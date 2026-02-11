import { useState, useCallback, useRef, useEffect } from 'react'
import Tesseract from 'tesseract.js'
import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType } from 'docx'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { ProgressBar } from '@/components/common/ProgressBar.tsx'
import { loadPDFFile, renderPageToCanvas, hasEmbeddedText, extractPositionedText, extractPageLines } from '@/utils/pdf.ts'
import type { PageLine } from '@/utils/pdf.ts'
import { downloadBlob, downloadText } from '@/utils/download.ts'
import type { PDFFile } from '@/types'
import {
  FileText, Copy, RotateCcw, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, Table2, AlignLeft,
  Crop, Globe, ChevronDown, Layers, X, Trash2,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────

interface PositionedText {
  text: string
  x: number
  y: number
  width: number
  height: number
  page: number
}

interface CropRegion {
  id: string
  x: number; y: number; width: number; height: number
  page: number
  label: string
}

interface TableData {
  headers: string[]
  rows: string[][]
}

type ExtractionMode = 'table' | 'document'

const LANGUAGES = [
  { id: 'eng', label: 'English' },
  { id: 'spa', label: 'Spanish' },
  { id: 'fra', label: 'French' },
  { id: 'deu', label: 'German' },
  { id: 'ita', label: 'Italian' },
  { id: 'por', label: 'Portuguese' },
  { id: 'jpn', label: 'Japanese' },
  { id: 'chi_sim', label: 'Chinese (Simplified)' },
  { id: 'kor', label: 'Korean' },
  { id: 'ara', label: 'Arabic' },
]

const RENDER_SCALE = 1.5

// ── Utility: generate unique ID ────────────────────

function genId(): string {
  return crypto.randomUUID()
}

// ── Region hit test ────────────────────────────────

function isInAnyRegion(item: PositionedText, regions: CropRegion[]): boolean {
  if (regions.length === 0) return true
  const cx = item.x + item.width / 2
  const cy = item.y + item.height / 2
  return regions.some(r =>
    r.page === item.page &&
    cx >= r.x && cx <= r.x + r.width &&
    cy >= r.y && cy <= r.y + r.height
  )
}

// ── OCR positioned text extraction ─────────────────

async function ocrPositionedText(
  pdfFile: PDFFile,
  pageNumber: number,
  language: string,
  canvas: HTMLCanvasElement,
  onProgress?: (p: number) => void
): Promise<PositionedText[]> {
  const renderScale = 2.0
  await renderPageToCanvas(pdfFile, pageNumber, canvas, renderScale)
  const result = await Tesseract.recognize(canvas, language, {
    logger: (m: { status: string; progress?: number }) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress ?? 0)
      }
    },
  })
  const data = result.data as unknown as {
    words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>
  }
  const words = data.words ?? []
  return words.map((w) => ({
    text: w.text,
    x: w.bbox.x0 / renderScale,
    y: w.bbox.y0 / renderScale,
    width: (w.bbox.x1 - w.bbox.x0) / renderScale,
    height: (w.bbox.y1 - w.bbox.y0) / renderScale,
    page: pageNumber,
  }))
}

// ── Table extraction algorithm ─────────────────────

// ── Cluster nearby numeric values ─────────────────

function clusterValues(values: number[], threshold: number): number[] {
  if (values.length === 0) return []
  const sorted = [...values].sort((a, b) => a - b)
  const clusters: number[][] = [[sorted[0]]]
  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1]
    if (sorted[i] - last[last.length - 1] <= threshold) {
      last.push(sorted[i])
    } else {
      clusters.push([sorted[i]])
    }
  }
  return clusters.map(c => c.reduce((s, v) => s + v, 0) / c.length)
}

// ── Cluster items into rows by Y ─────────────────

function clusterIntoRows(items: PositionedText[]): PositionedText[][] {
  if (items.length === 0) return []
  const avgH = items.reduce((s, i) => s + i.height, 0) / items.length
  const sorted = [...items].sort((a, b) => a.y - b.y)
  const rowThreshold = avgH * 0.6

  const rows: PositionedText[][] = []
  let curRow: PositionedText[] = [sorted[0]]
  let curY = sorted[0].y

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - curY) <= rowThreshold) {
      curRow.push(sorted[i])
    } else {
      rows.push(curRow.sort((a, b) => a.x - b.x))
      curRow = [sorted[i]]
      curY = sorted[i].y
    }
  }
  if (curRow.length > 0) rows.push(curRow.sort((a, b) => a.x - b.x))
  return rows
}

// ── Assign items to columns and produce table rows ─

function assignToGrid(
  rawRows: PositionedText[][],
  colBounds: number[],
): string[][] {
  const numCols = colBounds.length + 1

  function getCol(x: number): number {
    for (let c = 0; c < colBounds.length; c++) {
      if (x < colBounds[c]) return c
    }
    return colBounds.length
  }

  return rawRows.map(row => {
    const cells = Array(numCols).fill('')
    for (const item of row) {
      const col = getCol(item.x)
      cells[col] = cells[col] ? cells[col] + ' ' + item.text : item.text
    }
    return cells
  })
}

// ── Merge wrapped rows (e.g. "Q2" + "2024" in same cell) ──

function mergeWrappedRows(rows: string[][]): string[][] {
  if (rows.length < 2) return rows
  const numCols = rows[0].length

  const merged: string[][] = []
  let i = 0
  while (i < rows.length) {
    const base = [...rows[i]]
    // Look ahead at consecutive continuation rows
    let j = i + 1
    while (j < rows.length) {
      const candidate = rows[j]
      // Count how many cells are non-empty in candidate vs base
      let emptyInCandidate = 0
      let bothPopulated = 0
      for (let c = 0; c < numCols; c++) {
        const bTrim = base[c].trim()
        const cTrim = candidate[c].trim()
        if (!cTrim) emptyInCandidate++
        if (bTrim && cTrim) bothPopulated++
      }
      // A continuation row: majority of its cells are empty,
      // and the non-empty cells overlap with populated base cells
      // (i.e. it's adding wrapped text to existing columns)
      const nonEmptyInCandidate = numCols - emptyInCandidate
      const isContinuation =
        nonEmptyInCandidate > 0 &&
        emptyInCandidate > nonEmptyInCandidate &&
        bothPopulated === nonEmptyInCandidate
      if (!isContinuation) break
      // Merge: append candidate cell text to base with newline
      for (let c = 0; c < numCols; c++) {
        const cTrim = candidate[c].trim()
        if (cTrim) {
          base[c] = base[c].trim() ? base[c] + ' ' + cTrim : cTrim
        }
      }
      j++
    }
    merged.push(base)
    i = j
  }
  return merged
}

