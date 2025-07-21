// OpenTelemetry instrumentation for KickTalk
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { FsInstrumentation } = require('@opentelemetry/instrumentation-fs');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { performance, PerformanceObserver } = require('perf_hooks');
const { metrics } = require('./metrics');
const pkg = require('../../package.json');

const isDev = process.env.NODE_ENV === 'development';

// Resource configuration
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: 'kicktalk',
  [SemanticResourceAttributes.SERVICE_VERSION]: pkg.version,
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: isDev ? 'development' : 'production',
  'service.instance.id': `kicktalk-${process.pid}`,
  'process.runtime.name': 'electron',
  'process.runtime.version': process.versions.electron
});

// OTLP exporters configuration
const traceExporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
  headers: {
    'X-Custom-Header': 'kicktalk-telemetry'
  }
});

const metricExporter = new OTLPMetricExporter({
  url: 'http://localhost:4318/v1/metrics',
  headers: {
    'X-Custom-Header': 'kicktalk-telemetry'
  }
});

// Metric reader with 15 second export interval
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 15000
});

// Initialize SDK
const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader,
  instrumentations: [
    new HttpInstrumentation({
      // Filter sensitive data from HTTP traces
      requestHook: (span, request) => {
        // Don't trace auth-related headers
        const headers = { ...request.headers };
        delete headers.authorization;
        delete headers.cookie;
        delete headers['session-token'];
        delete headers['kick-session'];
        
        span.setAttributes({
          'http.request.headers': JSON.stringify(headers)
        });
      },
      responseHook: (span, response) => {
        // Don't include response body for privacy
        span.setAttributes({
          'http.response.status_code': response.statusCode,
          'http.response.status_text': response.statusMessage
        });
      }
    }),
    new FsInstrumentation({
      // Only trace non-sensitive file operations
      ignoreIncomingRequestHook: (request) => {
        const filename = request.filename || '';
        // Ignore user data, logs, and config files
        return filename.includes('user') || 
               filename.includes('.log') || 
               filename.includes('token') ||
               filename.includes('.env');
      }
    })
  ]
});

// Graceful shutdown
const shutdown = async () => {
  try {
    console.log('[OTEL]: Shutting down telemetry...');
    await sdk.shutdown();
    console.log('[OTEL]: Telemetry shut down successfully');
  } catch (error) {
    console.error('[OTEL]: Error shutting down telemetry:', error);
  }
};

// Initialize telemetry if OTEL collector is available
const initializeTelemetry = () => {
  try {
    sdk.start();
    console.log('[OTEL]: Telemetry initialized successfully');
    
    // Monitor GC
    const obs = new PerformanceObserver((list) => {
      const entry = list.getEntries()[0];
      metrics.recordGCDuration(entry.duration / 1000, entry.kind);
    });
    obs.observe({ entryTypes: ['gc'], buffered: false });
    
    // Register shutdown handlers
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('exit', shutdown);
    
    return true;
  } catch (error) {
    console.error('[OTEL]: Failed to initialize telemetry:', error);
    return false;
  }
};

module.exports = {
  sdk,
  initializeTelemetry,
  shutdown
};