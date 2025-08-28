// KickTalk Performance Budget & User Experience Impact Analysis
const { metrics, trace } = require('@opentelemetry/api');
const { ErrorMonitor } = require('./error-monitoring');

// Lazy load UserAnalytics to avoid circular dependency
let UserAnalytics = null;

const pkg = require('../../package.json');
const meter = metrics.getMeter('kicktalk-performance-budget', pkg.version);
const tracer = trace.getTracer('kicktalk-performance-budget', pkg.version);

// Performance Budget Metrics
const performanceBudgetViolation = meter.createCounter('kicktalk_performance_budget_violations_total', {
  description: 'Performance budget violations by category',
  unit: '1'
});

const uiRenderTime = meter.createHistogram('kicktalk_ui_render_time_ms', {
  description: 'UI component render time',
  unit: 'ms',
  boundaries: [1, 5, 10, 16, 33, 50, 100, 250]
});

const memoryUsage = meter.createObservableGauge('kicktalk_memory_usage_mb', {
  description: 'Application memory usage in MB',
  unit: 'MB'
});

const cpuUsage = meter.createObservableGauge('kicktalk_cpu_usage_percent', {
  description: 'Application CPU usage percentage',
  unit: '%'
});

const bundleSize = meter.createObservableGauge('kicktalk_bundle_size_kb', {
  description: 'Application bundle size in KB',
  unit: 'KB'
});

const performanceScore = meter.createObservableGauge('kicktalk_performance_score', {
  description: 'Overall performance score (0-100)',
  unit: '1'
});

// Performance Budget Thresholds
const PERFORMANCE_BUDGETS = {
  // UI Responsiveness Budgets
  UI_INTERACTION: {
    good: 100,     // < 100ms excellent
    acceptable: 250, // < 250ms acceptable
    poor: 500,     // > 500ms poor
    critical: 1000  // > 1000ms critical
  },
  
  // Rendering Performance
  COMPONENT_RENDER: {
    good: 16,      // < 16ms (60fps)
    acceptable: 33,  // < 33ms (30fps)
    poor: 50,      // < 50ms (20fps)
    critical: 100   // > 100ms (10fps)
  },
  
  // Memory Usage
  MEMORY_USAGE: {
    good: 200,        // < 200MB excellent
    acceptable: 500,   // < 500MB acceptable
    poor: 800,        // < 800MB poor
    critical: 1200    // > 1200MB critical
  },
  
  // CPU Usage
  CPU_USAGE: {
    good: 10,         // < 10% excellent
    acceptable: 25,    // < 25% acceptable
    poor: 50,         // < 50% poor
    critical: 75      // > 75% critical
  },
  
  // Network Performance
  WEBSOCKET_LATENCY: {
    good: 50,         // < 50ms excellent
    acceptable: 100,   // < 100ms acceptable
    poor: 250,        // < 250ms poor
    critical: 500     // > 500ms critical
  },
  
  // Bundle Size (affects startup time)
  BUNDLE_SIZE: {
    good: 1024,       // < 1MB excellent
    acceptable: 2048,  // < 2MB acceptable
    poor: 5120,       // < 5MB poor
    critical: 10240   // > 10MB critical
  }
};

// Performance impact correlation data
let performanceTrackingData = {
  violations: [],
  user_impact_events: [],
  resource_usage_history: [],
  render_performance_history: []
};

// System resource monitoring
let systemResourceData = {
  memory_usage: 0,
  cpu_usage: 0,
  bundle_sizes: new Map()
};

class PerformanceBudgetMonitor {
  constructor() {
    this.violationThresholds = { ...PERFORMANCE_BUDGETS };
    this.isMonitoring = true;
    this.performanceScore = 100;
    this.recentViolations = new Map(); // Category -> count in last 5 minutes
    
    // Start resource monitoring
    this.startResourceMonitoring();
    
    // Performance score calculation interval
    setInterval(() => this.calculatePerformanceScore(), 30000); // Every 30 seconds
  }