// ── Strip empty columns and apply header detection ─

function finalizeTable(tableRows: string[][]): TableData {
  if (tableRows.length === 0) return { headers: [], rows: [] }
  const numCols = tableRows[0].length

  // Remove fully-empty columns
  const nonEmpty: number[] = []
  for (let c = 0; c < numCols; c++) {
    if (tableRows.some(r => r[c]?.trim())) nonEmpty.push(c)
  }
  const filtered = tableRows.map(r => nonEmpty.map(c => r[c]))
  const cols = nonEmpty.length
  if (cols === 0) return { headers: [], rows: [] }

  // Header detection
  const headers = filtered[0]
  const isNumeric = (s: string) => /^\s*[\d.,\-$%]+\s*$/.test(s)
  const firstRowAllNum = headers.every(h => isNumeric(h) || !h.trim())
  if (firstRowAllNum) {
    return {
      headers: Array(cols).fill('').map((_, i) => `Col ${String.fromCharCode(65 + (i % 26))}`),
      rows: filtered,
    }
  }

  // Detect two-row header: row 0 has an empty first cell that row 1 fills with
  // a label, and row 1 has repeated values (sub-header labels like years/units)
  if (filtered.length >= 3) {
    const row1 = filtered[1]
    if (!headers[0].trim() && row1[0]?.trim() && !isNumeric(row1[0])) {
      const row1Values = row1.map(c => c.trim()).filter(Boolean)
      const hasRepeats = new Set(row1Values).size < row1Values.length
      if (hasRepeats) {
        const merged = headers.map((h, i) => {
          const h0 = h.trim()
          const h1 = row1[i]?.trim() ?? ''
          if (h0 && h1) return `${h0} ${h1}`
          return h0 || h1
        })
        return { headers: merged, rows: filtered.slice(2) }
      }
    }
  }

  return { headers, rows: filtered.slice(1) }
}

// ── PRIMARY: Line-based table extraction ──────────
// When the PDF has drawn rules/borders, use them as column + row boundaries.
// Filters out short lines (cell/rectangle edges) and clips text to the table bounds.

interface LineTableResult {
  data: TableData
  bounds: { top: number; bottom: number }
}

function buildTableFromLines(
  items: PositionedText[],
  lines: { horizontal: PageLine[]; vertical: PageLine[] },
): LineTableResult | null {
  if (lines.vertical.length < 2) return null

  // 1. Determine rough table Y extent from horizontal lines
  const allHLineYs = lines.horizontal.map(l => l.y1)
  const roughYMin = Math.min(...allHLineYs)
  const roughYMax = Math.max(...allHLineYs)
  const roughTableHeight = roughYMax - roughYMin

  // 2. Filter vertical lines: keep only those that span a significant portion
  //    of the table height (removes short edges from background rectangles,
  //    filled header cells, etc.)
  const significantVLines = roughTableHeight > 10
    ? lines.vertical.filter(l => {
        const h = Math.abs(l.y2 - l.y1)
        return h >= roughTableHeight * 0.25
      })
    : lines.vertical

  if (significantVLines.length < 2) return null

  // 3. Cluster the significant vertical line X positions → column edges
  const vXs = clusterValues(significantVLines.map(l => l.x1), 3)
  if (vXs.length < 2) return null
  vXs.sort((a, b) => a - b)

  // 4. Compute the table bounding box from filtered lines
  const tableLeft = vXs[0] - 2
  const tableRight = vXs[vXs.length - 1] + 2
  const tableTop = roughYMin - 2
  const tableBottom = roughYMax + 2

  // 5. Filter horizontal lines to those within the table X extent
  //    (removes underlines, decorations outside the table)
  const tableHLines = lines.horizontal.filter(l => {
    const lx1 = Math.min(l.x1, l.x2)
    const lx2 = Math.max(l.x1, l.x2)
    const lineWidth = lx2 - lx1
    const tableWidth = tableRight - tableLeft
    // Line must span at least 25% of the table width and overlap the table X range
    return lineWidth >= tableWidth * 0.25 && lx2 > tableLeft && lx1 < tableRight
  })

  // 6. Filter text items to only those within the table bounds
  const tableItems = items.filter(item =>
    item.x >= tableLeft && item.x <= tableRight &&
    item.y >= tableTop && item.y <= tableBottom
  )
  if (tableItems.length === 0) return null

  // 7. Column boundaries (first and last vXs are table edges)
  const colBounds: number[] = []
  for (let i = 1; i < vXs.length - 1; i++) {
    colBounds.push(vXs[i])
  }
  if (colBounds.length === 0) return null

  // 8. Row detection using filtered horizontal lines
  const hYs = clusterValues(tableHLines.map(l => l.y1), 3)
  hYs.sort((a, b) => a - b)

  let rawRows: PositionedText[][]
  if (hYs.length >= 2) {
    rawRows = []
    for (let r = 0; r < hYs.length - 1; r++) {
      const yTop = hYs[r] - 2
      const yBot = hYs[r + 1] + 2
      const rowItems = tableItems
        .filter(it => it.y >= yTop && it.y <= yBot)
        .sort((a, b) => a.x - b.x)
      if (rowItems.length > 0) rawRows.push(rowItems)
    }
  } else {
    rawRows = clusterIntoRows(tableItems)
  }

  const tableRows = assignToGrid(rawRows, colBounds)
  const merged = mergeWrappedRows(tableRows)
  const data = finalizeTable(merged)
  return data.headers.length > 0 ? { data, bounds: { top: tableTop, bottom: tableBottom } } : null
}

// ── FALLBACK: Histogram-based table extraction ────
// When no drawn lines exist, detect columns from X-position density.

