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
        }
        async export(spans, resultCallback) {
          try {
            try { console.debug('[Renderer OTEL] IPC exporter: exporting', Array.isArray(spans) ? spans.length : 0, 'spans'); } catch {}
            const req = this._toOtlpJson(spans);
            const res = await window.telemetry.exportTracesJson(req);
            const ok = !!res?.ok && (!res.status || (res.status >= 200 && res.status < 300));
            resultCallback({ code: ok ? 0 : 1 });
          } catch (e) {
            try { resultCallback({ code: 1, error: e }); } catch {}
          }
        }
        async shutdown() {}
        _toOtlpJson(spans) {
          // Helpers
          const toEpochNanos = (hr) => {
            try {
              const sec = BigInt(hr?.[0] ?? 0);
              const ns = BigInt(hr?.[1] ?? 0);
              const originMs = Number.isFinite(performance?.timeOrigin)
                ? Math.floor(performance.timeOrigin)
                : Math.floor(Date.now() - (performance?.now?.() || 0));
              const originNs = BigInt(originMs) * 1000000n;
              return originNs + sec * 1000000000n + ns;
            } catch {
              return 0n;
            }
          };
          const toAnyValue = (v) => {
            if (v == null) return { stringValue: '' };
            switch (typeof v) {
              case 'string': return { stringValue: v };
              case 'number': return Number.isInteger(v) ? { intValue: v } : { doubleValue: v };
              case 'boolean': return { boolValue: v };
              default: return { stringValue: String(v) };
            }
          };
          const toSpan = (s) => {
            const ctx = s.spanContext();
            const attrs = [];
            try {
              if (s.attributes) {
                for (const k of Object.keys(s.attributes)) {
                  attrs.push({ key: k, value: toAnyValue(s.attributes[k]) });
                }
              }
            } catch {}
            // Convert times
            let startNs = toEpochNanos(s.startTime);
            let endNs = toEpochNanos(s.endTime);
            if (endNs <= startNs) {
              // ensure positive duration
              endNs = startNs + 1000000n; // +1ms
            }
            return {
              traceId: ctx?.traceId || '0'.repeat(32),
              spanId: ctx?.spanId || '0'.repeat(16),
              parentSpanId: s.parentSpanId || '',
              name: s.name || 'span',
              kind: Number(s.kind) || 0,
              startTimeUnixNano: startNs.toString(),
              endTimeUnixNano: endNs.toString(),
              attributes: attrs,
              status: { code: Number(s.status?.code ?? 0), message: s.status?.message || '' },
            };
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
        constructor(exp) { this._exporter = exp; }
        onStart(_span, _context) {}
        onEnd(span) {
          try {
            try { console.debug('[Renderer OTEL] span ended → exporting via IPC'); } catch {}
            this._exporter.export([span], () => {}, () => {});
          } catch {}
        }
        async forceFlush() {}
        async shutdown() {}
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

      // Minimal WebSocket auto-instrumentation for renderer: open, send, close, error, message
      try {
        if (!window.__KT_WEBSOCKET_INSTRUMENTED__ && typeof window.WebSocket === 'function') {
          window.__KT_WEBSOCKET_INSTRUMENTED__ = true;
          const NativeWS = window.WebSocket;
          const wsTracer = trace.getTracer('kicktalk-renderer-websocket');
          const WSWrapper = function(url, protocols) {
            const span = wsTracer.startSpan('websocket.connect', {
              attributes: {
                'ws.url': typeof url === 'string' ? url : String(url),
                'service.name': 'kicktalk-renderer'
              }
            });
            let socket;
            try {
              socket = new NativeWS(url, protocols);
            } catch (err) {
              try { span.recordException?.(err); span.setStatus?.({ code: 2, message: err?.message || String(err) }); } catch {}
              try { span.end(); } catch {}
              throw err;
            }
            try {
              socket.addEventListener('open', () => {
                try { span.addEvent('open'); span.setAttribute('ws.readyState', socket.readyState); } catch {}
              });
              socket.addEventListener('close', (ev) => {
                try {
                  span.addEvent('close');
                  span.setAttribute('ws.code', ev?.code ?? 0);
                  span.setAttribute('ws.wasClean', !!ev?.wasClean);
                } catch {}
                try { span.end(); } catch {}
              });
              socket.addEventListener('error', (err) => {
                try { span.addEvent('error'); span.recordException?.(err); } catch {}
              });
              socket.addEventListener('message', (msg) => {
                const m = wsTracer.startSpan('websocket.message', { parent: trace.setSpan(context.active(), span) });
                try {
                  const size = typeof msg?.data === 'string' ? msg.data.length : (msg?.data?.byteLength ?? 0);
                  m.setAttribute('ws.message.size', size);
                } catch {}
                try { m.end(); } catch {}
              });
              const origSend = socket.send;
              socket.send = function patchedSend(data) {
                const s = wsTracer.startSpan('websocket.send', { parent: trace.setSpan(context.active(), span) });
                try {
                  const size = typeof data === 'string' ? data.length : (data?.byteLength ?? 0);
                  s.setAttribute('ws.send.size', size);
                } catch {}
                try { return origSend.apply(this, arguments); }
                finally { try { s.end(); } catch {} }
              };
            } catch {}
            return socket;
          };
          WSWrapper.prototype = NativeWS.prototype;
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
            try {
              console.debug('[Renderer OTEL] emitRendererTestSpan: creating span');
              const t = window.__KT_TRACER__ || trace.getTracer('kicktalk-renderer');
              const s = t.startSpan('renderer_manual_test', {
                attributes: {
                  'service.name': 'kicktalk-renderer',
                  'deployment.environment': deploymentEnv || 'development',
                  'otel.helper': 'emitRendererTestSpan'
                }
              });
              s.addEvent('manual_test_invoked');
              s.end();
              console.debug('[Renderer OTEL] emitRendererTestSpan: span ended, forcing flush...');
              // Try to force flush if provider exposes it
              try {
                const prov = (trace.getTracerProvider && trace.getTracerProvider()) || provider;
                if (prov && typeof prov.forceFlush === 'function') {
                  await prov.forceFlush();
                  console.debug('[Renderer OTEL] emitRendererTestSpan: forceFlush done');
                } else {
                  // queue microtask to allow exporter to run
                  await Promise.resolve();
                  console.debug('[Renderer OTEL] emitRendererTestSpan: microtask tick complete (no forceFlush available)');
                }
              } catch (ffErr) {
                console.debug('[Renderer OTEL] emitRendererTestSpan: forceFlush error', ffErr?.message || ffErr);
              }
              return true;
            } catch (err) {
              console.warn('[Renderer OTEL]: emitRendererTestSpan error:', err?.message || err);
              return false;
            }
          }
        });
        // Additional helper: IPC-direct test using exporter
        Object.defineProperty(window, 'emitRendererTestSpanIPC', {
          configurable: true,
          enumerable: false,
          writable: false,
          value: async () => {
            try {
              const t = window.__KT_TRACER__ || trace.getTracer('kicktalk-renderer');
              const s = t.startSpan('renderer_manual_test_ipc', {
                attributes: { 'service.name': 'kicktalk-renderer', 'otel.helper': 'emitRendererTestSpanIPC' }
              });
              s.end();
              try { window.__KT_IPC_EXPORTER__?.export?.([s], () => {}, () => {}); } catch {}
              await window.__KT_OTEL_PROVIDER__?.forceFlush?.();
              return true;
            } catch (e) {
              console.warn('[Renderer OTEL]: emitRendererTestSpanIPC error:', e?.message || e);
              return false;
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
        try {
          const { trace } = await import('@opentelemetry/api');
          const tracer = trace.getTracer('kicktalk-renderer');
          const span = tracer.startSpan('renderer_manual_test_json', {
            attributes: {
              'service.name': 'kicktalk-renderer',
              'otel.helper': 'emitRendererTestSpanJson'
            }
          });
          span.addEvent('manual_test_json_invoked');
          span.end();

          // Minimal ExportTraceServiceRequest (OTLP/JSON) for relay path verification
          const nowMs = Date.now();
          const seconds = Math.floor(nowMs / 1000);
          const nanos = (nowMs % 1000) * 1e6;

          const req = {
            resourceSpans: [
              {
                resource: {
                  attributes: [
                    { key: 'service.name', value: { stringValue: 'kicktalk-renderer' } }
                  ]
                },
                scopeSpans: [
                  {
                    scope: { name: 'kicktalk-renderer' },
                    spans: [
                      {
                        traceId: '00000000000000000000000000000001',
                        spanId: '0000000000000001',
                        name: 'renderer_manual_test_json',
                        kind: 1,
                        startTimeUnixNano: String(BigInt(seconds) * 1000000000n + BigInt(nanos)),
                        endTimeUnixNano: String(BigInt(seconds) * 1000000000n + BigInt(nanos + 1000000)),
                        attributes: [
                          { key: 'otel.helper', value: { stringValue: 'emitRendererTestSpanJson' } }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          };

          const res = await window.telemetry?.exportTracesJson?.(req);
          console.debug('[Renderer OTEL] emitRendererTestSpanJson: IPC relay response', res);
          return !!res?.ok;
        } catch (e) {
          console.warn('[Renderer OTEL] emitRendererTestSpanJson error:', e?.message || e);
          return false;
        }
      }
    });
  }
} catch {}