  /**
   * Monitor UI interaction performance
   */
  monitorUIInteraction(interactionType, executionTime, context = {}) {
    const budget = this.violationThresholds.UI_INTERACTION;
    const severity = this.getSeverityLevel(executionTime, budget);
    
    if (severity !== 'good') {
      this.recordBudgetViolation('UI_INTERACTION', severity, executionTime, {
        interaction_type: interactionType,
        expected_threshold: budget.acceptable,
        actual_time: executionTime,
        ...context
      });

      // Correlate with user satisfaction
      if (context.session_id) {
        this.recordUserImpact(context.session_id, 'ui_lag', severity, {
          interaction_type: interactionType,
          lag_time: executionTime
        });
      }
    }

    console.log(`[Performance Budget] UI ${interactionType}: ${executionTime}ms (${severity})`);
    return severity;
  }

  /**
   * Monitor component render performance
   */
  monitorComponentRender(componentName, renderTime, context = {}) {
    const budget = this.violationThresholds.COMPONENT_RENDER;
    const severity = this.getSeverityLevel(renderTime, budget);

    uiRenderTime.record(renderTime, {
      component: componentName,
      render_type: context.render_type || 'update',
      severity
    });

    if (severity !== 'good') {
      this.recordBudgetViolation('COMPONENT_RENDER', severity, renderTime, {
        component: componentName,
        expected_threshold: budget.acceptable,
        actual_time: renderTime,
        ...context
      });
    }

    // Store render performance history
    performanceTrackingData.render_performance_history.push({
      timestamp: Date.now(),
      component: componentName,
      render_time: renderTime,
      severity
    });

    // Keep last 1000 render events
    if (performanceTrackingData.render_performance_history.length > 1000) {
      performanceTrackingData.render_performance_history = 
        performanceTrackingData.render_performance_history.slice(-1000);
    }

    return severity;
  }

  /**
   * Monitor WebSocket latency performance
   */
  monitorWebSocketLatency(latency, context = {}) {
    const budget = this.violationThresholds.WEBSOCKET_LATENCY;
    const severity = this.getSeverityLevel(latency, budget);

    if (severity !== 'good') {
      this.recordBudgetViolation('WEBSOCKET_LATENCY', severity, latency, {
        expected_threshold: budget.acceptable,
        actual_latency: latency,
        ...context
      });

      // High latency affects user experience significantly
      if (context.session_id) {
        this.recordUserImpact(context.session_id, 'connection_lag', severity, {
          latency,
          channel: context.channel
        });
      }
    }

    console.log(`[Performance Budget] WebSocket latency: ${latency}ms (${severity})`);
    return severity;
  }

  /**
   * Monitor memory usage
   */
  monitorMemoryUsage(memoryMB, context = {}) {
    const budget = this.violationThresholds.MEMORY_USAGE;
    const severity = this.getSeverityLevel(memoryMB, budget);

    systemResourceData.memory_usage = memoryMB;

    if (severity !== 'good') {
      this.recordBudgetViolation('MEMORY_USAGE', severity, memoryMB, {
        expected_threshold: budget.acceptable,
        actual_usage: memoryMB,
        ...context
      });

      // High memory usage can cause system-wide performance issues
      if (severity === 'critical') {
        console.warn(`[Performance Budget] Critical memory usage: ${memoryMB}MB`);
      }
    }

    // Store resource usage history
    performanceTrackingData.resource_usage_history.push({
      timestamp: Date.now(),
      memory_mb: memoryMB,
      severity
    });

    // Keep last 500 resource measurements
    if (performanceTrackingData.resource_usage_history.length > 500) {
      performanceTrackingData.resource_usage_history = 
        performanceTrackingData.resource_usage_history.slice(-500);
    }

    return severity;
  }

