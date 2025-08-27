// KickTalk SLO Monitoring and Performance Budgets
const { metrics } = require('@opentelemetry/api');

const pkg = require('../../package.json');
const meter = metrics.getMeter('kicktalk-slo', pkg.version);

// SLO Target Definitions (Service Level Objectives)
const SLO_TARGETS = {
  // User-facing operations (critical for UX)
  MESSAGE_SEND_DURATION: {
    target: 2.0,      // 2 seconds max
    p99: 1.5,         // 99th percentile should be under 1.5s
    description: 'Message send latency'
  },
  CHATROOM_SWITCH_DURATION: {
    target: 0.5,      // 500ms max
    p99: 0.3,         // 99th percentile should be under 300ms
    description: 'Chatroom switching latency'
  },
  MESSAGE_PARSER_DURATION: {
    target: 0.05,     // 50ms max for message parsing
    p99: 0.02,        // 99th percentile should be under 20ms
    description: 'Message parsing performance'
  },
  WEBSOCKET_CONNECTION_TIME: {
    target: 5.0,      // 5 seconds to establish connection
    p99: 3.0,         // 99th percentile under 3s
    description: 'WebSocket connection establishment'
  },
  APP_STARTUP_DURATION: {
    target: 10.0,     // 10 seconds to fully start
    p99: 7.0,         // 99th percentile under 7s
    description: 'Application startup time'
  },
  EMOTE_SEARCH_DURATION: {
    target: 0.1,      // 100ms for emote search
    p99: 0.05,        // 99th percentile under 50ms
    description: 'Emote search performance'
  },
  // System performance
  MEMORY_USAGE_THRESHOLD: {
    target: 512 * 1024 * 1024,  // 512MB heap usage
    description: 'Memory usage threshold'
  },
  CPU_USAGE_THRESHOLD: {
    target: 80,       // 80% CPU usage
    description: 'CPU usage threshold'
  }
};

// SLO Violation Counters
const sloViolations = meter.createCounter('kicktalk_slo_violations_total', {
  description: 'Total number of SLO violations',
  unit: '1'
});

const sloLatency = meter.createHistogram('kicktalk_slo_latency_seconds', {
  description: 'Latency measurements for SLO tracking',
  unit: 's',
  boundaries: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0]
});

const sloSuccessRate = meter.createCounter('kicktalk_slo_success_rate_total', {
  description: 'Success rate tracking for SLO compliance',
  unit: '1'
});

const performanceBudget = meter.createObservableGauge('kicktalk_performance_budget_remaining', {
  description: 'Remaining performance budget as percentage',
  unit: '%'
});

// Performance budget tracking
let currentPerformanceBudgets = {
  message_send: { used: 0, budget: 100 },
  chatroom_switch: { used: 0, budget: 100 },
  memory_usage: { used: 0, budget: 100 },
  cpu_usage: { used: 0, budget: 100 }
};

// Add callback for performance budget gauge
performanceBudget.addCallback((observableResult) => {
  for (const [operation, budget] of Object.entries(currentPerformanceBudgets)) {
    const remaining = Math.max(0, budget.budget - budget.used);
    observableResult.observe(remaining, {
      operation,
      budget_type: 'performance'
    });
  }
});

// SLO Monitoring Helper
const SLOMonitor = {
  
  /**
   * Record an operation's latency and check against SLO
   */
  recordLatency(operation, durationSeconds, attributes = {}) {
    const sloConfig = SLO_TARGETS[operation];
    if (!sloConfig) {
      console.warn(`[SLO] Unknown operation: ${operation}`);
      return;
    }

    const isViolation = durationSeconds > sloConfig.target;
    const isP99Violation = durationSeconds > sloConfig.p99;
    
    // Record the latency
    sloLatency.record(durationSeconds, {
      operation,
      slo_target: sloConfig.target.toString(),
      ...attributes
    });

    // Record SLO compliance
    sloSuccessRate.add(1, {
      operation,
      status: isViolation ? 'violation' : 'success',
      severity: isP99Violation ? 'critical' : (isViolation ? 'warning' : 'ok'),
      ...attributes
    });

    // Record violation if applicable
    if (isViolation) {
      sloViolations.add(1, {
        operation,
        target_seconds: sloConfig.target.toString(),
        actual_seconds: durationSeconds.toFixed(3),
        severity: isP99Violation ? 'critical' : 'warning',
        ...attributes
      });
      
      console.warn(`[SLO VIOLATION] ${operation}: ${durationSeconds.toFixed(3)}s > ${sloConfig.target}s (${sloConfig.description})`);
    }

    return {
      isViolation,
      isP99Violation,
      target: sloConfig.target,
      p99Target: sloConfig.p99
    };
  },

  /**
   * Check resource usage against thresholds
   */
  checkResourceUsage(resourceType, currentValue, attributes = {}) {
    const thresholdKey = `${resourceType.toUpperCase()}_USAGE_THRESHOLD`;
    const threshold = SLO_TARGETS[thresholdKey];
    
    if (!threshold) {
      console.warn(`[SLO] Unknown resource type: ${resourceType}`);
      return;
    }

    const isViolation = currentValue > threshold.target;
    const utilizationPercent = (currentValue / threshold.target) * 100;
    
    // Record resource usage
    sloSuccessRate.add(1, {
      operation: `resource_${resourceType}`,
      status: isViolation ? 'violation' : 'success',
      utilization_percent: Math.round(utilizationPercent).toString(),
      ...attributes
    });

    if (isViolation) {
      sloViolations.add(1, {
        operation: `resource_${resourceType}`,
        threshold: threshold.target.toString(),
        actual_value: currentValue.toString(),
        utilization_percent: Math.round(utilizationPercent).toString(),
        severity: utilizationPercent > 150 ? 'critical' : 'warning',
        ...attributes
      });
      
      console.warn(`[SLO VIOLATION] ${resourceType} usage: ${currentValue} > ${threshold.target} (${Math.round(utilizationPercent)}% utilization)`);
    }

    // Update performance budget
    if (currentPerformanceBudgets[resourceType]) {
      currentPerformanceBudgets[resourceType].used = Math.min(100, utilizationPercent);
    }

    return {
      isViolation,
      utilizationPercent,
      threshold: threshold.target
    };
  },

  /**
   * Record operation success/failure rate
   */
  recordOperationResult(operation, success, durationSeconds = null, attributes = {}) {
    sloSuccessRate.add(1, {
      operation,
      status: success ? 'success' : 'failure',
      ...attributes
    });

    if (durationSeconds !== null) {
      this.recordLatency(operation, durationSeconds, attributes);
    }

    if (!success) {
      sloViolations.add(1, {
        operation,
        type: 'failure',
        severity: 'error',
        ...attributes
      });
    }
  },

  /**
   * Update performance budget usage
   */
  updatePerformanceBudget(operation, usedPercent) {
    if (currentPerformanceBudgets[operation]) {
      currentPerformanceBudgets[operation].used = Math.max(0, Math.min(100, usedPercent));
    }
  },

  /**
   * Get current SLO targets (useful for dynamic thresholds)
   */
  getSLOTarget(operation) {
    return SLO_TARGETS[operation];
  },

  /**
   * Get all SLO targets
   */
  getAllSLOTargets() {
    return { ...SLO_TARGETS };
  }
};

module.exports = {
  SLOMonitor,
  SLO_TARGETS,
  metrics: {
    sloViolations,
    sloLatency,
    sloSuccessRate,
    performanceBudget
  }
};