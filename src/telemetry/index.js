// Main telemetry module for KickTalk
const { initializeTelemetry, shutdown } = require('./instrumentation');
const { MetricsHelper } = require('./metrics');
const { TracingHelper } = require('./tracing');

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
    await shutdown();
    telemetryInitialized = false;
    console.log('[Telemetry]: Shutdown complete');
  } catch (error) {
    console.error('[Telemetry]: Error during shutdown:', error);
  }
};

// Check if telemetry is enabled (could be controlled by settings)
const isTelemetryEnabled = () => {
  // For now, always enabled in development, could be user-configurable
  const isDev = process.env.NODE_ENV === 'development';
  return isDev || process.env.KICKTALK_TELEMETRY_ENABLED === 'true';
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