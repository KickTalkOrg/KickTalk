// Renderer OpenTelemetry bootstrap (ESM). Loads config via preload bridge to avoid bundling secrets.
// IMPORTANT: Do NOT import @opentelemetry/resources in the renderer; different versions/export shapes cause Vite ESM errors.
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
// In sdk-trace-web v2, addSpanProcessor is not available; use SimpleSpanProcessor from sdk-trace-base
import { SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
import { context, trace } from '@opentelemetry/api';

// Guard: run only once
if (!window.__KT_RENDERER_OTEL_INITIALIZED__) {
  window.__KT_RENDERER_OTEL_INITIALIZED__ = true;

  (async () => {
    try {
      console.log('[Renderer OTEL]: init starting...');
      // Fetch endpoint/headers from main via preload bridge (A2)
      const cfg = await window?.telemetry?.getOtelConfig?.();
      if (!cfg || !cfg.ok) {
        console.warn('[Renderer OTEL]: Missing or invalid OTLP config from preload bridge:', cfg?.reason);
        return;
      }
 
      const { endpoint, headers, deploymentEnv } = cfg;
      try {
        console.log('[Renderer OTEL]: config received', {
          endpointPresent: !!endpoint,
          headersPresent: !!headers,
          deploymentEnv
        });
      } catch {}

      // Force sampler to AlwaysOn to avoid "Instrumentation suppressed, returning Noop Span"
      // Also create a parent span context for initial network operations to inherit sampling.

      // Parse headers "Key=Value,Key2=Value2" into object (optional; renderer does not need auth itself)
      const hdrs = {};
      if (headers && typeof headers === 'string') {
        headers.split(',').forEach((kv) => {
          const idx = kv.indexOf('=');
          if (idx > 0) {
            const k = kv.slice(0, idx).trim();
            const v = kv.slice(idx + 1).trim();
            if (k && v) hdrs[k] = v;
          }
        });
      }

      // No Resource import in renderer (Vite ESM conflict). Instead, set service attributes on the first parent span
      const provider = new WebTracerProvider({
        sampler: new AlwaysOnSampler()
      });
      // Try to set service resource to kicktalk-renderer so Grafana groups spans correctly
      try {
        const resMod = await import('@opentelemetry/resources');
        const ResourceCtor = resMod?.Resource || resMod?.default?.Resource;
        if (ResourceCtor) {
          const extra = new ResourceCtor({
            'service.name': 'kicktalk-renderer',
            'service.namespace': 'kicktalk',
            'deployment.environment': deploymentEnv || 'development'
          });
          if (provider.resource && typeof provider.resource.merge === 'function') {
            provider.resource = provider.resource.merge(extra);
          }
        }
      } catch (e) {
        try { console.debug('[Renderer OTEL]: Resource injection skipped:', e?.message || e); } catch {}
      }
 
      // Robust IPC relay: let OTLPTraceExporter build the protobuf body and intercept its fetch call.
      // We configure the exporter with a sentinel URL and override window.fetch to capture request bodies
      // destined to that sentinel, then forward bytes to main via IPC.
      const IPC_OTLP_URL = 'http://127.0.0.1/otlp-ipc';
      const isIpcOtelUrl = (url) => {
        try {
          if (!url) return false;
          const u = typeof url === 'string' ? url : String(url);
          return u.indexOf(IPC_OTLP_URL) === 0; // prefix match to allow path/query suffixes
        } catch {
          return false;
        }
      };
 
      // Install transport interceptors BEFORE creating the exporter so it catches exporter requests.
      // 1) fetch
      const origFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
      // 2) XHR
      const XHRProto = (typeof window.XMLHttpRequest === 'function') ? window.XMLHttpRequest.prototype : null;
      const origOpen = XHRProto && XHRProto.open ? XHRProto.open : null;
      const origSend = XHRProto && XHRProto.send ? XHRProto.send : null;
      // 3) sendBeacon
      const origSendBeacon = (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function')
        ? navigator.sendBeacon.bind(navigator)
        : null;
 
      // Guard: install once
      if (!window.__KT_OTEL_IPC_TRANSPORT_INTERCEPTORS__) {
        window.__KT_OTEL_IPC_TRANSPORT_INTERCEPTORS__ = true;
 
        // fetch interceptor
        if (origFetch) {
          window.fetch = async (input, init) => {
            try {
              const url = typeof input === 'string' ? input : (input?.url || '');
              if (isIpcOtelUrl(url)) {
                try { console.debug('[Renderer OTEL][intercept] fetch → IPC'); } catch {}
                let bodyAb = null;
                let bodyJson = null;
                try {
                  if (init?.body instanceof ArrayBuffer) {
                    bodyAb = init.body;
                  } else if (init?.body && ArrayBuffer.isView(init.body)) {
                    const view = init.body;
                    bodyAb = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
                  } else if (init?.body instanceof Blob) {
                    bodyAb = await init.body.arrayBuffer();
                  } else if (typeof init?.body === 'string') {
                    // OTLP/JSON path
                    try { bodyJson = JSON.parse(init.body); } catch {}
                  } else if (init?.body && typeof init.body.arrayBuffer === 'function') {
                    bodyAb = await init.body.arrayBuffer();
                  } else if (typeof input !== 'string') {
                    const req = input;
                    if (typeof req.arrayBuffer === 'function') {
                      bodyAb = await req.arrayBuffer();
                    } else if (typeof req.blob === 'function') {
                      bodyAb = await (await req.blob()).arrayBuffer();
                    } else if (typeof req.text === 'function') {
                      const txt = await req.text();
                      if (txt && txt[0] === '{') {
                        try { bodyJson = JSON.parse(txt); } catch {}
                      }
                    }
                  }
                } catch (e) {
                  console.warn('[Renderer OTEL]: Failed to extract OTLP body (fetch):', e?.message || e);
                }
                if (bodyAb instanceof ArrayBuffer) {
                  const res = await window.telemetry.exportTraces(bodyAb);
                  const status = res?.ok ? 204 : (Number(res?.status) || 502);
                  return new Response('', { status });
                }
                if (bodyJson && typeof bodyJson === 'object') {
                  const res = await window.telemetry.exportTracesJson(bodyJson);
                  const status = res?.ok ? 204 : (Number(res?.status) || 502);
                  return new Response('', { status });
                }
                return new Response('', { status: 400 });
              }
            } catch {}
            return origFetch(input, init);
          };
          // Sanitize AnyValue tree for collector limits and JSON mapping correctness
          const sanitizeAnyValue = (av) => {
            try {
              if (!av || typeof av !== 'object') return { stringValue: '' };
              if (Object.prototype.hasOwnProperty.call(av, 'stringValue')) {
                const s = String(av.stringValue ?? '');
                return { stringValue: s.length > 4096 ? s.slice(0, 4096) : s };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'intValue')) {
                // Ensure string form for int64
                return { intValue: String(av.intValue) };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'doubleValue')) {
                const n = Number(av.doubleValue);
                return { doubleValue: Number.isFinite(n) ? n : 0 };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'boolValue')) {
                return { boolValue: !!av.boolValue };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'arrayValue')) {
                const vals = Array.isArray(av.arrayValue?.values) ? av.arrayValue.values : [];
                const capped = vals.slice(0, 64).map(sanitizeAnyValue);
                return { arrayValue: { values: capped } };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'kvlistValue')) {
                // Not used by us; be safe
                const list = Array.isArray(av.kvlistValue?.values) ? av.kvlistValue.values : [];
                const sanitized = list.slice(0, 64).map((kv) => ({ key: String(kv.key).slice(0,128), value: sanitizeAnyValue(kv.value) }));
                return { kvlistValue: { values: sanitized } };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'bytesValue')) {
                // Leave as-is; not emitted in our code path
                return av;
              }
              return { stringValue: '' };
            } catch {
              return { stringValue: '' };
            }
          };
          const sanitizeAttributes = (kvs) => {
            try {
              const out = [];
              const seen = new Set();
              for (const kv of Array.isArray(kvs) ? kvs : []) {
                const key = String(kv?.key ?? '').slice(0, 128);
                if (!key || seen.has(key)) continue;
                seen.add(key);
                out.push({ key, value: sanitizeAnyValue(kv?.value) });
                if (out.length >= 128) break; // cap attribute count
              }
              return out;
            } catch { return []; }
          };
        } else {
          console.warn('[Renderer OTEL]: window.fetch not available; fetch interceptor skipped');
        }
 
        // XHR interceptor
        if (XHRProto && origOpen && origSend) {
          XHRProto.open = function(method, url, async, user, password) {
            this.__KT_IS_IPC_OTLP__ = isIpcOtelUrl(url);
            return origOpen.apply(this, arguments);
          };
          XHRProto.send = function(body) {
            if (this.__KT_IS_IPC_OTLP__) {
              let bodyAb = null;
              let bodyJson = null;
              try {
                if (body instanceof ArrayBuffer) {
                  bodyAb = body;
                } else if (body instanceof Blob) {
                  // Note: XHR.send does not accept async body conversion; fallback to FileReader sync-ish path
                  const reader = new FileReader();
                  const self = this;
                  reader.onload = async function() {
                    try {
                      const res = await window.telemetry.exportTraces(reader.result);
                      // Simulate a successful minimal XHR lifecycle
                      try { self.status = res?.ok ? 204 : (Number(res?.status) || 502); } catch {}
                      try { self.readyState = 4; } catch {}
                      try { self.onreadystatechange && self.onreadystatechange(); } catch {}
                    } catch {}
                  };
                  reader.readAsArrayBuffer(body);
                  return;
                } else if (typeof body === 'string') {
                  try { bodyJson = JSON.parse(body); } catch {}
                } else if (body && typeof body.arrayBuffer === 'function') {
                  // e.g. Request/Typed arrays with arrayBuffer()
                  // We cannot await here; fall back to fetch path for reliability
                }
              } catch (e) {
                console.warn('[Renderer OTEL]: Failed to extract OTLP body (xhr):', e?.message || e);
              }
              if (bodyAb instanceof ArrayBuffer) {
                window.telemetry.exportTraces(bodyAb).then(() => {
                  try { this.status = 204; } catch {}
                  try { this.readyState = 4; } catch {}
                  try { this.onreadystatechange && this.onreadystatechange(); } catch {}
                }).catch(() => {
                  try { this.status = 502; } catch {}
                  try { this.readyState = 4; } catch {}
                  try { this.onreadystatechange && this.onreadystatechange(); } catch {}
                });
                return;
              } else if (bodyJson && typeof bodyJson === 'object') {
                window.telemetry.exportTracesJson(bodyJson).then(() => {
                  try { this.status = 204; } catch {}
                  try { this.readyState = 4; } catch {}
                  try { this.onreadystatechange && this.onreadystatechange(); } catch {}
                }).catch(() => {
                  try { this.status = 502; } catch {}
                  try { this.readyState = 4; } catch {}
                  try { this.onreadystatechange && this.onreadystatechange(); } catch {}
                });
                return;
              }
            }
            return origSend.apply(this, arguments);
          };
        } else {
          console.warn('[Renderer OTEL]: XHR not available; XHR interceptor skipped');
        }
 
        // sendBeacon interceptor
        if (origSendBeacon) {
          navigator.sendBeacon = (url, data) => {
            try {
              if (isIpcOtelUrl(url)) {
                try { console.debug('[Renderer OTEL][intercept] sendBeacon → IPC'); } catch {}
                let bodyAb = null;
                if (data instanceof ArrayBuffer) {
                  bodyAb = data;
                } else if (data && ArrayBuffer.isView(data)) {
                  const view = data;
                  bodyAb = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
                } else if (data instanceof Blob) {
                  // Blob to ArrayBuffer is async; sendBeacon expects sync boolean return.
                  // Best-effort: queue async export and return true to not block app logic.
                  (async () => {
                    try {
                      const ab = await data.arrayBuffer();
                      await window.telemetry.exportTraces(ab);
                    } catch {}
                  })();
                  return true;
                } else if (ArrayBuffer.isView(data)) {
                  bodyAb = data.buffer;
                }
                if (bodyAb instanceof ArrayBuffer) {
                  // Fire and forget; mimic sendBeacon semantics
                  window.telemetry.exportTraces(bodyAb);
                  return true;
                }
              }
            } catch {}
            return origSendBeacon(url, data);
          };
        } else {
          console.warn('[Renderer OTEL]: navigator.sendBeacon not available; beacon interceptor skipped');
        }
      }
 
      // Lightweight exporter that converts spans to minimal OTLP/JSON and relays via IPC to main.
      class IPCSpanExporter {
        constructor(serviceName, deploymentEnv) {
          this.serviceName = serviceName;
          this.deploymentEnv = deploymentEnv || 'development';
          this.exportCount = 0;
        }
        async export(spans, resultCallback) {
          const exportId = Math.random().toString(36).substring(2, 8);
          const startTime = performance.now();
          this.exportCount++;
          
          try {
            const spanArray = Array.isArray(spans) ? spans : [];
            
            // Extract trace information for logging
            const traceInfo = {
              traceIds: [],
              spanIds: [],
              spanNames: [],
              parentSpanIds: []
            };
            
            for (const span of spanArray) {
              try {
                const ctx = span.spanContext();
                if (ctx?.traceId && !traceInfo.traceIds.includes(ctx.traceId)) {
                  traceInfo.traceIds.push(ctx.traceId);
                }
                if (ctx?.spanId) traceInfo.spanIds.push(ctx.spanId);
                if (span.name) traceInfo.spanNames.push(span.name);
                if (span.parentSpanId) traceInfo.parentSpanIds.push(span.parentSpanId);
              } catch {}
            }
            
            console.log(`[Renderer OTEL][${exportId}] IPCSpanExporter.export() called:`, {
              exportId,
              exportCount: this.exportCount,
              spanCount: spanArray.length,
              serviceName: this.serviceName,
              deploymentEnv: this.deploymentEnv,
              traceIds: traceInfo.traceIds,
              spanIds: traceInfo.spanIds.slice(0, 3), // First 3 span IDs  
              spanNames: traceInfo.spanNames,
              parentSpanIds: traceInfo.parentSpanIds.slice(0, 3)
            });
            
            const req = this._toOtlpJson(spans);
            const reqSize = JSON.stringify(req).length;
            
            console.log(`[Renderer OTEL][${exportId}] Converted to OTLP JSON:`, {
              exportId,
              requestSize: reqSize,
              resourceSpansCount: req.resourceSpans?.length || 0,
              traceIds: traceInfo.traceIds,
              actualTraceIds: traceInfo.traceIds,
              traceIdLengths: traceInfo.traceIds.map(id => id?.length || 0)
            });
            
            const res = await window.telemetry.exportTracesJson(req);
            const duration = performance.now() - startTime;
            
            const ok = !!res?.ok && (!res.status || (res.status >= 200 && res.status < 300));
            
            console.log(`[Renderer OTEL][${exportId}] IPC export result:`, {
              exportId,
              success: ok,
              duration: `${Math.round(duration)}ms`,
              responseStatus: res?.status,
              responseOk: res?.ok,
              requestId: res?.requestId,
              traceIds: traceInfo.traceIds,
              returnedTraceIds: res?.traceIds
            });
            
            resultCallback({ code: ok ? 0 : 1 });
          } catch (e) {
            const duration = performance.now() - startTime;
            console.error(`[Renderer OTEL][${exportId}] Export error:`, {
              exportId,
              error: e?.message || e,
              stack: e?.stack,
              duration: `${Math.round(duration)}ms`
            });
            try { resultCallback({ code: 1, error: e }); } catch {}
          }
        }
        async shutdown() {
          console.log('[Renderer OTEL] IPCSpanExporter.shutdown() called', {
            serviceName: this.serviceName,
            totalExports: this.exportCount
          });
        }
        _toOtlpJson(spans) {
          // Helpers
          const toEpochNanos = (hr) => {
            try {
              if (!hr || !Array.isArray(hr) || hr.length < 2) {
                // Fallback to current time in nanoseconds
                return BigInt(Date.now()) * 1000000n;
              }
              const sec = BigInt(hr[0]);
              const ns = BigInt(hr[1]);

              // If hr looks like epoch seconds (>= 1e9), it's already epoch-based.
              // Otherwise treat as relative to performance.timeOrigin.
              if (sec >= 1000000000n) {
                return sec * 1000000000n + ns;
              }

              const originMs = typeof performance?.timeOrigin === 'number' ? performance.timeOrigin : Date.now();
              const originNs = BigInt(Math.trunc(originMs * 1000000)); // ms -> ns
              return originNs + (sec * 1000000000n + ns);
            } catch {
              // Fallback to current time in nanoseconds
              return BigInt(Date.now()) * 1000000n;
            }
          };
          // Per proto3 JSON mapping, bytes fields map to base64 strings in JSON.
          // Convert 32-hex (traceId) / 16-hex (spanId) strings to base64.
          const hexToBase64 = (hex) => {
            try {
              if (!hex || typeof hex !== 'string') return '';
              const clean = hex.trim().toLowerCase();
              if (clean.length % 2 !== 0) return '';
              const bytes = new Uint8Array(clean.length / 2);
              for (let i = 0; i < clean.length; i += 2) {
                const byte = parseInt(clean.slice(i, i + 2), 16);
                if (Number.isNaN(byte)) return '';
                bytes[i / 2] = byte;
              }
              // Browser-safe base64 from bytes
              let bin = '';
              for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
              // btoa is available in browsers/Electron renderers
              return typeof btoa === 'function' ? btoa(bin) : '';
            } catch {
              return '';
            }
          };
          const toAnyValue = (v) => {
            try {
              if (v == null) return { stringValue: '' };
              if (Array.isArray(v)) {
                return { arrayValue: { values: v.map((el) => toAnyValue(el)) } };
              }
              switch (typeof v) {
                case 'string': return { stringValue: v };
                case 'number':
                  return Number.isInteger(v)
                    ? { intValue: String(v) } // int64 must be JSON string per proto3 mapping
                    : { doubleValue: v };
                case 'boolean': return { boolValue: v };
                case 'bigint': return { stringValue: v.toString() };
                default:
                  // Avoid invalid nested objects; fall back to string
                  return { stringValue: String(v) };
              }
            } catch {
              return { stringValue: '' };
            }
          };
          // Local sanitizers to ensure availability within _toOtlpJson scope
          const sanitizeAnyValue = (av) => {
            try {
              if (!av || typeof av !== 'object') return { stringValue: '' };
              if (Object.prototype.hasOwnProperty.call(av, 'stringValue')) {
                const s = String(av.stringValue ?? '');
                return { stringValue: s.length > 4096 ? s.slice(0, 4096) : s };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'intValue')) {
                return { intValue: String(av.intValue) };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'doubleValue')) {
                const n = Number(av.doubleValue);
                return { doubleValue: Number.isFinite(n) ? n : 0 };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'boolValue')) {
                return { boolValue: !!av.boolValue };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'arrayValue')) {
                const vals = Array.isArray(av.arrayValue?.values) ? av.arrayValue.values : [];
                const capped = vals.slice(0, 64).map(sanitizeAnyValue);
                return { arrayValue: { values: capped } };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'kvlistValue')) {
                const list = Array.isArray(av.kvlistValue?.values) ? av.kvlistValue.values : [];
                const sanitized = list.slice(0, 64).map((kv) => ({ key: String(kv.key).slice(0,128), value: sanitizeAnyValue(kv.value) }));
                return { kvlistValue: { values: sanitized } };
              }
              if (Object.prototype.hasOwnProperty.call(av, 'bytesValue')) {
                return av;
              }
              return { stringValue: '' };
            } catch {
              return { stringValue: '' };
            }
          };
          const sanitizeAttributes = (kvs) => {
            try {
              const out = [];
              const seen = new Set();
              for (const kv of Array.isArray(kvs) ? kvs : []) {
                const key = String(kv?.key ?? '').slice(0, 128);
                if (!key || seen.has(key)) continue;
                seen.add(key);
                out.push({ key, value: sanitizeAnyValue(kv?.value) });
                if (out.length >= 128) break;
              }
              return out;
            } catch { return []; }
          };
          const spanKindEnum = (k) => {
            switch (Number(k) || 0) {
              case 0: return 'SPAN_KIND_UNSPECIFIED';
              case 1: return 'SPAN_KIND_INTERNAL';
              case 2: return 'SPAN_KIND_SERVER';
              case 3: return 'SPAN_KIND_CLIENT';
              case 4: return 'SPAN_KIND_PRODUCER';
              case 5: return 'SPAN_KIND_CONSUMER';
              default: return 'SPAN_KIND_UNSPECIFIED';
            }
          };
          const toSpan = (s) => {
            const ctx = s.spanContext();
            let attrs = [];
            try {
              if (s.attributes) {
                for (const k of Object.keys(s.attributes)) {
                  attrs.push({ key: k, value: toAnyValue(s.attributes[k]) });
                }
              }
            } catch {}
            attrs = sanitizeAttributes(attrs);
            // Convert times
            let startNs = toEpochNanos(s.startTime);
            let endNs = toEpochNanos(s.endTime);
            if (endNs <= startNs) {
              // ensure positive duration
              endNs = startNs + 1000000n; // +1ms
            }
            // IMPORTANT: Although proto3 JSON mapping suggests base64 for bytes,
            // Grafana Cloud (OTel Collector HTTP/JSON) expects hex strings for IDs.
            // Use hex for traceId/spanId/parentSpanId for compatibility.
            const traceIdHex = (ctx?.traceId || '0'.repeat(32)).toLowerCase().padStart(32, '0');
            const spanIdHex = (ctx?.spanId || '0'.repeat(16)).toLowerCase().padStart(16, '0');
            const parentSpanIdHex = s.parentSpanId ? s.parentSpanId.toLowerCase().padStart(16, '0') : '';
            const traceId = traceIdHex;
            const spanId = spanIdHex;
            const parentSpanId = parentSpanIdHex;
            
              // Enhanced timestamp debugging
            const nowMs = Date.now();
            const nowNs = BigInt(nowMs) * 1000000n;
            const startDate = new Date(Number(startNs) / 1e6);
            const endDate = new Date(Number(endNs) / 1e6);
            
            // Debug timestamp conversion step by step
            const rawSec = BigInt(s.startTime?.[0] ?? 0);
            const rawNs = BigInt(s.startTime?.[1] ?? 0);
            const directConversion = rawSec * 1000000000n + rawNs;
            const directDate = new Date(Number(directConversion) / 1e6);
            
            console.log(`[Renderer OTEL] Span validation debug:`, {
              traceId,
              traceIdHexLength: traceId.length,
              spanId,
              spanIdHexLength: spanId.length,
              parentSpanId,
              parentSpanIdHexLength: parentSpanId.length,
              // For visibility when debugging, also show base64 versions
              traceIdBase64: hexToBase64(traceIdHex),
              spanIdBase64: hexToBase64(spanIdHex),
              parentSpanIdBase64: parentSpanIdHex ? hexToBase64(parentSpanIdHex) : '',
              startTimeUnixNano: startNs.toString(),
              endTimeUnixNano: endNs.toString(),
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              startYear: startDate.getFullYear(),
              endYear: endDate.getFullYear(),
              isStartTimeReasonable: startDate.getFullYear() >= 2020 && startDate.getFullYear() <= 2030,
              isEndTimeReasonable: endDate.getFullYear() >= 2020 && endDate.getFullYear() <= 2030,
              duration: (endNs - startNs).toString() + ' nanos',
              durationMs: Number(endNs - startNs) / 1e6,
              kind: Number(s.kind) || 0,
              name: s.name || 'span',
              nowMs,
              nowNs: nowNs.toString(),
              timeDiffFromNow: Number(nowNs - startNs),
              statusCode: s.status?.code,
              statusMessage: s.status?.message,
              statusWillBeIncluded: !!(s.status?.code && s.status.code > 0),
              statusExists: !!s.status,
              statusCodeType: typeof s.status?.code,
              // Raw hrtime debugging
              rawStartTime: s.startTime,
              rawEndTime: s.endTime,
              performanceTimeOrigin: performance?.timeOrigin,
              performanceNow: performance?.now?.(),
              // Step-by-step conversion debugging
              rawSecBigInt: rawSec.toString(),
              rawNsBigInt: rawNs.toString(),
              directConversion: directConversion.toString(),
              directDate: directDate.toISOString(),
              directYear: directDate.getFullYear(),
              directVsCalculated: directConversion.toString() === startNs.toString()
            });
            
            // Per OTLP spec for HTTP, span status should be UNSET (omitted) for success.
            // Only include status if it is an error.
            const statusCode = s.status?.code;
            const isError = statusCode === 2; // SpanStatusCode.ERROR
            const statusObject = {};
            if (isError) {
              statusObject.status = {
                // Use enum string for maximum compatibility with proto3 JSON mapping
                code: 'STATUS_CODE_ERROR',
                message: s.status.message || ''
              };
            }
            
            console.log(`[Renderer OTEL] Status filtering debug:`, {
              originalStatusCode: statusCode,
              originalStatusMessage: s.status?.message,
              isError,
              willAddStatus: isError
            });
            
            const spanName = (s.name || 'span');
            const spanOut = {
              traceId,
              spanId,
              name: spanName.length > 255 ? spanName.slice(0, 255) : spanName,
              // Use enum string for JSON mapping of enums
              kind: spanKindEnum(s.kind),
              startTimeUnixNano: startNs.toString(),
              endTimeUnixNano: endNs.toString(),
              attributes: attrs,
              ...statusObject
            };
            if (parentSpanId) spanOut.parentSpanId = parentSpanId; // omit when empty
            return spanOut;
          };
          // Group all spans under a single scope
          const scopeName = (spans?.[0]?.instrumentationLibrary?.name) || 'kicktalk-renderer';
          const scopeVersion = (spans?.[0]?.instrumentationLibrary?.version) || undefined;
          const scope = { name: scopeName }; if (scopeVersion) scope.version = scopeVersion;
          return {
            resourceSpans: [
              {
                resource: {
                  attributes: [
                    { key: 'service.name', value: { stringValue: this.serviceName || 'kicktalk-renderer' } },
                    { key: 'service.namespace', value: { stringValue: 'kicktalk' } },
                    { key: 'deployment.environment', value: { stringValue: this.deploymentEnv } },
                  ]
                },
                scopeSpans: [
                  {
                    scope,
                    spans: (spans || []).map(toSpan)
                  }
                ]
              }
            ]
          };
        }
      }
      const exporter = new IPCSpanExporter('kicktalk-renderer', deploymentEnv);
      try { window.__KT_IPC_EXPORTER__ = exporter; } catch {}

      // Custom minimal span processor to avoid any bundling/ESM mismatches
      class IPCSimpleSpanProcessor {
        constructor(exp) { 
          this._exporter = exp;
          this.processedSpans = 0;
        }
        onStart(span, context) {
          try {
            const ctx = span.spanContext();
            console.log('[Renderer OTEL] Span started:', {
              name: span.name,
              traceId: ctx?.traceId,
              spanId: ctx?.spanId,
              parentSpanId: span.parentSpanId,
              startTime: span.startTime,
              kind: span.kind
            });
          } catch {}
        }
        onEnd(span) {
          this.processedSpans++;
          try {
            const ctx = span.spanContext();
            const duration = span.endTime && span.startTime ? 
              (Number(span.endTime[0]) * 1000 + Number(span.endTime[1]) / 1e6) - 
              (Number(span.startTime[0]) * 1000 + Number(span.startTime[1]) / 1e6) : null;
              
            console.log('[Renderer OTEL] Span ended → exporting via IPC:', {
              name: span.name,
              traceId: ctx?.traceId,
              spanId: ctx?.spanId,
              parentSpanId: span.parentSpanId,
              duration: duration ? `${Math.round(duration)}ms` : 'unknown',
              processedCount: this.processedSpans,
              status: span.status,
              attributes: span.attributes
            });
            
            this._exporter.export([span], (result) => {
              console.log('[Renderer OTEL] Span export callback:', {
                name: span.name,
                traceId: ctx?.traceId,
                spanId: ctx?.spanId,
                result: result?.code === 0 ? 'success' : 'error',
                error: result?.error?.message || result?.error
              });
            }, () => {});
          } catch (e) {
            console.error('[Renderer OTEL] Error in onEnd:', e);
          }
        }
        async forceFlush() {
          console.log('[Renderer OTEL] IPCSimpleSpanProcessor.forceFlush() called', {
            processedSpans: this.processedSpans
          });
        }
        async shutdown() {
          console.log('[Renderer OTEL] IPCSimpleSpanProcessor.shutdown() called', {
            totalProcessedSpans: this.processedSpans
          });
        }
      }

      if (typeof provider.addSpanProcessor === 'function') {
        provider.addSpanProcessor(new IPCSimpleSpanProcessor(exporter));
        try { console.debug('[Renderer OTEL] Installed IPCSimpleSpanProcessor on local provider (pre-register)'); } catch {}
      } else {
        provider._tracerProviderConfig = { spanProcessor: new IPCSimpleSpanProcessor(exporter) };
        try { console.debug('[Renderer OTEL] Stashed span processor into provider config (pre-register)'); } catch {}
      }
      // Use default context manager to avoid CSP issues from ZoneContextManager in Electron
      provider.register({});
      try { window.__KT_TRACE_API__ = { trace }; } catch {}
      try {
        const gp = (trace.getTracerProvider && trace.getTracerProvider());
        if (gp && typeof gp.addSpanProcessor === 'function') {
          gp.addSpanProcessor(new IPCSimpleSpanProcessor(exporter));
          console.debug('[Renderer OTEL] Installed IPCSimpleSpanProcessor on global provider (post-register)');
        }
      } catch {}

      // Hard fallback: wrap tracer.startSpan so any span end triggers IPC export immediately
      try {
        if (!window.__KT_TRACER_WRAP_INSTALLED__) {
          window.__KT_TRACER_WRAP_INSTALLED__ = true;
          const origGetTracer = trace.getTracer.bind(trace);
          trace.getTracer = function wrappedGetTracer(name, version) {
            const base = origGetTracer(name, version);
            try {
              return new Proxy(base, {
                get(target, prop, receiver) {
                  if (prop === 'startSpan') {
                    return function wrappedStartSpan(...args) {
                      const span = target.startSpan.apply(target, args);
                      try {
                        const origEnd = span.end ? span.end.bind(span) : null;
                        if (origEnd && !span.__kt_end_wrapped__) {
                          span.__kt_end_wrapped__ = true;
                          span.end = function wrappedEnd(...endArgs) {
                            try {
                              exporter.export([span], () => {}, () => {});
                            } catch {}
                            return origEnd.apply(this, endArgs);
                          };
                        }
                      } catch {}
                      return span;
                    };
                  }
                  return Reflect.get(target, prop, receiver);
                }
              });
            } catch {
              return base;
            }
          };
        }
      } catch {}
      // Immediately emit a test span to trigger exporter
      try {
        const testTracer = trace.getTracer('kicktalk-renderer');
        const s = testTracer.startSpan('renderer_export_smoke');
        s.end();
        if (typeof provider.forceFlush === 'function') {
          provider.forceFlush().catch(() => {});
        }
      } catch {}

      // Expose provider globally for diagnostics/flush and add periodic flush
      try {
        window.__KT_OTEL_PROVIDER__ = provider;
        window.__KT_TRACER__ = trace.getTracer('kicktalk-renderer');
        if (typeof provider.forceFlush === 'function') {
          console.debug('[Renderer OTEL] provider registered; starting periodic forceFlush every 5s');
          setInterval(async () => {
            try {
              const t0 = performance.now?.() || Date.now();
              await provider.forceFlush();
              const t1 = performance.now?.() || Date.now();
              console.debug('[Renderer OTEL] periodic forceFlush ok', Math.round(t1 - t0), 'ms');
            } catch (e) {
              console.debug('[Renderer OTEL] periodic forceFlush error', e?.message || e);
            }
          }, 5000);
          // One-time delayed flush to catch early spans
          setTimeout(async () => {
            try {
              await provider.forceFlush();
              console.debug('[Renderer OTEL] initial delayed forceFlush ok');
            } catch (e) {
              console.debug('[Renderer OTEL] initial delayed forceFlush error', e?.message || e);
            }
          }, 1000);
        } else {
          console.debug('[Renderer OTEL] provider registered; forceFlush not available');
        }
      } catch (e) {
        console.debug('[Renderer OTEL] failed to expose provider', e?.message || e);
      }

      // Establish a sampled parent span to ensure children (fetch/XHR) are recorded
      const tracer = trace.getTracer('kicktalk-renderer');
      const parent = tracer.startSpan('renderer_parent_sampling_enforcer', {
        attributes: {
          'service.name': 'kicktalk-renderer',
          'deployment.environment': deploymentEnv || 'development',
          'service.namespace': 'kicktalk'
        }
      });
      const activeCtx = trace.setSpan(context.active(), parent);

      registerInstrumentations({
        instrumentations: [
          new FetchInstrumentation({
            propagateTraceHeaderCorsUrls: /.*/,
          }),
          new XMLHttpRequestInstrumentation({}),
        ],
      });

      // Enhanced WebSocket auto-instrumentation for renderer: connect (short) + session (open→close)
      try {
        if (!window.__KT_WEBSOCKET_INSTRUMENTED__ && typeof window.WebSocket === 'function') {
          window.__KT_WEBSOCKET_INSTRUMENTED__ = true;
          const NativeWS = window.WebSocket;
          const wsTracer = trace.getTracer('kicktalk-renderer-websocket');
          const WSWrapper = function(url, protocols) {
            // Derive URL parts for nicer attributes
            let urlStr = typeof url === 'string' ? url : String(url);
            let urlHost = '';
            try { urlHost = new URL(urlStr).host; } catch {}

            const connectSpan = wsTracer.startSpan('websocket.connect', {
              attributes: {
                'ws.url': urlStr,
                'ws.host': urlHost,
                'service.name': 'kicktalk-renderer'
              }
            });

            let socket;
            let sessionSpan = null;
            try {
              socket = new NativeWS(url, protocols);
            } catch (err) {
              try { connectSpan.recordException?.(err); connectSpan.setStatus?.({ code: 2, message: err?.message || String(err) }); } catch {}
              try { connectSpan.end(); } catch {}
              throw err;
            }

            try {
              socket.addEventListener('open', () => {
                try {
                  connectSpan.addEvent('open');
                  connectSpan.setAttribute('ws.readyState', socket.readyState);
                  connectSpan.end(); // export short connect span immediately on open

                  // Start a long-lived session span that lasts until close
                  sessionSpan = wsTracer.startSpan('websocket.session', {
                    attributes: {
                      'ws.url': urlStr,
                      'ws.host': urlHost,
                      'service.name': 'kicktalk-renderer'
                    }
                  });
                } catch {}
              });
              socket.addEventListener('close', (ev) => {
                try {
                  if (sessionSpan) {
                    sessionSpan.addEvent('close');
                    sessionSpan.setAttribute('ws.code', ev?.code ?? 0);
                    sessionSpan.setAttribute('ws.wasClean', !!ev?.wasClean);
                    if (typeof ev?.reason === 'string' && ev.reason) sessionSpan.setAttribute('ws.reason', ev.reason.slice(0, 256));
                    sessionSpan.end();
                  } else {
                    // If close occurs before open, end connect span instead
                    connectSpan.addEvent('close');
                    connectSpan.setAttribute('ws.code', ev?.code ?? 0);
                    connectSpan.setAttribute('ws.wasClean', !!ev?.wasClean);
                    if (typeof ev?.reason === 'string' && ev.reason) connectSpan.setAttribute('ws.reason', ev.reason.slice(0, 256));
                    connectSpan.end();
                  }
                } catch {}
              });
              socket.addEventListener('error', (err) => {
                try {
                  // Attribute errors to the session if available, otherwise to connect span
                  const targetSpan = sessionSpan || connectSpan;
                  targetSpan.addEvent('error');
                  targetSpan.recordException?.(err);
                  targetSpan.setStatus?.({ code: 2, message: (err?.message || String(err)) });
                } catch {}
              });
            } catch {}
            return socket;
          };
          // Preserve prototype chain and static constants
          WSWrapper.prototype = NativeWS.prototype;
          try {
            WSWrapper.CONNECTING = NativeWS.CONNECTING;
            WSWrapper.OPEN = NativeWS.OPEN;
            WSWrapper.CLOSING = NativeWS.CLOSING;
            WSWrapper.CLOSED = NativeWS.CLOSED;
          } catch {}
          // Replace global
          window.WebSocket = WSWrapper;
        }
      } catch (e) {
        console.warn('[Renderer OTEL]: WebSocket instrumentation failed:', e?.message || e);
      }

      // Temporary sampling wrapper: ensure ALL renderer fetch/XHR run under a recording parent
      try {
        const tracerShim = trace.getTracer('kicktalk-renderer-wrap');

        // Patch window.fetch
        if (typeof window.fetch === 'function') {
          const origFetch = window.fetch.bind(window);
          window.fetch = async (...args) => {
            const parentSpan = tracerShim.startSpan('renderer_fetch_parent', {
              attributes: {
                'service.name': 'kicktalk-renderer',
                'otel.wrapper': 'fetch',
              }
            });
            try {
              return await context.with(trace.setSpan(context.active(), parentSpan), async () => {
                return await origFetch(...args);
              });
            } catch (e) {
              try { parentSpan.recordException?.(e); } catch {}
              throw e;
            } finally {
              try { parentSpan.end(); } catch {}
            }
          };
        }

        // Patch XMLHttpRequest send
        if (typeof window.XMLHttpRequest === 'function') {
          const XHRProto = window.XMLHttpRequest.prototype;
          const origSend = XHRProto.send;
          XHRProto.send = function patchedSend(...args) {
            const parentSpan = tracerShim.startSpan('renderer_xhr_parent', {
              attributes: {
                'service.name': 'kicktalk-renderer',
                'otel.wrapper': 'xhr',
              }
            });
            try {
              return context.with(trace.setSpan(context.active(), parentSpan), () => {
                return origSend.apply(this, args);
              });
            } catch (e) {
              try { parentSpan.recordException?.(e); } catch {}
              throw e;
            } finally {
              try { parentSpan.end(); } catch {}
            }
          };
        }
      } catch (e) {
        console.warn('[Renderer OTEL]: Failed to apply sampling wrappers:', e?.message || e);
      }

      // Trigger a small fetch under the parent context to validate child spans immediately
      try {
        await context.with(activeCtx, async () => {
          await fetch('https://httpbin.org/get', { method: 'GET', mode: 'cors' }).catch(() => {});
        });
      } catch {}
      try { parent.end(); } catch {}

      // Smoke test span so you can confirm visibility
      try {
        const boot = tracer.startSpan('renderer_boot', {
          attributes: {
            'service.name': 'kicktalk-renderer',
            'deployment.environment': deploymentEnv || 'development',
          }
        });
        boot.end();
        // emit one more span after a tick to ensure exporter pipeline runs
        queueMicrotask(() => {
          try {
            const t = tracer.startSpan('renderer_boot_post_tick');
            t.end();
          } catch {}
        });
      } catch (e) {
        console.warn('[Renderer OTEL]: Failed to emit renderer_boot span:', e?.message || e);
      }

      // Expose helper to emit a manual renderer test span from DevTools
      try {
        // Avoid mutating an existing frozen bridge; define a standalone global function instead.
        Object.defineProperty(window, 'emitRendererTestSpan', {
          configurable: true,
          enumerable: false,
          writable: false,
          value: async () => {
            const testId = Math.random().toString(36).substring(2, 8);
            const startTime = performance.now();
            
            try {
              console.log(`[Renderer OTEL][${testId}] emitRendererTestSpan: START`);
              
              const t = window.__KT_TRACER__ || trace.getTracer('kicktalk-renderer');
              const s = t.startSpan('renderer_manual_test', {
                attributes: {
                  'service.name': 'kicktalk-renderer',
                  'deployment.environment': deploymentEnv || 'development',
                  'otel.helper': 'emitRendererTestSpan',
                  'test.id': testId
                }
              });
              
              const spanCtx = s.spanContext();
              console.log(`[Renderer OTEL][${testId}] Span created:`, {
                testId,
                name: 'renderer_manual_test',
                traceId: spanCtx?.traceId,
                spanId: spanCtx?.spanId,
                parentSpanId: s.parentSpanId
              });
              
              s.addEvent('manual_test_invoked', { timestamp: Date.now() });
              s.end();
              
              const spanEndTime = performance.now();
              console.log(`[Renderer OTEL][${testId}] Span ended, forcing flush...`, {
                testId,
                traceId: spanCtx?.traceId,
                spanId: spanCtx?.spanId,
                spanDuration: `${Math.round(spanEndTime - startTime)}ms`
              });
              
              // Try to force flush if provider exposes it
              try {
                const prov = (trace.getTracerProvider && trace.getTracerProvider()) || provider;
                if (prov && typeof prov.forceFlush === 'function') {
                  const flushStart = performance.now();
                  await prov.forceFlush();
                  const flushDuration = performance.now() - flushStart;
                  console.log(`[Renderer OTEL][${testId}] forceFlush completed:`, {
                    testId,
                    traceId: spanCtx?.traceId,
                    flushDuration: `${Math.round(flushDuration)}ms`,
                    totalDuration: `${Math.round(performance.now() - startTime)}ms`
                  });
                } else {
                  // queue microtask to allow exporter to run
                  await Promise.resolve();
                  console.log(`[Renderer OTEL][${testId}] microtask tick complete (no forceFlush available):`, {
                    testId,
                    traceId: spanCtx?.traceId,
                    totalDuration: `${Math.round(performance.now() - startTime)}ms`
                  });
                }
              } catch (ffErr) {
                console.error(`[Renderer OTEL][${testId}] forceFlush error:`, {
                  testId,
                  traceId: spanCtx?.traceId,
                  error: ffErr?.message || ffErr,
                  totalDuration: `${Math.round(performance.now() - startTime)}ms`
                });
              }
              
              console.log(`[Renderer OTEL][${testId}] emitRendererTestSpan: COMPLETE`, {
                testId,
                traceId: spanCtx?.traceId,
                spanId: spanCtx?.spanId,
                success: true,
                totalDuration: `${Math.round(performance.now() - startTime)}ms`
              });
              
              return { success: true, testId, traceId: spanCtx?.traceId, spanId: spanCtx?.spanId };
            } catch (err) {
              console.error(`[Renderer OTEL][${testId}] emitRendererTestSpan error:`, {
                testId,
                error: err?.message || err,
                stack: err?.stack,
                totalDuration: `${Math.round(performance.now() - startTime)}ms`
              });
              return { success: false, testId, error: err?.message || err };
            }
          }
        });
        // Additional helper: IPC-direct test using exporter
        Object.defineProperty(window, 'emitRendererTestSpanIPC', {
          configurable: true,
          enumerable: false,
          writable: false,
          value: async () => {
            const testId = Math.random().toString(36).substring(2, 8);
            const startTime = performance.now();
            
            try {
              console.log(`[Renderer OTEL][${testId}] emitRendererTestSpanIPC: START`);
              
              const t = window.__KT_TRACER__ || trace.getTracer('kicktalk-renderer');
              const s = t.startSpan('renderer_manual_test_ipc', {
                attributes: { 
                  'service.name': 'kicktalk-renderer', 
                  'otel.helper': 'emitRendererTestSpanIPC',
                  'test.id': testId
                }
              });
              
              const spanCtx = s.spanContext();
              console.log(`[Renderer OTEL][${testId}] Span created for direct IPC test:`, {
                testId,
                name: 'renderer_manual_test_ipc',
                traceId: spanCtx?.traceId,
                spanId: spanCtx?.spanId,
                parentSpanId: s.parentSpanId
              });
              
              s.end();
              
              console.log(`[Renderer OTEL][${testId}] Directly calling IPC exporter:`, {
                testId,
                traceId: spanCtx?.traceId,
                spanId: spanCtx?.spanId,
                exporterAvailable: !!window.__KT_IPC_EXPORTER__
              });
              
              // Direct call to IPC exporter
              if (window.__KT_IPC_EXPORTER__?.export) {
                const exportStart = performance.now();
                await new Promise((resolve) => {
                  window.__KT_IPC_EXPORTER__.export([s], (result) => {
                    const exportDuration = performance.now() - exportStart;
                    console.log(`[Renderer OTEL][${testId}] Direct IPC export callback:`, {
                      testId,
                      traceId: spanCtx?.traceId,
                      spanId: spanCtx?.spanId,
                      result: result?.code === 0 ? 'success' : 'error',
                      error: result?.error?.message || result?.error,
                      exportDuration: `${Math.round(exportDuration)}ms`
                    });
                    resolve();
                  }, () => {});
                });
              } else {
                console.warn(`[Renderer OTEL][${testId}] IPC exporter not available`);
              }
              
              // Force flush provider
              if (window.__KT_OTEL_PROVIDER__?.forceFlush) {
                const flushStart = performance.now();
                await window.__KT_OTEL_PROVIDER__.forceFlush();
                const flushDuration = performance.now() - flushStart;
                console.log(`[Renderer OTEL][${testId}] Provider forceFlush completed:`, {
                  testId,
                  traceId: spanCtx?.traceId,
                  flushDuration: `${Math.round(flushDuration)}ms`
                });
              }
              
              console.log(`[Renderer OTEL][${testId}] emitRendererTestSpanIPC: COMPLETE`, {
                testId,
                traceId: spanCtx?.traceId,
                spanId: spanCtx?.spanId,
                success: true,
                totalDuration: `${Math.round(performance.now() - startTime)}ms`
              });
              
              return { success: true, testId, traceId: spanCtx?.traceId, spanId: spanCtx?.spanId };
            } catch (e) {
              console.error(`[Renderer OTEL][${testId}] emitRendererTestSpanIPC error:`, {
                testId,
                error: e?.message || e,
                stack: e?.stack,
                totalDuration: `${Math.round(performance.now() - startTime)}ms`
              });
              return { success: false, testId, error: e?.message || e };
            }
          }
        });
      } catch (err) {
        console.warn('[Renderer OTEL]: Failed to expose emitRendererTestSpan:', err?.message || err);
      }

      console.log('[Renderer OTEL]: Web tracer initialized for kicktalk-renderer (IPC relay)');
    } catch (e) {
      console.warn('[Renderer OTEL]: Initialization failed:', e?.message || e);
    }
  })();
}
// Dev-only helper: serialize a test span to OTLP protobuf in renderer and relay via IPC.
// Usage in DevTools: await window.emitRendererTestSpanRaw()
try {
  Object.defineProperty(window, 'emitRendererTestSpanRaw', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: async () => {
      try {
        const { trace } = await import('@opentelemetry/api');
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');

        const tracer = trace.getTracer('kicktalk-renderer');
        const span = tracer.startSpan('renderer_manual_test_raw', {
          attributes: {
            'service.name': 'kicktalk-renderer',
            'otel.helper': 'emitRendererTestSpanRaw'
          }
        });
        span.addEvent('manual_test_raw_invoked');
        span.end();

        // Construct a temporary OTLP exporter to access serializer internals for this dev-only path
        const tmp = new OTLPTraceExporter({ url: 'http://127.0.0.1/otlp-ipc-dummy' });
        const otlp = tmp && tmp._otlpExporter;
        if (!otlp || typeof otlp.convert !== 'function' || typeof otlp.serializeRequest !== 'function') {
          console.warn('[Renderer OTEL][emitRendererTestSpanRaw]: serializer internals unavailable on OTLP exporter');
          return false;
        }
        // Convert the finished span into OTLP ExportTraceServiceRequest protobuf bytes
        const body = otlp.convert([span]);
        const bytes = otlp.serializeRequest(body);
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

        console.debug('[Renderer OTEL][emitRendererTestSpanRaw]: sending serialized bytes via IPC', { byteLength: ab.byteLength });
        const res = await window.telemetry.exportTraces(ab);
        console.debug('[Renderer OTEL][emitRendererTestSpanRaw]: IPC relay response', res);
        return !!res?.ok;
      } catch (e) {
        console.warn('[Renderer OTEL][emitRendererTestSpanRaw]: error:', e?.message || e);
        return false;
      }
    }
  });
} catch {}

