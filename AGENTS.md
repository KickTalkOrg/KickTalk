# Repository Guidelines

## Electron‑Vite First

- This is an electron‑vite + React app. Prefer electron‑vite patterns over raw Electron.
- Env vars: use `import.meta.env` and scoped prefixes — `MAIN_VITE_*` (main), `PRELOAD_VITE_*` (preload), `RENDERER_VITE_*` (renderer), `VITE_*` (all). Unprefixed keys are ignored. You can customize prefixes via `envPrefix` or load with `loadEnv(mode)` in `electron.vite.config.mjs`.
- Preloads: expose safe APIs via `contextBridge.exposeInMainWorld` with `contextIsolation: true`. From main, reference the built preload (e.g., `join(__dirname, '../preload/index.js')`). In ESM contexts, resolve with `fileURLToPath(new URL('../preload/index.js', import.meta.url))`.
- Docs: when unsure, use Context7 to consult electron‑vite/Electron/Vite docs and confirm patterns.

## Project Structure & Module Organization

- Source: `src/`
  - Main (Electron): `src/main/` (Node context)
  - Preload bridges: `src/preload/` (expose minimal APIs via `contextBridge`)
  - Renderer (React): `src/renderer/src/**` (components, hooks, assets, styles)
  - Telemetry: `src/telemetry/**`, `src/renderer/src/telemetry/**`
- Build output: bundled `out/`, packaged installers `dist/`
- Config: `electron.vite.config.mjs` (main, preload, renderer builds)
- Docs/examples: `docs/`; load/perf artifacts: `tests/`

## Build, Test, and Development Commands

- `npm install`: install dependencies
- `npm run dev`: start app in dev (Vite + Electron)
- `npm run dev-hr`: dev with hot reload for main/preload
- `npm run build`: bundle to `out/`
- `npm start`: run packaged preview from `out/`
- `npm run build:win | build:mac | build:linux`: create installers in `dist/`
- `npm run lint` / `npm run lint:fix`: check/fix ESLint issues
- `npm run format`: format with Prettier

## Coding Style & Naming Conventions

- Lint/format: ESLint (`eslint.config.js`) + Prettier; run before PRs
- React components: PascalCase in `src/renderer/src/components/` (e.g., `TitleBar.jsx`)
- Hooks/utilities: camelCase (e.g., `useClickOutside.jsx`, `chatUtils.js`)
- Styles: SCSS under `src/renderer/src/assets/styles/**`
- Avoid direct Node APIs in renderer; add preload bridges instead

## Testing Guidelines

- Current: no formal unit tests configured
- If adding tests: prefer Vitest + React Testing Library
- Naming: `Component.test.jsx`; colocate next to file or in `__tests__/`
- Keep tests fast and deterministic; mock Electron bridges

## Commit & Pull Request Guidelines

- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `build:` …)
- PRs must include: clear description, linked issues, before/after screenshots for UI changes, and risk/telemetry notes
- CI hygiene: run `npm run lint` and `npm run build` locally; do not commit `dist/`

## Security & Configuration Tips

- Env vars: scope with `MAIN_VITE_*`, `PRELOAD_VITE_*`, `RENDERER_VITE_*`; use `VITE_*` for non-secrets shared across contexts
- Secrets: keep in `process.env`/`MAIN_VITE_*`; never expose to renderer
- Create `.env` from `.env.example`; packaging excludes docs/tests — avoid bloat

## IPC Model

- Bridge: expose minimal, purpose‑built functions in preload; no raw Node APIs in renderer.
- Request/response: main registers `ipcMain.handle('channel', fn)`; renderer calls `ipcRenderer.invoke('channel', payload)`.
- Events: use `ipcRenderer.send`/`ipcMain.on` for fire‑and‑forget; prefer namespaced channels like `app:settings:get`.
- Safety: validate/sanitize payloads in main; avoid wildcards and dynamic eval.
- Example: renderer `await window.electron.ping()` ↔ main `ipcMain.handle('ping', () => 'pong')`.

## Telemetry

- OpenTelemetry: instrumented in `src/telemetry/**` and `src/renderer/src/telemetry/**`.
- Export: sends traces/metrics directly to Grafana Cloud’s OTLP HTTP endpoint (no collector) for simplicity.
- Config: set OTLP endpoint/keys via `.env` (main process `process.env` or `MAIN_VITE_*`); never expose secrets to renderer.

## Electron‑Vite Notes

- Preload entry: `src/preload/index.js`; load from main with `preload: join(__dirname, '../preload/index.js')`
- Keep `contextIsolation: true`; resolve assets via Vite (e.g., `new URL('./icon.png', import.meta.url)`).
