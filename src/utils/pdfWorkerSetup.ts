/**
 * Centralized PDF.js worker setup.
 * Import this module to ensure the worker is configured exactly once.
 */

import * as pdfjsLib from 'pdfjs-dist'

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
} catch {
  // Worker setup may fail in non-browser environments — safe to ignore
}