function buildTableFromHistogram(items: PositionedText[], tablesOnly?: boolean): TableData {
  if (items.length === 0) return { headers: [], rows: [] }

  const avgH = items.reduce((s, i) => s + i.height, 0) / items.length
  const rawRows = clusterIntoRows(items)
  if (rawRows.length === 0) return { headers: [], rows: [] }

  // Build histogram of item X-start positions (width-independent)
  const allX = items.map(i => i.x)
  const xMin = Math.min(...allX)
  const xMax = Math.max(...allX)
  const xRange = xMax - xMin

  if (xRange < avgH * 3) {
    // Everything at near-same X → single column
    return finalizeTable(rawRows.map(row => [row.map(i => i.text).join(' ')]))
  }

  const binW = Math.max(avgH * 0.3, 2) // ~3-4 pts for 12pt text
  const numBins = Math.ceil(xRange / binW) + 2
  const hist = new Array(numBins).fill(0)
  for (const x of allX) {
    const bin = Math.floor((x - xMin) / binW)
    if (bin >= 0 && bin < numBins) hist[bin]++
  }

  // Find empty gaps between occupied regions
  // Minimum gap width = avgH * 0.8 (about 2/3 of font height)
  const minGapBins = Math.max(2, Math.ceil((avgH * 0.8) / binW))
  const colBounds: number[] = []
  let gapStart = -1

  for (let i = 0; i <= numBins; i++) {
    const val = i < numBins ? hist[i] : 1 // sentinel at end
    if (val === 0) {
      if (gapStart < 0) gapStart = i
    } else {
      if (gapStart >= 0 && (i - gapStart) >= minGapBins) {
        colBounds.push(xMin + ((gapStart + i) / 2) * binW)
      }
      gapStart = -1
    }
  }

  // Sanity: cap columns at 30
  if (colBounds.length + 1 > 30) {
    return finalizeTable(rawRows.map(row => [row.map(i => i.text).join(' ')]))
  }

  // ── Classify rows: table rows touch 3+ columns, text rows touch fewer ──
  function getCol(x: number): number {
    for (let c = 0; c < colBounds.length; c++) {
      if (x < colBounds[c]) return c
    }
    return colBounds.length
  }

  const rowIsTable = rawRows.map(row => {
    const usedCols = new Set(row.map(item => getCol(item.x)))
    return usedCols.size >= 3
  })

  const firstTableIdx = rowIsTable.indexOf(true)
  const lastTableIdx = rowIsTable.lastIndexOf(true)

  // No multi-column rows → treat as single-column document
  if (firstTableIdx === -1) {
    return finalizeTable(rawRows.map(row => [row.map(i => i.text).join(' ')]))
  }

  // Build the table from the contiguous table region only
  const tableBody = rawRows.slice(firstTableIdx, lastTableIdx + 1)
  const tableGridRows = assignToGrid(tableBody, colBounds)
  const merged = mergeWrappedRows(tableGridRows)
  const table = finalizeTable(merged)
  if (table.headers.length === 0) return table

  if (tablesOnly) return table

  // Collect non-table text above and below the table region
  const numCols = table.headers.length
  const prefixRows = rawRows.slice(0, firstTableIdx)
  const suffixRows = rawRows.slice(lastTableIdx + 1)

  // Table data first, then all non-table text underneath
  const allRows: string[][] = [...table.rows]

  const extraRows = [...prefixRows, ...suffixRows]
  for (const row of extraRows) {
    const text = row.map(i => i.text).join(' ').trim()
    if (!text) continue
    const cells: string[] = Array(numCols).fill('')
    cells[0] = text
    allRows.push(cells)
  }

  return { headers: table.headers, rows: allRows }
}

// ── Unified entry point ──────────────────────────

/** Add non-table text items as column-0 rows around the core table data. */
function addNonTableText(
  items: PositionedText[],
  table: TableData,
  bounds: { top: number; bottom: number },
): TableData {
  const numCols = table.headers.length
  if (numCols === 0) return table

  const aboveItems = items.filter(i => i.y + i.height < bounds.top)
  const belowItems = items.filter(i => i.y > bounds.bottom)

  const toRows = (group: PositionedText[]): string[][] => {
    const rows = clusterIntoRows(group)
    const result: string[][] = []
    for (const row of rows) {
      const text = row.map(i => i.text).join(' ').trim()
      if (!text) continue
      const cells: string[] = Array(numCols).fill('')
      cells[0] = text
      result.push(cells)
    }
    return result
  }

  const prefix = toRows(aboveItems)
  const suffix = toRows(belowItems)

  if (prefix.length === 0 && suffix.length === 0) return table
  // Table data first, then all non-table text underneath
  return { headers: table.headers, rows: [...table.rows, ...prefix, ...suffix] }
}

function buildTableData(
  items: PositionedText[],
  lines?: { horizontal: PageLine[]; vertical: PageLine[] },
  tablesOnly?: boolean,
): TableData {
  if (items.length === 0) return { headers: [], rows: [] }

  // Try line-based detection first (most accurate)
  if (lines && (lines.vertical.length >= 2 || lines.horizontal.length >= 2)) {
    const result = buildTableFromLines(items, lines)
    if (result && result.data.headers.length > 1) {
      return tablesOnly ? result.data : addNonTableText(items, result.data, result.bounds)
    }
  }

  // Fallback to histogram-based detection
  return buildTableFromHistogram(items, tablesOnly)
}

// ── Document layout extraction ─────────────────────

interface DocLine {
  y: number
  items: { text: string; x: number; width: number; height: number }[]
}

function buildDocumentLines(items: PositionedText[]): DocLine[] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const avgH = items.reduce((s, i) => s + i.height, 0) / items.length
  const lineThreshold = avgH * 0.5

  const lines: DocLine[] = []
  let currentLine: DocLine = { y: sorted[0].y, items: [] }

  for (const item of sorted) {
    if (currentLine.items.length === 0 || Math.abs(item.y - currentLine.y) <= lineThreshold) {
      currentLine.items.push({ text: item.text, x: item.x, width: item.width, height: item.height })
      if (currentLine.items.length === 1) currentLine.y = item.y
    } else {
      currentLine.items.sort((a, b) => a.x - b.x)
      lines.push(currentLine)
      currentLine = { y: item.y, items: [{ text: item.text, x: item.x, width: item.width, height: item.height }] }
    }
  }
  if (currentLine.items.length > 0) {
    currentLine.items.sort((a, b) => a.x - b.x)
    lines.push(currentLine)
  }

  return lines
}

function docLinesToPlainText(lines: DocLine[]): string {
  if (lines.length === 0) return ''
  const result: string[] = []
  let prevY = lines[0].y

  for (const line of lines) {
    const avgH = line.items.reduce((s, i) => s + i.height, 0) / line.items.length
    if (result.length > 0 && (line.y - prevY) > avgH * 1.8) {
      result.push('') // paragraph break
    }
    // Join items with proportional spacing
    let lineText = ''
    let lastEnd = 0
    for (const item of line.items) {
      const gapChars = lastEnd > 0 ? Math.max(1, Math.round((item.x - lastEnd) / (avgH * 0.4))) : 0
      lineText += ' '.repeat(gapChars) + item.text
      lastEnd = item.x + item.width
    }
    result.push(lineText)
    prevY = line.y
  }
  return result.join('\n')
}

