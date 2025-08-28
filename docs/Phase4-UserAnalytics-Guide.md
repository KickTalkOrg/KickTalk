# Phase 4: User Experience Analytics - Implementation Guide

## Overview

Phase 4 of KickTalk's observability implementation focuses on user experience analytics and performance budget monitoring. This phase provides comprehensive insights into user behavior, feature adoption, performance impact on user satisfaction, and real-time performance budget enforcement.

## Key Components

### 1. User Analytics System (`src/telemetry/user-analytics.js`)

**Core Features:**
- **User Session Tracking**: Complete lifecycle management from session start to end
- **Action Tracking**: Granular monitoring of all user interactions with performance context
- **Feature Usage Analytics**: Track adoption and usage patterns across all features
- **Engagement Metrics**: Monitor active chat participation and application focus time
- **Connection Quality Correlation**: Link network performance to user satisfaction
- **Satisfaction Scoring**: Real-time calculation of user satisfaction based on multiple factors

**User Action Types:**
```javascript
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
```

**Satisfaction Score Factors:**
- Response time weight: 30%
- Error rate weight: 25%
- Engagement weight: 20%
- Connection quality weight: 15%
- Feature adoption weight: 10%

### 2. Performance Budget Monitor (`src/telemetry/performance-budget.js`)

**Performance Budget Thresholds:**

| Category | Good | Acceptable | Poor | Critical |
|----------|------|------------|------|----------|
| UI Interaction | <100ms | <250ms | <500ms | >1000ms |
| Component Render | <16ms | <33ms | <50ms | >100ms |
| Memory Usage | <200MB | <500MB | <800MB | >1200MB |
| CPU Usage | <10% | <25% | <50% | >75% |
| WebSocket Latency | <50ms | <100ms | <250ms | >500ms |
| Bundle Size | <1MB | <2MB | <5MB | >10MB |

**Performance Score Calculation:**
- Starts at 100 points
- Violations reduce score based on severity:
  - Acceptable: -0.5 points
  - Poor: -2 points  
  - Critical: -5 points
- Good performance over time recovers score
- Real-time updates every 30 seconds

### 3. Renderer Integration (`src/renderer/src/telemetry/userAnalyticsHelper.js`)

**Usage Examples:**

```javascript
import userAnalytics, { 
  trackChatMessage,
  trackEmoteUse,
  trackChannelSwitch,
  monitorUIAction
} from '../telemetry/userAnalyticsHelper.js';

// Initialize session
await userAnalytics.init(userId);

// Track user actions
await trackChatMessage({ message_length: 25 });
await trackEmoteUse('PogChamp', { emote_source: '7tv' });
await trackChannelSwitch('oldChannel', 'newChannel');

// Monitor performance with automatic timing
await monitorUIAction('button_click', async () => {
  // Your UI operation here
  await performExpensiveOperation();
});

// Track feature usage
await userAnalytics.recordFeatureUsage('emotes', 'search', {
  query: 'pog',
  results_count: 15
});

// Record connection quality
await userAnalytics.recordConnectionQuality(8, 'websocket_connect');
```

## Architecture Integration

### Backend Integration Points

**Main Process (`src/main/index.js`):**
- 16 new IPC handlers for user analytics and performance monitoring
- Automatic fallback to no-op functions when telemetry is disabled
- Session lifecycle management
- Performance data aggregation

**Metrics Integration (`src/telemetry/metrics.js`):**
- Seamless integration with existing metrics infrastructure
- 12 new helper methods for user analytics
- 7 new performance budget monitoring methods
- Consistent error handling and context propagation

**WebSocket Services (`utils/services/kick/kickPusher.js`):**
- Enhanced connection error handling with user impact tracking
- Connection quality scoring based on reconnection frequency
- Automatic user satisfaction correlation during connection issues

### Frontend Integration Points

**Preload Script (`src/preload/index.js`):**
- 16 new IPC method exposures for renderer communication
- Type-safe parameter passing
- Consistent error handling

**User Analytics Helper:**
- Resource monitoring (memory usage every 30s)
- Window focus/blur event tracking for engagement
- Render performance observation using PerformanceObserver API
- Automatic session cleanup on page unload

## Metrics Exported

### User Analytics Metrics

| Metric Name | Type | Description | Labels |
|-------------|------|-------------|---------|
| `kicktalk_session_duration_seconds` | Histogram | User session duration | user_id, session_type, feature_count |
| `kicktalk_user_actions_total` | Counter | User actions by type | action_type, user_id, session_id, feature_category |
| `kicktalk_feature_usage_total` | Counter | Feature usage tracking | feature, action, user_id, adoption_stage |
| `kicktalk_chat_engagement_seconds` | Histogram | Active chat engagement time | user_id, session_id, engagement_level |
| `kicktalk_ui_interaction_time_ms` | Histogram | UI response times | action_type, user_id |
| `kicktalk_user_satisfaction_score` | Gauge | User satisfaction (1-10) | measurement_type, user_id, session_id |
| `kicktalk_connection_quality_score` | Gauge | Connection quality (1-10) | session_id, user_id, connection_status |

