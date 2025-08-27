// KickTalk Dashboard Configuration for Grafana
// This file provides configuration templates and queries for building observability dashboards

const DASHBOARD_CONFIG = {
  // SLO Dashboard Configuration
  slo_panels: {
    message_send_latency: {
      title: "Message Send Latency SLO",
      description: "Message send performance vs 2s target",
      target_seconds: 2.0,
      p99_target_seconds: 1.5,
      queries: {
        // PromQL queries for Grafana
        latency_histogram: 'histogram_quantile(0.95, sum(rate(kicktalk_slo_latency_seconds_bucket{operation="MESSAGE_SEND_DURATION"}[5m])) by (le))',
        success_rate: 'sum(rate(kicktalk_slo_success_rate_total{operation="MESSAGE_SEND_DURATION",status="success"}[5m])) / sum(rate(kicktalk_slo_success_rate_total{operation="MESSAGE_SEND_DURATION"}[5m])) * 100',
        violations: 'sum(rate(kicktalk_slo_violations_total{operation="MESSAGE_SEND_DURATION"}[5m]))'
      }
    },
    chatroom_switch_latency: {
      title: "Chatroom Switch Latency SLO", 
      description: "Chatroom switching performance vs 500ms target",
      target_seconds: 0.5,
      p99_target_seconds: 0.3,
      queries: {
        latency_histogram: 'histogram_quantile(0.95, sum(rate(kicktalk_slo_latency_seconds_bucket{operation="CHATROOM_SWITCH_DURATION"}[5m])) by (le))',
        success_rate: 'sum(rate(kicktalk_slo_success_rate_total{operation="CHATROOM_SWITCH_DURATION",status="success"}[5m])) / sum(rate(kicktalk_slo_success_rate_total{operation="CHATROOM_SWITCH_DURATION"}[5m])) * 100',
        violations: 'sum(rate(kicktalk_slo_violations_total{operation="CHATROOM_SWITCH_DURATION"}[5m]))'
      }
    },
    message_parser_performance: {
      title: "Message Parser Performance SLO",
      description: "Message parsing performance vs 50ms target", 
      target_seconds: 0.05,
      p99_target_seconds: 0.02,
      queries: {
        latency_histogram: 'histogram_quantile(0.95, sum(rate(kicktalk_slo_latency_seconds_bucket{operation="MESSAGE_PARSER_DURATION"}[5m])) by (le))',
        success_rate: 'sum(rate(kicktalk_slo_success_rate_total{operation="MESSAGE_PARSER_DURATION",status="success"}[5m])) / sum(rate(kicktalk_slo_success_rate_total{operation="MESSAGE_PARSER_DURATION"}[5m])) * 100',
        violations: 'sum(rate(kicktalk_slo_violations_total{operation="MESSAGE_PARSER_DURATION"}[5m]))'
      }
    },
    emote_search_performance: {
      title: "Emote Search Performance SLO",
      description: "Emote search performance vs 100ms target",
      target_seconds: 0.1,
      p99_target_seconds: 0.05,
      queries: {
        latency_histogram: 'histogram_quantile(0.95, sum(rate(kicktalk_slo_latency_seconds_bucket{operation="EMOTE_SEARCH_DURATION"}[5m])) by (le))',
        success_rate: 'sum(rate(kicktalk_slo_success_rate_total{operation="EMOTE_SEARCH_DURATION",status="success"}[5m])) / sum(rate(kicktalk_slo_success_rate_total{operation="EMOTE_SEARCH_DURATION"}[5m])) * 100',
        violations: 'sum(rate(kicktalk_slo_violations_total{operation="EMOTE_SEARCH_DURATION"}[5m]))'
      }
    }
  },

  // Performance Budget Dashboard
  performance_budget_panels: {
    memory_usage_budget: {
      title: "Memory Usage Performance Budget",
      description: "Memory usage vs 512MB budget",
      queries: {
        current_usage: 'kicktalk_memory_usage_bytes{type="heap_used"}',
        budget_remaining: 'kicktalk_performance_budget_remaining{operation="memory_usage"}',
        utilization_percent: '(kicktalk_memory_usage_bytes{type="heap_used"} / (512 * 1024 * 1024)) * 100'
      }
    },
    cpu_usage_budget: {
      title: "CPU Usage Performance Budget", 
      description: "CPU usage vs 80% budget",
      queries: {
        current_usage: 'kicktalk_cpu_usage_percent',
        budget_remaining: 'kicktalk_performance_budget_remaining{operation="cpu_usage"}',
        utilization_percent: 'kicktalk_cpu_usage_percent'
      }
    }
  },

  // Connection Health Dashboard
  connection_health_panels: {
    websocket_connections: {
      title: "Active WebSocket Connections",
      description: "Real-time WebSocket connection status",
      queries: {
        active_connections: 'kicktalk_websocket_connections_active',
        connection_errors: 'rate(kicktalk_connection_errors_total[5m])',
        reconnections: 'rate(kicktalk_websocket_reconnections_total[5m])',
        seventv_connections: 'kicktalk_seventv_connections_total'
      }
    },
    connection_establishment: {
      title: "WebSocket Connection Establishment", 
      description: "Connection setup performance vs 5s target",
      queries: {
        establishment_time: 'histogram_quantile(0.95, sum(rate(kicktalk_slo_latency_seconds_bucket{operation="WEBSOCKET_CONNECTION_TIME"}[5m])) by (le))',
        success_rate: 'sum(rate(kicktalk_slo_success_rate_total{operation="websocket_connection",status="success"}[5m])) / sum(rate(kicktalk_slo_success_rate_total{operation="websocket_connection"}[5m])) * 100'
      }
    }
  },

  // Application Health Dashboard
  app_health_panels: {
    startup_performance: {
      title: "Application Startup Performance",
      description: "Startup time vs 10s target",
      queries: {
        startup_duration: 'histogram_quantile(0.95, sum(rate(kicktalk_slo_latency_seconds_bucket{operation="APP_STARTUP_DURATION"}[5m])) by (le))',
        startup_phases: 'kicktalk_api_request_duration_seconds{operation="startup"}'
      }
    },
    message_throughput: {
      title: "Message Throughput",
      description: "Message processing rates",
      queries: {
        messages_sent_rate: 'rate(kicktalk_messages_sent_total[5m])',
        messages_received_rate: 'rate(kicktalk_messages_received_total[5m])',
        message_send_success_rate: 'sum(rate(kicktalk_slo_success_rate_total{operation="message_send",status="success"}[5m])) / sum(rate(kicktalk_slo_success_rate_total{operation="message_send"}[5m])) * 100'
      }
    }
  },

  // Alert Rules Configuration
  alert_rules: {
    slo_violations: [
      {
        name: "Message Send SLO Violation",
        description: "Message send latency exceeds 2s target",
        condition: 'histogram_quantile(0.95, sum(rate(kicktalk_slo_latency_seconds_bucket{operation="MESSAGE_SEND_DURATION"}[5m])) by (le)) > 2',
        severity: "warning",
        duration: "2m"
      },
      {
        name: "Chatroom Switch SLO Violation", 
        description: "Chatroom switch latency exceeds 500ms target",
        condition: 'histogram_quantile(0.95, sum(rate(kicktalk_slo_latency_seconds_bucket{operation="CHATROOM_SWITCH_DURATION"}[5m])) by (le)) > 0.5',
        severity: "warning", 
        duration: "1m"
      },
      {
        name: "Memory Usage Critical",
        description: "Memory usage exceeds 512MB limit",
        condition: 'kicktalk_memory_usage_bytes{type="heap_used"} > (512 * 1024 * 1024)',
        severity: "critical",
        duration: "30s"
      },
      {
        name: "High Error Rate",
        description: "Error rate exceeds 5% over 5 minutes", 
        condition: 'sum(rate(kicktalk_connection_errors_total[5m])) / sum(rate(kicktalk_api_requests_total[5m])) * 100 > 5',
        severity: "critical",
        duration: "5m"
      }
    ]
  }
};

