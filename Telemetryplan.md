# KickTalk Electron Telemetry & Observability Implementation Plan

Owner: Core Team (mentored by senior devs)
Status: Draft v1
Targets: Electron main + renderer (React/Vite)
Export: OTLP HTTP to Grafana Cloud (via main process)

This plan is phased and prescriptive for junior developers. Each task lists the location, code example, acceptance criteria, testing steps, and reporting.

- Main process telemetry bootstrap: `src/telemetry/tracing.js`, `src/main/index.js`
- Renderer bootstrap: `src/renderer/src/telemetry/webTracing.js`
- Telemetry IPC bridge (renderer -> main): `src/preload/index.js` lines ~435–454 (`telemetry:*`), main handlers: `src/main/index.js` lines ~1390–1452
- Metrics helper: `src/telemetry/metrics.js`
- WebSocket managers: `utils/services/connectionManager.js`, `utils/services/kick/kickPusher.js`, `utils/services/kick/sharedKickPusher.js`, `utils/services/seventv/sharedStvWebSocket.js`
- Zustand store and chat provider: `src/renderer/src/providers/ChatProvider.jsx`
- Lexical input & emotes: `src/renderer/src/components/Chat/Input/index.jsx`, `src/renderer/src/components/Cosmetics/Emote.jsx`, `src/renderer/src/utils/MessageParser.jsx`
- Auto-updater: `src/main/utils/update.js`

---

## Phase 0 (P0): Baseline stabilization and guardrails

- Ensure service/resource attributes are set and visible.
- Keep telemetry defaults minimal; disable at runtime via settings.

Where:
- `src/main/index.js` maps `MAIN_VITE_*` to `OTEL_*` and sets `service.version`/`service.name`.
- `src/telemetry/tracing.js` starts NodeSDK driven by `OTEL_*` envs.
- Startup probe span exists: `main_startup_boot`.

Acceptance:
- Traces visible in Grafana for `main_startup_boot` with attributes: `process.type=electron-main`, `service.version`.
- If `store.get('telemetry.enabled') === false`, metrics IPC handlers in main return quickly (observed), and no custom metric time series are produced.

Testing:
- Set `.env` with `MAIN_VITE_OTEL_EXPORTER_OTLP_ENDPOINT` and `MAIN_VITE_OTEL_EXPORTER_OTLP_HEADERS` (Grafana Cloud).
- Run app; verify startup spans and no metric series when telemetry disabled in settings.

Reporting:
- Screenshot or link to trace in Grafana Explore with tag `name = main_startup_boot`.

---

## Phase 1 (P0): IPC telemetry and context propagation (renderer ↔ main)

Goal: Standardize IPC spans and propagate trace context across the process boundary.

Where:
- Renderer IPC calls exposed in `src/preload/index.js` (e.g., `telemetry:recordMessageSent`, etc.).
- Main IPC handlers in `src/main/index.js` (grep: `ipcMain.handle("telemetry:` …)`).

Tasks:
1) Add renderer-side injection helper (preload):

```js
// src/preload/index.js (helper example)
import { context, propagation } from '@opentelemetry/api';

function invokeWithContext(channel, payload = {}) {
  const carrier = {};
  try { propagation.inject(context.active(), carrier); } catch {}
  return ipcRenderer.invoke(channel, { ...payload, _otel: carrier });
}

// Usage inside exposed APIs, e.g.
recordMessageSent: (chatroomId, messageType, duration, success, streamerName) =>
  invokeWithContext('telemetry:recordMessageSent', { chatroomId, messageType, duration, success, streamerName })
```

2) Add main-side extraction + server spans wrapper:

```js
// src/main/index.js (central helper)
const { trace, context: otelCtx, propagation } = require('@opentelemetry/api');
const tracer = trace.getTracer('kicktalk-main');

