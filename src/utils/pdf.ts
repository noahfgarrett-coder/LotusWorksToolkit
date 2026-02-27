/**
 * Browser-adapted PDF utilities for LotusWorks Toolkit.
 * Uses pdfjs-dist for rendering and pdf-lib for manipulation.
 * No Electron/filesystem dependencies - works entirely with File objects and Uint8Arrays.
 */

import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFFile, PDFPage, PageRangeValidation } from '@/types'

// Centralized PDF.js worker setup (side-effect import)
import '@/utils/pdfWorkerSetup.ts'

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
async function getCachedDoc(fileId: string, file: File): Promise<pdfjsLib.PDFDocumentProxy> {
  const cached = docCache.get(fileId)
  if (cached) {
    cached.lastAccess = Date.now()
    return cached.doc
  }

  // Cache miss — read bytes from disk, parse, cache, let bytes GC
  evictOldest()
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  docCache.set(fileId, { doc, lastAccess: Date.now() })
  return doc
}

export function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Read raw bytes from a PDFFile's underlying File object.
 * Each call reads from disk — the returned Uint8Array is ephemeral.
 * Callers should let it GC after use (do not store in state).
 */
export async function getPDFBytes(pdfFile: PDFFile): Promise<Uint8Array> {
  const buffer = await pdfFile.file.arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Load a PDF file from a browser File object.
 * Returns metadata and a reference to the File (bytes are NOT retained in memory).
 */
export async function loadPDFFile(file: File): Promise<PDFFile> {
  if (file.size === 0) {
    throw new Error('File is empty')
  }

  // Read bytes once for initial pdfjs parse, then let them GC.
  // pdfjs copies data to its worker internally.
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)

  const doc = await pdfjsLib.getDocument({ data }).promise
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
    file,
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
  const doc = await getCachedDoc(pdfFile.id, pdfFile.file)

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
  const doc = await getCachedDoc(pdfFile.id, pdfFile.file)
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
  files: { file: File; pages?: number[] }[],
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create()
  const total = files.length

  for (let i = 0; i < files.length; i++) {
    const { file, pages } = files[i]
    // Read bytes on demand — each file's buffer is GC-eligible after this iteration
    const buffer = await file.arrayBuffer()
    const sourcePdf = await PDFDocument.load(new Uint8Array(buffer))

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
  entries: { file: File; pageNumber: number }[],
  onProgress?: (current: number, total: number) => void,
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create()
  // Cache loaded PDFs by File reference to avoid re-parsing
  const pdfCache = new Map<File, PDFDocument>()

  for (let i = 0; i < entries.length; i++) {
    const { file, pageNumber } = entries[i]

    if (!pdfCache.has(file)) {
      const buffer = await file.arrayBuffer()
      pdfCache.set(file, await PDFDocument.load(new Uint8Array(buffer)))
    }

    const sourcePdf = pdfCache.get(file)!
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
  file: File,
  pageNumbers: number[],
): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  const sourcePdf = await PDFDocument.load(new Uint8Array(buffer))
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
  file: File,
  baseName: string,
  splits: { pages: number[]; name?: string }[],
  onProgress?: (current: number, total: number) => void,
): Promise<{ name: string; data: Uint8Array }[]> {
  const buffer = await file.arrayBuffer()
  const sourcePdf = await PDFDocument.load(new Uint8Array(buffer))
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
  file: File,
  baseName: string,
  onProgress?: (current: number, total: number) => void,
): Promise<{ name: string; data: Uint8Array }[]> {
  const buffer = await file.arrayBuffer()
  const sourcePdf = await PDFDocument.load(new Uint8Array(buffer))
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
  const doc = await getCachedDoc(pdfFile.id, pdfFile.file)
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

/**
 * Extract positioned text items from a page (with coordinates for table/layout extraction).
 */
export async function extractPositionedText(
  pdfFile: PDFFile,
  pageNumber: number,
  rotation: number = 0,
): Promise<{
  items: { text: string; x: number; y: number; width: number; height: number; page: number }[]
  viewport: { width: number; height: number }
}> {
  const doc = await getCachedDoc(pdfFile.id, pdfFile.file)
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1, rotation })
  const content = await page.getTextContent()
  const items: { text: string; x: number; y: number; width: number; height: number; page: number }[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    items.push({
      text: item.str,
      x: item.transform[4],
      y: viewport.height - item.transform[5],
      width: item.width ?? 0,
      height: Math.abs(item.transform[0]) || 12,
      page: pageNumber,
    })
  }
  return { items, viewport: { width: viewport.width, height: viewport.height } }
}

