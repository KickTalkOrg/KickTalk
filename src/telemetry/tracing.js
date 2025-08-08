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

(async () => {
 try {
   if (process.env.OTEL_DIAG_LOG_LEVEL) {
     const level = DiagLogLevel[process.env.OTEL_DIAG_LOG_LEVEL.toUpperCase()] ?? DiagLogLevel.INFO;
     diag.setLogger(new DiagConsoleLogger(), level);
   }

   const exporterEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
     || process.env.OTEL_EXPORTER_OTLP_ENDPOINT
     || '';

   const sdk = new NodeSDK({
     traceExporter: new OTLPTraceExporter(),
     metricExporter: new OTLPMetricExporter(),
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