function instrumentIpcHandler(channel, handler) {
  ipcMain.handle(channel, async (e, payload = {}) => {
    const parentCtx = payload._otel ? propagation.extract(otelCtx.active(), payload._otel) : otelCtx.active();
    return await otelCtx.with(parentCtx, async () => {
      const span = tracer.startSpan(`ipc:${channel}`, {
        attributes: {
          'ipc.channel': channel,
          'ipc.kind': 'invoke',
          'ipc.origin': 'renderer',
        },
      });
      try {
        const res = await handler(e, payload, span);
        span.setStatus({ code: 1 }); // OK
        return res;
      } catch (err) {
        span.recordException(err);
        span.setStatus({ code: 2, message: err?.message });
        throw err;
      } finally {
        span.end();
      }
    });
  });
}

// Example migration of one handler
instrumentIpcHandler('telemetry:recordMessageSent', (_e, { chatroomId, messageType='regular', duration=null, success=true, streamerName }, span) => {
  span.setAttributes({ chatroom_id: chatroomId, message_type: messageType, success: String(success), streamer_name: streamerName || '' });
  if (isTelemetryEnabled()) {
    metrics.recordMessageSent(chatroomId, messageType, streamerName);
    if (duration !== null) metrics.recordMessageSendDuration(duration, chatroomId, success);
  }
});
```

Acceptance:
- Each IPC call produces an `ipc:<channel>` span in main with attributes and error capture.
- Parent-child context: IPC spans appear as children of renderer spans when invoked within an active renderer span.

Testing:
- Trigger a few `store:get`/`store:set` and `telemetry:*` calls from UI and verify spans in Grafana Explore for names prefixed with `ipc:`.

Reporting:
- Count of IPC channels migrated to `instrumentIpcHandler()` per PR; target 100%.

---

## Phase 2 (P0): WebSocket lifecycle tracing + metrics

Where:
- `utils/services/kick/kickPusher.js`, `utils/services/kick/sharedKickPusher.js`
- `utils/services/seventv/sharedStvWebSocket.js`
- Metrics via IPC to main handlers: `telemetry:recordWebSocketConnection`, `telemetry:recordConnectionError`, `telemetry:recordReconnection`, `telemetry:recordMessageReceived`

Tasks:
- Create spans around connect/open/close/error and reconnection sequences. Keep spans short-lived around events; attach attributes:
  - `ws.url`, `ws.streamer_id`, `ws.streamer_name`, `chatroom_id`, `ws.phase` (connect|open|close|error), `reconnect.attempt`

Example (renderer side around existing code):

```js
// utils/services/kick/sharedKickPusher.js (pattern)
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('kicktalk-renderer');

function connectKick(wsUrl, meta) {
  const span = tracer.startSpan('ws:kick_connect', { attributes: { 'ws.url': wsUrl, 'chatroom_id': meta.chatroomId, 'ws.streamer_id': meta.streamerId, 'ws.streamer_name': meta.streamerName || '' } });
  try {
    // existing connect logic...
    span.addEvent('ws.connect.started');
    // onopen
    socket.addEventListener('open', () => {
      span.addEvent('ws.open');
      window.app.telemetry.recordWebSocketConnection(meta.chatroomId, meta.streamerId, true, meta.streamerName);
    });
    // onerror
    socket.addEventListener('error', (err) => {
      span.recordException(err);
      window.app.telemetry.recordConnectionError(meta.chatroomId, 'ws_error');
    });
    // onclose
    socket.addEventListener('close', () => {
      span.addEvent('ws.close');
      window.app.telemetry.recordWebSocketConnection(meta.chatroomId, meta.streamerId, false, meta.streamerName);
      span.end();
    });
  } catch (e) {
    span.recordException(e); span.end();
    throw e;
  }
}
```

Acceptance:
- Active connection gauge reflects connections by `streamer_name` and `chatroom_id`.
- Errors increment `kicktalk_connection_errors_total{error_type=...}`.
- Reconnects increment `kicktalk_websocket_reconnections_total`.

Testing:
- Connect to 2–3 chatrooms, toggle network to force reconnect, observe metrics and related spans.

Reporting:
- Grafana panels: Active WebSocket connections by streamer, Reconnects over time, Connection errors by type.

---

## Phase 3 (P1): Window lifecycle metrics and spans

Where: `src/main/index.js` in `createWindow()` and other `BrowserWindow` creators.

Tasks:
- Emit metrics via `MetricsHelper.incrementOpenWindows()`/`decrementOpenWindows()` (already available), and add short spans:

```js
// src/main/index.js (around each BrowserWindow create/destroy)
const { trace } = require('@opentelemetry/api');
const tracer = trace.getTracer('kicktalk-main');