// ── CSV export helper ──────────────────────────────

function tableToCSV(headers: string[], rows: string[][]): string {
  const escape = (s: string) => {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) {
    lines.push(row.map(escape).join(','))
  }
  return lines.join('\n')
}

function tableToTSV(headers: string[], rows: string[][]): string {
  const lines = [headers.join('\t')]
  for (const row of rows) lines.push(row.join('\t'))
  return lines.join('\n')
}

// ── Component ──────────────────────────────────────

export default function TextExtractTool() {
  // File & extraction
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('document')
  const [language, setLanguage] = useState('eng')
  const [isExtracting, setIsExtracting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [useOcr, setUseOcr] = useState(false)
  const [ocrDetected, setOcrDetected] = useState(false)
  const [tablesOnly, setTablesOnly] = useState(false)

  // Extracted data
  const [extractedItems, setExtractedItems] = useState<PositionedText[]>([])
  const [tableData, setTableData] = useState<TableData | null>(null)
  // docLines computed inline during extraction, only docPlainText stored
  const [docPlainText, setDocPlainText] = useState('')

  // Regions
  const [regions, setRegions] = useState<CropRegion[]>([])
  const [regionToolActive, setRegionToolActive] = useState(false)
  const regionDragRef = useRef<{ startX: number; startY: number } | null>(null)

  // Layout
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [leftZoom, setLeftZoom] = useState(1)
  const [rightZoom, setRightZoom] = useState(1)
  const isDraggingDivider = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Export dropdown
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  // Canvas refs
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const regionCanvasRef = useRef<HTMLCanvasElement>(null)
  const ocrCanvasRef = useRef<HTMLCanvasElement>(null)

  // Page dimensions (doc-space)
  const [pageDims, setPageDims] = useState<{ width: number; height: number }>({ width: 612, height: 792 })
  const [pageDimsByPage, setPageDimsByPage] = useState<Record<number, { width: number; height: number }>>({})

  // ── File loading ─────────────────────────────────

  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setLoadError(null)
    try {
      const pdf = await loadPDFFile(file)
      setPdfFile(pdf)
      setCurrentPage(1)
      setExtractedItems([])
      setTableData(null)
      setDocPlainText('')
      setPageDimsByPage({})
      setRegions([])
      setRegionToolActive(false)

      const detected = await hasEmbeddedText(pdf)
      setUseOcr(!detected)
      setOcrDetected(!detected)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setLoadError(`Failed to load PDF: ${msg}`)
    }
  }, [])

  // ── Render PDF page ──────────────────────────────

  useEffect(() => {
    if (!pdfFile || !pdfCanvasRef.current) return
    const canvas = pdfCanvasRef.current
    const render = async () => {
      try {
        await renderPageToCanvas(pdfFile, currentPage, canvas, RENDER_SCALE * leftZoom)
      } catch {
        return  // Page render can fail if PDF is corrupt or component unmounted
      }
      setPageDims({
        width: canvas.width / (RENDER_SCALE * leftZoom),
        height: canvas.height / (RENDER_SCALE * leftZoom),
      })
      // Size overlay
      const overlay = regionCanvasRef.current
      if (overlay) {
        overlay.width = canvas.width
        overlay.height = canvas.height
      }
      drawRegions()
    }
    render()
  }, [pdfFile, currentPage, leftZoom])

  // ── Draw regions overlay ─────────────────────────

  const drawRegions = useCallback(() => {
    const overlay = regionCanvasRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    const scale = RENDER_SCALE * leftZoom
    const pageRegions = regions.filter(r => r.page === currentPage)

    for (const r of pageRegions) {
      const sx = r.x * scale, sy = r.y * scale
      const sw = r.width * scale, sh = r.height * scale

      // Fill
      ctx.fillStyle = 'rgba(59, 130, 246, 0.12)'
      ctx.fillRect(sx, sy, sw, sh)

      // Border
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.strokeRect(sx, sy, sw, sh)
      ctx.setLineDash([])

      // Label
      ctx.fillStyle = 'rgba(59, 130, 246, 0.9)'
      ctx.font = `bold ${12 * leftZoom}px sans-serif`
      ctx.fillText(r.label, sx + 4, sy + 14 * leftZoom)

      // Delete button (top-right corner)
      const btnSize = 16 * leftZoom
      ctx.fillStyle = 'rgba(239, 68, 68, 0.8)'
      ctx.beginPath()
      ctx.arc(sx + sw - btnSize / 2, sy + btnSize / 2, btnSize / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'white'
      ctx.font = `bold ${10 * leftZoom}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('×', sx + sw - btnSize / 2, sy + btnSize / 2)
      ctx.textAlign = 'start'
      ctx.textBaseline = 'alphabetic'
    }
  }, [regions, currentPage, leftZoom])

  useEffect(() => { drawRegions() }, [drawRegions])

  // ── Region pointer handlers ──────────────────────

  const getDocPoint = useCallback((e: React.PointerEvent) => {
    const canvas = regionCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const scale = RENDER_SCALE * leftZoom
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width / scale,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height / scale,
    }
  }, [leftZoom])

  const handleRegionPointerDown = useCallback((e: React.PointerEvent) => {
    if (!regionToolActive) return
    const pt = getDocPoint(e)

    // Check if clicking a delete button
    const scale = RENDER_SCALE * leftZoom
    const pageRegions = regions.filter(r => r.page === currentPage)
    for (const r of pageRegions) {
      const btnX = (r.x + r.width) * scale - 8 * leftZoom
      const btnY = r.y * scale + 8 * leftZoom
      const canvasPt = {
        x: pt.x * scale,
        y: pt.y * scale,
      }
      if (Math.hypot(canvasPt.x - btnX, canvasPt.y - btnY) < 10 * leftZoom) {
        setRegions(prev => prev.filter(rr => rr.id !== r.id))
        return
      }
    }

    // Start drawing new region
    regionDragRef.current = { startX: pt.x, startY: pt.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [regionToolActive, getDocPoint, regions, currentPage, leftZoom])

  const handleRegionPointerMove = useCallback((e: React.PointerEvent) => {
    if (!regionDragRef.current) return
    const pt = getDocPoint(e)
    const s = regionDragRef.current

    // Draw preview
    const overlay = regionCanvasRef.current
    if (!overlay) return
    drawRegions()
    const ctx = overlay.getContext('2d')
    if (!ctx) return

    const scale = RENDER_SCALE * leftZoom
    const x = Math.min(s.startX, pt.x) * scale
    const y = Math.min(s.startY, pt.y) * scale
    const w = Math.abs(pt.x - s.startX) * scale
    const h = Math.abs(pt.y - s.startY) * scale

    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 3])
    ctx.strokeRect(x, y, w, h)
    ctx.setLineDash([])
  }, [getDocPoint, drawRegions, leftZoom])

  const handleRegionPointerUp = useCallback((e: React.PointerEvent) => {
    if (!regionDragRef.current) return
    const pt = getDocPoint(e)
    const s = regionDragRef.current
    regionDragRef.current = null

    const x = Math.min(s.startX, pt.x)
    const y = Math.min(s.startY, pt.y)
    const w = Math.abs(pt.x - s.startX)
    const h = Math.abs(pt.y - s.startY)

    // Only commit if region is at least 10x10 doc units
    if (w > 10 && h > 10) {
      const label = `Region ${regions.filter(r => r.page === currentPage).length + 1}`
      setRegions(prev => [...prev, { id: genId(), x, y, width: w, height: h, page: currentPage, label }])
    }
    drawRegions()
  }, [getDocPoint, regions, currentPage, drawRegions])

  // ── Extraction pipeline ──────────────────────────

  /** Extract a single page and return its items, lines, and viewport dimensions */
  const extractPage = useCallback(async (
    pdf: PDFFile,
    pageNum: number,
    onProgress?: (prog: number) => void,
  ) => {
    const items: PositionedText[] = []
    const lines: { horizontal: PageLine[]; vertical: PageLine[] } = { horizontal: [], vertical: [] }
    let viewport = { width: pageDims.width, height: pageDims.height }

    let pageItems: PositionedText[]
    if (useOcr) {
      const canvas = ocrCanvasRef.current
      if (!canvas) return { items, lines, viewport }
      pageItems = await ocrPositionedText(pdf, pageNum, language, canvas, onProgress)
    } else {
      const result = await extractPositionedText(pdf, pageNum)
      pageItems = result.items
      viewport = result.viewport
    }

    // Extract drawn lines/rules for table grid detection
    if (!useOcr) {
      const pageLines = await extractPageLines(pdf, pageNum)
      const pageRegions = regions.filter(r => r.page === pageNum)
      if (pageRegions.length > 0) {
        const inRegion = (l: PageLine) => pageRegions.some(r =>
          Math.min(l.x1, l.x2) < r.x + r.width + 5 &&
          Math.max(l.x1, l.x2) > r.x - 5 &&
          Math.min(l.y1, l.y2) < r.y + r.height + 5 &&
          Math.max(l.y1, l.y2) > r.y - 5
        )
        lines.horizontal.push(...pageLines.horizontal.filter(inRegion))
        lines.vertical.push(...pageLines.vertical.filter(inRegion))
      } else {
        lines.horizontal.push(...pageLines.horizontal)
        lines.vertical.push(...pageLines.vertical)
      }
    }

    // Filter text by regions on this page
    const pageRegions = regions.filter(r => r.page === pageNum)
    const filtered = pageRegions.length > 0
      ? pageItems.filter(item => isInAnyRegion(item, pageRegions))
      : pageItems
    items.push(...filtered)

    return { items, lines, viewport }
  }, [useOcr, language, regions, pageDims])

  const handleExtract = useCallback(async (scope: 'page' | 'all' = 'page') => {
    if (!pdfFile) return
    setIsExtracting(true)
    setExtractError(null)
    setProgress(0)
    setProgressMsg('Starting extraction...')

    try {
      // Determine pages to process
      let pagesToProcess: number[]
      if (scope === 'page') {
        pagesToProcess = [currentPage]
      } else {
        // All pages — when regions exist, only pages with regions
        pagesToProcess = regions.length > 0
          ? [...new Set(regions.map(r => r.page))].sort((a, b) => a - b)
          : Array.from({ length: pdfFile.pageCount }, (_, i) => i + 1)
      }

      const processCount = pagesToProcess.length

      if (scope === 'all' && processCount > 1) {
        // ── Multi-page: extract each page separately, compile tables vertically ──
        const allItems: PositionedText[] = []
        let combinedTable: TableData | null = null
        const allDocTexts: string[] = []
        const dims: Record<number, { width: number; height: number }> = {}

        for (let pi = 0; pi < processCount; pi++) {
          const p = pagesToProcess[pi]
          setProgressMsg(`Page ${p} (${pi + 1}/${processCount})...`)

          const { items, lines, viewport } = await extractPage(pdfFile, p, (prog) => {
            setProgress(Math.round(((pi + prog) / processCount) * 100))
          })
          allItems.push(...items)
          dims[p] = viewport

          // Build table for this page
          const pageTable = buildTableData(items, lines, tablesOnly)

          // Build doc text for this page
          const docLines = buildDocumentLines(items)
          allDocTexts.push(docLinesToPlainText(docLines))

          // Compile tables vertically with separator
          if (pageTable.headers.length > 0) {
            if (!combinedTable) {
              combinedTable = { headers: pageTable.headers, rows: [...pageTable.rows] }
            } else {
              // Add blank separator row then this page's data
              const sepRow = Array(combinedTable.headers.length).fill('')
              combinedTable.rows.push(sepRow)
              // If column counts differ, pad to the wider one
              const maxCols = Math.max(combinedTable.headers.length, pageTable.headers.length)
              if (pageTable.headers.length > combinedTable.headers.length) {
                const diff = pageTable.headers.length - combinedTable.headers.length
                combinedTable.headers.push(...pageTable.headers.slice(combinedTable.headers.length))
                combinedTable.rows = combinedTable.rows.map(r => [...r, ...Array(diff).fill('')])
              }
              const paddedRows = pageTable.rows.map(r => {
                const padded = [...r]
                while (padded.length < maxCols) padded.push('')
                return padded
              })
              combinedTable.rows.push(...paddedRows)
            }
          }

          setProgress(Math.round(((pi + 1) / processCount) * 100))
        }

        setExtractedItems(allItems)
        setTableData(combinedTable ?? { headers: [], rows: [] })
        setDocPlainText(allDocTexts.join('\n\n---\n\n'))
        setPageDimsByPage(dims)
      } else {
        // ── Single page extraction ──
        const p = pagesToProcess[0]
        setProgressMsg(processCount === 1 ? `Extracting page ${p}...` : `Page ${p}...`)

        const { items, lines, viewport } = await extractPage(pdfFile, p, (prog) => {
          setProgress(Math.round(prog * 100))
        })

        setExtractedItems(items)
        setTableData(buildTableData(items, lines, tablesOnly))
        const docLines = buildDocumentLines(items)
        setDocPlainText(docLinesToPlainText(docLines))
        setPageDimsByPage({ [p]: viewport })
        setProgress(100)
      }

      setProgressMsg('Done!')
      setProgress(100)
      // Brief pause so user sees completion feedback (non-OCR extraction is near-instant)
      await new Promise<void>(r => setTimeout(r, 600))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setExtractError(`Extraction failed: ${msg}`)
    } finally {
      setIsExtracting(false)
    }
  }, [pdfFile, useOcr, language, regions, currentPage, extractPage, tablesOnly])

  // ── Export functions ─────────────────────────────

  const baseName = pdfFile?.name.replace(/\.pdf$/i, '') ?? 'extracted'

  const exportCSV = useCallback(() => {
    if (!tableData) return
    const csv = tableToCSV(tableData.headers, tableData.rows)
    downloadText(csv, `${baseName}.csv`)
    setExportOpen(false)
  }, [tableData, baseName])

  const exportTXT = useCallback(() => {
    if (extractionMode === 'table' && tableData) {
      const tsv = tableToTSV(tableData.headers, tableData.rows)
      downloadText(tsv, `${baseName}.txt`)
    } else {
      downloadText(docPlainText, `${baseName}.txt`)
    }
    setExportOpen(false)
  }, [extractionMode, tableData, docPlainText, baseName])

  const exportExcel = useCallback(async () => {
    if (!tableData) return
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Extracted Data')

    // Header row
    ws.addRow(tableData.headers)
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true }
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } }
      cell.border = {
        bottom: { style: 'thin' },
      }
    })

    // Data rows
    for (const row of tableData.rows) {
      ws.addRow(row)
    }

    // Auto-width
    ws.columns.forEach(col => {
      let maxLen = 10
      col.eachCell?.({ includeEmpty: true }, cell => {
        const len = cell.value?.toString().length ?? 0
        if (len > maxLen) maxLen = len
      })
      col.width = Math.min(maxLen + 2, 50)
    })

    const buf = await wb.xlsx.writeBuffer()
    downloadBlob(new Uint8Array(buf as ArrayBuffer), `${baseName}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    setExportOpen(false)
  }, [tableData, baseName])

  const exportWord = useCallback(async () => {
    const children: (Paragraph | Table)[] = []

    if (extractionMode === 'table' && tableData) {
      // Table in Word
      const headerRow = new TableRow({
        tableHeader: true,
        children: tableData.headers.map(h => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
          width: { size: Math.floor(9000 / tableData.headers.length), type: WidthType.DXA },
        })),
      })
      const dataRows = tableData.rows.map(row =>
        new TableRow({
          children: row.map(cell => new TableCell({
            children: [new Paragraph({ children: [new TextRun(cell)] })],
            width: { size: Math.floor(9000 / tableData.headers.length), type: WidthType.DXA },
          })),
        })
      )
      children.push(new Table({
        rows: [headerRow, ...dataRows],
        width: { size: 9000, type: WidthType.DXA },
      }))
    } else {
      // Document mode
      const textLines = docPlainText.split('\n')
      for (const line of textLines) {
        children.push(new Paragraph({
          children: [new TextRun(line)],
        }))
      }
    }

    const doc = new Document({
      sections: [{ children }],
    })
    const buf = await Packer.toBuffer(doc)
    downloadBlob(new Uint8Array(buf), `${baseName}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    setExportOpen(false)
  }, [extractionMode, tableData, docPlainText, baseName])

  const exportPDF = useCallback(async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)

    if (extractionMode === 'table' && tableData) {
      const fontSize = 9
      const cellPad = 4
      const colCount = tableData.headers.length
      const pageW = 612
      const pageH = 792
      const margin = 40
      const tableW = pageW - margin * 2
      const colW = tableW / colCount
      const rowH = fontSize + cellPad * 2

      let page = doc.addPage([pageW, pageH])
      let y = pageH - margin

      // Header
      for (let c = 0; c < colCount; c++) {
        page.drawText(tableData.headers[c] || '', {
          x: margin + c * colW + cellPad,
          y: y - fontSize - cellPad,
          size: fontSize,
          font: boldFont,
          color: rgb(0, 0, 0),
        })
      }
      // Header bottom line
      page.drawLine({
        start: { x: margin, y: y - rowH },
        end: { x: margin + tableW, y: y - rowH },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      })
      y -= rowH

      // Rows
      for (const row of tableData.rows) {
        if (y - rowH < margin) {
          page = doc.addPage([pageW, pageH])
          y = pageH - margin
        }
        for (let c = 0; c < colCount; c++) {
          page.drawText((row[c] || '').slice(0, 50), {
            x: margin + c * colW + cellPad,
            y: y - fontSize - cellPad,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          })
        }
        y -= rowH
      }
    } else {
      // Document mode — positioned text
      const fontSize = 10
      const pageW = 612
      const pageH = 792
      const margin = 40

      let page = doc.addPage([pageW, pageH])
      let y = pageH - margin

      const textLines = docPlainText.split('\n')
      for (const line of textLines) {
        if (y < margin) {
          page = doc.addPage([pageW, pageH])
          y = pageH - margin
        }
        page.drawText(line, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        })
        y -= fontSize * 1.4
      }
    }

    const pdfBytes = await doc.save()
    downloadBlob(pdfBytes, `${baseName}.pdf`, 'application/pdf')
    setExportOpen(false)
  }, [extractionMode, tableData, docPlainText, baseName])

  const handleCopy = useCallback(async () => {
    let text = ''
    if (extractionMode === 'table' && tableData) {
      text = tableToTSV(tableData.headers, tableData.rows)
    } else {
      text = docPlainText
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access denied — silent fail, user can see text in preview
    }
  }, [extractionMode, tableData, docPlainText])

  // ── Close export dropdown on outside click ───────

  useEffect(() => {
    if (!exportOpen) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [exportOpen])

  // ── Divider drag handling ────────────────────────

  const handleDividerDown = useCallback((e: React.PointerEvent) => {
    isDraggingDivider.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const handleDividerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingDivider.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
  }, [])

  const handleDividerUp = useCallback(() => {
    isDraggingDivider.current = false
  }, [])

  // ── Has extracted data ───────────────────────────

  const hasData = extractedItems.length > 0

  // ── Render ───────────────────────────────────────

  if (!pdfFile) {
    return (
      <div className="h-full flex flex-col gap-4">
        <FileDropZone
          onFiles={handleFiles}
          accept="application/pdf"
          multiple={false}
          label="Drop a PDF file here"
          description="Extract text and tables from PDFs — embedded text or OCR"
          className="h-full"
        />
        {loadError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400 flex-1">{loadError}</p>
            <button onClick={() => setLoadError(null)} className="p-1 rounded text-red-400/60 hover:text-red-400 transition-colors" aria-label="Dismiss error">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-0">
      {/* Hidden OCR canvas */}
      <canvas ref={ocrCanvasRef} className="hidden" />

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] flex-shrink-0 flex-wrap">
        {/* File info */}
        <div className="flex items-center gap-1.5 mr-2">
          <FileText size={14} className="text-[#F47B20]" />
          <span className="text-xs text-white truncate max-w-[140px]">{pdfFile.name}</span>
          <span className="text-[10px] text-white/30">{pdfFile.pageCount}p</span>
        </div>

        <div className="w-px h-4 bg-white/[0.08]" />

        {/* Mode toggle */}
        <div className="flex items-center bg-white/[0.06] rounded-md p-0.5">
          <button
            onClick={() => setExtractionMode('document')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
              extractionMode === 'document' ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            <AlignLeft size={10} /> Document
          </button>
          <button
            onClick={() => setExtractionMode('table')}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
              extractionMode === 'table' ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            <Table2 size={10} /> Table
          </button>
        </div>

        {/* Tables only toggle (table mode only) */}
        {extractionMode === 'table' && (
          <button
            onClick={() => setTablesOnly(prev => !prev)}
            title="Tables only — exclude non-table text (titles, paragraphs)"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
              tablesOnly ? 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-400/50' : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            <Table2 size={10} /> Tables only
          </button>
        )}

        {/* Language (OCR only) */}
        {ocrDetected && (
          <>
            <div className="w-px h-4 bg-white/[0.08]" />
            <div className="flex items-center gap-1">
              <Globe size={12} className="text-amber-400" />
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="text-[10px] bg-dark-surface border border-white/[0.1] rounded px-1 py-0.5 text-white"
              >
                {LANGUAGES.map(l => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
              <span className="text-[10px] text-amber-400/70">OCR</span>
            </div>
          </>
        )}

        <div className="w-px h-4 bg-white/[0.08]" />

        {/* Region tool */}
        <button
          onClick={() => setRegionToolActive(prev => !prev)}
          title="Region selection — draw areas to extract from"
          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors ${
            regionToolActive ? 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-400/50' : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
          }`}
        >
          <Crop size={12} /> Region
          {regions.filter(r => r.page === currentPage).length > 0 && (
            <span className="ml-0.5 bg-blue-500/40 text-blue-200 text-[9px] px-1 rounded-full">
              {regions.filter(r => r.page === currentPage).length}
            </span>
          )}
        </button>

        {regions.length > 0 && (
          <button
            onClick={() => setRegions([])}
            className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        )}

        <div className="flex-1" />

        {/* Extract current page */}
        <Button
          size="sm"
          onClick={() => handleExtract('page')}
          disabled={isExtracting}
        >
          {isExtracting ? 'Extracting...' : hasData ? 'Re-extract' : 'Extract'}
        </Button>

        {/* Extract all pages */}
        {pdfFile.pageCount > 1 && (
          <button
            onClick={() => handleExtract('all')}
            disabled={isExtracting}
            title="Extract all pages — compiles data vertically"
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <Layers size={10} /> Extract All
          </button>
        )}

        {/* Export dropdown */}
        {hasData && (
          <div ref={exportRef} className="relative">
            <button
              onClick={() => setExportOpen(prev => !prev)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-white/[0.06] text-white/70 hover:text-white hover:bg-white/[0.1] transition-colors"
            >
              Export <ChevronDown size={10} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-[#1a2332] border border-white/[0.1] rounded-lg shadow-xl py-1 min-w-[140px]">
                <button onClick={exportPDF} className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white">
                  PDF (.pdf)
                </button>
                <button onClick={exportExcel} className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white">
                  Excel (.xlsx)
                </button>
                <button onClick={exportWord} className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white">
                  Word (.docx)
                </button>
                <button onClick={exportCSV} className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white">
                  CSV (.csv)
                </button>
                <button onClick={exportTXT} className="w-full text-left px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white">
                  Text (.txt)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Copy */}
        {hasData && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <Copy size={10} /> {copied ? 'Copied!' : 'Copy'}
          </button>
        )}

        {/* Clear extracted data */}
        {hasData && (
          <button
            onClick={() => {
              setExtractedItems([])
              setTableData(null)
              setDocPlainText('')
              setPageDimsByPage({})
            }}
            title="Clear extracted data"
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-white/30 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
          >
            <Trash2 size={10} /> Clear
          </button>
        )}

        {/* New */}
        <button
          onClick={() => {
            setPdfFile(null)
            setExtractedItems([])
            setTableData(null)
            setDocPlainText('')
            setPageDimsByPage({})
            setRegions([])
          }}
          className="flex items-center gap-1 px-2 py-1 text-[10px] rounded text-white/30 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <RotateCcw size={10} /> New
        </button>
      </div>

      {/* ── Progress bar ── */}
      {isExtracting && (
        <div className="px-3 py-1 flex-shrink-0">
          <ProgressBar value={progress} max={100} label={progressMsg} />
        </div>
      )}
      {extractError && (
        <div className="flex items-center gap-2 mx-3 my-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 flex-shrink-0">
          <p className="text-[11px] text-red-400 flex-1">{extractError}</p>
          <button onClick={() => setExtractError(null)} className="p-0.5 rounded text-red-400/60 hover:text-red-400" aria-label="Dismiss error">
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Split pane ── */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden min-h-0">
        {/* Left pane — PDF viewer */}
        <div className="flex flex-col overflow-hidden" style={{ width: `${splitRatio * 100}%` }}>
          {/* Left controls */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06] flex-shrink-0">
            {/* Page nav */}
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-0.5 text-white/40 hover:text-white disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] text-white/50 min-w-[60px] text-center">
              Page {currentPage} / {pdfFile.pageCount}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(pdfFile.pageCount, p + 1))}
              disabled={currentPage >= pdfFile.pageCount}
              className="p-0.5 text-white/40 hover:text-white disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>

            <div className="flex-1" />

            {/* Zoom */}
            <button onClick={() => setLeftZoom(z => Math.max(0.5, z - 0.25))} className="p-0.5 text-white/40 hover:text-white" aria-label="Zoom out PDF">
              <ZoomOut size={12} />
            </button>
            <span className="text-[10px] text-white/40 w-8 text-center">{Math.round(leftZoom * 100)}%</span>
            <button onClick={() => setLeftZoom(z => Math.min(3, z + 0.25))} className="p-0.5 text-white/40 hover:text-white" aria-label="Zoom in PDF">
              <ZoomIn size={12} />
            </button>
          </div>

          {/* PDF canvas */}
          <div className="flex-1 overflow-auto bg-black/20 flex items-start justify-center p-4">
            <div className="relative inline-block">
              <canvas ref={pdfCanvasRef} className="max-w-full" style={{ imageRendering: 'auto' }} />
              <canvas
                ref={regionCanvasRef}
                className="absolute top-0 left-0 w-full h-full"
                style={{ cursor: regionToolActive ? 'crosshair' : 'default' }}
                onPointerDown={handleRegionPointerDown}
                onPointerMove={handleRegionPointerMove}
                onPointerUp={handleRegionPointerUp}
              />
            </div>
          </div>
        </div>

        {/* Divider */}
        <div
          className="w-1 flex-shrink-0 bg-white/[0.06] hover:bg-[#F47B20]/40 active:bg-[#F47B20]/60 cursor-col-resize transition-colors"
          onPointerDown={handleDividerDown}
          onPointerMove={handleDividerMove}
          onPointerUp={handleDividerUp}
        />

        {/* Right pane — Preview */}
        <div className="flex flex-col overflow-hidden" style={{ width: `${(1 - splitRatio) * 100}%` }}>
          {/* Right controls */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06] flex-shrink-0">
            <span className="text-[10px] text-white/40">Preview</span>
            <span className="text-[10px] text-white/20">
              {extractionMode === 'table' ? '(Table)' : '(Document)'}
            </span>
            <div className="flex-1" />
            <button onClick={() => setRightZoom(z => Math.max(0.5, z - 0.25))} className="p-0.5 text-white/40 hover:text-white" aria-label="Zoom out preview">
              <ZoomOut size={12} />
            </button>
            <span className="text-[10px] text-white/40 w-8 text-center">{Math.round(rightZoom * 100)}%</span>
            <button onClick={() => setRightZoom(z => Math.min(3, z + 0.25))} className="p-0.5 text-white/40 hover:text-white" aria-label="Zoom in preview">
              <ZoomIn size={12} />
            </button>
          </div>

          {/* Preview content */}
          <div className="flex-1 overflow-auto bg-black/10">
            {!hasData ? (
              <div className="h-full flex items-center justify-center text-white/20 text-sm">
                {isExtracting ? 'Extracting...' : 'Extract to see preview'}
              </div>
            ) : extractionMode === 'table' && tableData ? (
              /* Table preview */
              <div className="p-4 overflow-auto h-full">
                <div style={{ transform: `scale(${rightZoom})`, transformOrigin: 'top left' }}>
                  <table className="border-collapse text-sm">
                    <thead>
                      <tr>
                        {tableData.headers.map((h, i) => (
                          <th
                            key={i}
                            className="px-3 py-2 text-left text-xs font-bold text-white bg-white/[0.08] border border-white/[0.1] whitespace-nowrap"
                          >
                            {h || <span className="text-white/20">—</span>}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableData.rows.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? 'bg-white/[0.02]' : ''}>
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className={`px-3 py-1.5 text-xs border border-white/[0.06] max-w-[300px] break-words ${
                                /^\s*[\d.,\-$%]+\s*$/.test(cell) ? 'text-right text-white/70' : 'text-white/60'
                              }`}
                            >
                              {cell || <span className="text-white/10">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tableData.rows.length === 0 && (
                    <p className="text-xs text-white/30 mt-4">No table data found. Try Document mode instead.</p>
                  )}
                </div>
              </div>
            ) : (
              /* Document preview — per-page layout */
              <div className="p-4 overflow-auto h-full">
                <div style={{ transform: `scale(${rightZoom})`, transformOrigin: 'top left' }}>
                  {(() => {
                    const pages = new Map<number, PositionedText[]>()
                    for (const item of extractedItems) {
                      const list = pages.get(item.page) ?? []
                      list.push(item)
                      pages.set(item.page, list)
                    }
                    const sortedPages = [...pages.entries()].sort(([a], [b]) => a - b)

                    return sortedPages.length > 0 ? sortedPages.map(([pageNum, items]) => {
                      const dims = pageDimsByPage[pageNum] ?? pageDims
                      return (
                        <div key={pageNum} className="mb-6">
                          {sortedPages.length > 1 && (
                            <div className="text-[10px] text-white/30 mb-1">Page {pageNum}</div>
                          )}
                          <div
                            className="relative bg-white rounded shadow-lg"
                            style={{ width: dims.width, minHeight: dims.height }}
                          >
                            {items.map((item, i) => (
                              <span
                                key={i}
                                className="absolute text-black whitespace-nowrap"
                                style={{
                                  left: item.x,
                                  top: item.y,
                                  fontSize: Math.max(8, item.height * 0.9),
                                  lineHeight: 1,
                                }}
                              >
                                {item.text}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                        No text found
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status bar ── */}
      {hasData && (
        <div className="flex items-center gap-4 px-3 py-1.5 border-t border-white/[0.06] text-[10px] text-white/30 flex-shrink-0">
          <span>{extractedItems.length.toLocaleString()} text items</span>
          {extractionMode === 'table' && tableData && (
            <>
              <span>{tableData.headers.length} columns</span>
              <span>{tableData.rows.length} rows</span>
            </>
          )}
          {extractionMode === 'document' && (
            <span>{docPlainText.split('\n').length.toLocaleString()} lines</span>
          )}
          {useOcr && <span className="text-amber-400/50">OCR mode</span>}
          {regions.length > 0 && <span className="text-blue-400/50">{regions.length} region(s)</span>}
        </div>
      )}
    </div>
  )
}
