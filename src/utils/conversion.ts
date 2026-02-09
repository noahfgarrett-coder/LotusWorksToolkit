/**
 * Universal file conversion utilities.
 * Supports images, PDFs, spreadsheets, text/markdown/HTML, and DOCX — all client-side.
 */

import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import JSZip from 'jszip'
import { marked, type Token } from 'marked'
import { readFileAsDataURL } from '@/utils/fileReader.ts'
import { loadImage, resizeImage, canvasToBlob } from '@/utils/imageProcessing.ts'

// ── PDF.js worker setup (mirrors compression.ts) ──────────────────

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
} catch {
  // Worker may already be configured via pdf.ts
}

// ── Types ──────────────────────────────────────────────────────────

export type FileCategory = 'image' | 'pdf' | 'spreadsheet' | 'text' | 'document'

export interface OutputFormat {
  ext: string
  label: string
  mime: string
}

export interface ConversionResult {
  blob: Blob
  name: string
}

export interface ConversionOptions {
  /** JPEG output quality (0–1). Default 0.92 */
  jpegQuality?: number
  /** PDF→image render scale multiplier. Default 2.0 */
  pdfScale?: number
}

// ── Output format constants ────────────────────────────────────────

const PNG: OutputFormat = { ext: 'png', label: 'PNG', mime: 'image/png' }
const JPEG: OutputFormat = { ext: 'jpg', label: 'JPEG', mime: 'image/jpeg' }
const WEBP: OutputFormat = { ext: 'webp', label: 'WebP', mime: 'image/webp' }
const PDF: OutputFormat = { ext: 'pdf', label: 'PDF', mime: 'application/pdf' }
const TXT: OutputFormat = { ext: 'txt', label: 'TXT', mime: 'text/plain' }
const HTML: OutputFormat = { ext: 'html', label: 'HTML', mime: 'text/html' }
const MD: OutputFormat = { ext: 'md', label: 'Markdown', mime: 'text/markdown' }
const DOCX: OutputFormat = { ext: 'docx', label: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
const CSV: OutputFormat = { ext: 'csv', label: 'CSV', mime: 'text/csv' }
const XLSX_FMT: OutputFormat = { ext: 'xlsx', label: 'XLSX', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
const JSON_FMT: OutputFormat = { ext: 'json', label: 'JSON', mime: 'application/json' }
const TSV: OutputFormat = { ext: 'tsv', label: 'TSV', mime: 'text/tab-separated-values' }

// ── Format registry ────────────────────────────────────────────────

interface RegistryEntry {
  category: FileCategory
  outputs: OutputFormat[]
}

const FORMAT_REGISTRY: Record<string, RegistryEntry> = {
  // Images
  png:  { category: 'image', outputs: [JPEG, WEBP, PDF] },
  jpg:  { category: 'image', outputs: [PNG, WEBP, PDF] },
  jpeg: { category: 'image', outputs: [PNG, WEBP, PDF] },
  webp: { category: 'image', outputs: [PNG, JPEG, PDF] },
  gif:  { category: 'image', outputs: [PNG, JPEG, WEBP, PDF] },
  bmp:  { category: 'image', outputs: [PNG, JPEG, WEBP, PDF] },
  svg:  { category: 'image', outputs: [PNG, JPEG, WEBP, PDF] },
  // PDF
  pdf:  { category: 'pdf', outputs: [PNG, JPEG, TXT] },
  // Spreadsheet / data
  csv:  { category: 'spreadsheet', outputs: [XLSX_FMT, JSON_FMT, TSV] },
  xlsx: { category: 'spreadsheet', outputs: [CSV, JSON_FMT, TSV] },
  xls:  { category: 'spreadsheet', outputs: [CSV, JSON_FMT, TSV] },
  tsv:  { category: 'spreadsheet', outputs: [CSV, XLSX_FMT, JSON_FMT] },
  json: { category: 'spreadsheet', outputs: [CSV, XLSX_FMT, TSV] },
  // Text / markup
  txt:  { category: 'text', outputs: [PDF, HTML, DOCX] },
  md:   { category: 'text', outputs: [PDF, HTML, DOCX] },
  html: { category: 'text', outputs: [PDF, TXT, MD] },
  htm:  { category: 'text', outputs: [PDF, TXT, MD] },
  // Document
  docx: { category: 'document', outputs: [TXT, PDF, HTML] },
}

// ── Detection functions ────────────────────────────────────────────

function getFileExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

export function getFileCategory(file: File): FileCategory | null {
  const ext = getFileExtension(file)
  return FORMAT_REGISTRY[ext]?.category ?? null
}

export function getOutputFormats(file: File): OutputFormat[] {
  const ext = getFileExtension(file)
  return FORMAT_REGISTRY[ext]?.outputs ?? []
}

// ── Main dispatch ──────────────────────────────────────────────────

export async function convertFile(
  file: File,
  output: OutputFormat,
  options: ConversionOptions = {},
): Promise<ConversionResult | ConversionResult[]> {
  const ext = getFileExtension(file)
  const category = FORMAT_REGISTRY[ext]?.category
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const quality = options.jpegQuality ?? 0.92

  if (category === 'image') {
    if (ext === 'svg') {
      return output.ext === 'pdf'
        ? convertSvgToPdf(file, baseName)
        : convertSvgToImage(file, output, quality, baseName)
    }
    return output.ext === 'pdf'
      ? convertImageToPdf(file, baseName)
      : convertImageToImage(file, output, quality, baseName)
  }

  if (category === 'pdf') {
    if (output.ext === 'txt') return convertPdfToText(file, baseName)
    if (output.ext === 'png' || output.ext === 'jpg') {
      return convertPdfToImages(file, output.ext === 'png' ? 'png' : 'jpeg', options.pdfScale ?? 2.0, baseName)
    }
  }

  if (category === 'spreadsheet') {
    return convertSpreadsheet(file, ext, output, baseName)
  }

  if (category === 'text') {
    return convertText(file, ext, output, baseName)
  }

  if (category === 'document') {
    return convertDocument(file, ext, output, baseName)
  }

  throw new Error(`Unsupported conversion: ${ext} → ${output.ext}`)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMAGE CONVERTERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function convertImageToImage(
  file: File, output: OutputFormat, quality: number, baseName: string,
): Promise<ConversionResult> {
  const dataUrl = await readFileAsDataURL(file)
  const img = await loadImage(dataUrl)
  const canvas = resizeImage(img, img.naturalWidth, img.naturalHeight)
  const blob = await canvasToBlob(canvas, output.mime, quality)
  canvas.width = 0
  return { blob, name: `${baseName}.${output.ext}` }
}

async function convertImageToPdf(file: File, baseName: string): Promise<ConversionResult> {
  const dataUrl = await readFileAsDataURL(file)
  const img = await loadImage(dataUrl)
  const pdfDoc = await PDFDocument.create()
  const arrayBuffer = await file.arrayBuffer()

  let embeddedImage
  if (file.type === 'image/png') {
    embeddedImage = await pdfDoc.embedPng(arrayBuffer)
  } else if (file.type === 'image/jpeg') {
    embeddedImage = await pdfDoc.embedJpg(arrayBuffer)
  } else {
    // Convert to PNG first for unsupported formats
    const canvas = resizeImage(img, img.naturalWidth, img.naturalHeight)
    const pngBlob = await canvasToBlob(canvas, 'image/png', 1)
    canvas.width = 0
    const pngBuffer = await pngBlob.arrayBuffer()
    embeddedImage = await pdfDoc.embedPng(pngBuffer)
  }

  const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height])
  page.drawImage(embeddedImage, {
    x: 0, y: 0,
    width: embeddedImage.width,
    height: embeddedImage.height,
  })

  const pdfBytes = await pdfDoc.save()
  return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), name: `${baseName}.pdf` }
}

