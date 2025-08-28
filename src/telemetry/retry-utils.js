// KickTalk Retry Utilities with Exponential Backoff and Telemetry
const { ErrorMonitor } = require('./error-monitoring');

/**
 * Retry configuration presets for different operation types
 */
const RETRY_PRESETS = {
  // Network operations - more aggressive retries
  NETWORK: {
    maxAttempts: 5,
    initialDelay: 1000, // 1 second
    maxDelay: 30000,    // 30 seconds
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => {
      const networkErrors = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'];
      return networkErrors.includes(error.code) || (error.response?.status >= 500);
    }
  },
  
  // API requests - moderate retries
  API: {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => {
      // Retry on 5xx errors and specific 4xx errors
      const status = error.response?.status;
      return status >= 500 || status === 429 || status === 408;
    }
  },
  
  // WebSocket connections - careful retries to avoid spam
  WEBSOCKET: {
    maxAttempts: 10,
    initialDelay: 2000,
    maxDelay: 60000, // 1 minute
    backoffMultiplier: 1.5,
    jitter: true,
    retryCondition: (error) => {
      // Most WebSocket errors should be retried
      return !error.message?.includes('unauthorized');
    }
  },
  
  // 7TV operations - gentle retries
  SEVENTV: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: (error) => {
      const status = error.response?.status;
      return status >= 500 || status === 429 || !status; // Retry server errors, rate limits, or network issues
    }
  },
  
  // Storage operations - quick retries
  STORAGE: {
    maxAttempts: 3,
    initialDelay: 100,
    maxDelay: 1000,
    backoffMultiplier: 2,
    jitter: false,
    retryCondition: (error) => {
      // Retry quota errors and temporary storage issues
      return error.message?.includes('quota') || error.message?.includes('temporary');
    }
  },
  
  // Default conservative preset
  DEFAULT: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: () => true // Retry all errors by default
  }
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(attempt, config) {
  const baseDelay = Math.min(
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelay
  );
  
  if (config.jitter) {
    // Add ±25% jitter to prevent thundering herd
    const jitterRange = baseDelay * 0.25;
    const jitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.max(0, baseDelay + jitter);
  }
  
  return baseDelay;
}

/**
 * Sleep utility for delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff and telemetry
 */
async function retryWithBackoff(operation, options = {}) {
  // Determine configuration
  const preset = options.preset || 'DEFAULT';
  const config = { ...RETRY_PRESETS[preset], ...options };
  
  const operationName = options.operationName || 'unknown_operation';
  const context = {
    operation: operationName,
    component: options.component || 'retry_utils',
    user_id: options.userId,
    session_id: options.sessionId,
    ...options.context
  };

  let lastError;
  let attempt = 0;
  const startTime = Date.now();

  while (attempt < config.maxAttempts) {
    attempt++;
    
    try {
      console.log(`[Retry] Attempt ${attempt}/${config.maxAttempts} for ${operationName}`);
      
      const result = await operation(attempt);
      
      // Success - record recovery if this wasn't the first attempt
      if (attempt > 1) {
        const duration = Date.now() - startTime;
        const errorId = `retry_${operationName}_${startTime}`;
        ErrorMonitor.recordRecovery(errorId, `retry_attempt_${attempt}`, true, duration);
        
        console.log(`[Retry] Success on attempt ${attempt}/${config.maxAttempts} for ${operationName} (${duration}ms)`);
      }
      
      return result;
      
    } catch (error) {
      lastError = error;
      
      // Record the error
      const errorRecord = ErrorMonitor.recordError(error, {
        ...context,
        retry_attempt: attempt,
        max_attempts: config.maxAttempts
      });
      
      // Check if we should retry
      const shouldRetry = attempt < config.maxAttempts && 
                         config.retryCondition(error);
      
      if (!shouldRetry) {
        console.error(`[Retry] Final failure for ${operationName} after ${attempt} attempts:`, error.message);
        
        // Record final failure
        const duration = Date.now() - startTime;
        ErrorMonitor.recordRecovery(errorRecord.error_id, `retry_exhausted`, false, duration);
        
        break;
      }
      
      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, config);
      
      console.warn(`[Retry] Attempt ${attempt}/${config.maxAttempts} failed for ${operationName}, retrying in ${Math.round(delay)}ms:`, error.message);
      
      // Wait before next attempt
      await sleep(delay);
    }
  }
  
  // All attempts failed
  throw lastError;
}