  /**
   * Monitor CPU usage
   */
  monitorCPUUsage(cpuPercent, context = {}) {
    const budget = this.violationThresholds.CPU_USAGE;
    const severity = this.getSeverityLevel(cpuPercent, budget);

    systemResourceData.cpu_usage = cpuPercent;

    if (severity !== 'good') {
      this.recordBudgetViolation('CPU_USAGE', severity, cpuPercent, {
        expected_threshold: budget.acceptable,
        actual_usage: cpuPercent,
        ...context
      });

      if (severity === 'critical') {
        console.warn(`[Performance Budget] Critical CPU usage: ${cpuPercent}%`);
      }
    }

    return severity;
  }

  /**
   * Monitor bundle size
   */
  monitorBundleSize(bundleName, sizeKB) {
    const budget = this.violationThresholds.BUNDLE_SIZE;
    const severity = this.getSeverityLevel(sizeKB, budget);

    systemResourceData.bundle_sizes.set(bundleName, sizeKB);

    if (severity !== 'good') {
      this.recordBudgetViolation('BUNDLE_SIZE', severity, sizeKB, {
        bundle_name: bundleName,
        expected_threshold: budget.acceptable,
        actual_size: sizeKB
      });
    }

    console.log(`[Performance Budget] Bundle ${bundleName}: ${sizeKB}KB (${severity})`);
    return severity;
  }

  /**
   * Record performance budget violation
   */
  recordBudgetViolation(category, severity, actualValue, context = {}) {
    performanceBudgetViolation.add(1, {
      budget_category: category,
      severity,
      violation_magnitude: this.getViolationMagnitude(category, actualValue),
      ...context
    });

    // Track violations for performance score calculation
    const violationKey = `${category}_${severity}`;
    const currentCount = this.recentViolations.get(violationKey) || 0;
    this.recentViolations.set(violationKey, currentCount + 1);

    // Store violation for correlation analysis
    performanceTrackingData.violations.push({
      timestamp: Date.now(),
      category,
      severity,
      actual_value: actualValue,
      context
    });

    // Keep last 500 violations
    if (performanceTrackingData.violations.length > 500) {
      performanceTrackingData.violations = performanceTrackingData.violations.slice(-500);
    }

    // Adjust performance score
    this.adjustPerformanceScore(severity);

    console.warn(`[Performance Budget] ${category} violation: ${actualValue} (${severity})`);
  }

  /**
   * Record user impact from performance issues
   */
  recordUserImpact(sessionId, impactType, severity, context = {}) {
    const impactEvent = {
      timestamp: Date.now(),
      session_id: sessionId,
      impact_type: impactType,
      severity,
      context
    };

    performanceTrackingData.user_impact_events.push(impactEvent);

    // Keep last 200 impact events
    if (performanceTrackingData.user_impact_events.length > 200) {
      performanceTrackingData.user_impact_events = 
        performanceTrackingData.user_impact_events.slice(-200);
    }

    // Try to correlate with user satisfaction if session is active
    try {
      if (!UserAnalytics) {
        UserAnalytics = require('./user-analytics').UserAnalytics;
      }
      if (UserAnalytics && typeof UserAnalytics.recordUserAction === 'function') {
        UserAnalytics.recordUserAction(sessionId, 'performance_impact', {
          impact_type: impactType,
          severity,
          ...context
        });
      }
    } catch (error) {
      console.warn('[Performance Budget] Could not correlate with user analytics:', error.message);
    }

    console.log(`[Performance Budget] User impact: ${impactType} (${severity}) for session ${sessionId}`);
  }

  /**
   * Get severity level based on thresholds
   */
  getSeverityLevel(value, budget) {
    if (value <= budget.good) return 'good';
    if (value <= budget.acceptable) return 'acceptable';
    if (value <= budget.poor) return 'poor';
    return 'critical';
  }

  /**
   * Get violation magnitude for scoring
   */
  getViolationMagnitude(category, actualValue) {
    const budget = this.violationThresholds[category];
    const acceptableThreshold = budget.acceptable;
    
    if (actualValue <= acceptableThreshold) return 'minor';
    if (actualValue <= acceptableThreshold * 2) return 'moderate';
    if (actualValue <= acceptableThreshold * 3) return 'major';
    return 'severe';
  }

