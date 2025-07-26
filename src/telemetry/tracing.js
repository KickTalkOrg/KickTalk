// KickTalk distributed tracing implementation - Manual instrumentation
const { tracer } = require('./instrumentation');

// Import OpenTelemetry API with fallbacks
let trace, context, SpanStatusCode, SpanKind;
try {
  ({ trace, context, SpanStatusCode, SpanKind } = require('@opentelemetry/api'));
} catch (error) {
  // Fallback for when API is not available
  SpanStatusCode = { OK: 1, ERROR: 2 };
  SpanKind = { INTERNAL: 0, CLIENT: 3, PRODUCER: 5 };
  trace = { getActiveSpan: () => null };
  context = {};
}

// Tracing helper functions
const TracingHelper = {
  // Start a new span with common KickTalk attributes
  startSpan(name, options = {}) {
    const span = tracer.startSpan(name, {
      kind: options.kind || SpanKind.INTERNAL,
      attributes: {
        'service.name': 'kicktalk',
        'service.version': require('../../package.json').version,
        ...options.attributes
      }
    });

    return span;
  },

  // Start a span with automatic context propagation
  startActiveSpan(name, callback, options = {}) {
    // Use manual span management since Electron doesn't support auto-context
    const span = this.startSpan(name, options);
    try {
      const result = callback(span);
      if (result && typeof result.then === 'function') {
        return result.finally(() => span.end());
      } else {
        span.end();
        return result;
      }
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.end();
      throw error;
    }
  },

  // WebSocket connection tracing
  traceWebSocketConnection(chatroomId, streamerId, callback) {
    return this.startActiveSpan('websocket.connect', (span) => {
      span.setAttributes({
        'websocket.chatroom_id': chatroomId,
        'websocket.streamer_id': streamerId,
        'websocket.operation': 'connect'
      });

      try {
        const result = callback(span);
        
        // Handle both sync and async results
        if (result && typeof result.then === 'function') {
          return result
            .then(res => {
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return res;
            })
            .catch(error => {
              span.recordException(error);
              span.setStatus({ 
                code: SpanStatusCode.ERROR, 
                message: error.message 
              });
              span.end();
              throw error;
            });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        }
      } catch (error) {
        span.recordException(error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error.message 
        });
        span.end();
        throw error;
      }
    }, {
      kind: SpanKind.CLIENT,
      attributes: {
        'network.protocol.name': 'websocket'
      }
    });
  },

  // Message sending tracing
  traceMessageSend(chatroomId, messageContent, callback) {
    return this.startActiveSpan('message.send', (span) => {
      span.setAttributes({
        'message.chatroom_id': chatroomId,
        'message.length': messageContent.length,
        'message.type': 'user_message',
        'messaging.operation': 'send'
      });

      // Don't include actual message content for privacy
      const startTime = Date.now();

      try {
        const result = callback(span);
        
        if (result && typeof result.then === 'function') {
          return result
            .then(res => {
              const duration = Date.now() - startTime;
              span.setAttributes({
                'message.send_duration_ms': duration,
                'message.success': true
              });
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return res;
            })
            .catch(error => {
              const duration = Date.now() - startTime;
              span.setAttributes({
                'message.send_duration_ms': duration,
                'message.success': false,
                'message.error': error.name
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
          const duration = Date.now() - startTime;
          span.setAttributes({
            'message.send_duration_ms': duration,
            'message.success': true
          });
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        span.setAttributes({
          'message.send_duration_ms': duration,
          'message.success': false,
          'message.error': error.name
        });
        span.recordException(error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error.message 
        });
        span.end();
        throw error;
      }
    }, {
      kind: SpanKind.PRODUCER
    });
  },

  // API request tracing
  traceAPIRequest(endpoint, method, callback) {
    return this.startActiveSpan('api.request', (span) => {
      span.setAttributes({
        'http.method': method,
        'http.url': endpoint,
        'http.request.method': method,
        'url.full': endpoint
      });

      const startTime = Date.now();

      try {
        const result = callback(span);
        
        if (result && typeof result.then === 'function') {
          return result
            .then(res => {
              const duration = Date.now() - startTime;
              span.setAttributes({
                'http.response.status_code': res.status || 200,
                'http.request.duration_ms': duration
              });
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return res;
            })
            .catch(error => {
              const duration = Date.now() - startTime;
              span.setAttributes({
                'http.response.status_code': error.status || error.response?.status || 500,
                'http.request.duration_ms': duration,
                'http.error': error.name
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
          const duration = Date.now() - startTime;
          span.setAttributes({
            'http.response.status_code': 200,
            'http.request.duration_ms': duration
          });
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        span.setAttributes({
          'http.response.status_code': error.status || error.response?.status || 500,
          'http.request.duration_ms': duration,
          'http.error': error.name
        });
        span.recordException(error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error.message 
        });
        span.end();
        throw error;
      }
    }, {
      kind: SpanKind.CLIENT
    });
  },

  // User action tracing (e.g., joining chatroom)
  traceUserAction(action, chatroomId, callback) {
    return this.startActiveSpan(`user.${action}`, (span) => {
      span.setAttributes({
        'user.action': action,
        'user.chatroom_id': chatroomId,
        'user.operation': action
      });

      try {
        const result = callback(span);
        
        if (result && typeof result.then === 'function') {
          return result
            .then(res => {
              span.setAttributes({
                'user.action_success': true
              });
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return res;
            })
            .catch(error => {
              span.setAttributes({
                'user.action_success': false,
                'user.error': error.name
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
            'user.action_success': true
          });
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        }
      } catch (error) {
        span.setAttributes({
          'user.action_success': false,
          'user.error': error.name
        });
        span.recordException(error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error.message 
        });
        span.end();
        throw error;
      }
    }, {
      kind: SpanKind.INTERNAL
    });
  },

  // Get current trace context for correlation
  getCurrentTraceId() {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      return spanContext.traceId;
    }
    return null;
  },

  // Add event to current span
  addEvent(name, attributes = {}) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(name, attributes);
    }
  },

  // Set attribute on current span
  setAttributes(attributes) {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes(attributes);
    }
  }
};

module.exports = {
  tracer,
  TracingHelper,
  trace,
  context,
  SpanStatusCode,
  SpanKind
};