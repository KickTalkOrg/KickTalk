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

(async () => {
 try {
   if (process.env.OTEL_DIAG_LOG_LEVEL) {
     const level = DiagLogLevel[process.env.OTEL_DIAG_LOG_LEVEL.toUpperCase()] ?? DiagLogLevel.INFO;
     diag.setLogger(new DiagConsoleLogger(), level);
   }

   const sdk = new NodeSDK({
     traceExporter: new OTLPTraceExporter(),
     metricExporter: new OTLPMetricExporter(),
     instrumentations: [],
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