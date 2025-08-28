// KickTalk User Experience Analytics & Session Tracking
const { metrics, trace, context } = require('@opentelemetry/api');
const { ErrorMonitor } = require('./error-monitoring');

const pkg = require('../../package.json');
const meter = metrics.getMeter('kicktalk-user-analytics', pkg.version);
const tracer = trace.getTracer('kicktalk-user-analytics', pkg.version);

// User Experience Metrics
const sessionDuration = meter.createHistogram('kicktalk_session_duration_seconds', {
  description: 'User session duration in seconds',
  unit: 's',
  boundaries: [60, 300, 900, 1800, 3600, 7200, 14400] // 1min to 4hrs
});

const userActions = meter.createCounter('kicktalk_user_actions_total', {
  description: 'Total user actions by type',
  unit: '1'
});

const featureUsage = meter.createCounter('kicktalk_feature_usage_total', {
  description: 'Feature usage by type and context',
  unit: '1'
});

const chatEngagement = meter.createHistogram('kicktalk_chat_engagement_seconds', {
  description: 'Time spent actively engaging with chat',
  unit: 's',
  boundaries: [1, 5, 15, 60, 300, 900, 1800]
});

const uiInteractionTime = meter.createHistogram('kicktalk_ui_interaction_time_ms', {
  description: 'UI response time for user interactions',
  unit: 'ms',
  boundaries: [10, 50, 100, 250, 500, 1000, 2000]
});

const userSatisfactionScore = meter.createObservableGauge('kicktalk_user_satisfaction_score', {
  description: 'Calculated user satisfaction score based on behavior',
  unit: '1'
});

const connectionQuality = meter.createObservableGauge('kicktalk_connection_quality_score', {
  description: 'Connection quality score affecting user experience',
  unit: '1'
});

// User Behavior Patterns
const USER_ACTION_TYPES = {
  CHAT_SEND: 'chat_send',
  CHAT_SCROLL: 'chat_scroll',
  EMOTE_USE: 'emote_use',
  EMOTE_SEARCH: 'emote_search',
  CHANNEL_SWITCH: 'channel_switch',
  SETTINGS_CHANGE: 'settings_change',
  WINDOW_FOCUS: 'window_focus',
  WINDOW_BLUR: 'window_blur',
  THEME_CHANGE: 'theme_change',
  FILTER_TOGGLE: 'filter_toggle',
  MODERATION_ACTION: 'moderation_action'
};

const FEATURE_CATEGORIES = {
  CHAT: {
    name: 'chat',
    actions: ['send_message', 'scroll', 'search', 'filter'],
    engagement_weight: 1.0
  },
  EMOTES: {
    name: 'emotes',
    actions: ['use_emote', 'search_emote', 'favorite_emote'],
    engagement_weight: 0.8
  },
  MODERATION: {
    name: 'moderation',
    actions: ['timeout_user', 'ban_user', 'delete_message'],
    engagement_weight: 0.6
  },
  CUSTOMIZATION: {
    name: 'customization',
    actions: ['change_theme', 'adjust_settings', 'configure_filters'],
    engagement_weight: 0.4
  },
  NAVIGATION: {
    name: 'navigation',
    actions: ['switch_channel', 'open_settings', 'toggle_sidebar'],
    engagement_weight: 0.3
  }
};

// Session tracking state
let activeSessions = new Map();
let userBehaviorData = new Map();
let featureAdoptionData = new Map();

// Performance impact correlation data
let performanceCorrelationData = {
  ui_interactions: [],
  connection_events: [],
  error_impact_sessions: new Set()
};

// User satisfaction scoring factors
const SATISFACTION_FACTORS = {
  RESPONSE_TIME_WEIGHT: 0.3,
  ERROR_RATE_WEIGHT: 0.25,
  ENGAGEMENT_WEIGHT: 0.2,
  CONNECTION_QUALITY_WEIGHT: 0.15,
  FEATURE_ADOPTION_WEIGHT: 0.1
};

class UserSession {
  constructor(sessionId, userId = null) {
    this.sessionId = sessionId;
    this.userId = userId || 'anonymous';
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
    this.actions = [];
    this.featureUsage = new Map();
    this.engagementTime = 0;
    this.errorCount = 0;
    this.performanceIssues = [];
    this.satisfactionScore = 5.0; // Start with neutral score
    this.isActive = true;
    this.connectionQualityEvents = [];
  }

