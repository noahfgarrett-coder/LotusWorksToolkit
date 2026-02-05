/**
 * Browser-adapted PDF utilities for LotusWorks Toolkit.
 * Uses pdfjs-dist for rendering and pdf-lib for manipulation.
 * No Electron/filesystem dependencies - works entirely with File objects and Uint8Arrays.
 */

import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFFile, PDFPage, PageRangeValidation } from '@/types'

// Set up PDF.js worker
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
} catch (error) {
  console.error('[PDF] Failed to set up PDF.js worker:', error)
}

// Simple LRU cache for loaded PDF.js documents (max 10)
interface CachedDoc {
  doc: pdfjsLib.PDFDocumentProxy
  lastAccess: number
}

const docCache = new Map<string, CachedDoc>()
const MAX_CACHE_SIZE = 10

function evictOldest() {
  if (docCache.size <= MAX_CACHE_SIZE) return
  let oldestKey: string | null = null
  let oldestTime = Infinity
  for (const [key, val] of docCache) {
    if (val.lastAccess < oldestTime) {
      oldestTime = val.lastAccess
      oldestKey = key
    }
  }
  if (oldestKey) {
    const old = docCache.get(oldestKey)
    old?.doc.destroy()
    docCache.delete(oldestKey)
  }
}

/** Get or load a pdfjs document from cache */
async function getCachedDoc(fileId: string, data: Uint8Array): Promise<pdfjsLib.PDFDocumentProxy> {
  const cached = docCache.get(fileId)
  if (cached) {
    cached.lastAccess = Date.now()
    return cached.doc
  }

  evictOldest()
  const doc = await pdfjsLib.getDocument({ data: data.slice() }).promise
  docCache.set(fileId, { doc, lastAccess: Date.now() })
  return doc
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}

/**
 * Load a PDF file from a browser File object.
 * Returns metadata and the raw bytes.
 */
export async function loadPDFFile(file: File): Promise<PDFFile> {
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)

  if (data.length === 0) {
    throw new Error('File is empty')
  }

  const doc = await pdfjsLib.getDocument({ data: data.slice() }).promise
  const pageCount = doc.numPages

  if (pageCount === 0) {
    throw new Error('PDF has no pages')
  }

  const id = generateId()

  // Cache the document
  docCache.set(id, { doc, lastAccess: Date.now() })
  evictOldest()

  return {
    id,
    name: file.name,
    data,
    pageCount,
    size: file.size,
  }
}

/**
 * Generate a thumbnail for a specific page of a PDF.
 * Returns a data URL string.
 */
export async function generateThumbnail(
  pdfFile: PDFFile,
  pageNumber: number,
  targetHeight: number = 200,
): Promise<string> {
  const doc = await getCachedDoc(pdfFile.id, pdfFile.data)

  if (pageNumber < 1 || pageNumber > doc.numPages) {
    throw new Error(`Invalid page number ${pageNumber}`)
  }

  const page = await doc.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1.0 })
  const scale = Math.min(targetHeight / baseViewport.height, 0.5)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')

  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  await page.render({ canvasContext: ctx, viewport }).promise
  const dataUrl = canvas.toDataURL('image/png')

  page.cleanup()
  canvas.width = 0
  canvas.height = 0

  return dataUrl
}

/**
 * Generate thumbnails for all pages of a PDF.
 * Returns an array of PDFPage objects with thumbnails.
 */
export async function generateAllThumbnails(
  pdfFile: PDFFile,
  targetHeight: number = 200,
  onProgress?: (current: number, total: number) => void,
): Promise<PDFPage[]> {
  const pages: PDFPage[] = []

  for (let i = 1; i <= pdfFile.pageCount; i++) {
    const thumbnail = await generateThumbnail(pdfFile, i, targetHeight)
    pages.push({
      id: `${pdfFile.id}-p${i}`,
      fileId: pdfFile.id,
      fileName: pdfFile.name,
      pageNumber: i,
      thumbnail,
    })
    onProgress?.(i, pdfFile.pageCount)
  }

  return pages
}

/**
 * Render a PDF page to a canvas at a given scale.
 */
export async function renderPageToCanvas(
  pdfFile: PDFFile,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.5,
  rotation: number = 0,
): Promise<void> {
  const doc = await getCachedDoc(pdfFile.id, pdfFile.data)
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale, rotation })

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')

  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  await page.render({ canvasContext: ctx, viewport }).promise
  page.cleanup()
}