function onWindowCreated(name) {
  try { MetricsHelper.incrementOpenWindows(); } catch {}
  const span = tracer.startSpan('window:create', { attributes: { 'window.name': name } });
  span.end();
}
function onWindowClosed(name) {
  try { MetricsHelper.decrementOpenWindows(); } catch {}
  const span = tracer.startSpan('window:closed', { attributes: { 'window.name': name } });
  span.end();
}
```

Acceptance:
- Gauge `kicktalk_open_windows` tracks windows accurately.
- Spans present for create/closed with `window.name`.

Testing:
- Open/close dialogs (user/auth/chatters/search/settings/replyThread) and validate counts and spans.

Reporting:
- Grafana single-stat for open windows. Trace samples for window create/closed.

---

## Phase 4 (P1): 7TV emote cache and render performance

Where:
- `src/renderer/src/utils/MessageParser.jsx`
- `src/renderer/src/components/Cosmetics/Emote.jsx`
- `utils/services/seventv/sharedStvWebSocket.js`

Tasks:
- Add spans and counters for cache hits/misses and render duration.
- Proposed metrics (to add in `src/telemetry/metrics.js`):
  - `kicktalk_emote_cache_hits_total{source,tier}`
  - `kicktalk_emote_cache_misses_total{source}`
  - `kicktalk_emote_render_duration_seconds`

Example (renderer):

```js
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('kicktalk-renderer');

function emoteLookup(name, cache) {
  const span = tracer.startSpan('emote:lookup', { attributes: { name } });
  const start = performance.now();
  const hit = cache.get(name);
  span.setAttribute('cache.hit', Boolean(hit));
  span.end();
  return hit;
}
```

Acceptance:
- Traces show `emote:lookup` with `cache.hit=true/false`.
- Metrics display hit/miss rates and render P95.

Testing:
- Toggle 7TV cosmetics on/off, insert emotes, observe metrics and spans.

Reporting:
- Grafana: cache hit ratio, render time histogram.

---

## Phase 5 (P1): Zustand state mutation instrumentation

Where: `src/renderer/src/providers/ChatProvider.jsx`

Tasks:
- Wrap `setState` to create spans for known actions (messages add/delete, presence updates, connection state changes).

Example:

```js
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('kicktalk-renderer');

const withTracing = (fn, name) => (...args) => {
  const span = tracer.startSpan(`zustand:${name}`);
  try { return fn(...args); } finally { span.end(); }
};

// When creating the store
const setWithTrace = (updater, actionName='unknown') => set((state) => {
  const span = tracer.startSpan(`zustand:set:${actionName}`);
  try { return typeof updater === 'function' ? updater(state) : updater; }
  finally { span.end(); }
});
```

Acceptance:
- Spans appear for mutations with `zustand:*` prefix and carry store/action attributes.

Testing:
- Send/receive messages, verify mutation spans.

Reporting:
- Trace search by `zustand:*`; optional panel counting mutations/min.

---

## Phase 6 (P1): Lexical editor UX instrumentation

Where: `src/renderer/src/components/Chat/Input/index.jsx`

Tasks:
- Track key UX timings:
  - Input latency from keydown to suggestion visible.
  - Emote/mention insertion spans.
  - Time from “Enter” to `message_sent` acknowledgment.

Examples:

```js
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('kicktalk-renderer');

function onKeyDown(e) {
  const span = tracer.startSpan('lexical:keydown', { attributes: { key: e.key } });
  // existing logic...
  span.end();
}

