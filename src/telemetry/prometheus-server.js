// Prometheus metrics HTTP server for KickTalk
const http = require('http');

let metricsServer = null;
let isServerRunning = false;

// Start Prometheus metrics server
const startMetricsServer = (port = 9464) => {
  if (isServerRunning) {
    console.log('[Metrics]: Server already running');
    return;
  }

  try {
    // Try to use PrometheusRegistry from OpenTelemetry
    let PrometheusRegistry;
    try {
      const { PrometheusRegistry: PR } = require('@opentelemetry/exporter-prometheus');
      PrometheusRegistry = PR;
    } catch (error) {
      console.warn('[Metrics]: @opentelemetry/exporter-prometheus not available, using fallback');
      PrometheusRegistry = null;
    }

    if (PrometheusRegistry) {
      // Create the registry with proper configuration
      const registry = new PrometheusRegistry({
        port: port,
        endpoint: '/metrics',
      });

      // Start the registry (this creates the HTTP server internally)
      registry.startServer().then(() => {
        isServerRunning = true;
        console.log(`[Metrics]: Prometheus server started on http://localhost:${port}/metrics`);
      }).catch((error) => {
        console.error('[Metrics]: Failed to start Prometheus server:', error.message);
        // Fall through to fallback implementation
        throw error;
      });

      return true;
    } else {
      throw new Error('PrometheusRegistry not available');
    }
  } catch (error) {
    console.error('[Metrics]: Error setting up Prometheus server:', error.message);
    
    // Fallback: create a simple HTTP server that returns basic metrics
    try {
      const { metrics } = require('@opentelemetry/api');
      
      metricsServer = http.createServer((req, res) => {
        if (req.url === '/metrics' && req.method === 'GET') {
          res.writeHead(200, { 
            'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' 
          });
          
          // Basic health metric
          const uptime = process.uptime();
          const memUsage = process.memoryUsage();
          
          let output = '';
          output += '# HELP kicktalk_up Application is running\n';
          output += '# TYPE kicktalk_up gauge\n';
          output += 'kicktalk_up 1\n';
          
          output += '# HELP kicktalk_uptime_seconds Application uptime in seconds\n';
          output += '# TYPE kicktalk_uptime_seconds counter\n';
          output += `kicktalk_uptime_seconds ${uptime}\n`;
          
          output += '# HELP kicktalk_memory_heap_used_bytes Memory heap used in bytes\n';
          output += '# TYPE kicktalk_memory_heap_used_bytes gauge\n';
          output += `kicktalk_memory_heap_used_bytes ${memUsage.heapUsed}\n`;
          
          output += '# HELP kicktalk_memory_heap_total_bytes Memory heap total in bytes\n';
          output += '# TYPE kicktalk_memory_heap_total_bytes gauge\n';
          output += `kicktalk_memory_heap_total_bytes ${memUsage.heapTotal}\n`;
          
          res.end(output);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found - Try /metrics\n');
        }
      });

      metricsServer.listen(port, '0.0.0.0', () => {
        isServerRunning = true;
        console.log(`[Metrics]: Fallback metrics server started on http://0.0.0.0:${port}/metrics`);
      });

      metricsServer.on('error', (error) => {
        console.error('[Metrics]: Metrics server error:', error.message);
        isServerRunning = false;
      });

      return true;
    } catch (fallbackError) {
      console.error('[Metrics]: Failed to create fallback metrics server:', fallbackError.message);
      return false;
    }
  }
};

// Stop Prometheus metrics server
const stopMetricsServer = () => {
  if (!isServerRunning) {
    return;
  }

  try {
    if (metricsServer) {
      metricsServer.close(() => {
        console.log('[Metrics]: Metrics server stopped');
        isServerRunning = false;
        metricsServer = null;
      });
    } else {
      console.log('[Metrics]: Metrics server stopped');
      isServerRunning = false;
    }
  } catch (error) {
    console.error('[Metrics]: Error stopping metrics server:', error.message);
  }
};

module.exports = {
  startMetricsServer,
  stopMetricsServer,
  isRunning: () => isServerRunning
};