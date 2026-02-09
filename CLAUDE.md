# LotusWorksToolkit

Professional-grade local toolbox delivered as a single HTML file. All tools run 100% in-browser with zero server calls — safe for intellectual property, sensitive documents, and regulated industries. Distributed via email, OneDrive, SharePoint, or any file share.

## Why This Matters
This is a flagship internal product. Quality, polish, and reliability directly impact career trajectory. Every tool must feel enterprise-grade — no rough edges, no "demo-quality" UI.

## Commands
```bash
npm run dev              # Vite dev server (localhost:5173)
npm run build            # Production build → dist/index.html
```
- **Development**: All work and testing happens on `localhost:5173` via Vite dev server.
- **Production**: Changes are eventually ported into `dist/index.html` for single-file distribution. Do not edit `dist/index.html` directly.

## Architecture
- `dist/index.html` — Single-file distribution build (the final deliverable)
- `presentation.html` — Executive presentation (not part of the app)
- `App.tsx` — Home menu with sidebar navigation and tool grid, organized by category (Documents, Images, Files, Creators, Utilities)
- `/src/tools/` — Each subfolder is a standalone tool module:
  - `dashboard` — Dashboard builder tool (under Creators category)
  - `file-compressor` — File compression
  - `file-converter` — Format conversion
  - `flowchart` — Flowchart builder
  - `form-creator` — Form builder
  - `image-bg-remove` — Background removal
  - `image-resizer` — Image resizing
  - `json-csv-viewer` — JSON/CSV data viewer
  - `org-chart` — Organizational chart builder
  - `pdf-annotate` — PDF annotation
  - `pdf-merge` — PDF merging
  - `pdf-split` — PDF splitting
  - `pdf-watermark` — PDF watermarking
  - `qr-code` — QR code generator
  - `text-extract` — Text extraction (OCR)
- `/src/components/` — Shared UI components (reuse across tools)
- `/src/stores/` — State management
- `/src/types/` — Shared TypeScript types
- `/src/utils/` — Shared utilities
- `registry.ts` — Tool registry (maps tools to routes/metadata)

## Critical Constraints
- **100% local execution.** NEVER add any external API calls, analytics, telemetry, or CDN-loaded resources. Every byte must ship in the bundle.
- **Single HTML distribution.** The final output must work as a standalone file. No assumptions about folder structure or adjacent assets at runtime.
- **Professional UI.** Every tool must have consistent styling, clear labels, proper loading states, error handling, and empty states. This is not a prototype — it's a product.
- **Browser compatibility.** Must work in Chrome and Edge (enterprise standard). No bleeding-edge APIs without fallbacks.

## Adding a New Tool
1. Create a new folder under `/src/tools/<tool-name>/`
2. Follow the same component structure as existing tools
3. Register it in `registry.ts`
4. Ensure it works in isolation — no cross-tool dependencies
5. Verify it renders correctly inside the single HTML output

## Polish Pass (new tools and major features)
After a tool works functionally, do a second pass before marking done:
1. Think like a product designer, not just an engineer. Ask: "If a non-technical professional used this tool daily, what would frustrate them or what would they expect to be there?"
2. List 5+ UX enhancements (examples: drag-and-drop, inline editing, undo/redo, + buttons for adding items, profile photos, export to PNG/PDF, keyboard shortcuts, color coding, expand/collapse, right-click context menus).
3. Present the list to the user for approval — don't implement without asking.
4. Implement the approved enhancements.
5. Verify each enhancement works with edge cases.

## Code Patterns
- Tools are self-contained modules. Shared logic goes in `/src/utils/` or `/src/components/`, never duplicated across tools.
- Use existing shared components before creating new ones — check `/src/components/` first.
- All file processing (PDF, image, etc.) must use client-side libraries only. See existing tools for patterns.

## Gotchas
- **pdf.js worker setup is duplicated.** `pdfjsLib.GlobalWorkerOptions.workerSrc` is configured in `pdf.ts`, `compression.ts`, and `conversion.ts`. Each wraps it in a try/catch since the worker may already be set by whichever module loads first. If you add a new file that uses pdfjs-dist, copy the same pattern.
- **pdf-lib standard fonts only support WinAnsi encoding.** Characters outside Latin-1 (e.g. CJK, emoji, Arabic) get replaced with `?` when rendering text to PDF via `StandardFonts.Courier`/`Helvetica`. Embedding custom fonts requires fetching font files, which conflicts with the single-file constraint.
