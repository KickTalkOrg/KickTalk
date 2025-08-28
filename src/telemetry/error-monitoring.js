// KickTalk Error Monitoring & Recovery System
const { metrics } = require('@opentelemetry/api');
const { SLOMonitor } = require('./slo-monitoring');

const pkg = require('../../package.json');
const meter = metrics.getMeter('kicktalk-errors', pkg.version);

// Error Classification System
const ERROR_CATEGORIES = {
  NETWORK: {
    code: 'NETWORK',
    description: 'Network connectivity issues',
    severity: 'high',
    recovery_actions: ['retry', 'fallback']
  },
  WEBSOCKET: {
    code: 'WEBSOCKET',
    description: 'WebSocket connection failures',
    severity: 'high',
    recovery_actions: ['reconnect', 'circuit_break']
  },
  API: {
    code: 'API',
    description: 'API request failures',
    severity: 'medium',
    recovery_actions: ['retry', 'cache_fallback']
  },
  PARSING: {
    code: 'PARSING',
    description: 'Data parsing and validation errors',
    severity: 'low',
    recovery_actions: ['fallback', 'log_and_continue']
  },
  AUTH: {
    code: 'AUTH',
    description: 'Authentication and authorization failures',
    severity: 'critical',
    recovery_actions: ['reauthenticate', 'user_intervention']
  },
  SEVENTV: {
    code: 'SEVENTV',
    description: '7TV service integration errors',
    severity: 'medium',
    recovery_actions: ['retry', 'disable_feature']
  },
  RENDER: {
    code: 'RENDER',
    description: 'UI rendering and component errors',
    severity: 'low',
    recovery_actions: ['component_reset', 'fallback_ui']
  },
  STORAGE: {
    code: 'STORAGE',
    description: 'Local storage and persistence errors',
    severity: 'medium',
    recovery_actions: ['retry', 'memory_fallback']
  }
};

// Error Rate SLO Targets
const ERROR_RATE_SLOS = {
  OVERALL_ERROR_RATE: {
    target: 0.01, // 1% error rate target
    critical_threshold: 0.05, // 5% critical threshold
    time_window: 300000, // 5 minutes
    description: 'Overall application error rate'
  },
  NETWORK_ERROR_RATE: {
    target: 0.02, // 2% network error rate
    critical_threshold: 0.10, // 10% critical threshold
    time_window: 300000,
    description: 'Network operation error rate'
  },
  WEBSOCKET_ERROR_RATE: {
    target: 0.005, // 0.5% WebSocket error rate
    critical_threshold: 0.02, // 2% critical threshold
    time_window: 600000, // 10 minutes
    description: 'WebSocket connection error rate'
  }
};

// Error Metrics
const errorCount = meter.createCounter('kicktalk_errors_total', {
  description: 'Total number of errors by category and severity',
  unit: '1'
});

const errorRate = meter.createObservableGauge('kicktalk_error_rate', {
  description: 'Error rate percentage by category',
  unit: '%'
});

const errorRecovery = meter.createCounter('kicktalk_error_recovery_total', {
  description: 'Total number of error recovery attempts',
  unit: '1'
});

const errorResolution = meter.createHistogram('kicktalk_error_resolution_duration_seconds', {
  description: 'Time taken to resolve errors',
  unit: 's',
  boundaries: [0.001, 0.01, 0.1, 0.5, 1.0, 5.0, 10.0, 30.0]
});

const circuitBreakerStatus = meter.createObservableGauge('kicktalk_circuit_breaker_status', {
  description: 'Circuit breaker status (0=closed, 1=open, 0.5=half-open)',
  unit: '1'
});