  /**
   * Adjust performance score based on violation severity
   */
  adjustPerformanceScore(severity) {
    let penalty = 0;
    switch (severity) {
      case 'acceptable': penalty = -1; break;
      case 'poor': penalty = -3; break;
      case 'critical': penalty = -8; break;
      default: penalty = 0;
    }

    this.performanceScore = Math.max(0, Math.min(100, this.performanceScore + penalty));
  }

  /**
   * Calculate overall performance score
   */
  calculatePerformanceScore() {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);

    // Reset recent violations older than 5 minutes
    const recentViolations = performanceTrackingData.violations.filter(
      v => v.timestamp > fiveMinutesAgo
    );

    // Calculate score based on recent performance
    let score = 100;

    // Penalty for violations in last 5 minutes
    recentViolations.forEach(violation => {
      switch (violation.severity) {
        case 'acceptable': score -= 0.5; break;
        case 'poor': score -= 2; break;
        case 'critical': score -= 5; break;
      }
    });

    // Bonus for sustained good performance
    if (recentViolations.length === 0 && this.performanceScore < 95) {
      score = Math.min(100, this.performanceScore + 2);
    }

    this.performanceScore = Math.max(0, score);
    console.log(`[Performance Budget] Performance score: ${this.performanceScore.toFixed(1)}/100`);

    return this.performanceScore;
  }

  /**
   * Start system resource monitoring
   */
  startResourceMonitoring() {
    if (typeof process !== 'undefined') {
      setInterval(() => {
        try {
          const memUsage = process.memoryUsage();
          const memMB = Math.round(memUsage.rss / 1024 / 1024);
          
          this.monitorMemoryUsage(memMB);

          // CPU usage monitoring (simplified)
          const cpuUsage = process.cpuUsage();
          // This is a simplified CPU calculation - in practice you'd want more sophisticated monitoring
          
        } catch (error) {
          console.warn('[Performance Budget] Resource monitoring error:', error.message);
        }
      }, 10000); // Every 10 seconds
    }
  }

  /**
   * Get performance analytics data
   */
  getPerformanceData() {
    return {
      current_score: this.performanceScore,
      recent_violations: performanceTrackingData.violations.slice(-50),
      user_impact_events: performanceTrackingData.user_impact_events.slice(-50),
      resource_usage: {
        memory_mb: systemResourceData.memory_usage,
        cpu_percent: systemResourceData.cpu_usage
      },
      budget_thresholds: this.violationThresholds,
      render_performance: performanceTrackingData.render_performance_history.slice(-100)
    };
  }

  /**
   * Reset performance tracking (for testing)
   */
  resetTracking() {
    performanceTrackingData = {
      violations: [],
      user_impact_events: [],
      resource_usage_history: [],
      render_performance_history: []
    };
    this.performanceScore = 100;
    this.recentViolations.clear();
  }
}

// Global performance budget monitor instance
const performanceBudgetMonitor = new PerformanceBudgetMonitor();

// Observable gauge callbacks
memoryUsage.addCallback((observableResult) => {
  observableResult.observe(systemResourceData.memory_usage, {
    resource_type: 'rss_memory'
  });
});

cpuUsage.addCallback((observableResult) => {
  observableResult.observe(systemResourceData.cpu_usage, {
    resource_type: 'process_cpu'
  });
});

bundleSize.addCallback((observableResult) => {
  for (const [bundleName, sizeKB] of systemResourceData.bundle_sizes) {
    observableResult.observe(sizeKB, {
      bundle_name: bundleName
    });
  }
});

performanceScore.addCallback((observableResult) => {
  observableResult.observe(performanceBudgetMonitor.performanceScore, {
    measurement_type: 'overall'
  });
});

module.exports = {
  PerformanceBudgetMonitor,
  performanceBudgetMonitor,
  PERFORMANCE_BUDGETS,
  metrics: {
    performanceBudgetViolation,
    uiRenderTime,
    memoryUsage,
    cpuUsage,
    bundleSize,
    performanceScore
  }
};