/**
 * Retry wrapper with circuit breaker integration
 */
async function retryWithCircuitBreaker(operation, options = {}) {
  const operationName = options.operationName || 'unknown_operation';
  const circuitBreakerName = options.circuitBreakerName || operationName;
  
  // Get circuit breaker options
  const circuitBreakerOptions = {
    failureThreshold: options.failureThreshold || 5,
    recoveryTimeout: options.recoveryTimeout || 30000,
    monitoringWindow: options.monitoringWindow || 60000
  };
  
  // Create retry operation that uses circuit breaker
  const retryOperation = async (attempt) => {
    return await ErrorMonitor.executeWithCircuitBreaker(
      circuitBreakerName,
      operation,
      options.fallback,
      circuitBreakerOptions
    );
  };
  
  return await retryWithBackoff(retryOperation, {
    ...options,
    operationName: `${operationName}_with_circuit_breaker`
  });
}

/**
 * Specialized retry functions for common operations
 */
const RetryUtils = {
  
  /**
   * Retry network requests (API calls, HTTP requests)
   */
  async retryNetworkRequest(requestFn, options = {}) {
    return await retryWithBackoff(requestFn, {
      preset: 'NETWORK',
      operationName: 'network_request',
      ...options
    });
  },
  
  /**
   * Retry API operations with circuit breaker
   */
  async retryApiCall(apiFn, options = {}) {
    return await retryWithCircuitBreaker(apiFn, {
      preset: 'API',
      operationName: 'api_call',
      circuitBreakerName: options.endpoint || 'generic_api',
      ...options
    });
  },
  
  /**
   * Retry WebSocket connections with circuit breaker
   */
  async retryWebSocketConnection(connectFn, options = {}) {
    return await retryWithCircuitBreaker(connectFn, {
      preset: 'WEBSOCKET',
      operationName: 'websocket_connect',
      circuitBreakerName: `websocket_${options.chatroomId || 'unknown'}`,
      ...options
    });
  },
  
  /**
   * Retry 7TV operations
   */
  async retrySevenTVOperation(operationFn, options = {}) {
    return await retryWithBackoff(operationFn, {
      preset: 'SEVENTV',
      operationName: '7tv_operation',
      ...options
    });
  },
  
  /**
   * Retry storage operations
   */
  async retryStorageOperation(storageFn, options = {}) {
    return await retryWithBackoff(storageFn, {
      preset: 'STORAGE',
      operationName: 'storage_operation',
      ...options
    });
  },
  
  /**
   * Generic retry with custom configuration
   */
  async retry(operation, config = {}) {
    return await retryWithBackoff(operation, config);
  },
  
  /**
   * Retry with circuit breaker protection
   */
  async retryWithProtection(operation, options = {}) {
    return await retryWithCircuitBreaker(operation, options);
  },
  
  /**
   * Get retry configuration presets
   */
  getPresets() {
    return { ...RETRY_PRESETS };
  },
  
  /**
   * Create custom retry preset
   */
  createPreset(name, config) {
    RETRY_PRESETS[name.toUpperCase()] = {
      ...RETRY_PRESETS.DEFAULT,
      ...config
    };
  }
};

module.exports = {
  RetryUtils,
  retryWithBackoff,
  retryWithCircuitBreaker,
  RETRY_PRESETS,
  calculateDelay
};