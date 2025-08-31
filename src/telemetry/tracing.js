/**
* Minimal OpenTelemetry NodeSDK bootstrap for Electron main process.
* - Driven entirely by standard OTEL_* env variables.
* - No custom env normalization, no manual verification spans.
* - Keep preload/renderer free of telemetry init.
*/
try {
  require('dotenv').config();
} catch {}

// Check if telemetry is enabled in user settings
let telemetryEnabled = false;
try {
  const StoreMod = require('electron-store');
  const ElectronStore = StoreMod && StoreMod.default ? StoreMod.default : StoreMod;
  const store = new ElectronStore();
  const telemetrySettings = store.get('telemetry', { enabled: false });
  telemetryEnabled = telemetrySettings.enabled === true;
  
  if (!telemetryEnabled) {
    console.log('[Telemetry] Telemetry disabled by user settings, skipping initialization');
    module.exports = null;
  }
} catch (error) {
  console.warn('[Telemetry] Could not check user settings:', error.message);
  module.exports = null;
}

// Only proceed with telemetry setup if enabled
if (telemetryEnabled) {
  // Best-effort resolver to handle AppImage and asar layouts
  // Tries normal require first, then falls back to app.asar.unpacked/node_modules
  function safeRequire(modName) {
  try {
    return require(modName);
  } catch (e1) {
    try {
      const path = require('path');
      const base = (process.resourcesPath || '').toString();
      if (base) {
        const candidate = path.join(base, 'app.asar.unpacked', 'node_modules', modName);
        return require(candidate);
      }
    } catch {}
    throw e1;
  }
}

  // Defer and guard all OpenTelemetry requires. In packaged builds (AppImage),
  // certain packaging layouts and asar can cause resolution issues. We avoid crashing the app
  // if any telemetry dependency is unavailable by bailing out gracefully.
  let NodeSDK,
    diag,
    DiagConsoleLogger,
    DiagLogLevel,
    OTLPTraceExporter,
    OTLPMetricExporter,
    AlwaysOnSampler,
    View,
    ExplicitBucketHistogramAggregation,
    HttpInstrumentation;
  let __otelReady = true;
  try {
    ({ NodeSDK } = safeRequire('@opentelemetry/sdk-node'));
    ({ diag, DiagConsoleLogger, DiagLogLevel } = safeRequire('@opentelemetry/api'));
    ({ OTLPTraceExporter } = safeRequire('@opentelemetry/exporter-trace-otlp-http'));
    ({ OTLPMetricExporter } = safeRequire('@opentelemetry/exporter-metrics-otlp-http'));
    ({ AlwaysOnSampler } = safeRequire('@opentelemetry/sdk-trace-base'));
    ({ HttpInstrumentation } = safeRequire('@opentelemetry/instrumentation-http'));
    // Views are optional; load defensively to avoid runtime mismatches across package versions
    try {
      ({ View, ExplicitBucketHistogramAggregation } = safeRequire('@opentelemetry/sdk-metrics'));
    } catch {}
  } catch (requireErr) {
    console.error('[Telemetry] OpenTelemetry modules are not available, disabling telemetry:', requireErr?.message || requireErr);
    __otelReady = false;
  }

  (async () => {
   try {
    if (!__otelReady) {
    module.exports = null;
    return;
  }
   if (process.env.OTEL_DIAG_LOG_LEVEL) {
     const level = DiagLogLevel[process.env.OTEL_DIAG_LOG_LEVEL.toUpperCase()] ?? DiagLogLevel.INFO;
     diag.setLogger(new DiagConsoleLogger(), level);
   }


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

  // Using manual HTTP instrumentation (auto-instrumentations removed for packaged builds)
  const instrumentations = [
    new HttpInstrumentation({
      ignoreOutgoingRequestHook: (request) => {
        try {
          const host = request?.headers?.host || request?.hostname || '';
          // Ignore OTLP exporter requests to prevent instrumentation loops
          if (host.includes('otlp-gateway')) return true;
          if (host.includes('grafana.net')) return true;
        } catch {}
        return false;
      }
    })
  ];
  console.log('[Telemetry] Using manual HTTP instrumentation');

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter(),
      metricExporter: new OTLPMetricExporter(),
      ...(histogramViews ? { views: histogramViews } : {}),
      instrumentations,
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
}