  recordAction(actionType, context = {}) {
    const timestamp = Date.now();
    const action = {
      type: actionType,
      timestamp,
      context,
      response_time: context.response_time || null
    };

    this.actions.push(action);
    this.lastActivityTime = timestamp;

    // Update feature usage
    const feature = this.getFeatureFromAction(actionType);
    if (feature) {
      const currentUsage = this.featureUsage.get(feature) || 0;
      this.featureUsage.set(feature, currentUsage + 1);
    }

    // Calculate engagement time for chat actions
    if (actionType === USER_ACTION_TYPES.CHAT_SEND || actionType === USER_ACTION_TYPES.EMOTE_USE) {
      const timeSinceLastAction = this.actions.length > 1 ? 
        timestamp - this.actions[this.actions.length - 2].timestamp : 0;
      
      if (timeSinceLastAction < 60000) { // Within 1 minute = engaged
        this.engagementTime += Math.min(timeSinceLastAction, 60000);
      }
    }

    // Update satisfaction score based on response time
    if (action.response_time) {
      this.updateSatisfactionForResponseTime(action.response_time);
    }
  }

  getFeatureFromAction(actionType) {
    for (const [category, config] of Object.entries(FEATURE_CATEGORIES)) {
      if (config.actions.some(action => actionType.includes(action))) {
        return config.name;
      }
    }
    return null;
  }

  recordError(error, context = {}) {
    this.errorCount++;
    this.performanceIssues.push({
      type: 'error',
      timestamp: Date.now(),
      error: error.message || 'Unknown error',
      context
    });

    // Decrease satisfaction score for errors
    this.satisfactionScore = Math.max(1.0, this.satisfactionScore - 0.2);
    
    // Add to error impact tracking
    performanceCorrelationData.error_impact_sessions.add(this.sessionId);
  }

  recordConnectionEvent(eventType, quality = null) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      quality
    };

    this.connectionQualityEvents.push(event);

    // Update satisfaction based on connection quality
    if (quality !== null) {
      this.updateSatisfactionForConnectionQuality(quality);
    }
  }

  updateSatisfactionForResponseTime(responseTime) {
    let impact = 0;
    if (responseTime < 100) impact = 0.1;
    else if (responseTime < 250) impact = 0.05;
    else if (responseTime < 500) impact = 0;
    else if (responseTime < 1000) impact = -0.1;
    else impact = -0.2;

    this.satisfactionScore = Math.max(1.0, Math.min(10.0, this.satisfactionScore + impact));
  }

  updateSatisfactionForConnectionQuality(quality) {
    const impact = (quality - 5.0) * 0.1; // Quality on 1-10 scale
    this.satisfactionScore = Math.max(1.0, Math.min(10.0, this.satisfactionScore + impact));
  }

  getSessionDuration() {
    return (this.lastActivityTime - this.startTime) / 1000; // seconds
  }

  getEngagementRate() {
    const sessionDuration = this.getSessionDuration();
    return sessionDuration > 0 ? this.engagementTime / (sessionDuration * 1000) : 0;
  }

  calculateFinalSatisfactionScore() {
    const sessionDuration = this.getSessionDuration();
    const engagementRate = this.getEngagementRate();
    const errorRate = this.actions.length > 0 ? this.errorCount / this.actions.length : 0;
    const avgResponseTime = this.getAverageResponseTime();
    const connectionQuality = this.getAverageConnectionQuality();

    // Weighted satisfaction score
    let score = 5.0; // Base score

    // Response time factor
    if (avgResponseTime < 100) score += 1.0;
    else if (avgResponseTime < 250) score += 0.5;
    else if (avgResponseTime > 1000) score -= 1.0;

    // Error rate factor
    score -= errorRate * 3.0;

    // Engagement factor
    score += engagementRate * 2.0;

    // Connection quality factor
    score += (connectionQuality - 5.0) * 0.3;

    // Feature adoption factor
    const featuresUsed = this.featureUsage.size;
    score += Math.min(1.0, featuresUsed / Object.keys(FEATURE_CATEGORIES).length);

    return Math.max(1.0, Math.min(10.0, score));
  }

  getAverageResponseTime() {
    const responseTimes = this.actions
      .filter(action => action.response_time)
      .map(action => action.response_time);
    
    return responseTimes.length > 0 ? 
      responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length : 0;
  }

  getAverageConnectionQuality() {
    const qualities = this.connectionQualityEvents
      .filter(event => event.quality !== null)
      .map(event => event.quality);
    
    return qualities.length > 0 ? 
      qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length : 5.0;
  }

  endSession() {
    this.isActive = false;
    const finalScore = this.calculateFinalSatisfactionScore();
    this.satisfactionScore = finalScore;
    
    console.log(`[User Analytics] Session ${this.sessionId} ended: ${this.getSessionDuration()}s, satisfaction: ${finalScore.toFixed(1)}/10`);
  }
}