async function onSendMessage() {
  const span = tracer.startSpan('lexical:send');
  const t0 = performance.now();
  try {
    await sendMessage(); // existing logic
    const dt = (performance.now() - t0) / 1000;
    window.app.telemetry.recordMessageSent(currentChatroomId, 'regular', dt, true, currentStreamerName);
  } catch (e) {
    window.app.telemetry.recordError({ message: e.message, name: e.name, stack: e.stack }, { area: 'lexical_send' });
    throw e;
  } finally { span.end(); }
}
```

Acceptance:
- Spans `lexical:*` present; message send durations recorded in metrics.

Testing:
- Type, trigger suggestions, insert emotes, send; verify traces and metrics.

Reporting:
- Grafana: message send duration histogram; Explore: `lexical:*` spans.

---

## Phase 7 (P2): File system and settings persistence

Where:
- `src/main/index.js` IPC handlers `store:get`, `store:set`, `store:delete`
- `src/utils/config` (imported as `store` in main)

Tasks:
- Wrap store operations with IPC spans (via Phase 1 helper) and add attributes:
  - `store.key`, `store.op` (get|set|delete), `store.value_size` (safe estimate), `store.success`

Example:

```js
instrumentIpcHandler('store:set', async (_e, { key, value }) => {
  const size = value ? JSON.stringify(value).length : 0;
  const span = trace.getTracer('kicktalk-main').startSpan('store:set', { attributes: { 'store.key': key, 'store.value_size': size } });
  try { await store.set(key, value); }
  finally { span.end(); }
});
```

Acceptance:
- Traces for store ops visible with attributes.

Testing:
- Modify settings in UI; confirm spans with `store.key` and success.

Reporting:
- Grafana Explore by `name =~ store:*`.

---

## Phase 8 (P2): Memory and GC metrics end-to-end

Where:
- Metrics defined in `src/telemetry/metrics.js`: memory, CPU, handles, GC, renderer memory, DOM nodes, uptime.
- Renderer report loop via preload telemetry: `recordRendererMemory`, `recordDomNodeCount` (`src/preload/index.js` lines ~440–444).

Tasks:
- Add a renderer interval (e.g., in `webTracing.js` or a small telemetry util) to periodically send:

```js
setInterval(() => {
  if (performance?.memory) {
    const { jsHeapUsedSize, jsHeapTotalSize } = performance.memory;
    window.app.telemetry.recordRendererMemory({ jsHeapUsedSize, jsHeapTotalSize });
  }
  const count = document.getElementsByTagName('*').length;
  window.app.telemetry.recordDomNodeCount(count);
}, 10000);
```

Acceptance:
- Metrics `kicktalk_renderer_memory_usage_bytes` and `kicktalk_dom_node_count` update over time.

Testing:
- Open/close views; verify DOM nodes count changes; memory trends visible.

Reporting:
- Grafana: memory timeseries, DOM nodes gauge.

---

## Phase 9 (P2): Auto-updater flows

Where: `src/main/utils/update.js`

Tasks:
- Add spans around update check, download progress, and install.

Example:

```js
import { trace } from '@opentelemetry/api';
const tracer = trace.getTracer('kicktalk-main');