async function convertSvgToImage(
  file: File, output: OutputFormat, quality: number, baseName: string,
): Promise<ConversionResult> {
  const svgText = await file.text()
  const { width, height } = parseSvgDimensions(svgText)

  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const img = await loadImage(url)
    const canvas = resizeImage(img, width, height)
    const blob = await canvasToBlob(canvas, output.mime, quality)
    canvas.width = 0
    return { blob, name: `${baseName}.${output.ext}` }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function convertSvgToPdf(file: File, baseName: string): Promise<ConversionResult> {
  const svgText = await file.text()
  const { width, height } = parseSvgDimensions(svgText)

  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const img = await loadImage(url)
    const canvas = resizeImage(img, width, height)
    const pngBlob = await canvasToBlob(canvas, 'image/png', 1)
    canvas.width = 0
    const pngBuffer = await pngBlob.arrayBuffer()

    const pdfDoc = await PDFDocument.create()
    const embeddedImage = await pdfDoc.embedPng(pngBuffer)
    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height])
    page.drawImage(embeddedImage, {
      x: 0, y: 0, width: embeddedImage.width, height: embeddedImage.height,
    })
    const pdfBytes = await pdfDoc.save()
    return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), name: `${baseName}.pdf` }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function parseSvgDimensions(svgText: string): { width: number; height: number } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(svgText, 'image/svg+xml')
  const svg = doc.documentElement
  let w = parseFloat(svg.getAttribute('width') || '0')
  let h = parseFloat(svg.getAttribute('height') || '0')
  if (!w || !h) {
    const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
    if (vb && vb.length === 4) { w = vb[2]; h = vb[3] }
  }
  if (!w || !h) { w = 1024; h = 1024 }
  return { width: Math.round(w), height: Math.round(h) }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PDF CONVERTERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function convertPdfToImages(
  file: File, format: 'png' | 'jpeg', scale: number, baseName: string,
): Promise<ConversionResult | ConversionResult[]> {
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)
  const doc = await pdfjsLib.getDocument({ data: data.slice() }).promise

  try {
    const numPages = doc.numPages
    if (numPages === 0) throw new Error('PDF has no pages')
    const results: ConversionResult[] = []
    const mime = format === 'png' ? 'image/png' : 'image/jpeg'
    const ext = format === 'png' ? 'png' : 'jpg'
    const quality = format === 'jpeg' ? 0.92 : 1

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i)
      const baseViewport = page.getViewport({ scale: 1.0 })

      // Clamp scale to prevent canvas memory overflow (max ~16k pixels)
      const maxDim = 16000
      const clampedScale = Math.min(
        scale,
        maxDim / baseViewport.width,
        maxDim / baseViewport.height,
      )
      const viewport = page.getViewport({ scale: clampedScale })

      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Failed to create canvas context')

      await page.render({ canvasContext: ctx, viewport }).promise
      page.cleanup()

      const blob = await canvasToBlob(canvas, mime, quality)
      canvas.width = 0

      const pad = String(numPages).length
      const num = String(i).padStart(pad, '0')
      const name = numPages === 1
        ? `${baseName}.${ext}`
        : `${baseName}_page${num}.${ext}`
      results.push({ blob, name })
    }

    return results.length === 1 ? results[0] : results
  } finally {
    doc.destroy()
  }
}