// User Analytics Helper
const UserAnalytics = {

  /**
   * Start tracking a new user session
   */
  startSession(sessionId, userId = null) {
    const session = new UserSession(sessionId, userId);
    activeSessions.set(sessionId, session);
    
    console.log(`[User Analytics] Started session ${sessionId} for user ${userId || 'anonymous'}`);
    return session;
  },

  /**
   * End a user session and record metrics
   */
  endSession(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session) {
      console.warn(`[User Analytics] Attempted to end non-existent session: ${sessionId}`);
      return;
    }

    session.endSession();
    
    // Record session metrics
    const duration = session.getSessionDuration();
    sessionDuration.record(duration, {
      user_id: session.userId,
      session_type: session.actions.length > 10 ? 'active' : 'passive',
      feature_count: session.featureUsage.size
    });

    // Record final satisfaction score
    const finalScore = session.satisfactionScore;
    console.log(`[User Analytics] Session satisfaction: ${finalScore.toFixed(2)}/10`);

    // Store session data for correlation analysis
    userBehaviorData.set(sessionId, {
      duration,
      actions: session.actions.length,
      engagement_rate: session.getEngagementRate(),
      satisfaction_score: finalScore,
      features_used: Array.from(session.featureUsage.keys()),
      error_count: session.errorCount
    });

    activeSessions.delete(sessionId);
  },

  /**
   * Record user action with performance tracking
   */
  recordUserAction(sessionId, actionType, context = {}) {
    const session = activeSessions.get(sessionId);
    if (!session) {
      console.warn(`[User Analytics] Attempted to record action for non-existent session: ${sessionId}`);
      return;
    }

    const startTime = Date.now();
    
    return tracer.startActiveSpan(`user_action_${actionType}`, (span) => {
      try {
        // Record the action
        session.recordAction(actionType, context);

        // Record user action metric
        userActions.add(1, {
          action_type: actionType,
          user_id: session.userId,
          session_id: sessionId,
          feature_category: session.getFeatureFromAction(actionType) || 'other'
        });

        // Record UI interaction time if available
        if (context.interaction_start_time) {
          const interactionTime = Date.now() - context.interaction_start_time;
          uiInteractionTime.record(interactionTime, {
            action_type: actionType,
            user_id: session.userId
          });

          // Store for correlation analysis
          performanceCorrelationData.ui_interactions.push({
            action_type: actionType,
            response_time: interactionTime,
            session_id: sessionId,
            timestamp: Date.now()
          });
        }

        span.setAttributes({
          'user.id': session.userId,
          'user.session_id': sessionId,
          'user.action': actionType,
          'user.satisfaction_score': session.satisfactionScore
        });

        return context.result;
      } catch (error) {
        span.recordException(error);
        session.recordError(error, context);
        throw error;
      } finally {
        span.end();
      }
    });
  },

  /**
   * Record feature usage with adoption tracking
   */
  recordFeatureUsage(sessionId, featureName, action, context = {}) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    // Record feature usage metric
    featureUsage.add(1, {
      feature: featureName,
      action,
      user_id: session.userId,
      session_id: sessionId,
      adoption_stage: this.getAdoptionStage(session.userId, featureName)
    });

    // Update adoption tracking
    const userKey = session.userId;
    if (!featureAdoptionData.has(userKey)) {
      featureAdoptionData.set(userKey, new Set());
    }
    featureAdoptionData.get(userKey).add(featureName);

    console.log(`[User Analytics] Feature usage: ${featureName}.${action} by ${session.userId}`);
  },

  /**
   * Record chat engagement time
   */
  recordChatEngagement(sessionId, engagementSeconds) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    chatEngagement.record(engagementSeconds, {
      user_id: session.userId,
      session_id: sessionId,
      engagement_level: engagementSeconds > 300 ? 'high' : engagementSeconds > 60 ? 'medium' : 'low'
    });

    session.engagementTime += engagementSeconds * 1000; // Convert to ms
  },

  /**
   * Record connection quality event affecting UX
   */
  recordConnectionQuality(sessionId, quality, eventType) {
    const session = activeSessions.get(sessionId);
    if (!session) return;

    session.recordConnectionEvent(eventType, quality);

    // Store for correlation analysis
    performanceCorrelationData.connection_events.push({
      session_id: sessionId,
      quality,
      event_type: eventType,
      timestamp: Date.now()
    });

    console.log(`[User Analytics] Connection quality: ${quality}/10 (${eventType}) for session ${sessionId}`);
  },

  /**
   * Get adoption stage for user and feature
   */
  getAdoptionStage(userId, featureName) {
    const userFeatures = featureAdoptionData.get(userId);
    if (!userFeatures) return 'new';
    
    const totalFeatures = Object.keys(FEATURE_CATEGORIES).length;
    const adoptedFeatures = userFeatures.size;
    
    if (adoptedFeatures === 1) return 'first_use';
    if (adoptedFeatures < totalFeatures * 0.3) return 'early';
    if (adoptedFeatures < totalFeatures * 0.7) return 'growing';
    return 'power_user';
  },

  /**
   * Get user experience analytics data
   */
  getAnalyticsData() {
    return {
      active_sessions: activeSessions.size,
      total_sessions: userBehaviorData.size,
      feature_adoption: {
        total_users: featureAdoptionData.size,
        features_by_user: Array.from(featureAdoptionData.entries()).map(([userId, features]) => ({
          user_id: userId,
          features: Array.from(features),
          adoption_count: features.size
        }))
      },
      performance_correlation: {
        ui_interactions: performanceCorrelationData.ui_interactions.length,
        connection_events: performanceCorrelationData.connection_events.length,
        error_impact_sessions: performanceCorrelationData.error_impact_sessions.size
      },
      average_satisfaction: this.getAverageSatisfactionScore()
    };
  },

  /**
   * Get average satisfaction score across all sessions
   */
  getAverageSatisfactionScore() {
    const scores = Array.from(userBehaviorData.values()).map(data => data.satisfaction_score);
    return scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 5.0;
  },

  /**
   * Clean up old session data with comprehensive memory management
   */
  cleanupOldSessions(maxAgeMs = 24 * 60 * 60 * 1000) { // 24 hours
    const cutoffTime = Date.now() - maxAgeMs;
    const cleanupStartTime = Date.now();
    let cleanedSessions = 0;
    let cleanedHistoricalData = 0;
    
    // Clean up active sessions that are stale
    for (const [sessionId, session] of activeSessions) {
      if (session.lastActivityTime < cutoffTime) {
        this.endSession(sessionId);
        cleanedSessions++;
      }
    }

    // Clean up historical behavior data (keep for 7x longer)
    const historicalCutoff = Date.now() - (maxAgeMs * 7);
    for (const [sessionId, data] of userBehaviorData) {
      try {
        // Extract timestamp from session ID format: session_timestamp_random
        const sessionTimestamp = parseInt(sessionId.split('_')[1]) || 0;
        if (sessionTimestamp < historicalCutoff) {
          userBehaviorData.delete(sessionId);
          cleanedHistoricalData++;
        }
      } catch (error) {
        // If session ID format is unexpected, clean it up anyway if too old
        if (data.timestamp && data.timestamp < historicalCutoff) {
          userBehaviorData.delete(sessionId);
          cleanedHistoricalData++;
        }
      }
    }

    // Clean up feature adoption data for inactive users (keep for 30 days)
    const adoptionCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    let cleanedAdoptionData = 0;
    
    for (const [userId, features] of featureAdoptionData) {
      // Remove adoption data if no recent sessions for this user
      const hasRecentSession = Array.from(userBehaviorData.values())
        .some(data => data.user_id === userId && 
                     data.session_end_time > adoptionCutoff);
      
      if (!hasRecentSession) {
        featureAdoptionData.delete(userId);
        cleanedAdoptionData++;
      }
    }

    // Clean up performance correlation data
    const perfCutoff = Date.now() - (2 * 60 * 60 * 1000); // 2 hours
    let cleanedPerfData = 0;
    
    if (performanceCorrelationData.ui_interactions.length > 1000) {
      performanceCorrelationData.ui_interactions = performanceCorrelationData.ui_interactions
        .filter(interaction => interaction.timestamp > perfCutoff)
        .slice(-1000); // Keep last 1000 entries
      cleanedPerfData += 50; // Approximate cleaned count
    }
    
    if (performanceCorrelationData.connection_events.length > 500) {
      performanceCorrelationData.connection_events = performanceCorrelationData.connection_events
        .filter(event => event.timestamp > perfCutoff)
        .slice(-500); // Keep last 500 entries
      cleanedPerfData += 25; // Approximate cleaned count
    }

    // Clean up error impact sessions older than 24 hours
    const errorImpactArray = Array.from(performanceCorrelationData.error_impact_sessions);
    performanceCorrelationData.error_impact_sessions.clear();
    
    for (const sessionId of errorImpactArray) {
      if (activeSessions.has(sessionId) || userBehaviorData.has(sessionId)) {
        performanceCorrelationData.error_impact_sessions.add(sessionId);
      }
    }

    const cleanupDuration = Date.now() - cleanupStartTime;
    
    console.log(`[User Analytics] Cleanup completed in ${cleanupDuration}ms:`, {
      active_sessions_cleaned: cleanedSessions,
      historical_data_cleaned: cleanedHistoricalData, 
      adoption_data_cleaned: cleanedAdoptionData,
      performance_data_cleaned: cleanedPerfData,
      active_sessions_remaining: activeSessions.size,
      historical_data_remaining: userBehaviorData.size,
      feature_adoption_users: featureAdoptionData.size,
      error_impact_sessions: performanceCorrelationData.error_impact_sessions.size
    });

    return {
      cleaned: cleanedSessions + cleanedHistoricalData + cleanedAdoptionData + cleanedPerfData,
      remaining: {
        activeSessions: activeSessions.size,
        historicalData: userBehaviorData.size,
        featureAdoption: featureAdoptionData.size
      }
    };
  },

  /**
   * Force cleanup of all session data (for testing or emergency cleanup)
   */
  forceCleanup() {
    const beforeCounts = {
      activeSessions: activeSessions.size,
      historicalData: userBehaviorData.size,
      featureAdoption: featureAdoptionData.size,
      errorImpactSessions: performanceCorrelationData.error_impact_sessions.size
    };

    // End all active sessions
    for (const [sessionId] of activeSessions) {
      this.endSession(sessionId);
    }

    // Clear all data structures
    activeSessions.clear();
    userBehaviorData.clear();
    featureAdoptionData.clear();
    performanceCorrelationData = {
      ui_interactions: [],
      connection_events: [],
      error_impact_sessions: new Set()
    };

    console.log(`[User Analytics] Force cleanup completed:`, {
      before: beforeCounts,
      after: {
        activeSessions: activeSessions.size,
        historicalData: userBehaviorData.size,
        featureAdoption: featureAdoptionData.size,
        errorImpactSessions: performanceCorrelationData.error_impact_sessions.size
      }
    });

    return beforeCounts;
  },

  /**
   * Get memory usage statistics for monitoring
   */
  getMemoryStats() {
    const calculateObjectSize = (obj) => {
      try {
        return JSON.stringify(obj).length;
      } catch {
        return 0;
      }
    };

    const stats = {
      active_sessions: {
        count: activeSessions.size,
        estimated_bytes: calculateObjectSize(Array.from(activeSessions.entries()))
      },
      historical_data: {
        count: userBehaviorData.size,
        estimated_bytes: calculateObjectSize(Array.from(userBehaviorData.entries()))
      },
      feature_adoption: {
        count: featureAdoptionData.size,
        estimated_bytes: calculateObjectSize(Array.from(featureAdoptionData.entries()))
      },
      performance_correlation: {
        ui_interactions_count: performanceCorrelationData.ui_interactions.length,
        connection_events_count: performanceCorrelationData.connection_events.length,
        error_impact_sessions_count: performanceCorrelationData.error_impact_sessions.size,
        estimated_bytes: calculateObjectSize(performanceCorrelationData)
      }
    };

    stats.total_estimated_bytes = 
      stats.active_sessions.estimated_bytes + 
      stats.historical_data.estimated_bytes + 
      stats.feature_adoption.estimated_bytes + 
      stats.performance_correlation.estimated_bytes;

    return stats;
  }
};

