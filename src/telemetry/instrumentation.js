/**
* Deprecated: custom OpenTelemetry providers removed.
* Telemetry is initialized by NodeSDK in src/telemetry/tracing.js, driven by OTEL_* envs.
* This module remains for backward-compat requires and exports no-ops.
*/
module.exports = {
 tracer: null,
 provider: null,
 initializeTelemetry: () => false,
 shutdown: async () => {}
};