async function convertPdfToText(file: File, baseName: string): Promise<ConversionResult> {
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)
  const doc = await pdfjsLib.getDocument({ data: data.slice() }).promise

  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const text = content.items
        .filter((item) => 'str' in item)
        .map((item) => (item as { str: string }).str)
        .join(' ')
      pages.push(text)
      page.cleanup()
    }
    const fullText = pages.join('\n\n--- Page Break ---\n\n')
    return {
      blob: new Blob([fullText], { type: 'text/plain' }),
      name: `${baseName}.txt`,
    }
  } finally {
    doc.destroy()
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SPREADSHEET / DATA CONVERTERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function convertSpreadsheet(
  file: File, inputExt: string, output: OutputFormat, baseName: string,
): Promise<ConversionResult> {
  // Parse input into headers + rows
  const { headers, rows } = await parseSpreadsheetInput(file, inputExt)

  if (headers.length === 0) throw new Error('No data found in file')

  // Serialize to output format
  switch (output.ext) {
    case 'csv':
      return { blob: new Blob([serializeDelimited(headers, rows, ',')], { type: 'text/csv' }), name: `${baseName}.csv` }
    case 'tsv':
      return { blob: new Blob([serializeDelimited(headers, rows, '\t')], { type: 'text/tab-separated-values' }), name: `${baseName}.tsv` }
    case 'json': {
      const objects = rows.map((row) => {
        const obj: Record<string, string | number> = {}
        headers.forEach((h, i) => {
          const val = row[i] ?? ''
          const num = Number(val)
          obj[h] = val !== '' && !isNaN(num) ? num : val
        })
        return obj
      })
      return {
        blob: new Blob([JSON.stringify(objects, null, 2)], { type: 'application/json' }),
        name: `${baseName}.json`,
      }
    }
    case 'xlsx':
      return createXlsxResult(headers, rows, baseName)
    default:
      throw new Error(`Unsupported spreadsheet output: ${output.ext}`)
  }
}

async function parseSpreadsheetInput(
  file: File, ext: string,
): Promise<{ headers: string[]; rows: string[][] }> {
  if (ext === 'json') {
    const text = await file.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('Invalid JSON — file could not be parsed')
    }
    if (!Array.isArray(data)) throw new Error('JSON must be an array of objects for spreadsheet conversion')
    if (data.length === 0) throw new Error('JSON array is empty')
    if (typeof data[0] !== 'object' || data[0] === null) throw new Error('JSON array items must be objects')
    return jsonArrayToRows(data as Record<string, unknown>[])
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    if (!sheet) throw new Error('No sheets found in workbook')
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    if (rawRows.length === 0) return { headers: [], rows: [] }
    const headers = rawRows[0].map(String)
    const rows = rawRows.slice(1).map((r) => r.map((c) => String(c ?? '')))
    return { headers, rows }
  }

  // CSV or TSV — detect delimiter
  const text = await file.text()
  const delimiter = ext === 'tsv' ? '\t' : ','
  const wb = XLSX.read(text, { type: 'string', FS: delimiter })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('Failed to parse delimited data')
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  if (rawRows.length === 0) return { headers: [], rows: [] }
  const headers = rawRows[0].map(String)
  const rows = rawRows.slice(1).map((r) => r.map((c) => String(c ?? '')))
  return { headers, rows }
}