// Utility functions for dashboard building
const DashboardUtils = {
  
  /**
   * Generate PromQL query for SLO compliance
   */
  generateSLOComplianceQuery(operation, timeRange = '1h') {
    return `sum(rate(kicktalk_slo_success_rate_total{operation="${operation}",status="success"}[5m])) / sum(rate(kicktalk_slo_success_rate_total{operation="${operation}"}[5m])) * 100`;
  },

  /**
   * Generate PromQL query for latency percentile
   */
  generateLatencyPercentileQuery(operation, percentile = 0.95, timeRange = '5m') {
    return `histogram_quantile(${percentile}, sum(rate(kicktalk_slo_latency_seconds_bucket{operation="${operation}"}[${timeRange}])) by (le))`;
  },

  /**
   * Generate PromQL query for error rate
   */
  generateErrorRateQuery(operation, timeRange = '5m') {
    return `sum(rate(kicktalk_slo_violations_total{operation="${operation}"}[${timeRange}]))`;
  },

  /**
   * Generate alert rule condition
   */
  generateAlertCondition(operation, target, percentile = 0.95) {
    return `${this.generateLatencyPercentileQuery(operation, percentile)} > ${target}`;
  },

  /**
   * Get all configured SLO targets
   */
  getSLOTargets() {
    return {
      'MESSAGE_SEND_DURATION': { target: 2.0, p99: 1.5 },
      'CHATROOM_SWITCH_DURATION': { target: 0.5, p99: 0.3 },
      'MESSAGE_PARSER_DURATION': { target: 0.05, p99: 0.02 },
      'EMOTE_SEARCH_DURATION': { target: 0.1, p99: 0.05 },
      'WEBSOCKET_CONNECTION_TIME': { target: 5.0, p99: 3.0 },
      'APP_STARTUP_DURATION': { target: 10.0, p99: 7.0 }
    };
  }
};

module.exports = {
  DASHBOARD_CONFIG,
  DashboardUtils
};