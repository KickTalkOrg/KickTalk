/**
* Minimal OpenTelemetry NodeSDK bootstrap for Electron main process.
* - Driven entirely by standard OTEL_* env variables.
* - No custom env normalization, no manual verification spans.
* - Keep preload/renderer free of telemetry init.
*/
try {
 require('dotenv').config();
} catch {}

  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { AlwaysOnSampler } = require('@opentelemetry/sdk-trace-base');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  // Views are optional; load defensively to avoid runtime mismatches across package versions
  let View, ExplicitBucketHistogramAggregation;
  try {
    ({ View, ExplicitBucketHistogramAggregation } = require('@opentelemetry/sdk-metrics'));
  } catch {}

(async () => {
 try {
   if (process.env.OTEL_DIAG_LOG_LEVEL) {
     const level = DiagLogLevel[process.env.OTEL_DIAG_LOG_LEVEL.toUpperCase()] ?? DiagLogLevel.INFO;
     diag.setLogger(new DiagConsoleLogger(), level);
   }

   const exporterEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
     || process.env.OTEL_EXPORTER_OTLP_ENDPOINT
     || '';

   // Define metric Views for histograms (optional)
  let histogramViews = undefined;
  try {
    if (typeof View === 'function' && typeof ExplicitBucketHistogramAggregation === 'function') {
      histogramViews = [
        new View({
          instrumentName: 'kicktalk_slo_latency_seconds',
          aggregation: new ExplicitBucketHistogramAggregation([
            0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0
          ])
        }),
        new View({
          instrumentName: 'kicktalk_message_send_duration_seconds',
          aggregation: new ExplicitBucketHistogramAggregation([
            0.01, 0.05, 0.1, 0.5, 1, 2, 5
          ])
        }),
        new View({
          instrumentName: 'kicktalk_api_request_duration_seconds',
          aggregation: new ExplicitBucketHistogramAggregation([
            0.1, 0.5, 1, 2, 5, 10, 30
          ])
        }),
        new View({
          instrumentName: 'kicktalk_chatroom_switch_duration_seconds',
          aggregation: new ExplicitBucketHistogramAggregation([
            0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1
          ])
        }),
        new View({
          instrumentName: 'kicktalk_seventv_emote_update_duration_seconds',
          aggregation: new ExplicitBucketHistogramAggregation([
            0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1
          ])
        })
      ];
    }
  } catch {
    histogramViews = undefined;
  }

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricExporter: new OTLPMetricExporter(),
    ...(histogramViews ? { views: histogramViews } : {}),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreOutgoingRequestHook: (request) => {
            try {
               const host = request?.headers?.host || request?.hostname || '';
               const path = request?.path || '';
               const protocol = request?.protocol || 'https:';
               const url = host ? `${protocol}//${host}${path}` : '';
               if (host.includes('otlp-gateway')) return true;
               if (exporterEndpoint && url && url.startsWith(exporterEndpoint.replace(/\/$/, ''))) return true;
             } catch {}
             return false;
           }
         }
       })
     ],
     traceSampler: new AlwaysOnSampler()
   });

   const startResult = sdk.start();
   if (startResult && typeof startResult.then === 'function') {
     await startResult;
   }

   const shutdown = async () => {
     try { await sdk.shutdown(); } catch {}
   };
   process.on('SIGTERM', shutdown);
   process.on('SIGINT', shutdown);
   process.on('exit', shutdown);

   module.exports = sdk;
 } catch (e) {
   console.error('[OTEL]: NodeSDK bootstrap failed:', e?.stack || e?.message || e);
   module.exports = null;
 }
})();