### Performance Budget Metrics

| Metric Name | Type | Description | Labels |
|-------------|------|-------------|---------|
| `kicktalk_performance_budget_violations_total` | Counter | Performance violations | budget_category, severity, violation_magnitude |
| `kicktalk_ui_render_time_ms` | Histogram | Component render times | component, render_type, severity |
| `kicktalk_memory_usage_mb` | Gauge | Memory usage in MB | resource_type |
| `kicktalk_cpu_usage_percent` | Gauge | CPU usage percentage | resource_type |
| `kicktalk_bundle_size_kb` | Gauge | Bundle sizes in KB | bundle_name |
| `kicktalk_performance_score` | Gauge | Overall performance score (0-100) | measurement_type |

## Usage Patterns

### 1. Session Lifecycle Management

```javascript
// App startup
const session = await userAnalytics.init(currentUser?.id);

// During user interactions
await userAnalytics.recordAction('chat_send', {
  message_length: messageText.length,
  has_emotes: containsEmotes,
  interaction_start_time: Date.now()
});

// App shutdown
await userAnalytics.endSession();
```

### 2. Performance Monitoring

```javascript
// Automatic UI performance monitoring
const severity = await monitorUIAction('emote_search', async () => {
  const results = await searchEmotes(query);
  renderEmoteResults(results);
  return results;
});

// Manual performance budget checks
const renderSeverity = await userAnalytics.monitorComponentRender(
  'ChatMessage', 
  renderTime, 
  { message_type: 'regular' }
);
```

### 3. Feature Adoption Tracking

```javascript
// Track feature discovery
await userAnalytics.recordFeatureUsage('moderation', 'timeout_user', {
  timeout_duration: 300,
  user_role: 'moderator'
});

// Track customization usage
await userAnalytics.recordFeatureUsage('customization', 'theme_change', {
  from_theme: 'dark',
  to_theme: 'light'
});
```

## Dashboard Queries

### User Satisfaction by Feature Usage
```promql
avg_over_time(kicktalk_user_satisfaction_score[5m]) by (user_id)
```

### Performance Budget Violation Rate
```promql
increase(kicktalk_performance_budget_violations_total[5m]) / 
increase(kicktalk_user_actions_total[5m]) * 100
```

### Feature Adoption Funnel
```promql
sum by (feature) (increase(kicktalk_feature_usage_total[1h]))
```

### UI Responsiveness Distribution
```promql
histogram_quantile(0.95, 
  sum(rate(kicktalk_ui_interaction_time_ms_bucket[5m])) by (le, action_type)
)
```

## Troubleshooting

### Common Issues

1. **Session Not Starting:**
   - Verify telemetry is enabled in settings
   - Check browser console for IPC errors
   - Ensure main process metrics are loaded

2. **Performance Monitoring Not Working:**
   - Check if `PerformanceObserver` API is supported
   - Verify context propagation in async operations
   - Look for performance budget threshold violations in logs

3. **Missing User Analytics Data:**
   - Confirm session ID is properly generated
   - Check network connectivity for OTLP export
   - Verify Grafana Cloud credentials in environment

### Debug Commands

```javascript
// Get current analytics state
const analyticsData = await userAnalytics.getAnalyticsData();
console.log('Analytics Data:', analyticsData);

// Get performance budget status
const perfData = await userAnalytics.getPerformanceData();
console.log('Performance Score:', perfData.current_score);

// Check session status
console.log('Session ID:', userAnalytics.sessionId);
console.log('Initialized:', userAnalytics.isInitialized);
```

## Best Practices

1. **Session Management:**
   - Always initialize session early in app lifecycle
   - Handle session cleanup on app close/refresh
   - Use meaningful user IDs when available

2. **Action Tracking:**
   - Include relevant context in action parameters
   - Use consistent action naming conventions
   - Track both success and failure scenarios

3. **Performance Monitoring:**
   - Set up automated monitoring for critical UI paths
   - Monitor both individual components and full user flows
   - Correlate performance issues with user satisfaction

4. **Privacy Considerations:**
   - Hash or anonymize sensitive user identifiers
   - Respect user opt-out preferences
   - Follow data retention policies for analytics data

## Integration with Existing Phases

Phase 4 builds upon and enhances previous observability phases:

- **Phase 1**: Uses core metrics infrastructure and OTLP export
- **Phase 2**: Leverages SLO monitoring for performance thresholds
- **Phase 3**: Integrates with error monitoring and circuit breakers for user impact correlation
- **Phase 5**: Provides foundation for advanced A/B testing and experimentation (future phase)

This comprehensive user analytics system provides deep insights into application performance impact on user experience while maintaining the robust error handling and monitoring established in previous phases.