function jsonArrayToRows(data: Record<string, unknown>[]): { headers: string[]; rows: string[][] } {
  const keySet = new Set<string>()
  for (const obj of data) {
    for (const key of Object.keys(obj)) keySet.add(key)
  }
  const headers = Array.from(keySet)
  const rows = data.map((obj) => headers.map((h) => {
    const val = obj[h]
    if (val === null || val === undefined) return ''
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  }))
  return { headers, rows }
}

function serializeDelimited(headers: string[], rows: string[][], delimiter: string): string {
  const escape = (val: string) => {
    // Guard against CSV formula injection — prefix trigger chars with a single quote
    const needsFormulaGuard = /^[=+\-@\t\r]/.test(val)
    const safeVal = needsFormulaGuard ? `'${val}` : val
    if (safeVal.includes(delimiter) || safeVal.includes('"') || safeVal.includes('\n')) {
      return `"${safeVal.replace(/"/g, '""')}"`
    }
    return safeVal
  }
  const lines = [headers.map(escape).join(delimiter)]
  for (const row of rows) {
    lines.push(row.map(escape).join(delimiter))
  }
  return lines.join('\n')
}

async function createXlsxResult(
  headers: string[], rows: string[][], baseName: string,
): Promise<ConversionResult> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Sheet1')

  // Header row with bold styling
  sheet.addRow(headers)
  sheet.getRow(1).font = { bold: true }

  // Data rows — try numeric conversion
  for (const row of rows) {
    sheet.addRow(row.map((cell) => {
      const num = Number(cell)
      return cell.trim() !== '' && !isNaN(num) ? num : cell
    }))
  }

  // Auto-fit column widths (approximate)
  for (let i = 0; i < headers.length; i++) {
    let maxLen = headers[i]?.length ?? 10
    for (const row of rows) {
      maxLen = Math.max(maxLen, (row[i]?.length ?? 0))
    }
    const col = sheet.getColumn(i + 1)
    col.width = Math.min(maxLen + 2, 50)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return {
    blob: new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    name: `${baseName}.xlsx`,
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEXT / MARKDOWN / HTML CONVERTERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function convertText(
  file: File, inputExt: string, output: OutputFormat, baseName: string,
): Promise<ConversionResult> {
  switch (inputExt) {
    case 'txt':
      if (output.ext === 'pdf') return convertTextToPdf(file, baseName)
      if (output.ext === 'html') return convertTextToHtml(file, baseName)
      if (output.ext === 'docx') return convertTextToDocx(file, baseName)
      break
    case 'md':
      if (output.ext === 'pdf') return convertMdToPdf(file, baseName)
      if (output.ext === 'html') return convertMdToHtml(file, baseName)
      if (output.ext === 'docx') return convertMdToDocx(file, baseName)
      break
    case 'html': case 'htm':
      if (output.ext === 'pdf') return convertHtmlToPdf(file, baseName)
      if (output.ext === 'txt') return convertHtmlToText(file, baseName)
      if (output.ext === 'md') return convertHtmlToMd(file, baseName)
      break
  }
  throw new Error(`Unsupported text conversion: ${inputExt} → ${output.ext}`)
}

// ── TXT converters ──────────────────────────────────────────────

async function convertTextToPdf(file: File, baseName: string): Promise<ConversionResult> {
  const text = await file.text()
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Courier)

  const fontSize = 10
  const lineHeight = fontSize * 1.4
  const margin = 50
  const pageWidth = 595
  const pageHeight = 842
  const usableWidth = pageWidth - margin * 2
  const usableHeight = pageHeight - margin * 2
  const linesPerPage = Math.floor(usableHeight / lineHeight)

  // Word-wrap lines
  const charWidth = font.widthOfTextAtSize('M', fontSize)
  const maxChars = Math.floor(usableWidth / charWidth)
  const wrappedLines = wrapTextLines(text, maxChars)

  for (let i = 0; i < wrappedLines.length; i += linesPerPage) {
    const pageLines = wrappedLines.slice(i, i + linesPerPage)
    const page = pdfDoc.addPage([pageWidth, pageHeight])
    let y = pageHeight - margin
    for (const line of pageLines) {
      // pdf-lib standard fonts only support WinAnsi; replace unsupported chars
      const safeLine = line.replace(/[^\x00-\xFF]/g, '?')
      page.drawText(safeLine, { x: margin, y, size: fontSize, font })
      y -= lineHeight
    }
  }

  const pdfBytes = await pdfDoc.save()
  return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), name: `${baseName}.pdf` }
}

