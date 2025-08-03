/**
 * Legacy telemetry bootstrap is disabled in favor of NodeSDK (see src/telemetry/tracing.js).
 * This file remains as a no-op to preserve require() compatibility if referenced elsewhere.
 */
module.exports = {
  initTelemetry: () => {},
  shutdownTelemetry: async () => {},
  metrics: {}
};