# React Best Practices Audit — LotusWorksToolkit

Audit date: 2026-02-10
Based on: Vercel React Best Practices guidelines (57 rules, 8 categories)

## P0 — Critical (Performance Impact)

- [x] **1. Add `React.memo()` to all common UI components**
  Files: `Button.tsx`, `ColorPicker.tsx`, `FileDropZone.tsx`, `ProgressBar.tsx`, `Slider.tsx`, `Tabs.tsx`, `Toast.tsx` (+ extracted `ToastItem`)
  Rule: `rerender-memo` — Extract expensive work into memoized components

- [x] **2. Add `React.memo()` to chart widget components**
  Files: `BarChartWidget.tsx`, `LineChartWidget.tsx`, `PieChartWidget.tsx`, `AreaChartWidget.tsx`, `ScatterChartWidget.tsx`
  Rule: `rerender-memo` — Dashboard re-renders ALL charts on any state change

- [x] **3. Fix Zustand selector inefficiency**
  File: `Sidebar.tsx` — split destructured `useAppStore()` into individual selectors
  Note: `WelcomeScreen.tsx` already used proper selectors
  Rule: `rerender-derived-state` — Destructuring entire store causes re-renders on ANY change

## P1 — High (Code Quality)

- [x] **4. Centralize PDF.js worker setup**
  Created: `src/utils/pdfWorkerSetup.ts` — single init module
  Updated: `pdf.ts`, `compression.ts`, `conversion.ts` — replaced inline setup with side-effect import
  Rule: `bundle-barrel-imports` — Duplicated init code across 3 files

- [x] **5. Hoist regex constants to module level**
  File: `conversion.ts` — hoisted `FORMULA_INJECT_RE`, `SCRIPT_RE`, `IFRAME_RE`, `OBJECT_RE`, `EMBED_RE`, `EVENT_HANDLER_*_RE`, `JS_PROTOCOL_RE`
  Also hoisted `HEX_PATTERN` in `ColorPicker.tsx`
  Rule: `js-hoist-regexp` — Regex compiled on every function call

- [ ] **6. Split conversion.ts monolith** *(deferred — large refactor)*
  File: `conversion.ts` (977 lines)
  Rule: `bundle-dynamic-imports` — All converters ship in one chunk

## P2 — Medium (Best Practices)

- [x] **7. Add toast feedback to silent catch blocks**
  Files: `DashboardTool.tsx` (PNG export + JSON import), `QrCodeTool.tsx` (clipboard copy), `PdfMergeTool.tsx` (file load)
  Rule: Validation & Robustness — Silent failures give no user feedback

- [x] **8. Wrap tool roots in ErrorBoundary**
  File: `App.tsx` — wrapped `<ActiveComponent>` in `<ErrorBoundary>` inside `<Suspense>`
  Rule: Error handling — Component throw crashes entire tool

- [x] **9. Switch to `crypto.randomUUID()` for ID generation**
  File: `pdf.ts` — `generateId()` now uses `crypto.randomUUID()`
  Rule: CLAUDE.md gotcha — `Math.random().toString(36)` is collision-prone

- [x] **10. Add max size to unbounded thumbnail Set**
  File: `PdfMergeTool.tsx` — added `MAX_LOADING_THUMBS = 1000` with eviction
  Rule: CLAUDE.md gotcha — Every cache must have max size + eviction

- [x] **11. Round canvas dimensions to integers**
  File: `ImageResizerTool.tsx` — wrapped preview canvas width/height in `Math.round()`
  Rule: `rendering-svg-precision` — Float canvas dimensions cause sub-pixel artifacts

## Network Audit

**Verdict: PASS — Zero external network calls detected.**

- 127 source files scanned, 19 npm packages analyzed
- No `fetch()`, `axios`, `XMLHttpRequest`, `WebSocket`, analytics, telemetry, or CDN references
- Only caveat: `tesseract.js` can download language models on first OCR use (mitigated by single-HTML bundle)
- All 15 tools process data 100% locally in the browser

## Build Verification

- `tsc --noEmit`: 0 errors
- `vite build`: success (6,124 kB single HTML, 1,897 kB gzip)