autoUpdater.on('checking-for-update', () => tracer.startSpan('updater:check').end());
autoUpdater.on('update-available', (info) => tracer.startSpan('updater:available', { attributes: { version: info.version } }).end());
autoUpdater.on('update-not-available', (info) => tracer.startSpan('updater:not-available', { attributes: { version: info.version } }).end());
autoUpdater.on('download-progress', (p) => tracer.startSpan('updater:downloading', { attributes: { percent: p.percent || 0 } }).end());
autoUpdater.on('update-downloaded', (info) => tracer.startSpan('updater:ready', { attributes: { version: info.version } }).end());
autoUpdater.on('error', (err) => { const s = tracer.startSpan('updater:error'); s.recordException(err); s.end(); });
```

Acceptance:
- Updater spans visible with versions and progress markers.

Testing:
- In production build, trigger update check and observe spans; verify `autoUpdater:*` IPC works as before.

Reporting:
- Grafana Explore: `name =~ updater:*`.

---

## Phase 10 (P2): API request metrics (already scaffolded)

Where: Renderer/API wrappers; main metrics handler `telemetry:recordAPIRequest` → `MetricsHelper.recordAPIRequest()`.

Tasks:
- Ensure all fetch/XHR paths in renderer route through a wrapper that records duration and calls `recordAPIRequest(endpoint, method, statusCode, duration)`.

Acceptance:
- Metrics visible: `kicktalk_api_requests_total` and `kicktalk_api_request_duration_seconds`.

Testing:
- Perform login / chat endpoints; verify metrics with method and status_code labels.

Reporting:
- Grafana: API RPS and latency heatmap.

---

## Phase 11 (P3): Error reporting and annotations

Tasks:
- Standardize `recordError` usage in renderer with context (`area`, `chatroom_id`, `streamer_id`, `fatal`), routed via IPC.
- Add optional release annotations by pushing events when app version changes.

Acceptance:
- Errors recorded with consistent attributes across areas (lexical, ws, store, updater).

Testing:
- Simulate controlled errors; verify exception recorded and context attached.

Reporting:
- Grafana: error count by area.

---

## Environment, Config, and Export

- Set in `.env` (example):

```bash
MAIN_VITE_OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway.grafana.net/otlp
MAIN_VITE_OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64-instanceid:apitoken>
MAIN_VITE_OTEL_SERVICE_NAME=kicktalk
MAIN_VITE_OTEL_DEPLOYMENT_ENV=dev
OTEL_DIAG_LOG_LEVEL=ERROR
```

- Main maps `MAIN_VITE_*` → `OTEL_*` automatically in `src/main/index.js`.
- Renderer spans are relayed to main (no direct network from renderer).

---

## Reporting and Dashboards (Grafana)

Recommended panels (initial):
- Active WebSocket connections by `streamer_name`
- WebSocket reconnects over time
- Connection errors by `error_type`
- Messages sent/received per minute
- Message send duration (P50/P90/P95)
- API latency histogram (by endpoint)
- Memory usage (heap_used / rss)
- DOM nodes count
- Open windows
- Updater events by version

Trace Explore saved queries:
- `name =~ ipc:*`
- `name =~ ws:*`
- `name =~ lexical:*`
- `name =~ store:*`
- `name =~ updater:*`

Progress reporting per PR:
- Channels migrated to `instrumentIpcHandler()`: N/total
- Files instrumented for WS: [list]
- Lexical events covered: [keydown, suggestion, insert, send]

---

## Rollout and Risk Management

- Default: telemetry disabled in settings (`telemetry.enabled=false`).
- Enable per QA build; validate overhead < 3% CPU and < 10 MB RSS.
- Feature flag for IPC span wrapper rollout; migrate in batches.

---

## Appendix: Acceptance Criteria Summary

- IPC: every `ipcMain.handle()` produces `ipc:<channel>` span with propagated context.
- WS: gauges and counters reflect real activity; lifecycle spans exist.
- Windows: `kicktalk_open_windows` accurate; create/closed spans present.
- 7TV: cache hit/miss metrics and `emote:*` spans.
- Zustand: `zustand:*` spans on mutations.
- Lexical: `lexical:*` spans; send duration metrics recorded.
- Store/FS: `store:*` spans with key and size attributes.
- Memory: renderer memory + DOM metrics flowing; GC durations recorded.
- Updater: `updater:*` spans with versions and progress.
- API: request count and latency recorded for all relevant calls.

---

## Appendix: Test Playbook (quick)

1) Startup: verify `main_startup_boot` span and service.version.
2) IPC: open settings → save → expect `ipc:store:set` span.
3) WS: join 2 chatrooms; toggle offline; observe reconnect metrics.
4) Lexical: type, open suggestions, insert emote, send; verify spans + message send duration metric.
5) 7TV: trigger emote cache lookup; verify hit/miss.
6) Memory: switch views; DOM node count changes; renderer memory updates.
7) Updater: trigger check/download in prod; verify spans.
8) API: login or fetch endpoints; verify API metrics.
