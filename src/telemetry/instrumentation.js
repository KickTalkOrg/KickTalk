// OpenTelemetry tracing and metrics for KickTalk (Electron-compatible)
// Based on SigNoz Electron sample: https://github.com/SigNoz/ElectronJS-otel-sample-app

let tracer = null;
let provider = null;
let metricsProvider = null;

try {
  // Try to import from different packages - some versions have different locations
  let BasicTracerProvider, SimpleSpanProcessor;
  
  try {
    ({ BasicTracerProvider } = require('@opentelemetry/sdk-trace-base'));
    ({ SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base'));
  } catch (sdkError) {
    console.log('[OTEL]: Trying alternative SDK imports...');
    ({ BasicTracerProvider } = require('@opentelemetry/sdk-trace-node'));
    ({ SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-node'));
  }
  
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { trace } = require('@opentelemetry/api');
  const pkg = require('../../package.json');

  const isDev = process.env.NODE_ENV === 'development';

  // Create a tracer provider without resource for Electron compatibility
  provider = new BasicTracerProvider();

  // Configure the OTLP exporter
  const exporter = new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
    headers: {
      'X-Custom-Header': 'kicktalk-telemetry'
    }
  });

  // Add a simple span processor - check if method exists
  if (typeof provider.addSpanProcessor === 'function') {
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    console.log('[OTEL]: addSpanProcessor method available, using standard approach');
  } else {
    console.log('[OTEL]: addSpanProcessor method not available, trying alternative');
  }

  // Register the provider (only once)
  if (typeof provider.register === 'function') {
    provider.register();
    console.log('[OTEL]: Provider registered successfully');
  } else {
    console.log('[OTEL]: Provider register method not available');
  }

  // Get a tracer
  tracer = trace.getTracer('kicktalk', pkg.version);

  console.log('[OTEL]: Manual instrumentation tracer initialized');

  // Initialize metrics provider
  try {
    const { MeterProvider } = require('@opentelemetry/sdk-metrics');
    const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
    const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
    const { metrics } = require('@opentelemetry/api');

    // Create metrics provider
    metricsProvider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: 'http://localhost:4318/v1/metrics',
            headers: {
              'X-Custom-Header': 'kicktalk-telemetry'
            }
          }),
          exportIntervalMillis: 10000, // Export every 10 seconds
        }),
      ],
    });

    // Register the metrics provider
    metrics.setGlobalMeterProvider(metricsProvider);
    console.log('[OTEL]: Metrics provider initialized successfully');
  } catch (metricsError) {
    console.warn('[OTEL]: Failed to initialize metrics provider:', metricsError.message);
  }
} catch (error) {
  console.error('[OTEL]: Failed to initialize tracer:', error.message);
  // Create a no-op tracer
  tracer = {
    startSpan: (name) => ({
      setAttributes: () => {},
      addEvent: () => {},
      recordException: () => {},
      setStatus: () => {},
      end: () => {}
    })
  };
}

// Graceful shutdown
const shutdown = async () => {
  const shutdownPromises = [];
  
  if (provider) {
    shutdownPromises.push(provider.shutdown());
  }
  
  if (metricsProvider) {
    shutdownPromises.push(metricsProvider.shutdown());
  }
  
  if (shutdownPromises.length === 0) return;
  
  try {
    console.log('[OTEL]: Shutting down telemetry...');
    await Promise.all(shutdownPromises);
    console.log('[OTEL]: Telemetry shut down successfully');
  } catch (error) {
    console.error('[OTEL]: Error shutting down telemetry:', error);
  }
};

// Initialize telemetry (already done above, just return status)
const initializeTelemetry = () => {
  const isInitialized = tracer !== null && provider !== null;
  
  if (isInitialized) {
    // Register shutdown handlers
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    process.on('exit', shutdown);
    
    console.log('[OTEL]: Telemetry ready for manual instrumentation');
    return true;
  }
  
  console.log('[OTEL]: Using no-op tracer (telemetry disabled)');
  return false;
};

module.exports = {
  tracer,
  provider,
  initializeTelemetry,
  shutdown
};