// KickTalk metrics implementation
const { metrics } = require('@opentelemetry/api');

// Get the meter for KickTalk
const meter = metrics.getMeter('kicktalk', require('../../package.json').version);

// Connection Metrics - Track active connections in a Map for accurate counting
const activeConnections = new Map();

const websocketConnections = meter.createObservableGauge('kicktalk_websocket_connections_active', {
  description: 'Number of active WebSocket connections',
  unit: '1'
});

const websocketReconnections = meter.createCounter('kicktalk_websocket_reconnections_total', {
  description: 'Total number of WebSocket reconnection attempts',
  unit: '1'
});

const connectionErrors = meter.createCounter('kicktalk_connection_errors_total', {
  description: 'Total number of connection errors',
  unit: '1'
});

// Message Metrics
const messagesSent = meter.createCounter('kicktalk_messages_sent_total', {
  description: 'Total number of messages sent by user',
  unit: '1'
});

const messagesReceived = meter.createCounter('kicktalk_messages_received_total', {
  description: 'Total number of messages received from chat',
  unit: '1'
});

const messageSendDuration = meter.createHistogram('kicktalk_message_send_duration_seconds', {
  description: 'Time taken to send a message',
  unit: 's',
  boundaries: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

// API Metrics
const apiRequestDuration = meter.createHistogram('kicktalk_api_request_duration_seconds', {
  description: 'Time taken for API requests',
  unit: 's',
  boundaries: [0.1, 0.5, 1, 2, 5, 10, 30]
});

const apiRequests = meter.createCounter('kicktalk_api_requests_total', {
  description: 'Total number of API requests',
  unit: '1'
});

// Resource Metrics (using observableGauges for real-time values)
const memoryUsage = meter.createObservableGauge('kicktalk_memory_usage_bytes', {
  description: 'Application memory usage in bytes',
  unit: 'By'
});

const cpuUsage = meter.createObservableGauge('kicktalk_cpu_usage_percent', {
  description: 'CPU usage percentage',
  unit: '%'
});

const openHandles = meter.createObservableGauge('kicktalk_open_handles_total', {
  description: 'Number of open file/socket handles',
  unit: '1'
});

const rendererMemoryUsage = meter.createObservableGauge('kicktalk_renderer_memory_usage_bytes', {
  description: 'Renderer process memory usage in bytes',
  unit: 'By'
});

const domNodeCount = meter.createObservableGauge('kicktalk_dom_node_count', {
  description: 'Number of DOM nodes in the renderer process',
  unit: '1'
});

// Storage for current values
let currentRendererMemory = {
  jsHeapUsedSize: 0,
  jsHeapTotalSize: 0
};
let currentDomNodeCount = 0;

const openWindows = meter.createUpDownCounter('kicktalk_open_windows', {
  description: 'Number of open windows',
  unit: '1'
});

const upStatus = meter.createObservableGauge('kicktalk_up', {
  description: 'Application status (1=up, 0=down)',
  unit: '1'
});

const gcDuration = meter.createHistogram('kicktalk_gc_duration_seconds', {
  description: 'Garbage collection duration',
  unit: 's'
});

// Callback for resource metrics
memoryUsage.addCallback((observableResult) => {
  const memUsage = process.memoryUsage();
  observableResult.observe(memUsage.heapUsed, {
    type: 'heap_used'
  });
  observableResult.observe(memUsage.heapTotal, {
    type: 'heap_total'
  });
  observableResult.observe(memUsage.rss, {
    type: 'rss'
  });
  observableResult.observe(memUsage.external, {
    type: 'external'
  });
});

cpuUsage.addCallback((observableResult) => {
  const cpuUsageValue = process.cpuUsage();
  const totalUsage = (cpuUsageValue.user + cpuUsageValue.system) / 1000000; // Convert to seconds
  observableResult.observe(totalUsage, {
    type: 'total'
  });
});

// Handle count approximation using process._getActiveHandles (Node.js specific)
openHandles.addCallback((observableResult) => {
  try {
    // This is a Node.js internal API, use with caution
    const handles = process._getActiveHandles ? process._getActiveHandles().length : 0;
    const requests = process._getActiveRequests ? process._getActiveRequests().length : 0;
    
    observableResult.observe(handles + requests, {
      type: 'total'
    });
  } catch (error) {
    // Fallback if internal APIs are not available
    observableResult.observe(0);
  }
});

// Application uptime status
upStatus.addCallback((observableResult) => {
  // Application is up if this callback is running
  observableResult.observe(1);
});

// Renderer memory usage callback
rendererMemoryUsage.addCallback((observableResult) => {
  observableResult.observe(currentRendererMemory.jsHeapUsedSize, { type: 'js_heap_used' });
  observableResult.observe(currentRendererMemory.jsHeapTotalSize, { type: 'js_heap_total' });
});

// DOM node count callback
domNodeCount.addCallback((observableResult) => {
  observableResult.observe(currentDomNodeCount);
});

// Active WebSocket connections callback
websocketConnections.addCallback((observableResult) => {
  // Group connections by unique attribute sets and count them
  const connectionCounts = new Map();
  
  for (const [connectionKey, attributes] of activeConnections) {
    const key = JSON.stringify(attributes);
    connectionCounts.set(key, (connectionCounts.get(key) || 0) + 1);
  }
  
  for (const [attributesJson, count] of connectionCounts) {
    const attributes = JSON.parse(attributesJson);
    observableResult.observe(count, attributes);
  }
});

// GC monitoring setup
try {
  const v8 = require('v8');
  const performanceObserver = require('perf_hooks').PerformanceObserver;
  
  // Monitor GC events using Performance Observer
  const gcObserver = new performanceObserver((list) => {
    const entries = list.getEntries();
    entries.forEach((entry) => {
      if (entry.entryType === 'gc') {
        gcDuration.record(entry.duration / 1000, {
          kind: entry.detail?.kind || 'unknown'
        });
      }
    });
  });
  
  gcObserver.observe({ entryTypes: ['gc'] });
} catch (error) {
  // GC monitoring not available, continue without it
  console.warn('GC monitoring unavailable:', error.message);
}

// Metrics helper functions
const MetricsHelper = {
  // Connection metrics
  incrementWebSocketConnections(chatroomId, streamerId, streamerName = null) {
    const attributes = {
      chatroom_id: chatroomId,
      streamer_id: streamerId
    };
    if (streamerName) attributes.streamer_name = streamerName;
    
    const connectionKey = `${chatroomId}_${streamerId}`;
    activeConnections.set(connectionKey, attributes);
    console.log(`[Metrics] WebSocket INCREMENT for ${streamerName || 'unknown'} (${chatroomId}) - Active: ${activeConnections.size}`);
  },

  decrementWebSocketConnections(chatroomId, streamerId, streamerName = null) {
    const connectionKey = `${chatroomId}_${streamerId}`;
    const removed = activeConnections.delete(connectionKey);
    console.log(`[Metrics] WebSocket DECREMENT for ${streamerName || 'unknown'} (${chatroomId}) - Removed: ${removed} - Active: ${activeConnections.size}`);
  },

  recordReconnection(chatroomId, reason = 'unknown') {
    websocketReconnections.add(1, {
      chatroom_id: chatroomId,
      reason
    });
  },

  recordConnectionError(errorType, chatroomId = null) {
    const attributes = { error_type: errorType };
    if (chatroomId) attributes.chatroom_id = chatroomId;
    
    connectionErrors.add(1, attributes);
  },

  // Message metrics
  recordMessageSent(chatroomId, messageType = 'regular', streamerName = null) {
    const attributes = {
      chatroom_id: chatroomId,
      message_type: messageType
    };
    if (streamerName) attributes.streamer_name = streamerName;
    
    messagesSent.add(1, attributes);
  },

  recordMessageReceived(chatroomId, messageType = 'regular', senderId = null, streamerName = null) {
    const attributes = {
      chatroom_id: chatroomId,
      message_type: messageType
    };
    if (senderId) attributes.sender_id = senderId;
    if (streamerName) attributes.streamer_name = streamerName;
    
    messagesReceived.add(1, attributes);
  },

  recordMessageSendDuration(duration, chatroomId, success = true) {
    messageSendDuration.record(duration, {
      chatroom_id: chatroomId,
      success: success.toString()
    });
  },

  // API metrics
  recordAPIRequest(endpoint, method, statusCode, duration) {
    apiRequests.add(1, {
      endpoint,
      method,
      status_code: statusCode.toString()
    });

    apiRequestDuration.record(duration, {
      endpoint,
      method,
      status_code: statusCode.toString()
    });
  },

  // Utility function to time operations
  startTimer() {
    return process.hrtime.bigint();
  },

  endTimer(startTime) {
    const endTime = process.hrtime.bigint();
    return Number(endTime - startTime) / 1e9; // Convert nanoseconds to seconds
  },

  recordGCDuration(duration, kind) {
    gcDuration.record(duration, {
      kind
    });
  },

  recordRendererMemory(memory) {
    currentRendererMemory.jsHeapUsedSize = memory.jsHeapUsedSize || 0;
    currentRendererMemory.jsHeapTotalSize = memory.jsHeapTotalSize || 0;
  },

  recordDomNodeCount(count) {
    currentDomNodeCount = count || 0;
  },

  incrementOpenWindows() {
    openWindows.add(1);
  },

  decrementOpenWindows() {
    openWindows.add(-1);
  }
};

module.exports = {
  meter,
  metrics: {
    websocketConnections,
    websocketReconnections,
    connectionErrors,
    messagesSent,
    messagesReceived,
    messageSendDuration,
    apiRequestDuration,
    apiRequests,
    memoryUsage,
    cpuUsage,
    openHandles,
    gcDuration,
    rendererMemoryUsage,
    domNodeCount,
    openWindows,
    upStatus
  },
  MetricsHelper
};