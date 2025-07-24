// Main telemetry module for KickTalk
let initializeTelemetry, shutdown, MetricsHelper, TracingHelper, SpanStatusCode;

try {
  console.log('[Telemetry]: Loading telemetry modules...');
  const instrumentation = require('./instrumentation');
  const metrics = require('./metrics');
  const tracing = require('./tracing');
  
  initializeTelemetry = instrumentation.initializeTelemetry;
  shutdown = instrumentation.shutdown;
  MetricsHelper = metrics.MetricsHelper;
  TracingHelper = tracing.TracingHelper;
  SpanStatusCode = tracing.SpanStatusCode;
  
  console.log('[Telemetry]: All modules loaded successfully');
} catch (error) {
  console.error('[Telemetry]: Failed to load telemetry modules:', error.message);
  console.error('[Telemetry]: Full error:', error);
  
  // Provide fallback implementations
  initializeTelemetry = () => false;
  shutdown = () => Promise.resolve();
  MetricsHelper = {
    startTimer: () => Date.now(),
    endTimer: () => 0,
    incrementWebSocketConnections: () => {},
    decrementWebSocketConnections: () => {},
    recordConnectionError: () => {},
    recordReconnection: () => {},
    recordMessageReceived: () => {},
    recordMessageSent: () => {},
    recordMessageSendDuration: () => {},
    recordError: () => {},
    recordRendererMemory: () => {},
    recordDomNodeCount: () => {},
    incrementOpenWindows: () => {},
    decrementOpenWindows: () => {}
  };
  TracingHelper = {
    addEvent: () => {},
    setAttributes: () => {},
    traceWebSocketConnection: (id, streamerId, callback) => callback(),
    traceMessageFlow: (id, content, callback) => callback(),
    traceKickAPICall: (endpoint, method, callback) => callback()
  };
  SpanStatusCode = { OK: 1, ERROR: 2 };
}

let telemetryInitialized = false;

// Initialize telemetry system
const initTelemetry = () => {
  if (telemetryInitialized) {
    console.log('[Telemetry]: Already initialized');
    return true;
  }

  try {
    const success = initializeTelemetry();
    if (success) {
      telemetryInitialized = true;
      console.log('[Telemetry]: KickTalk telemetry initialized successfully');
      
      // Start Prometheus metrics server
      try {
        const { startMetricsServer } = require('./prometheus-server');
        startMetricsServer(9464);
      } catch (error) {
        console.warn('[Telemetry]: Failed to start metrics server:', error.message);
      }
      
      // Record application start
      KickTalkMetrics.recordApplicationStart();
      TracingHelper.addEvent('application.start', {
        'app.version': require('../../package.json').version,
        'node.version': process.version,
        'electron.version': process.versions.electron
      });
    }
    return success;
  } catch (error) {
    console.error('[Telemetry]: Failed to initialize:', error);
    return false;
  }
};

// Graceful shutdown
const shutdownTelemetry = async () => {
  if (!telemetryInitialized) return;
  
  try {
    // Stop metrics server
    try {
      const { stopMetricsServer } = require('./prometheus-server');
      stopMetricsServer();
    } catch (error) {
      console.warn('[Telemetry]: Failed to stop metrics server:', error.message);
    }
    
    await shutdown();
    telemetryInitialized = false;
    console.log('[Telemetry]: Shutdown complete');
  } catch (error) {
    console.error('[Telemetry]: Error during shutdown:', error);
  }
};

// Check if telemetry is enabled (controlled by user settings)
// This function will be overridden by the main process with actual settings
let isTelemetryEnabled = () => {
  // Default to false for privacy - main process will override this
  return false;
};

// Extended metrics helper with application-specific methods
const KickTalkMetrics = {
  ...MetricsHelper,
  
  // Application lifecycle
  recordApplicationStart() {
    TracingHelper.addEvent('application.lifecycle', {
      'lifecycle.event': 'start',
      'app.startup_time': Date.now()
    });
  },

  recordApplicationShutdown() {
    TracingHelper.addEvent('application.lifecycle', {
      'lifecycle.event': 'shutdown',
      'app.shutdown_time': Date.now()
    });
  },

  // Chatroom operations
  recordChatroomJoin(chatroomId, streamerId) {
    this.incrementWebSocketConnections(chatroomId, streamerId);
    TracingHelper.addEvent('chatroom.join', {
      'chatroom.id': chatroomId,
      'streamer.id': streamerId
    });
  },

  recordChatroomLeave(chatroomId, streamerId) {
    this.decrementWebSocketConnections(chatroomId, streamerId);
    TracingHelper.addEvent('chatroom.leave', {
      'chatroom.id': chatroomId,
      'streamer.id': streamerId
    });
  },

  // Error tracking
  recordError(error, context = {}) {
    const errorAttributes = {
      'error.name': error.name,
      'error.message': error.message,
      'error.stack': error.stack?.substring(0, 1000), // Limit stack trace size
      ...context
    };

    TracingHelper.addEvent('error.occurred', errorAttributes);
    
    // Categorize error types
    const errorType = error.name || 'UnknownError';
    if (errorType.includes('Network') || errorType.includes('Connection')) {
      this.recordConnectionError(errorType, context.chatroomId);
    }
  }
};

// Extended tracing helper with application-specific methods  
const KickTalkTracing = {
  ...TracingHelper,

  // Trace complete message flow
  traceMessageFlow(chatroomId, messageContent, callback) {
    return this.traceMessageSend(chatroomId, messageContent, (span) => {
      // Add message flow specific attributes
      span.setAttributes({
        'message.flow': 'user_to_chat',
        'message.chatroom': chatroomId
      });
      
      return callback(span);
    });
  },

  // Trace API calls with KickTalk specific context
  traceKickAPICall(endpoint, method, callback) {
    return this.traceAPIRequest(endpoint, method, (span) => {
      span.setAttributes({
        'api.provider': 'kick.com',
        'api.client': 'kicktalk'
      });
      
      return callback(span);
    });
  },

  // Trace emote loading operations
  traceEmoteLoad(emoteProvider, emoteId, callback) {
    return this.startActiveSpan('emote.load', (span) => {
      span.setAttributes({
        'emote.provider': emoteProvider,
        'emote.id': emoteId,
        'emote.operation': 'load'
      });

      try {
        const result = callback(span);
        
        if (result && typeof result.then === 'function') {
          return result
            .then(res => {
              span.setAttributes({
                'emote.load_success': true,
                'emote.cache_hit': res.fromCache || false
              });
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return res;
            })
            .catch(error => {
              span.setAttributes({
                'emote.load_success': false,
                'emote.error': error.name
              });
              span.recordException(error);
              span.setStatus({ 
                code: SpanStatusCode.ERROR, 
                message: error.message 
              });
              span.end();
              throw error;
            });
        } else {
          span.setAttributes({
            'emote.load_success': true
          });
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        }
      } catch (error) {
        span.setAttributes({
          'emote.load_success': false,
          'emote.error': error.name
        });
        span.recordException(error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error.message 
        });
        span.end();
        throw error;
      }
    });
  }
};

module.exports = {
  initTelemetry,
  shutdownTelemetry,
  isTelemetryEnabled,
  isInitialized: () => telemetryInitialized,
  metrics: KickTalkMetrics,
  tracing: KickTalkTracing
};