// Circuit Breaker State Management
const circuitBreakers = new Map();

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 30000; // 30 seconds
    this.monitoringWindow = options.monitoringWindow || 60000; // 1 minute
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.totalRequests = 0;
    
    // Sliding window for error tracking
    this.requestHistory = [];
  }

  async execute(operation, fallback = null) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        console.log(`[Circuit Breaker] ${this.name}: Transitioning to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      if (fallback && typeof fallback === 'function') {
        try {
          return await fallback();
        } catch (fallbackError) {
          throw error; // Return original error if fallback fails
        }
      }
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.successCount++;
    this.totalRequests++;
    
    if (this.state === 'HALF_OPEN' && this.successCount >= 3) {
      this.state = 'CLOSED';
      console.log(`[Circuit Breaker] ${this.name}: Recovered, transitioning to CLOSED`);
    }

    this.updateHistory(true);
  }

  onFailure(error) {
    this.failureCount++;
    this.totalRequests++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`[Circuit Breaker] ${this.name}: OPENED due to ${this.failureCount} failures`);
    } else if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      console.warn(`[Circuit Breaker] ${this.name}: Failed during HALF_OPEN, returning to OPEN`);
    }

    this.updateHistory(false);
  }

  updateHistory(success) {
    const now = Date.now();
    this.requestHistory.push({ timestamp: now, success });
    
    // Clean old entries outside monitoring window
    this.requestHistory = this.requestHistory.filter(
      entry => now - entry.timestamp <= this.monitoringWindow
    );
  }

  getErrorRate() {
    if (this.requestHistory.length === 0) return 0;
    const failures = this.requestHistory.filter(entry => !entry.success).length;
    return failures / this.requestHistory.length;
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      errorRate: this.getErrorRate(),
      totalRequests: this.totalRequests
    };
  }
}

// Circuit breaker status callback
circuitBreakerStatus.addCallback((observableResult) => {
  for (const [name, breaker] of circuitBreakers) {
    let statusValue = 0; // CLOSED
    if (breaker.state === 'OPEN') statusValue = 1;
    if (breaker.state === 'HALF_OPEN') statusValue = 0.5;
    
    observableResult.observe(statusValue, {
      circuit_breaker: name,
      state: breaker.state,
      error_rate: Math.round(breaker.getErrorRate() * 100)
    });
  }
});

// Error tracking state
let errorStats = {
  total_errors: 0,
  total_requests: 0,
  category_counts: {},
  recent_errors: []
};

// Error rate callback
errorRate.addCallback((observableResult) => {
  for (const [category, count] of Object.entries(errorStats.category_counts)) {
    const rate = errorStats.total_requests > 0 ? (count / errorStats.total_requests) * 100 : 0;
    observableResult.observe(rate, {
      error_category: category,
      severity: ERROR_CATEGORIES[category]?.severity || 'unknown'
    });
  }
  
  // Overall error rate
  const overallRate = errorStats.total_requests > 0 ? (errorStats.total_errors / errorStats.total_requests) * 100 : 0;
  observableResult.observe(overallRate, {
    error_category: 'OVERALL',
    severity: 'aggregate'
  });
});

// Error Monitor Helper
const ErrorMonitor = {

  /**
   * Record an error with full context and recovery tracking
   */
  recordError(error, context = {}) {
    const errorCategory = this.classifyError(error, context);
    const severity = ERROR_CATEGORIES[errorCategory]?.severity || 'unknown';
    const startTime = Date.now();

    // Update error statistics
    errorStats.total_errors++;
    errorStats.category_counts[errorCategory] = (errorStats.category_counts[errorCategory] || 0) + 1;
    
    // Record error metrics
    errorCount.add(1, {
      error_category: errorCategory,
      severity,
      error_type: error?.name || 'UnknownError',
      error_code: error?.code || context.error_code || 'unknown',
      operation: context.operation || 'unknown',
      component: context.component || 'unknown',
      user_id: context.user_id || 'anonymous'
    });

    // Add to recent errors for correlation
    const errorRecord = {
      timestamp: startTime,
      category: errorCategory,
      severity,
      message: error?.message || 'Unknown error',
      context,
      session_id: context.session_id,
      user_id: context.user_id,
      recovery_attempted: false
    };

    errorStats.recent_errors.push(errorRecord);
    
    // Keep only last 100 errors for correlation
    if (errorStats.recent_errors.length > 100) {
      errorStats.recent_errors = errorStats.recent_errors.slice(-100);
    }

    // Check error rate SLOs
    this.checkErrorRateSLOs(errorCategory);

    console.error(`[Error Monitor] ${errorCategory} error in ${context.operation || 'unknown'}:`, error?.message, context);

    return {
      error_id: `${errorCategory}_${startTime}`,
      category: errorCategory,
      severity,
      recovery_actions: ERROR_CATEGORIES[errorCategory]?.recovery_actions || []
    };
  },

  /**
   * Classify error into appropriate category
   */
  classifyError(error, context) {
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorCode = error?.code || context.error_code;

    // Network errors
    if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND' || errorCode === 'ETIMEDOUT' ||
        errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return 'NETWORK';
    }

    // WebSocket errors
    if (errorMessage.includes('websocket') || errorMessage.includes('ws') || context.component === 'websocket') {
      return 'WEBSOCKET';
    }

    // API errors
    if (context.operation?.includes('api') || errorCode >= 400) {
      return 'API';
    }

    // Auth errors
    if (errorCode === 401 || errorCode === 403 || errorMessage.includes('auth')) {
      return 'AUTH';
    }

    // 7TV errors
    if (context.component === '7tv' || errorMessage.includes('7tv')) {
      return 'SEVENTV';
    }

    // Parsing errors
    if (errorMessage.includes('parse') || errorMessage.includes('json') || error?.name === 'SyntaxError') {
      return 'PARSING';
    }

    // Render errors
    if (context.component === 'renderer' || error?.name === 'RenderError') {
      return 'RENDER';
    }

    // Storage errors
    if (errorMessage.includes('storage') || errorMessage.includes('quota')) {
      return 'STORAGE';
    }

    return 'NETWORK'; // Default fallback
  },

  /**
   * Record error recovery attempt
   */
  recordRecovery(errorId, recoveryAction, success, duration = 0) {
    const durationSeconds = duration / 1000;

    errorRecovery.add(1, {
      error_id: errorId,
      recovery_action: recoveryAction,
      success: success.toString(),
      duration_ms: duration
    });

    if (success) {
      errorResolution.record(durationSeconds, {
        recovery_action: recoveryAction,
        resolution_type: 'automatic'
      });
    }

    // Update recent errors
    const errorRecord = errorStats.recent_errors.find(e => e.timestamp.toString() === errorId.split('_')[1]);
    if (errorRecord) {
      errorRecord.recovery_attempted = true;
      errorRecord.recovery_action = recoveryAction;
      errorRecord.recovery_success = success;
    }

    console.log(`[Error Recovery] ${recoveryAction} for ${errorId}: ${success ? 'SUCCESS' : 'FAILED'} (${duration}ms)`);
  },

  /**
   * Get or create circuit breaker
   */
  getCircuitBreaker(name, options = {}) {
    if (!circuitBreakers.has(name)) {
      circuitBreakers.set(name, new CircuitBreaker(name, options));
    }
    return circuitBreakers.get(name);
  },

  /**
   * Execute operation with circuit breaker protection
   */
  async executeWithCircuitBreaker(name, operation, fallback = null, options = {}) {
    const breaker = this.getCircuitBreaker(name, options);
    
    try {
      const result = await breaker.execute(operation, fallback);
      errorStats.total_requests++;
      return result;
    } catch (error) {
      errorStats.total_requests++;
      
      // Record the error
      const errorRecord = this.recordError(error, {
        operation: name,
        component: 'circuit_breaker',
        circuit_breaker_state: breaker.state
      });

      // Attempt recovery if circuit breaker suggests it
      if (fallback && breaker.state === 'OPEN') {
        try {
          const startTime = Date.now();
          const fallbackResult = await fallback();
          const duration = Date.now() - startTime;
          
          this.recordRecovery(errorRecord.error_id, 'fallback', true, duration);
          return fallbackResult;
        } catch (fallbackError) {
          this.recordRecovery(errorRecord.error_id, 'fallback', false);
        }
      }

      throw error;
    }
  },

  /**
   * Check error rate SLOs
   */
  checkErrorRateSLOs(errorCategory) {
    const sloKey = `${errorCategory}_ERROR_RATE`;
    const slo = ERROR_RATE_SLOS[sloKey] || ERROR_RATE_SLOS.OVERALL_ERROR_RATE;
    
    const categoryCount = errorStats.category_counts[errorCategory] || 0;
    const currentRate = errorStats.total_requests > 0 ? categoryCount / errorStats.total_requests : 0;
    
    if (currentRate > slo.target) {
      SLOMonitor.recordOperationResult(`error_rate_${errorCategory.toLowerCase()}`, false, null, {
        current_rate: currentRate.toFixed(4),
        target_rate: slo.target.toString(),
        severity: currentRate > slo.critical_threshold ? 'critical' : 'warning'
      });
      
      console.warn(`[SLO Violation] ${errorCategory} error rate ${(currentRate * 100).toFixed(2)}% exceeds target ${(slo.target * 100).toFixed(2)}%`);
    }
  },

  /**
   * Get error statistics and correlation data
   */
  getErrorStatistics() {
    return {
      ...errorStats,
      circuit_breakers: Array.from(circuitBreakers.entries()).map(([name, breaker]) => ({
        name,
        ...breaker.getStatus()
      }))
    };
  },

  /**
   * Reset error statistics (for testing)
   */
  resetStatistics() {
    errorStats = {
      total_errors: 0,
      total_requests: 0,
      category_counts: {},
      recent_errors: []
    };
  }
};

module.exports = {
  ErrorMonitor,
  ERROR_CATEGORIES,
  ERROR_RATE_SLOS,
  CircuitBreaker,
  metrics: {
    errorCount,
    errorRate,
    errorRecovery,
    errorResolution,
    circuitBreakerStatus
  }
};