async function convertTextToHtml(file: File, baseName: string): Promise<ConversionResult> {
  const text = await file.text()
  const escaped = escapeHtml(text)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(baseName)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
  pre { white-space: pre-wrap; word-wrap: break-word; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 14px; background: #f5f5f5; padding: 20px; border-radius: 8px; }
</style>
</head>
<body>
<pre>${escaped}</pre>
</body>
</html>`
  return { blob: new Blob([html], { type: 'text/html' }), name: `${baseName}.html` }
}

async function convertTextToDocx(file: File, baseName: string): Promise<ConversionResult> {
  const text = await file.text()
  const paragraphs = text.split('\n').map(
    (line) => new Paragraph({ children: [new TextRun(line)] }),
  )
  const doc = new Document({ sections: [{ children: paragraphs }] })
  const blob = await Packer.toBlob(doc)
  return { blob, name: `${baseName}.docx` }
}

// ── Markdown converters ─────────────────────────────────────────

async function convertMdToHtml(file: File, baseName: string): Promise<ConversionResult> {
  const text = await file.text()
  const body = await marked(text)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(baseName)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
  h1,h2,h3,h4,h5,h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
  pre { background: #f5f5f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
  code { font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.9em; }
  p code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; }
  blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 16px; color: #555; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  img { max-width: 100%; }
</style>
</head>
<body>
${body}
</body>
</html>`
  return { blob: new Blob([html], { type: 'text/html' }), name: `${baseName}.html` }
}

async function convertMdToPdf(file: File, baseName: string): Promise<ConversionResult> {
  const text = await file.text()
  const body = await marked(text)
  return renderHtmlStringToPdf(body, baseName)
}

async function convertMdToDocx(file: File, baseName: string): Promise<ConversionResult> {
  const text = await file.text()
  const tokens = marked.lexer(text)
  const children: Paragraph[] = []

  for (const token of tokens) {
    if (token.type === 'heading') {
      const levels = [
        HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
      ]
      children.push(new Paragraph({
        heading: levels[token.depth - 1] ?? HeadingLevel.HEADING_6,
        children: [new TextRun({ text: token.text, bold: true })],
      }))
    } else if (token.type === 'paragraph') {
      const runs = parseInlineTokens(token.tokens ?? [])
      children.push(new Paragraph({ children: runs }))
    } else if (token.type === 'list') {
      for (const item of token.items) {
        children.push(new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun(item.text)],
        }))
      }
    } else if (token.type === 'code') {
      for (const line of token.text.split('\n')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line, font: 'Courier New', size: 20 })],
        }))
      }
    } else if (token.type === 'blockquote') {
      const bqText = 'text' in token ? String(token.text) : ''
      children.push(new Paragraph({
        indent: { left: 720 },
        children: [new TextRun({ text: bqText, italics: true })],
      }))
    } else if (token.type === 'space') {
      children.push(new Paragraph({}))
    }
  }

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  return { blob, name: `${baseName}.docx` }
}