// Observable gauge callbacks
userSatisfactionScore.addCallback((observableResult) => {
  const avgScore = UserAnalytics.getAverageSatisfactionScore();
  
  observableResult.observe(avgScore, {
    measurement_type: 'overall'
  });

  // Per-user satisfaction if we have active sessions
  for (const [sessionId, session] of activeSessions) {
    observableResult.observe(session.satisfactionScore, {
      measurement_type: 'session',
      user_id: session.userId,
      session_id: sessionId
    });
  }
});

connectionQuality.addCallback((observableResult) => {
  for (const [sessionId, session] of activeSessions) {
    const quality = session.getAverageConnectionQuality();
    
    observableResult.observe(quality, {
      session_id: sessionId,
      user_id: session.userId,
      connection_status: quality > 7 ? 'excellent' : quality > 5 ? 'good' : quality > 3 ? 'poor' : 'critical'
    });
  }
});

// Cleanup interval
setInterval(() => {
  UserAnalytics.cleanupOldSessions();
}, 60 * 60 * 1000); // Every hour

module.exports = {
  UserAnalytics,
  USER_ACTION_TYPES,
  FEATURE_CATEGORIES,
  UserSession,
  metrics: {
    sessionDuration,
    userActions,
    featureUsage,
    chatEngagement,
    uiInteractionTime,
    userSatisfactionScore,
    connectionQuality
  }
};