// ============================================
// Line / Rule Extraction (for table grid detection)
// ============================================

export interface PageLine {
  x1: number; y1: number
  x2: number; y2: number
}

/**
 * Extract horizontal and vertical line segments drawn on a PDF page.
 * Uses the page's operator list to find stroke paths (table rules, borders).
 * Coordinates are in doc-space (top-down Y, same as extractPositionedText).
 */
export async function extractPageLines(
  pdfFile: PDFFile,
  pageNumber: number,
): Promise<{ horizontal: PageLine[]; vertical: PageLine[] }> {
  const doc = await getCachedDoc(pdfFile.id, pdfFile.file)
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 1 })
  const ops = await page.getOperatorList()

  const rawLines: { x1: number; y1: number; x2: number; y2: number }[] = []

  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] === pdfjsLib.OPS.constructPath) {
      const subOps = ops.argsArray[i][0] as number[]
      const args = ops.argsArray[i][1] as number[]

      let argIdx = 0
      let curX = 0, curY = 0
      let startX = 0, startY = 0

      for (const op of subOps) {
        if (op === pdfjsLib.OPS.moveTo) {
          curX = args[argIdx++]; curY = args[argIdx++]
          startX = curX; startY = curY
        } else if (op === pdfjsLib.OPS.lineTo) {
          const x = args[argIdx++]; const y = args[argIdx++]
          rawLines.push({
            x1: curX, y1: viewport.height - curY,
            x2: x, y2: viewport.height - y,
          })
          curX = x; curY = y
        } else if (op === pdfjsLib.OPS.rectangle) {
          const rx = args[argIdx++]; const ry = args[argIdx++]
          const rw = args[argIdx++]; const rh = args[argIdx++]
          const top = viewport.height - (ry + rh)
          const bot = viewport.height - ry
          // 4 edges of the rectangle
          rawLines.push(
            { x1: rx, y1: top, x2: rx + rw, y2: top },         // top
            { x1: rx, y1: bot, x2: rx + rw, y2: bot },         // bottom
            { x1: rx, y1: top, x2: rx, y2: bot },              // left
            { x1: rx + rw, y1: top, x2: rx + rw, y2: bot },   // right
          )
          curX = rx; curY = ry
        } else if (op === pdfjsLib.OPS.curveTo) {
          argIdx += 6
          curX = args[argIdx - 2]; curY = args[argIdx - 1]
        } else if (op === pdfjsLib.OPS.curveTo2 || op === pdfjsLib.OPS.curveTo3) {
          argIdx += 4
          curX = args[argIdx - 2]; curY = args[argIdx - 1]
        } else if (op === pdfjsLib.OPS.closePath) {
          if (curX !== startX || curY !== startY) {
            rawLines.push({
              x1: curX, y1: viewport.height - curY,
              x2: startX, y2: viewport.height - startY,
            })
            curX = startX; curY = startY
          }
        }
      }
    }
  }

  const tolerance = 2   // max deviation to classify as horizontal/vertical
  const minLength = 10  // minimum length to count as a table rule

  const horizontal: PageLine[] = []
  const vertical: PageLine[] = []

  for (const l of rawLines) {
    const dx = Math.abs(l.x2 - l.x1)
    const dy = Math.abs(l.y2 - l.y1)
    if (dy <= tolerance && dx >= minLength) {
      horizontal.push({ x1: Math.min(l.x1, l.x2), y1: (l.y1 + l.y2) / 2, x2: Math.max(l.x1, l.x2), y2: (l.y1 + l.y2) / 2 })
    } else if (dx <= tolerance && dy >= minLength) {
      vertical.push({ x1: (l.x1 + l.x2) / 2, y1: Math.min(l.y1, l.y2), x2: (l.x1 + l.x2) / 2, y2: Math.max(l.y1, l.y2) })
    }
  }

  return { horizontal, vertical }
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