function parseInlineTokens(tokens: Token[]): TextRun[] {
  const runs: TextRun[] = []
  for (const t of tokens) {
    if (t.type === 'text') {
      runs.push(new TextRun(t.text))
    } else if (t.type === 'strong') {
      runs.push(new TextRun({ text: t.text, bold: true }))
    } else if (t.type === 'em') {
      runs.push(new TextRun({ text: t.text, italics: true }))
    } else if (t.type === 'codespan') {
      runs.push(new TextRun({ text: t.text, font: 'Courier New' }))
    } else if (t.type === 'link') {
      runs.push(new TextRun({ text: t.text }))
    }
  }
  if (runs.length === 0) runs.push(new TextRun(''))
  return runs
}

// ── HTML converters ─────────────────────────────────────────────

async function convertHtmlToPdf(file: File, baseName: string): Promise<ConversionResult> {
  const html = await file.text()
  // Extract body content if full document, otherwise use raw
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const content = bodyMatch ? bodyMatch[1] : html
  return renderHtmlStringToPdf(sanitizeHtml(content), baseName)
}

async function convertHtmlToText(file: File, baseName: string): Promise<ConversionResult> {
  const html = await file.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const text = doc.body.textContent ?? ''
  return { blob: new Blob([text.trim()], { type: 'text/plain' }), name: `${baseName}.txt` }
}