// Dev-only helper: build minimal OTLP JSON request and relay via IPC for verification.
// Usage in DevTools: await window.emitRendererTestSpanJson()
try {
  if (!window.emitRendererTestSpanJson) {
    Object.defineProperty(window, 'emitRendererTestSpanJson', {
      configurable: true,
      enumerable: false,
      writable: false,
      value: async () => {
        const testId = Math.random().toString(36).substring(2, 8);
        const startTime = performance.now();
        
        try {
          console.log(`[Renderer OTEL][${testId}] emitRendererTestSpanJson: START`);
          
          const { trace } = await import('@opentelemetry/api');
          const tracer = trace.getTracer('kicktalk-renderer');
          const span = tracer.startSpan('renderer_manual_test_json', {
            attributes: {
              'service.name': 'kicktalk-renderer',
              'otel.helper': 'emitRendererTestSpanJson',
              'test.id': testId
            }
          });
          
          const spanCtx = span.spanContext();
          console.log(`[Renderer OTEL][${testId}] Span created for JSON test:`, {
            testId,
            name: 'renderer_manual_test_json',
            traceId: spanCtx?.traceId,
            spanId: spanCtx?.spanId
          });
          
          span.addEvent('manual_test_json_invoked');
          span.end();

          // Minimal ExportTraceServiceRequest (OTLP/JSON) for relay path verification
          const nowMs = Date.now();
          const seconds = Math.floor(nowMs / 1000);
          const nanos = (nowMs % 1000) * 1e6;
          const fixedTraceId = '00000000000000000000000000000001';
          const fixedSpanId = '0000000000000001';

          const req = {
            resourceSpans: [
              {
                resource: {
                  attributes: [
                    { key: 'service.name', value: { stringValue: 'kicktalk-renderer' } },
                    { key: 'service.namespace', value: { stringValue: 'kicktalk' } },
                    { key: 'deployment.environment', value: { stringValue: 'development' } },
                    { key: 'test.id', value: { stringValue: testId } }
                  ]
                },
                scopeSpans: [
                  {
                    scope: { name: 'kicktalk-renderer' },
                    spans: [
                      {
                        traceId: fixedTraceId,
                        spanId: fixedSpanId,
                        name: 'renderer_manual_test_json',
                        kind: 1,
                        startTimeUnixNano: String(BigInt(seconds) * 1000000000n + BigInt(nanos)),
                        endTimeUnixNano: String(BigInt(seconds) * 1000000000n + BigInt(nanos + 1000000)),
                        attributes: [
                          { key: 'otel.helper', value: { stringValue: 'emitRendererTestSpanJson' } },
                          { key: 'test.id', value: { stringValue: testId } }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          };

          console.log(`[Renderer OTEL][${testId}] Sending minimal OTLP JSON payload:`, {
            testId,
            payloadSize: JSON.stringify(req).length,
            traceId: fixedTraceId,
            spanId: fixedSpanId,
            resourceSpansCount: req.resourceSpans.length
          });

          const res = await window.telemetry?.exportTracesJson?.(req);
          const duration = performance.now() - startTime;
          
          console.log(`[Renderer OTEL][${testId}] emitRendererTestSpanJson: COMPLETE`, {
            testId,
            traceId: fixedTraceId,
            spanId: fixedSpanId,
            success: !!res?.ok,
            responseStatus: res?.status,
            responseRequestId: res?.requestId,
            returnedTraceIds: res?.traceIds,
            totalDuration: `${Math.round(duration)}ms`
          });
          
          return { success: !!res?.ok, testId, traceId: fixedTraceId, spanId: fixedSpanId, response: res };
        } catch (e) {
          console.error(`[Renderer OTEL][${testId}] emitRendererTestSpanJson error:`, {
            testId,
            error: e?.message || e,
            stack: e?.stack,
            totalDuration: `${Math.round(performance.now() - startTime)}ms`
          });
          return { success: false, testId, error: e?.message || e };
        }
      }
    });
  }
} catch {}

// Dev-only helper: Test real instrumentation span but with fixed trace ID to isolate trace ID vs other issues
try {
  Object.defineProperty(window, 'emitRendererTestSpanHybrid', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: async () => {
      const testId = Math.random().toString(36).substring(2, 8);
      const startTime = performance.now();
      
      try {
        console.log(`[Renderer OTEL][${testId}] emitRendererTestSpanHybrid: START`);
        
        const { trace } = await import('@opentelemetry/api');
        const tracer = trace.getTracer('kicktalk-renderer');
        
        // Get deployment env from config or fallback
        const cfg = await window?.telemetry?.getOtelConfig?.();
        const env = cfg?.deploymentEnv || 'development';
        
        // Create a real span first
        const realSpan = tracer.startSpan('renderer_hybrid_test', {
          attributes: {
            'service.name': 'kicktalk-renderer',
            'deployment.environment': env,
            'otel.helper': 'emitRendererTestSpanHybrid',
            'test.id': testId
          }
        });
        
        const realSpanCtx = realSpan.spanContext();
        console.log(`[Renderer OTEL][${testId}] Real span created:`, {
          testId,
          name: 'renderer_hybrid_test',
          traceId: realSpanCtx?.traceId,
          spanId: realSpanCtx?.spanId,
          parentSpanId: realSpan.parentSpanId
        });
        
        realSpan.addEvent('hybrid_test_invoked');
        realSpan.end();
        
        // Now create OTLP payload using real span data but with working trace ID
        const nowMs = Date.now();
        const seconds = Math.floor(nowMs / 1000);
        const nanos = (nowMs % 1000) * 1e6;
        
        // Use the trace ID that we know works
        const workingTraceId = '00000000000000000000000000000001';
        const workingSpanId = '0000000000000002'; // Different span ID
        
        const hybridReq = {
          resourceSpans: [
            {
              resource: {
                attributes: [
                  { key: 'service.name', value: { stringValue: 'kicktalk-renderer' } },
                  { key: 'service.namespace', value: { stringValue: 'kicktalk' } },
                  { key: 'deployment.environment', value: { stringValue: env } },
                  { key: 'test.id', value: { stringValue: testId } },
                  { key: 'test.type', value: { stringValue: 'hybrid' } }
                ]
              },
              scopeSpans: [
                {
                  scope: { name: 'kicktalk-renderer' },
                  spans: [
                    {
                      traceId: workingTraceId,  // Use working trace ID
                      spanId: workingSpanId,    // But different span ID
                      name: 'renderer_hybrid_test',
                      kind: Number(realSpan.kind) || 1,
                      startTimeUnixNano: String(BigInt(seconds) * 1000000000n + BigInt(nanos)),
                      endTimeUnixNano: String(BigInt(seconds) * 1000000000n + BigInt(nanos + 1000000)),
                      attributes: Object.entries(realSpan.attributes || {}).map(([key, value]) => ({
                        key,
                        value: typeof value === 'string' ? { stringValue: value } :
                               typeof value === 'number' ? Number.isInteger(value) ? { intValue: value } : { doubleValue: value } :
                               typeof value === 'boolean' ? { boolValue: value } :
                               { stringValue: String(value) }
                      })).concat([
                        { key: 'test.type', value: { stringValue: 'hybrid' } },
                        { key: 'original.traceId', value: { stringValue: realSpanCtx?.traceId || 'unknown' } }
                      ]),
                      status: { code: Number(realSpan.status?.code ?? 0), message: realSpan.status?.message || '' }
                    }
                  ]
                }
              ]
            }
          ]
        };
        
        console.log(`[Renderer OTEL][${testId}] Sending hybrid payload (real span + working trace ID):`, {
          testId,
          payloadSize: JSON.stringify(hybridReq).length,
          workingTraceId,
          workingSpanId,
          originalTraceId: realSpanCtx?.traceId,
          originalSpanId: realSpanCtx?.spanId,
          resourceAttributeCount: hybridReq.resourceSpans[0].resource.attributes.length,
          spanAttributeCount: hybridReq.resourceSpans[0].scopeSpans[0].spans[0].attributes.length
        });
        
        const res = await window.telemetry?.exportTracesJson?.(hybridReq);
        const duration = performance.now() - startTime;
        
        console.log(`[Renderer OTEL][${testId}] emitRendererTestSpanHybrid: COMPLETE`, {
          testId,
          workingTraceId,
          originalTraceId: realSpanCtx?.traceId,
          success: !!res?.ok,
          responseStatus: res?.status,
          responseRequestId: res?.requestId,
          totalDuration: `${Math.round(duration)}ms`,
          recommendation: res?.ok ? 'Check Grafana for hybrid trace with working trace ID' : 'IPC relay failed'
        });
        
        return { 
          success: !!res?.ok, 
          testId, 
          workingTraceId, 
          originalTraceId: realSpanCtx?.traceId,
          originalSpanId: realSpanCtx?.spanId,
          response: res 
        };
      } catch (e) {
        console.error(`[Renderer OTEL][${testId}] emitRendererTestSpanHybrid error:`, {
          testId,
          error: e?.message || e,
          stack: e?.stack,
          totalDuration: `${Math.round(performance.now() - startTime)}ms`
        });
        return { success: false, testId, error: e?.message || e };
      }
    }
  });
  
  // Payload comparison helper to identify differences between working and failing traces
  Object.defineProperty(window, 'compareOTLPPayloads', {
    configurable: true,
    enumerable: false, 
    writable: false,
    value: (payload1, payload2, label1 = 'Payload 1', label2 = 'Payload 2') => {
      try {
        const compare = (obj1, obj2, path = '') => {
          const diffs = [];
          
          if (typeof obj1 !== typeof obj2) {
            diffs.push(`${path}: type mismatch (${typeof obj1} vs ${typeof obj2})`);
            return diffs;
          }
          
          if (Array.isArray(obj1) !== Array.isArray(obj2)) {
            diffs.push(`${path}: array mismatch`);
            return diffs;
          }
          
          if (Array.isArray(obj1)) {
            if (obj1.length !== obj2.length) {
              diffs.push(`${path}: array length (${obj1.length} vs ${obj2.length})`);
            }
            const maxLen = Math.max(obj1.length, obj2.length);
            for (let i = 0; i < maxLen; i++) {
              diffs.push(...compare(obj1[i], obj2[i], `${path}[${i}]`));
            }
            return diffs;
          }
          
          if (typeof obj1 === 'object' && obj1 !== null && obj2 !== null) {
            const keys1 = Object.keys(obj1);
            const keys2 = Object.keys(obj2);
            const allKeys = new Set([...keys1, ...keys2]);
            
            for (const key of allKeys) {
              if (!(key in obj1)) {
                diffs.push(`${path}.${key}: missing in ${label1}`);
              } else if (!(key in obj2)) {
                diffs.push(`${path}.${key}: missing in ${label2}`);
              } else {
                diffs.push(...compare(obj1[key], obj2[key], `${path}.${key}`));
              }
            }
            return diffs;
          }
          
          if (obj1 !== obj2) {
            diffs.push(`${path}: value mismatch ("${obj1}" vs "${obj2}")`);
          }
          
          return diffs;
        };
        
        const differences = compare(payload1, payload2);
        console.log('OTLP Payload Comparison:', {
          label1,
          label2,
          differences: differences.length ? differences : ['No differences found'],
          payload1Size: JSON.stringify(payload1).length,
          payload2Size: JSON.stringify(payload2).length
        });
        
        return differences;
      } catch (e) {
        console.error('compareOTLPPayloads error:', e);
        return [`Error during comparison: ${e.message}`];
      }
    }
  });
} catch {}