// ============================================
// Page Range Parsing
// ============================================

export function validatePageRange(rangeStr: string, maxPages: number): PageRangeValidation {
  const trimmed = rangeStr.trim()
  if (!trimmed) return { valid: true, pages: [] }

  if (!/^[\d,\-\s]+$/.test(trimmed)) {
    return { valid: false, error: 'Only numbers, commas, hyphens, and spaces allowed', pages: [] }
  }

  const pages: number[] = []
  const parts = trimmed.split(',')

  for (const part of parts) {
    const p = part.trim()
    if (!p) continue

    if (p.includes('-')) {
      const segments = p.split('-').filter((s) => s.trim() !== '')
      if (segments.length !== 2) {
        return { valid: false, error: `Invalid range: "${p}"`, pages: [] }
      }
      const start = parseInt(segments[0].trim(), 10)
      const end = parseInt(segments[1].trim(), 10)

      if (isNaN(start) || isNaN(end)) {
        return { valid: false, error: `Invalid numbers in range: "${p}"`, pages: [] }
      }
      if (start < 1 || end < 1) {
        return { valid: false, error: 'Pages start at 1', pages: [] }
      }
      if (start > maxPages || end > maxPages) {
        return { valid: false, error: `Page exceeds max (${maxPages})`, pages: [] }
      }

      if (start <= end) {
        for (let i = start; i <= end; i++) pages.push(i)
      } else {
        for (let i = start; i >= end; i--) pages.push(i)
      }
    } else {
      const page = parseInt(p, 10)
      if (isNaN(page)) {
        return { valid: false, error: `Invalid page number: "${p}"`, pages: [] }
      }
      if (page < 1) {
        return { valid: false, error: 'Pages start at 1', pages: [] }
      }
      if (page > maxPages) {
        return { valid: false, error: `Page ${page} exceeds max (${maxPages})`, pages: [] }
      }
      pages.push(page)
    }
  }

  return { valid: true, pages }
}

export function parsePageRange(rangeStr: string, maxPages: number): number[] {
  return validatePageRange(rangeStr, maxPages).pages
}

// ============================================
// Merge
// ============================================

/**
 * Merge multiple PDFs (or subsets of pages) into a single PDF.
 * Operates on raw Uint8Array data - no filesystem needed.
 */
export async function mergePDFs(
  files: { data: Uint8Array; pages?: number[] }[],
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create()
  const total = files.length

  for (let i = 0; i < files.length; i++) {
    const { data, pages } = files[i]
    const sourcePdf = await PDFDocument.load(data)

    const pagesToCopy = pages
      ? pages.map((p) => p - 1)
      : Array.from({ length: sourcePdf.getPageCount() }, (_, j) => j)

    const copiedPages = await mergedPdf.copyPages(sourcePdf, pagesToCopy)
    for (const page of copiedPages) {
      mergedPdf.addPage(page)
    }

    onProgress?.(i + 1, total)
  }

  return mergedPdf.save()
}

/**
 * Merge pages from multiple PDFs in a custom order.
 * Each entry specifies a source file and a single page number.
 */
export async function mergePDFPages(
  entries: { data: Uint8Array; pageNumber: number }[],
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create()
  // Cache loaded PDFs by data reference to avoid re-parsing
  const pdfCache = new Map<Uint8Array, PDFDocument>()

  for (let i = 0; i < entries.length; i++) {
    const { data, pageNumber } = entries[i]

    if (!pdfCache.has(data)) {
      pdfCache.set(data, await PDFDocument.load(data))
    }

    const sourcePdf = pdfCache.get(data)!
    const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [pageNumber - 1])
    mergedPdf.addPage(copiedPage)

    onProgress?.(i + 1, entries.length)
  }

  return mergedPdf.save()
}

// ============================================
// Split
// ============================================

/**
 * Extract specific pages from a PDF into a new PDF.
 * Returns the new PDF as Uint8Array.
 */
export async function extractPages(
  data: Uint8Array,
  pageNumbers: number[],
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(data)
  const newPdf = await PDFDocument.create()

  const indices = pageNumbers.map((p) => p - 1)
  const copiedPages = await newPdf.copyPages(sourcePdf, indices)

  for (const page of copiedPages) {
    newPdf.addPage(page)
  }

  return newPdf.save()
}

