# Repository Guidelines

## Electron‑Vite Patterns

- App stack: electron‑vite + React. Prefer electron‑vite conventions over raw Electron.
- Preload loading: from main, point to the built preload (e.g., `join(__dirname, '../preload/index.js')`); in ESM, use `fileURLToPath(new URL('../preload/index.js', import.meta.url))`.
- Security: keep `contextIsolation: true`; avoid direct Node APIs in renderer.
- Assets: resolve via Vite URLs (e.g., `new URL('./icon.png', import.meta.url)`).
- Docs: when unsure, use Context7 to consult electron‑vite/Electron/Vite docs and confirm patterns.

## Project Structure

- Source root: `src/`
- Main (Electron, Node context): `src/main/`
- Preload bridges: `src/preload/`
- Renderer (React): `src/renderer/src/**` (components, hooks, assets, styles)
- Telemetry: `src/telemetry/**`, `src/renderer/src/telemetry/**`
- Build output: bundled `out/`; installers in `dist/`
- Config: `electron.vite.config.mjs` (main, preload, renderer builds)
- Docs/examples: `docs/`; load/perf artifacts: `tests/`

## Preload Bridges

- API surface: expose minimal, purpose‑built functions via `contextBridge.exposeInMainWorld`.
- Isolation: keep `contextIsolation: true` and avoid exposing raw Node.
- Contract: document each exposed method and validate inputs on the main side.

## IPC Model

- Request/response: main registers `ipcMain.handle('channel', fn)`; renderer calls `ipcRenderer.invoke('channel', payload)`.
- Events: use `ipcRenderer.send`/`ipcMain.on` for fire‑and‑forget; prefer namespaced channels like `app:settings:get`.
- Safety: validate/sanitize payloads in main; avoid wildcards and dynamic eval.
- Example: renderer `await window.electron.ping()` ↔ main `ipcMain.handle('ping', () => 'pong')`.

## Env & Secrets

- Access: use `import.meta.env` with electron‑vite’s scoped prefixes.
- Default prefixes (active):
  - Context‑scoped: `MAIN_VITE_*` (main), `PRELOAD_VITE_*` (preload), `RENDERER_VITE_*` (renderer)
  - Shared non‑secrets: `VITE_*`
  - Unprefixed keys are ignored by Vite.
- KickTalk naming:
  - Use `MAIN_VITE_KT_*`, `PRELOAD_VITE_KT_*`, `RENDERER_VITE_KT_*` for app‑specific vars per context.
  - Avoid bare `KT_*` in renderer; it is not exposed via `import.meta.env` with the default config.
  - If you need bare `KT_*` available, add an `envPrefix` override in `electron.vite.config.mjs` (not enabled now).
- Secrets: keep in `process.env`/`MAIN_VITE_*` (main only); never expose secrets to renderer.
- Setup: create `.env` from `.env.example`. Packaging excludes docs/tests—avoid bloat.

## Telemetry

- Instrumentation: OpenTelemetry under `src/telemetry/**` and `src/renderer/src/telemetry/**`.
- Export: send traces/metrics directly to Grafana Cloud via OTLP HTTP (no collector).
- Config: set OTLP endpoint/keys via `.env` using main‑safe prefixes (see “Env & Secrets”). Never expose secrets to renderer.

## Testing

- Status: no formal unit tests configured.
- If adding tests: use Vitest + React Testing Library.
- Naming: `Component.test.jsx`; colocate next to file or use `__tests__/`.
- Guidance: keep tests fast/deterministic; mock Electron bridges.

## Dev & Build

- See `README.md` for development commands (`npm run dev`, build/package, lint/format).

## Commits & PRs

- Conventional Commits (`feat:`, `fix:`, `chore:`, `build:` …).
- PRs: include description, linked issues, before/after screenshots for UI changes, and risk/telemetry notes.
- CI hygiene: run lint/build locally; do not commit `dist/`.