async function convertHtmlToMd(file: File, baseName: string): Promise<ConversionResult> {
  const html = await file.text()
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    const childText = Array.from(el.childNodes).map(walk).join('')

    switch (tag) {
      case 'h1': return `# ${childText.trim()}\n\n`
      case 'h2': return `## ${childText.trim()}\n\n`
      case 'h3': return `### ${childText.trim()}\n\n`
      case 'h4': return `#### ${childText.trim()}\n\n`
      case 'h5': return `##### ${childText.trim()}\n\n`
      case 'h6': return `###### ${childText.trim()}\n\n`
      case 'p': return `${childText.trim()}\n\n`
      case 'br': return '\n'
      case 'strong': case 'b': return `**${childText}**`
      case 'em': case 'i': return `*${childText}*`
      case 'code': return `\`${childText}\``
      case 'pre': return `\`\`\`\n${childText.trim()}\n\`\`\`\n\n`
      case 'a': return `[${childText}](${el.getAttribute('href') ?? ''})`
      case 'ul': case 'ol': return childText
      case 'li': {
        const parent = el.parentElement?.tagName.toLowerCase()
        const prefix = parent === 'ol'
          ? `${Array.from(el.parentElement!.children).indexOf(el) + 1}. `
          : '- '
        return `${prefix}${childText.trim()}\n`
      }
      case 'blockquote':
        return childText.split('\n').filter(Boolean).map((l) => `> ${l}`).join('\n') + '\n\n'
      case 'hr': return '---\n\n'
      case 'img': return `![${el.getAttribute('alt') ?? ''}](${el.getAttribute('src') ?? ''})`
      default: return childText
    }
  }

  const md = walk(doc.body).replace(/\n{3,}/g, '\n\n').trim()
  return { blob: new Blob([md], { type: 'text/markdown' }), name: `${baseName}.md` }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DOCX CONVERTERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function convertDocument(
  file: File, _inputExt: string, output: OutputFormat, baseName: string,
): Promise<ConversionResult> {
  if (output.ext === 'txt') return convertDocxToText(file, baseName)
  if (output.ext === 'pdf') return convertDocxToPdf(file, baseName)
  if (output.ext === 'html') return convertDocxToHtml(file, baseName)
  throw new Error(`Unsupported document conversion: docx → ${output.ext}`)
}

interface DocxParagraph {
  text: string
  style?: string
  bold: boolean
  italic: boolean
}

async function extractDocxContent(file: File): Promise<DocxParagraph[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const docXml = await zip.file('word/document.xml')?.async('string')
  if (!docXml) throw new Error('Invalid DOCX: missing document.xml')

  const parser = new DOMParser()
  const doc = parser.parseFromString(docXml, 'application/xml')
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const paragraphs: DocxParagraph[] = []

  const pElements = doc.getElementsByTagNameNS(ns, 'p')
  for (let i = 0; i < pElements.length; i++) {
    const p = pElements[i]

    // Get paragraph style
    const pStyle = p.getElementsByTagNameNS(ns, 'pStyle')[0]
    const style = pStyle?.getAttributeNS(ns, 'val') ?? pStyle?.getAttribute('w:val') ?? undefined

    // Extract text runs
    let text = ''
    let hasBold = false
    let hasItalic = false
    const runs = p.getElementsByTagNameNS(ns, 'r')
    for (let j = 0; j < runs.length; j++) {
      const r = runs[j]
      const tEls = r.getElementsByTagNameNS(ns, 't')
      for (let k = 0; k < tEls.length; k++) {
        text += tEls[k].textContent ?? ''
      }
      if (r.getElementsByTagNameNS(ns, 'b').length > 0) hasBold = true
      if (r.getElementsByTagNameNS(ns, 'i').length > 0) hasItalic = true
    }

    paragraphs.push({ text, style, bold: hasBold, italic: hasItalic })
  }

  return paragraphs
}

async function convertDocxToText(file: File, baseName: string): Promise<ConversionResult> {
  const paragraphs = await extractDocxContent(file)
  const text = paragraphs.map((p) => p.text).join('\n')
  return { blob: new Blob([text], { type: 'text/plain' }), name: `${baseName}.txt` }
}

async function convertDocxToPdf(file: File, baseName: string): Promise<ConversionResult> {
  const paragraphs = await extractDocxContent(file)
  const text = paragraphs.map((p) => p.text).join('\n')

  // Reuse the text→PDF pipeline
  const fakeFile = new File([text], 'temp.txt', { type: 'text/plain' })
  return convertTextToPdf(fakeFile, baseName)
}