/**
 * Split a PDF into multiple files, each containing a subset of pages.
 * Returns an array of { name, data } objects.
 */
export async function splitPDF(
  data: Uint8Array,
  baseName: string,
  splits: { pages: number[]; name?: string }[],
  onProgress?: (current: number, total: number) => void,
): Promise<{ name: string; data: Uint8Array }[]> {
  const sourcePdf = await PDFDocument.load(data)
  const results: { name: string; data: Uint8Array }[] = []

  for (let i = 0; i < splits.length; i++) {
    const split = splits[i]
    const newPdf = await PDFDocument.create()
    const indices = split.pages.map((p) => p - 1)
    const copiedPages = await newPdf.copyPages(sourcePdf, indices)

    for (const page of copiedPages) {
      newPdf.addPage(page)
    }

    const pdfBytes = await newPdf.save()
    const name = split.name || `${baseName}_part${i + 1}.pdf`
    results.push({ name, data: pdfBytes })

    onProgress?.(i + 1, splits.length)
  }

  return results
}

/**
 * Split every page into its own PDF.
 */
export async function splitToSinglePages(
  data: Uint8Array,
  baseName: string,
  onProgress?: (current: number, total: number) => void,
): Promise<{ name: string; data: Uint8Array }[]> {
  const sourcePdf = await PDFDocument.load(data)
  const totalPages = sourcePdf.getPageCount()
  const results: { name: string; data: Uint8Array }[] = []
  const pad = String(totalPages).length

  for (let i = 0; i < totalPages; i++) {
    const newPdf = await PDFDocument.create()
    const [copiedPage] = await newPdf.copyPages(sourcePdf, [i])
    newPdf.addPage(copiedPage)

    const pdfBytes = await newPdf.save()
    const num = String(i + 1).padStart(pad, '0')
    results.push({ name: `${baseName}_page${num}.pdf`, data: pdfBytes })

    onProgress?.(i + 1, totalPages)
  }

  return results
}

// ============================================
// Text Extraction (embedded text via pdf.js)
// ============================================

/**
 * Extract embedded text from a specific page.
 */
export async function extractPageText(
  pdfFile: PDFFile,
  pageNumber: number,
): Promise<string> {
  const doc = await getCachedDoc(pdfFile.id, pdfFile.data)
  const page = await doc.getPage(pageNumber)
  const textContent = await page.getTextContent()

  let lastY: number | null = null
  let text = ''

  for (const item of textContent.items) {
    if ('str' in item) {
      const y = (item as { transform: number[] }).transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        text += '\n'
      }
      text += item.str
      lastY = y
    }
  }

  return text
}

/**
 * Extract text from all pages of a PDF.
 */
export async function extractAllText(
  pdfFile: PDFFile,
  onProgress?: (current: number, total: number) => void,
): Promise<string> {
  const parts: string[] = []

  for (let i = 1; i <= pdfFile.pageCount; i++) {
    const pageText = await extractPageText(pdfFile, i)
    if (pageText.trim()) {
      parts.push(`--- Page ${i} ---\n${pageText}`)
    }
    onProgress?.(i, pdfFile.pageCount)
  }

  return parts.join('\n\n')
}

/**
 * Check if a PDF has meaningful embedded text.
 * Returns true if average chars per page exceeds threshold.
 */
export async function hasEmbeddedText(
  pdfFile: PDFFile,
  samplePages: number = 3,
  minCharsPerPage: number = 50,
): Promise<boolean> {
  const pagesToCheck = Math.min(samplePages, pdfFile.pageCount)
  let totalChars = 0

  for (let i = 1; i <= pagesToCheck; i++) {
    const text = await extractPageText(pdfFile, i)
    totalChars += text.trim().length
  }

  return (totalChars / pagesToCheck) >= minCharsPerPage
}

// ============================================
// Cleanup
// ============================================

/**
 * Remove a specific PDF from the cache.
 */
export function removePDFFromCache(fileId: string): void {
  const cached = docCache.get(fileId)
  if (cached) {
    cached.doc.destroy()
    docCache.delete(fileId)
  }
}

/**
 * Clear all cached PDF documents.
 */
export function clearPDFCache(): void {
  for (const [, val] of docCache) {
    val.doc.destroy()
  }
  docCache.clear()
}
