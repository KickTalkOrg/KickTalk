// KickTalk Renderer User Analytics & Performance Budget Helper
import { randomUUID } from 'crypto';

// Generate session ID based on environment capabilities
const generateSessionId = () => {
  try {
    // Try to use crypto.randomUUID if available
    if (typeof randomUUID === 'function') {
      return `session_${randomUUID()}`;
    }
    // Fallback to timestamp + random
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  } catch (error) {
    console.warn('[User Analytics] Using fallback session ID generation:', error.message);
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
};

// User Action Types (synced with backend)
export const USER_ACTION_TYPES = {
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

// Feature categories for tracking
export const FEATURE_CATEGORIES = {
  CHAT: 'chat',
  EMOTES: 'emotes',
  MODERATION: 'moderation',
  CUSTOMIZATION: 'customization',
  NAVIGATION: 'navigation'
};

class RendererUserAnalytics {
  constructor() {
    this.sessionId = null;
    this.userId = null;
    this.isInitialized = false;
    this.engagementStartTime = null;
    this.lastActionTime = Date.now();
    this.performanceObserver = null;
    this.renderObserver = null;
    
    // Start resource monitoring
    this.startResourceMonitoring();
    
    // Monitor window focus/blur for engagement tracking
    this.setupWindowEventListeners();
    
    // Setup render performance monitoring
    this.setupRenderObserver();
  }

  /**
   * Initialize user session
   */
  async init(userId = null) {
    try {
      this.sessionId = generateSessionId();
      this.userId = userId;
      
      // Start session in backend
      const session = await window.electronAPI.telemetry.startUserSession({
        sessionId: this.sessionId,
        userId: this.userId
      });

      this.isInitialized = true;
      this.lastActionTime = Date.now();
      
      // Record app startup action
      await this.recordAction(USER_ACTION_TYPES.WINDOW_FOCUS, {
        app_startup: true,
        user_agent: navigator.userAgent,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight
      });

      console.log(`[User Analytics] Session initialized: ${this.sessionId} for user ${userId || 'anonymous'}`);
      return session;
    } catch (error) {
      console.error('[User Analytics] Failed to initialize session:', error);
      throw error;
    }
  }

  /**
   * End user session
   */
  async endSession() {
    if (!this.isInitialized || !this.sessionId) return;

    try {
      await window.electronAPI.telemetry.endUserSession({
        sessionId: this.sessionId
      });

      console.log(`[User Analytics] Session ended: ${this.sessionId}`);
      
      this.sessionId = null;
      this.userId = null;
      this.isInitialized = false;
    } catch (error) {
      console.error('[User Analytics] Failed to end session:', error);
    }
  }

  /**
   * Record user action with performance tracking
   */
  async recordAction(actionType, context = {}) {
    if (!this.isInitialized) {
      console.warn('[User Analytics] Cannot record action - session not initialized');
      return;
    }

    try {
      const startTime = Date.now();
      const interactionContext = {
        ...context,
        interaction_start_time: startTime,
        time_since_last_action: startTime - this.lastActionTime
      };

      // Record the action
      await window.electronAPI.telemetry.recordUserAction({
        sessionId: this.sessionId,
        actionType,
        context: interactionContext
      });

      this.lastActionTime = startTime;

      // Start engagement tracking for chat actions
      if (actionType === USER_ACTION_TYPES.CHAT_SEND || actionType === USER_ACTION_TYPES.EMOTE_USE) {
        this.startEngagementTracking();
      }

      console.log(`[User Analytics] Action recorded: ${actionType}`);
      return true;
    } catch (error) {
      console.error('[User Analytics] Failed to record action:', error);
      return false;
    }
  }

  /**
   * Record feature usage with adoption tracking
   */
  async recordFeatureUsage(featureName, action, context = {}) {
    if (!this.isInitialized) return;

    try {
      await window.electronAPI.telemetry.recordFeatureUsage({
        sessionId: this.sessionId,
        featureName,
        action,
        context
      });

      console.log(`[User Analytics] Feature usage: ${featureName}.${action}`);
    } catch (error) {
      console.error('[User Analytics] Failed to record feature usage:', error);
    }
  }

  /**
   * Record chat engagement time
   */
  async recordChatEngagement(engagementSeconds) {
    if (!this.isInitialized) return;

    try {
      await window.electronAPI.telemetry.recordChatEngagement({
        sessionId: this.sessionId,
        engagementSeconds
      });

      console.log(`[User Analytics] Chat engagement: ${engagementSeconds}s`);
    } catch (error) {
      console.error('[User Analytics] Failed to record chat engagement:', error);
    }
  }

  /**
   * Record connection quality affecting user experience
   */
  async recordConnectionQuality(quality, eventType) {
    if (!this.isInitialized) return;

    try {
      await window.electronAPI.telemetry.recordConnectionQuality({
        sessionId: this.sessionId,
        quality,
        eventType
      });

      console.log(`[User Analytics] Connection quality: ${quality}/10 (${eventType})`);
    } catch (error) {
      console.error('[User Analytics] Failed to record connection quality:', error);
    }
  }

  /**
   * Monitor UI interaction performance
   */
  async monitorUIInteraction(interactionType, executionTimeOrCallback, context = {}) {
    if (!this.isInitialized) return 'good';

    try {
      let executionTime;
      
      if (typeof executionTimeOrCallback === 'function') {
        // Time the callback execution
        const startTime = performance.now();
        await executionTimeOrCallback();
        executionTime = performance.now() - startTime;
      } else {
        executionTime = executionTimeOrCallback;
      }

      const severity = await window.electronAPI.telemetry.monitorUIInteraction({
        interactionType,
        executionTime,
        context: {
          ...context,
          session_id: this.sessionId
        }
      });

      // Record as user action with performance context
      await this.recordAction(`ui_${interactionType}`, {
        execution_time: executionTime,
        performance_severity: severity,
        ...context
      });

      return severity;
    } catch (error) {
      console.error('[User Analytics] Failed to monitor UI interaction:', error);
      return 'good';
    }
  }

  /**
   * Monitor component render performance
   */
  async monitorComponentRender(componentName, renderTime, context = {}) {
    if (!this.isInitialized) return 'good';

    try {
      return await window.electronAPI.telemetry.monitorComponentRender({
        componentName,
        renderTime,
        context: {
          ...context,
          session_id: this.sessionId
        }
      });
    } catch (error) {
      console.error('[User Analytics] Failed to monitor component render:', error);
      return 'good';
    }
  }

  /**
   * Monitor WebSocket latency affecting user experience
   */
  async monitorWebSocketLatency(latency, context = {}) {
    if (!this.isInitialized) return 'good';

    try {
      const severity = await window.electronAPI.telemetry.monitorWebSocketLatency({
        latency,
        context: {
          ...context,
          session_id: this.sessionId
        }
      });

      // Record connection quality based on latency
      const quality = this.latencyToQualityScore(latency);
      await this.recordConnectionQuality(quality, 'websocket_latency');

      return severity;
    } catch (error) {
      console.error('[User Analytics] Failed to monitor WebSocket latency:', error);
      return 'good';
    }
  }

  /**
   * Start engagement tracking
   */
  startEngagementTracking() {
    if (!this.engagementStartTime) {
      this.engagementStartTime = Date.now();
    }
  }

  /**
   * Stop engagement tracking and record duration
   */
  async stopEngagementTracking() {
    if (this.engagementStartTime) {
      const engagementDuration = (Date.now() - this.engagementStartTime) / 1000;
      await this.recordChatEngagement(engagementDuration);
      this.engagementStartTime = null;
    }
  }

  /**
   * Convert latency to quality score (1-10 scale)
   */
  latencyToQualityScore(latency) {
    if (latency < 50) return 10;
    if (latency < 100) return 8;
    if (latency < 200) return 6;
    if (latency < 500) return 4;
    if (latency < 1000) return 2;
    return 1;
  }

  /**
   * Setup window event listeners for engagement tracking
   */
  setupWindowEventListeners() {
    // Focus/blur events
    window.addEventListener('focus', async () => {
      await this.recordAction(USER_ACTION_TYPES.WINDOW_FOCUS, {
        engagement_resumed: true
      });
    });

    window.addEventListener('blur', async () => {
      await this.recordAction(USER_ACTION_TYPES.WINDOW_BLUR, {
        engagement_paused: true
      });
      await this.stopEngagementTracking();
    });

    // Beforeunload event
    window.addEventListener('beforeunload', async () => {
      await this.endSession();
    });

    // Resize events for responsive behavior tracking
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(async () => {
        await this.recordAction('window_resize', {
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight
        });
      }, 500);
    });
  }

  /**
   * Start resource monitoring for performance correlation
   */
  startResourceMonitoring() {
    // Memory usage monitoring
    setInterval(async () => {
      if (!this.isInitialized) return;

      try {
        const memoryInfo = performance.memory;
        if (memoryInfo) {
          const memoryMB = Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024);
          await window.electronAPI.telemetry.monitorMemoryUsage({
            memoryMB,
            context: {
              session_id: this.sessionId,
              heap_total: Math.round(memoryInfo.totalJSHeapSize / 1024 / 1024),
              heap_limit: Math.round(memoryInfo.jsHeapSizeLimit / 1024 / 1024)
            }
          });
        }
      } catch (error) {
        console.warn('[User Analytics] Memory monitoring error:', error.message);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Setup render performance observer
   */
  setupRenderObserver() {
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        this.renderObserver = new PerformanceObserver(async (list) => {
          const entries = list.getEntries();
          
          for (const entry of entries) {
            if (entry.entryType === 'measure' || entry.entryType === 'navigation') {
              await this.monitorComponentRender(
                entry.name || 'unknown_render',
                entry.duration,
                {
                  entry_type: entry.entryType,
                  start_time: entry.startTime
                }
              );
            }
          }
        });

        this.renderObserver.observe({
          entryTypes: ['measure', 'navigation']
        });
      } catch (error) {
        console.warn('[User Analytics] Performance observer setup failed:', error.message);
      }
    }
  }

  /**
   * Get analytics data for debugging
   */
  async getAnalyticsData() {
    if (!this.isInitialized) return {};

    try {
      return await window.electronAPI.telemetry.getUserAnalyticsData();
    } catch (error) {
      console.error('[User Analytics] Failed to get analytics data:', error);
      return {};
    }
  }

  /**
   * Get performance data for debugging
   */
  async getPerformanceData() {
    if (!this.isInitialized) return {};

    try {
      return await window.electronAPI.telemetry.getPerformanceData();
    } catch (error) {
      console.error('[User Analytics] Failed to get performance data:', error);
      return {};
    }
  }
}

// Create global instance
const userAnalytics = new RendererUserAnalytics();

// Convenience functions for common actions
export const trackChatMessage = async (context = {}) => {
  return await userAnalytics.recordAction(USER_ACTION_TYPES.CHAT_SEND, context);
};

export const trackEmoteUse = async (emoteName, context = {}) => {
  return await userAnalytics.recordAction(USER_ACTION_TYPES.EMOTE_USE, {
    emote_name: emoteName,
    ...context
  });
};

export const trackChannelSwitch = async (fromChannel, toChannel, context = {}) => {
  return await userAnalytics.recordAction(USER_ACTION_TYPES.CHANNEL_SWITCH, {
    from_channel: fromChannel,
    to_channel: toChannel,
    ...context
  });
};

export const trackFeatureUse = async (feature, action, context = {}) => {
  return await userAnalytics.recordFeatureUsage(feature, action, context);
};

export const monitorUIAction = async (actionName, callback, context = {}) => {
  return await userAnalytics.monitorUIInteraction(actionName, callback, context);
};

export const monitorRender = async (componentName, renderTime, context = {}) => {
  return await userAnalytics.monitorComponentRender(componentName, renderTime, context);
};

export const trackConnectionQuality = async (quality, eventType = 'measurement') => {
  return await userAnalytics.recordConnectionQuality(quality, eventType);
};

// Export the main instance and helper functions
export default userAnalytics;
export {
  userAnalytics,
  RendererUserAnalytics
};