async function convertDocxToHtml(file: File, baseName: string): Promise<ConversionResult> {
  const paragraphs = await extractDocxContent(file)

  const bodyParts: string[] = []
  for (const p of paragraphs) {
    if (!p.text && !p.style) { bodyParts.push('<br>'); continue }

    // Detect heading from style name (e.g., "Heading1", "heading 2")
    const headingMatch = p.style?.match(/heading\s*(\d)/i)
    let content = escapeHtml(p.text)
    if (p.bold) content = `<strong>${content}</strong>`
    if (p.italic) content = `<em>${content}</em>`

    if (headingMatch) {
      const level = Math.min(Number(headingMatch[1]), 6)
      bodyParts.push(`<h${level}>${content}</h${level}>`)
    } else {
      bodyParts.push(`<p>${content}</p>`)
    }
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(baseName)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
</style>
</head>
<body>
${bodyParts.join('\n')}
</body>
</html>`
  return { blob: new Blob([html], { type: 'text/html' }), name: `${baseName}.html` }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapTextLines(text: string, maxChars: number): string[] {
  const result: string[] = []
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= maxChars) {
      result.push(rawLine)
      continue
    }
    // Word-wrap long lines
    const words = rawLine.split(' ')
    let current = ''
    for (const word of words) {
      if (current.length + word.length + 1 > maxChars && current.length > 0) {
        result.push(current)
        current = word
      } else {
        current = current ? `${current} ${word}` : word
      }
    }
    if (current) result.push(current)
  }
  return result
}

function sanitizeHtml(html: string): string {
  // Strip dangerous tags (including self-closing and unclosed variants)
  let safe = html
  safe = safe.replace(/<script[\s\S]*?(<\/script>|$)/gi, '')
  safe = safe.replace(/<iframe[\s\S]*?(<\/iframe>|$)/gi, '')
  safe = safe.replace(/<object[\s\S]*?(<\/object>|$)/gi, '')
  safe = safe.replace(/<embed[^>]*\/?>/gi, '')
  // Strip event handlers (quoted and unquoted)
  safe = safe.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
  safe = safe.replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
  safe = safe.replace(/\s+on\w+\s*=\s*[^\s>"']+/gi, '')
  // Strip javascript: protocol in href/src/action attributes
  safe = safe.replace(/(href|src|action)\s*=\s*["']?\s*javascript:/gi, '$1="')
  return safe
}

async function renderHtmlStringToPdf(htmlContent: string, baseName: string): Promise<ConversionResult> {
  // Create off-screen container for rendering
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed; left: -9999px; top: 0;
    width: 800px; padding: 40px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px; line-height: 1.6; color: #1a1a1a;
    background: white;
  `
  container.innerHTML = sanitizeHtml(htmlContent)
  document.body.appendChild(container)

  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    })

    const imgBlob = await canvasToBlob(canvas, 'image/png', 1)
    const imgBytes = new Uint8Array(await imgBlob.arrayBuffer())
    canvas.width = 0

    const pdfDoc = await PDFDocument.create()
    const img = await pdfDoc.embedPng(imgBytes)

    // A4 page dimensions
    const pageWidth = 595
    const maxPageHeight = 842
    const scale = pageWidth / img.width
    const totalHeight = img.height * scale
    const totalPages = Math.max(1, Math.ceil(totalHeight / maxPageHeight))

    for (let i = 0; i < totalPages; i++) {
      const thisPageHeight = Math.min(maxPageHeight, totalHeight - i * maxPageHeight)
      const page = pdfDoc.addPage([pageWidth, thisPageHeight])
      page.drawImage(img, {
        x: 0,
        y: thisPageHeight - totalHeight + i * maxPageHeight,
        width: pageWidth,
        height: totalHeight,
      })
    }

    const pdfBytes = await pdfDoc.save()
    return {
      blob: new Blob([pdfBytes], { type: 'application/pdf' }),
      name: `${baseName}.pdf`,
    }
  } finally {
    document.body.removeChild(container)
  }
}
