import { useState, useCallback, useRef, useEffect } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { loadPDFFile, renderPageToCanvas, generateThumbnail } from '@/utils/pdf.ts'
import { downloadBlob } from '@/utils/download.ts'
import { formatFileSize } from '@/utils/fileReader.ts'
import type { PDFFile } from '@/types'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import {
  Download, RotateCcw, RotateCw, Undo2, Redo2,
  Pencil, Highlighter, Square, Circle, ArrowUpRight, Minus, Type, Eraser,
  ZoomIn, ZoomOut, Maximize, Cloud, ChevronDown, ChevronLeft, ChevronRight, PanelLeft,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────

type ToolType = 'pencil' | 'highlighter' | 'rectangle' | 'circle' | 'arrow' | 'line' | 'text' | 'eraser' | 'cloud'

interface Point { x: number; y: number }

interface Annotation {
  id: string
  type: Exclude<ToolType, 'eraser'>
  points: Point[]
  color: string
  strokeWidth: number
  opacity: number
  text?: string
  fontSize?: number
  width?: number   // textbox width (doc space) — text only
  height?: number  // textbox height (doc space) — text only
}

type PageAnnotations = Record<number, Annotation[]>

// ── Constants ──────────────────────────────────────────

const RENDER_SCALE = 1.5
const MAX_HISTORY = 50
const HANDLE_SIZE = 6
const DEFAULT_TEXTBOX_W = 200
const DEFAULT_TEXTBOX_H = 50

type ToolDef = { type: ToolType; icon: React.ComponentType<{ size?: number }>; label: string }

const DRAW_TOOLS: ToolDef[] = [
  { type: 'pencil', icon: Pencil, label: 'Pencil' },
  { type: 'line', icon: Minus, label: 'Line' },
  { type: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
  { type: 'rectangle', icon: Square, label: 'Rectangle' },
  { type: 'circle', icon: Circle, label: 'Circle' },
  { type: 'cloud', icon: Cloud, label: 'Cloud' },
]

const DRAW_TYPES = new Set(DRAW_TOOLS.map(s => s.type))

const CURSOR_MAP: Record<ToolType, string> = {
  pencil: 'crosshair', highlighter: 'crosshair', line: 'crosshair',
  arrow: 'crosshair', rectangle: 'crosshair', circle: 'crosshair',
  cloud: 'crosshair', text: 'crosshair', eraser: 'none',
}

function genId() { return Math.random().toString(36).substring(2, 11) }

// ── Text wrapping helper ─────────────────────────────

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const charWidth = fontSize * 0.6
  const result: string[] = []
  for (const line of text.split('\n')) {
    if (!line) { result.push(''); continue }
    const words = line.split(' ')
    let current = ''
    for (const word of words) {
      const test = current ? `${current} ${word}` : word
      if (test.length * charWidth > maxWidth && current) {
        result.push(current)
        current = word
      } else {
        current = test
      }
    }
    result.push(current)
  }
  return result
}

// ── Cloud drawing helper ─────────────────────────────

function drawCloudEdge(
  ctx: CanvasRenderingContext2D,
  ax: number, ay: number, bx: number, by: number,
  arcSize: number,
) {
  const edgeLen = Math.hypot(bx - ax, by - ay)
  const numBumps = Math.max(2, Math.round(edgeLen / arcSize))
  const dx = (bx - ax) / numBumps
  const dy = (by - ay) / numBumps
  const len = Math.hypot(dx, dy)
  if (len === 0) return
  const nx = (-dy / len) * arcSize * 0.4
  const ny = (dx / len) * arcSize * 0.4

  for (let i = 0; i < numBumps; i++) {
    const sx = ax + dx * i
    const sy = ay + dy * i
    const ex = ax + dx * (i + 1)
    const ey = ay + dy * (i + 1)
    const mx = (sx + ex) / 2 + nx
    const my = (sy + ey) / 2 + ny
    ctx.quadraticCurveTo(mx, my, ex, ey)
  }
}

// ── Resize handle helpers ────────────────────────────

type HandleId = 'nw' | 'ne' | 'sw' | 'se'

function getHandles(x: number, y: number, w: number, h: number): { id: HandleId; x: number; y: number }[] {
  return [
    { id: 'nw', x, y },
    { id: 'ne', x: x + w, y },
    { id: 'sw', x, y: y + h },
    { id: 'se', x: x + w, y: y + h },
  ]
}

function hitTestHandle(pt: Point, ann: Annotation, threshold: number): HandleId | null {
  if (ann.type !== 'text' || !ann.width || !ann.height || !ann.points.length) return null
  const { x, y } = ann.points[0]
  const handles = getHandles(x, y, ann.width, ann.height)
  for (const h of handles) {
    if (Math.hypot(pt.x - h.x, pt.y - h.y) < threshold) return h.id
  }
  return null
}

// ── Hit-testing helpers ────────────────────────────────

function ptSegDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function hitTest(p: Point, ann: Annotation, threshold: number): boolean {
  const th = threshold + ann.strokeWidth
  switch (ann.type) {
    case 'pencil':
    case 'highlighter':
      for (let i = 0; i < ann.points.length - 1; i++) {
        if (ptSegDist(p, ann.points[i], ann.points[i + 1]) < th) return true
      }
      return false
    case 'line':
    case 'arrow':
      return ann.points.length >= 2 && ptSegDist(p, ann.points[0], ann.points[1]) < th
    case 'rectangle': {
      if (ann.points.length < 2) return false
      const [p1, p2] = ann.points
      const c: Point[] = [p1, { x: p2.x, y: p1.y }, p2, { x: p1.x, y: p2.y }]
      for (let i = 0; i < 4; i++) { if (ptSegDist(p, c[i], c[(i + 1) % 4]) < th) return true }
      return false
    }
    case 'cloud': {
      if (ann.points.length < 2) return false
      const [p1, p2] = ann.points
      const corners: Point[] = [
        { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y) },
        { x: Math.max(p1.x, p2.x), y: Math.min(p1.y, p2.y) },
        { x: Math.max(p1.x, p2.x), y: Math.max(p1.y, p2.y) },
        { x: Math.min(p1.x, p2.x), y: Math.max(p1.y, p2.y) },
      ]
      const cloudTh = th + 10
      for (let i = 0; i < 4; i++) { if (ptSegDist(p, corners[i], corners[(i + 1) % 4]) < cloudTh) return true }
      return false
    }
    case 'circle': {
      if (ann.points.length < 2) return false
      const cx = (ann.points[0].x + ann.points[1].x) / 2
      const cy = (ann.points[0].y + ann.points[1].y) / 2
      const rx = Math.abs(ann.points[1].x - ann.points[0].x) / 2
      const ry = Math.abs(ann.points[1].y - ann.points[0].y) / 2
      if (rx < 1 || ry < 1) return false
      const d = Math.sqrt(((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2)
      return Math.abs(d - 1) * Math.min(rx, ry) < th
    }
    case 'text': {
      if (!ann.points.length) return false
      const { x, y } = ann.points[0]
      if (ann.width && ann.height) {
        return p.x >= x - 4 && p.x <= x + ann.width + 4 &&
               p.y >= y - 4 && p.y <= y + ann.height + 4
      }
      if (!ann.text) return false
      const fs = ann.fontSize || 16
      const w = ann.text.length * fs * 0.6
      const lines = ann.text.split('\n')
      const h = lines.length * fs * 1.3
      return p.x >= x - 4 && p.x <= x + w + 4 && p.y >= y - 4 && p.y <= y + h + 4
    }
  }
  return false
}

// ── Eraser path splitting ──────────────────────────────

/** Find intersection points of line segment [a,b] with circle (center, radius). Returns 0-2 points sorted by t. */
function circleSegIntersections(center: Point, radius: number, a: Point, b: Point): Point[] {
  const dx = b.x - a.x, dy = b.y - a.y
  const fx = a.x - center.x, fy = a.y - center.y
  const A = dx * dx + dy * dy
  const B = 2 * (fx * dx + fy * dy)
  const C = fx * fx + fy * fy - radius * radius
  const disc = B * B - 4 * A * C
  if (disc < 0 || A === 0) return []
  const sqrtDisc = Math.sqrt(disc)
  const pts: Point[] = []
  for (const t of [(-B - sqrtDisc) / (2 * A), (-B + sqrtDisc) / (2 * A)]) {
    if (t > 0.001 && t < 0.999) pts.push({ x: a.x + t * dx, y: a.y + t * dy })
  }
  return pts
}

/** Check if any segment of a path comes within radius of center */
function pathHitsCircle(points: Point[], center: Point, radius: number): boolean {
  if (points.length === 1) return Math.hypot(points[0].x - center.x, points[0].y - center.y) < radius
  for (let i = 0; i < points.length - 1; i++) {
    if (ptSegDist(center, points[i], points[i + 1]) < radius) return true
  }
  return false
}

/** Split a pencil/highlighter path precisely at the eraser circle boundary. */
function splitPathByEraser(ann: Annotation, center: Point, radius: number): Annotation[] {
  const results: Point[][] = []
  let current: Point[] = []

  const isInside = (p: Point) => Math.hypot(p.x - center.x, p.y - center.y) <= radius

  for (let i = 0; i < ann.points.length; i++) {
    const pt = ann.points[i]
    const ptIn = isInside(pt)

    if (i === 0) {
      if (!ptIn) current.push(pt)
      continue
    }

    const prev = ann.points[i - 1]
    const prevIn = isInside(prev)

    if (!prevIn && !ptIn) {
      // Both outside — check if segment passes through circle
      const crossings = circleSegIntersections(center, radius, prev, pt)
      if (crossings.length === 2) {
        current.push(crossings[0])
        if (current.length >= 2) results.push(current)
        current = [crossings[1], pt]
      } else {
        current.push(pt)
      }
    } else if (!prevIn && ptIn) {
      // Outside → inside: find entry, end segment
      const crossings = circleSegIntersections(center, radius, prev, pt)
      if (crossings.length > 0) current.push(crossings[0])
      if (current.length >= 2) results.push(current)
      current = []
    } else if (prevIn && !ptIn) {
      // Inside → outside: find exit, start new segment
      const crossings = circleSegIntersections(center, radius, prev, pt)
      current = crossings.length > 0 ? [crossings[crossings.length - 1], pt] : [pt]
    }
    // else: both inside — skip
  }

  if (current.length >= 2) results.push(current)
  return results.map(pts => ({ ...ann, id: genId(), points: pts }))
}

// ── PDF coordinate transform for export ─────────────

function toPdfCoords(p: Point, origW: number, origH: number, rotation: number): { x: number; y: number } {
  switch (((rotation % 360) + 360) % 360) {
    case 90:  return { x: p.y, y: p.x }
    case 180: return { x: origW - p.x, y: p.y }
    case 270: return { x: origW - p.y, y: origH - p.x }
    default:  return { x: p.x, y: origH - p.y }
  }
}

// ── Canvas drawing ─────────────────────────────────────

function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation, scale: number) {
  const pts = ann.points
  ctx.save()
  ctx.globalAlpha = ann.opacity
  ctx.strokeStyle = ann.color
  ctx.fillStyle = ann.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = ann.strokeWidth * scale

  if (ann.type === 'highlighter') {
    ctx.globalCompositeOperation = 'multiply'
  }

  switch (ann.type) {
    case 'pencil':
    case 'highlighter': {
      if (pts.length < 2) break
      ctx.beginPath()
      ctx.moveTo(pts[0].x * scale, pts[0].y * scale)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * scale, pts[i].y * scale)
      ctx.stroke()
      break
    }
    case 'line': {
      if (pts.length < 2) break
      ctx.beginPath()
      ctx.moveTo(pts[0].x * scale, pts[0].y * scale)
      ctx.lineTo(pts[1].x * scale, pts[1].y * scale)
      ctx.stroke()
      break
    }
    case 'arrow': {
      if (pts.length < 2) break
      const sx = pts[0].x * scale, sy = pts[0].y * scale
      const ex = pts[1].x * scale, ey = pts[1].y * scale
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke()
      const angle = Math.atan2(ey - sy, ex - sx)
      const hl = Math.max(12, ann.strokeWidth * scale * 4)
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - hl * Math.cos(angle - Math.PI / 6), ey - hl * Math.sin(angle - Math.PI / 6))
      ctx.lineTo(ex - hl * Math.cos(angle + Math.PI / 6), ey - hl * Math.sin(angle + Math.PI / 6))
      ctx.closePath(); ctx.fill()
      break
    }
    case 'rectangle': {
      if (pts.length < 2) break
      ctx.strokeRect(
        Math.min(pts[0].x, pts[1].x) * scale, Math.min(pts[0].y, pts[1].y) * scale,
        Math.abs(pts[1].x - pts[0].x) * scale, Math.abs(pts[1].y - pts[0].y) * scale,
      )
      break
    }
    case 'cloud': {
      if (pts.length < 2) break
      const x1 = Math.min(pts[0].x, pts[1].x) * scale
      const y1 = Math.min(pts[0].y, pts[1].y) * scale
      const x2 = Math.max(pts[0].x, pts[1].x) * scale
      const y2 = Math.max(pts[0].y, pts[1].y) * scale
      if (x2 - x1 < 4 || y2 - y1 < 4) break
      const arcSize = 20 * scale
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      drawCloudEdge(ctx, x1, y1, x2, y1, arcSize)
      drawCloudEdge(ctx, x2, y1, x2, y2, arcSize)
      drawCloudEdge(ctx, x2, y2, x1, y2, arcSize)
      drawCloudEdge(ctx, x1, y2, x1, y1, arcSize)
      ctx.closePath()
      ctx.stroke()
      break
    }
    case 'circle': {
      if (pts.length < 2) break
      const cx = ((pts[0].x + pts[1].x) / 2) * scale
      const cy = ((pts[0].y + pts[1].y) / 2) * scale
      const rx = (Math.abs(pts[1].x - pts[0].x) / 2) * scale
      const ry = (Math.abs(pts[1].y - pts[0].y) / 2) * scale
      if (rx > 0 && ry > 0) {
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke()
      }
      break
    }
    case 'text': {
      if (!ann.text || !pts.length) break
      const fs = (ann.fontSize || 16) * scale
      ctx.font = `${fs}px sans-serif`
      ctx.textBaseline = 'top'
      ctx.globalAlpha = ann.opacity

      if (ann.width) {
        // Textbox mode: wrap text within width
        const lines = wrapText(ann.text, ann.width, ann.fontSize || 16)
        const lineH = (ann.fontSize || 16) * 1.3
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], pts[0].x * scale, (pts[0].y + lineH * i) * scale)
        }
      } else {
        // Legacy single-point text
        const lines = ann.text.split('\n')
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], pts[0].x * scale, (pts[0].y + (ann.fontSize || 16) * 1.3 * i) * scale)
        }
      }
      break
    }
  }
  ctx.restore()
}

// ── Selection UI drawing ────────────────────────────────

function drawSelectionUI(ctx: CanvasRenderingContext2D, ann: Annotation, scale: number) {
  if (ann.type !== 'text' || !ann.width || !ann.height || !ann.points.length) return
  const { x, y } = ann.points[0]
  const sx = x * scale, sy = y * scale
  const sw = ann.width * scale, sh = ann.height * scale

  ctx.save()
  ctx.strokeStyle = '#3B82F6'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.strokeRect(sx, sy, sw, sh)
  ctx.setLineDash([])

  // Corner handles
  const handles = getHandles(sx, sy, sw, sh)
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#3B82F6'
  ctx.lineWidth = 1.5
  for (const h of handles) {
    ctx.fillRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
    ctx.strokeRect(h.x - HANDLE_SIZE / 2, h.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
  }
  ctx.restore()
}

// ── Thumbnail sidebar item ──────────────────────────────

function ThumbnailItem({ pageNum, thumbnail, isCurrent, isSelected, onVisible, onClick, onDoubleClick }: {
  pageNum: number
  thumbnail?: string
  isCurrent: boolean
  isSelected: boolean
  onVisible: () => void
  onClick: () => void
  onDoubleClick: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (thumbnail) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { onVisible(); observer.disconnect() } },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbnail])

  return (
    <div
      ref={ref}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`cursor-pointer rounded-md overflow-hidden border-2 transition-colors ${
        isCurrent ? 'border-[#F47B20]' :
        isSelected ? 'border-[#F47B20]/50' :
        'border-transparent hover:border-white/20'
      }`}
    >
      {thumbnail ? (
        <img src={thumbnail} alt={`Page ${pageNum}`} className="w-full h-auto" draggable={false} />
      ) : (
        <div className="w-full aspect-[3/4] bg-white/[0.04] flex items-center justify-center">
          <span className="text-[10px] text-white/30">Loading...</span>
        </div>
      )}
      <div className="text-center text-[10px] text-white/40 py-0.5">{pageNum}</div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────

export default function PdfAnnotateTool() {
  // State
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [activeTool, setActiveTool] = useState<ToolType>('pencil')
  const [color, setColor] = useState('#F47B20')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [opacity, setOpacity] = useState(100)
  const [fontSize, setFontSize] = useState(16)
  const [zoom, setZoom] = useState(1.0)
  const [annotations, setAnnotations] = useState<PageAnnotations>({})
  const [isExporting, setIsExporting] = useState(false)
  const [pdfReady, setPdfReady] = useState(0)

  // Shapes dropdown
  const [shapesDropdownOpen, setShapesDropdownOpen] = useState(false)
  const [activeDraw, setActiveDraw] = useState<ToolType>('pencil')

  // Straight-line mode
  const [straightLineMode, setStraightLineMode] = useState(false)

  // Eraser
  const [eraserRadius, setEraserRadius] = useState(15)
  const [eraserCursorPos, setEraserCursorPos] = useState<Point | null>(null)
  const eraserModsRef = useRef<{ removed: Set<string>; added: Annotation[] }>({ removed: new Set(), added: [] })

  // Rotation
  const [pageRotations, setPageRotations] = useState<Record<number, number>>({})

  // Text tool — PowerPoint style
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [editingTextValue, setEditingTextValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const textDragRef = useRef<{
    mode: 'move' | HandleId
    startPt: Point
    origPoints: Point[]
    origWidth: number
    origHeight: number
  } | null>(null)

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({})
  const [selectedThumbPage, setSelectedThumbPage] = useState<number | null>(null)
  const loadingThumbs = useRef(new Set<number>())

  // Refs
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const annCanvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const shapesDropdownRef = useRef<HTMLDivElement>(null)
  const isDrawingRef = useRef(false)
  const currentPtsRef = useRef<Point[]>([])
  const pageDimsRef = useRef({ width: 0, height: 0 })

  // History
  const historyRef = useRef<PageAnnotations[]>([{}])
  const historyIdxRef = useRef(0)
  const [, forceRender] = useState(0)

  const canUndo = historyIdxRef.current > 0
  const canRedo = historyIdxRef.current < historyRef.current.length - 1

  const isDrawTool = DRAW_TYPES.has(activeTool)
  const currentRotation = pageRotations[currentPage] || 0

  // ── Coordinate conversion ────────────────────────────

  const getPoint = useCallback((e: { clientX: number; clientY: number }): Point => {
    const canvas = annCanvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(pageDimsRef.current.width,
        ((e.clientX - rect.left) / rect.width) * canvas.width / RENDER_SCALE)),
      y: Math.max(0, Math.min(pageDimsRef.current.height,
        ((e.clientY - rect.top) / rect.height) * canvas.height / RENDER_SCALE)),
    }
  }, [])

  // ── Annotation helpers ─────────────────────────────

  const getAnnotation = useCallback((id: string): Annotation | undefined => {
    return (annotations[currentPage] || []).find(a => a.id === id)
  }, [annotations, currentPage])

  const findTextAnnotationAt = useCallback((pt: Point): Annotation | undefined => {
    const pageAnns = annotations[currentPage] || []
    // Search in reverse (top-most first)
    for (let i = pageAnns.length - 1; i >= 0; i--) {
      const ann = pageAnns[i]
      if (ann.type === 'text' && hitTest(pt, ann, 4)) return ann
    }
    return undefined
  }, [annotations, currentPage])

  // ── Render helpers ───────────────────────────────────

  const redraw = useCallback(() => {
    const canvas = annCanvasRef.current
    if (!canvas || canvas.width === 0) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const mods = eraserModsRef.current
    const pageAnns = (annotations[currentPage] || [])
      .filter(a => !mods.removed.has(a.id))
    for (const ann of pageAnns) {
      drawAnnotation(ctx, ann, RENDER_SCALE)
      // Draw selection UI for selected text
      if (ann.id === selectedAnnId) drawSelectionUI(ctx, ann, RENDER_SCALE)
    }

    // Draw eraser-added fragments
    for (const frag of mods.added) drawAnnotation(ctx, frag, RENDER_SCALE)

    // In-progress stroke
    if (isDrawingRef.current && activeTool !== 'eraser' && activeTool !== 'text') {
      const pts = currentPtsRef.current
      if (pts.length > 0) {
        const inProgress: Annotation = {
          id: '_progress', type: activeTool,
          points: pts, color, fontSize,
          strokeWidth: activeTool === 'highlighter' ? strokeWidth * 3 : strokeWidth,
          opacity: activeTool === 'highlighter' ? 0.4 : opacity / 100,
        }
        drawAnnotation(ctx, inProgress, RENDER_SCALE)
      }
    }

    // In-progress textbox creation
    if (isDrawingRef.current && activeTool === 'text') {
      const pts = currentPtsRef.current
      if (pts.length >= 2) {
        ctx.save()
        ctx.strokeStyle = '#3B82F6'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        const x = Math.min(pts[0].x, pts[1].x) * RENDER_SCALE
        const y = Math.min(pts[0].y, pts[1].y) * RENDER_SCALE
        const w = Math.abs(pts[1].x - pts[0].x) * RENDER_SCALE
        const h = Math.abs(pts[1].y - pts[0].y) * RENDER_SCALE
        ctx.strokeRect(x, y, w, h)
        ctx.setLineDash([])
        ctx.restore()
      }
    }
  }, [annotations, currentPage, activeTool, selectedAnnId, color, strokeWidth, opacity, fontSize])

  // ── History management ───────────────────────────────

  const pushHistory = useCallback((next: PageAnnotations) => {
    const h = historyRef.current.slice(0, historyIdxRef.current + 1)
    h.push(structuredClone(next))
    if (h.length > MAX_HISTORY) h.shift()
    historyRef.current = h
    historyIdxRef.current = h.length - 1
    forceRender(v => v + 1)
  }, [])

  const commitAnnotation = useCallback((ann: Annotation) => {
    setAnnotations(prev => {
      const next = { ...prev, [currentPage]: [...(prev[currentPage] || []), ann] }
      pushHistory(next)
      return next
    })
  }, [currentPage, pushHistory])

  const updateAnnotation = useCallback((id: string, update: Partial<Annotation>) => {
    setAnnotations(prev => {
      const next = {
        ...prev,
        [currentPage]: (prev[currentPage] || []).map(a => a.id === id ? { ...a, ...update } : a),
      }
      pushHistory(next)
      return next
    })
  }, [currentPage, pushHistory])

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations(prev => {
      const next = { ...prev, [currentPage]: (prev[currentPage] || []).filter(a => a.id !== id) }
      pushHistory(next)
      return next
    })
  }, [currentPage, pushHistory])

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current--
    setAnnotations(structuredClone(historyRef.current[historyIdxRef.current]))
    forceRender(v => v + 1)
    setSelectedAnnId(null)
    setEditingTextId(null)
  }, [])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current++
    setAnnotations(structuredClone(historyRef.current[historyIdxRef.current]))
    forceRender(v => v + 1)
    setSelectedAnnId(null)
    setEditingTextId(null)
  }, [])

  // ── Text editing ─────────────────────────────────────

  const commitTextEditing = useCallback(() => {
    if (!editingTextId) return
    const text = editingTextValue.trim()
    if (text) {
      updateAnnotation(editingTextId, { text })
    } else {
      removeAnnotation(editingTextId)
      setSelectedAnnId(null)
    }
    setEditingTextId(null)
    setEditingTextValue('')
  }, [editingTextId, editingTextValue, updateAnnotation, removeAnnotation])

  const enterEditMode = useCallback((annId: string) => {
    const ann = (annotations[currentPage] || []).find(a => a.id === annId)
    if (!ann || ann.type !== 'text') return
    setEditingTextId(annId)
    setEditingTextValue(ann.text || '')
    setSelectedAnnId(annId)
  }, [annotations, currentPage])

  // ── Fit to window ──────────────────────────────────

  const fitToWindow = useCallback(() => {
    if (!scrollRef.current || !pdfCanvasRef.current || pdfCanvasRef.current.width === 0) return
    const containerW = scrollRef.current.clientWidth - 48
    const containerH = scrollRef.current.clientHeight - 48
    const canvasW = pdfCanvasRef.current.width
    const canvasH = pdfCanvasRef.current.height
    const scaleW = containerW / canvasW
    const scaleH = containerH / canvasH
    setZoom(Math.round(Math.max(0.25, Math.min(4.0, Math.min(scaleW, scaleH))) * 100) / 100)
  }, [])

  // ── Rotation ─────────────────────────────────────────

  const rotatePage = useCallback((delta: number) => {
    setPageRotations(prev => {
      const current = prev[currentPage] || 0
      return { ...prev, [currentPage]: ((current + delta) % 360 + 360) % 360 }
    })
    // Clear thumbnails for this page since it changed
    setThumbnails(prev => {
      const next = { ...prev }
      delete next[currentPage]
      return next
    })
    loadingThumbs.current.delete(currentPage)
  }, [currentPage])

  // ── PDF loading ──────────────────────────────────────

  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const pdf = await loadPDFFile(file)
    setPdfFile(pdf)
    setCurrentPage(1)
    setAnnotations({})
    historyRef.current = [{}]
    historyIdxRef.current = 0
    setZoom(1.0)
    setThumbnails({})
    loadingThumbs.current.clear()
    setSelectedThumbPage(null)
    setPageRotations({})
    setSelectedAnnId(null)
    setEditingTextId(null)
  }, [])

  // ── Thumbnail loading ────────────────────────────────

  const loadThumbnail = useCallback(async (pageNum: number) => {
    if (loadingThumbs.current.has(pageNum) || !pdfFile) return
    loadingThumbs.current.add(pageNum)
    try {
      const thumb = await generateThumbnail(pdfFile, pageNum, 150)
      setThumbnails(prev => ({ ...prev, [pageNum]: thumb }))
    } catch {
      loadingThumbs.current.delete(pageNum)
    }
  }, [pdfFile])

  // ── Render PDF page ──────────────────────────────────

  useEffect(() => {
    if (!pdfFile || !pdfCanvasRef.current || !annCanvasRef.current) return
    const rotation = pageRotations[currentPage] || 0
    const render = async () => {
      const canvas = pdfCanvasRef.current!
      await renderPageToCanvas(pdfFile, currentPage, canvas, RENDER_SCALE, rotation)
      pageDimsRef.current = { width: canvas.width / RENDER_SCALE, height: canvas.height / RENDER_SCALE }
      const ann = annCanvasRef.current!
      ann.width = canvas.width
      ann.height = canvas.height
      setPdfReady(v => v + 1)
      requestAnimationFrame(() => fitToWindow())
    }
    render()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFile, currentPage, fitToWindow, pageRotations[currentPage]])

  // ── Re-render annotations ────────────────────────────

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { redraw() }, [pdfReady, annotations, selectedAnnId])

  // ── Keyboard shortcuts ───────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (editingTextId) return // Don't intercept while editing text
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (mod && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      else if (mod && e.key === 'y') { e.preventDefault(); redo() }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnId && !editingTextId) {
        e.preventDefault()
        removeAnnotation(selectedAnnId)
        setSelectedAnnId(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, selectedAnnId, editingTextId, removeAnnotation])

  // ── Zoom with scroll wheel ───────────────────────────

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      setZoom(prev => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1
        return Math.round(Math.max(0.25, Math.min(4.0, prev + delta)) * 100) / 100
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── Clear in-progress when tool changes ──────────────

  useEffect(() => {
    isDrawingRef.current = false
    currentPtsRef.current = []
    eraserModsRef.current = { removed: new Set(), added: [] }
    setStraightLineMode(false)
    setEraserCursorPos(null)
    setSelectedAnnId(null)
    if (editingTextId) {
      // Commit any open text edit
      commitTextEditing()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool])

  // ── Close shapes dropdown on outside click ───────────

  useEffect(() => {
    if (!shapesDropdownOpen) return
    const handler = (e: PointerEvent) => {
      if (shapesDropdownRef.current && !shapesDropdownRef.current.contains(e.target as Node)) {
        setShapesDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [shapesDropdownOpen])

  // ── Focus textarea when editing ──────────────────────

  useEffect(() => {
    if (editingTextId && textareaRef.current) {
      textareaRef.current.focus()
      // Place cursor at end
      textareaRef.current.selectionStart = textareaRef.current.value.length
    }
  }, [editingTextId])

  // ── Pointer handlers ─────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const pt = getPoint(e)

    // ── Text tool: PowerPoint-style ──
    if (activeTool === 'text') {
      // If editing, commit first
      if (editingTextId) {
        commitTextEditing()
      }

      // Check if clicking a resize handle on selected annotation
      if (selectedAnnId) {
        const ann = getAnnotation(selectedAnnId)
        if (ann && ann.type === 'text' && ann.width && ann.height) {
          const handleThreshold = HANDLE_SIZE / zoom + 4
          const handle = hitTestHandle(pt, ann, handleThreshold)
          if (handle) {
            isDrawingRef.current = true
            textDragRef.current = {
              mode: handle,
              startPt: pt,
              origPoints: [...ann.points],
              origWidth: ann.width,
              origHeight: ann.height,
            }
            return
          }

          // Check if clicking inside the selected textbox → enter edit mode
          if (hitTest(pt, ann, 4)) {
            enterEditMode(ann.id)
            return
          }
        }
      }

      // Check if clicking on an existing text annotation
      const hitAnn = findTextAnnotationAt(pt)
      if (hitAnn) {
        if (hitAnn.id === selectedAnnId) {
          // Already selected, enter edit
          enterEditMode(hitAnn.id)
        } else {
          // Select it
          setSelectedAnnId(hitAnn.id)
          // Double-click to edit
          if (e.detail >= 2) {
            enterEditMode(hitAnn.id)
          }
          // Start move drag
          if (hitAnn.width && hitAnn.height) {
            isDrawingRef.current = true
            textDragRef.current = {
              mode: 'move',
              startPt: pt,
              origPoints: [...hitAnn.points],
              origWidth: hitAnn.width,
              origHeight: hitAnn.height,
            }
          }
        }
        return
      }

      // Click on empty space — deselect or start creating textbox
      setSelectedAnnId(null)
      isDrawingRef.current = true
      currentPtsRef.current = [pt]
      return
    }

    isDrawingRef.current = true

    if (activeTool === 'eraser') {
      eraserModsRef.current = { removed: new Set(), added: [] }
      const docRadius = eraserRadius / (zoom * RENDER_SCALE)
      const pageAnns = annotations[currentPage] || []
      for (const ann of pageAnns) {
        if (ann.type === 'pencil' || ann.type === 'highlighter') {
          const hasHit = pathHitsCircle(ann.points, pt, docRadius)
          if (hasHit) {
            eraserModsRef.current.removed.add(ann.id)
            eraserModsRef.current.added.push(...splitPathByEraser(ann, pt, docRadius))
          }
        } else if (hitTest(pt, ann, docRadius)) {
          eraserModsRef.current.removed.add(ann.id)
        }
      }
      redraw()
      return
    }

    currentPtsRef.current = [pt]
    redraw()
  }, [getPoint, activeTool, annotations, currentPage, editingTextId, selectedAnnId,
      commitTextEditing, getAnnotation, findTextAnnotationAt, enterEditMode, redraw,
      eraserRadius, zoom, color, fontSize, opacity])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Eraser cursor
    if (activeTool === 'eraser' && annCanvasRef.current) {
      const rect = annCanvasRef.current.getBoundingClientRect()
      setEraserCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }

    if (!isDrawingRef.current) return
    const pt = getPoint(e)

    // Text tool: move/resize drag
    if (activeTool === 'text' && textDragRef.current) {
      const drag = textDragRef.current
      const dx = pt.x - drag.startPt.x
      const dy = pt.y - drag.startPt.y

      if (drag.mode === 'move') {
        const newX = drag.origPoints[0].x + dx
        const newY = drag.origPoints[0].y + dy
        // Live update without history
        setAnnotations(prev => ({
          ...prev,
          [currentPage]: (prev[currentPage] || []).map(a =>
            a.id === selectedAnnId ? { ...a, points: [{ x: newX, y: newY }] } : a
          ),
        }))
      } else {
        // Resize
        const { origPoints, origWidth, origHeight } = drag
        let newX = origPoints[0].x, newY = origPoints[0].y
        let newW = origWidth, newH = origHeight

        switch (drag.mode) {
          case 'se': newW = Math.max(40, origWidth + dx); newH = Math.max(20, origHeight + dy); break
          case 'sw': newX = origPoints[0].x + dx; newW = Math.max(40, origWidth - dx); newH = Math.max(20, origHeight + dy); break
          case 'ne': newW = Math.max(40, origWidth + dx); newY = origPoints[0].y + dy; newH = Math.max(20, origHeight - dy); break
          case 'nw': newX = origPoints[0].x + dx; newY = origPoints[0].y + dy; newW = Math.max(40, origWidth - dx); newH = Math.max(20, origHeight - dy); break
        }

        setAnnotations(prev => ({
          ...prev,
          [currentPage]: (prev[currentPage] || []).map(a =>
            a.id === selectedAnnId ? { ...a, points: [{ x: newX, y: newY }], width: newW, height: newH } : a
          ),
        }))
      }
      return
    }

    // Text tool: creating textbox
    if (activeTool === 'text') {
      currentPtsRef.current = [currentPtsRef.current[0], pt]
      redraw()
      return
    }

    if (activeTool === 'eraser') {
      const docRadius = eraserRadius / (zoom * RENDER_SCALE)
      const mods = eraserModsRef.current
      const pageAnns = annotations[currentPage] || []
      for (const ann of pageAnns) {
        if (mods.removed.has(ann.id)) continue
        if (ann.type === 'pencil' || ann.type === 'highlighter') {
          const hasHit = pathHitsCircle(ann.points, pt, docRadius)
          if (hasHit) {
            mods.removed.add(ann.id)
            mods.added.push(...splitPathByEraser(ann, pt, docRadius))
          }
        } else if (hitTest(pt, ann, docRadius)) {
          mods.removed.add(ann.id)
        }
      }
      const newAdded: Annotation[] = []
      for (const frag of mods.added) {
        if (frag.type === 'pencil' || frag.type === 'highlighter') {
          const hasHit = pathHitsCircle(frag.points, pt, docRadius)
          if (hasHit) {
            newAdded.push(...splitPathByEraser(frag, pt, docRadius))
          } else {
            newAdded.push(frag)
          }
        } else if (hitTest(pt, frag, docRadius)) {
          // remove
        } else {
          newAdded.push(frag)
        }
      }
      mods.added = newAdded
      redraw()
      return
    }

    if (activeTool === 'pencil' || activeTool === 'highlighter') {
      if (straightLineMode) {
        currentPtsRef.current = [currentPtsRef.current[0], pt]
      } else {
        currentPtsRef.current.push(pt)
      }
    } else {
      currentPtsRef.current = [currentPtsRef.current[0], pt]
    }
    redraw()
  }, [getPoint, activeTool, annotations, currentPage, redraw, eraserRadius, zoom, straightLineMode, selectedAnnId])

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    // Text tool: finish move/resize or create textbox
    if (activeTool === 'text') {
      if (textDragRef.current) {
        // Commit move/resize to history
        const ann = getAnnotation(selectedAnnId!)
        if (ann) {
          pushHistory(structuredClone(annotations))
        }
        textDragRef.current = null
        return
      }

      // Creating new textbox
      const pts = currentPtsRef.current
      if (pts.length >= 2) {
        const x = Math.min(pts[0].x, pts[1].x)
        const y = Math.min(pts[0].y, pts[1].y)
        const w = Math.abs(pts[1].x - pts[0].x)
        const h = Math.abs(pts[1].y - pts[0].y)

        // If drag was big enough, create a custom-sized box
        const boxW = w > 20 ? w : DEFAULT_TEXTBOX_W
        const boxH = h > 20 ? h : DEFAULT_TEXTBOX_H
        const boxX = w > 20 ? x : pts[0].x
        const boxY = h > 20 ? y : pts[0].y

        const newAnn: Annotation = {
          id: genId(), type: 'text',
          points: [{ x: boxX, y: boxY }],
          color, fontSize, strokeWidth: 1,
          opacity: opacity / 100,
          text: '',
          width: boxW,
          height: boxH,
        }
        commitAnnotation(newAnn)
        setSelectedAnnId(newAnn.id)
        setEditingTextId(newAnn.id)
        setEditingTextValue('')
      }
      currentPtsRef.current = []
      redraw()
      return
    }

    if (activeTool === 'eraser') {
      const mods = eraserModsRef.current
      if (mods.removed.size > 0 || mods.added.length > 0) {
        setAnnotations(prev => {
          const page = prev[currentPage] || []
          const surviving = page.filter(a => !mods.removed.has(a.id))
          const next = { ...prev, [currentPage]: [...surviving, ...mods.added] }
          pushHistory(next)
          return next
        })
      }
      eraserModsRef.current = { removed: new Set(), added: [] }
      return
    }

    const pts = currentPtsRef.current
    if (pts.length < 2) {
      currentPtsRef.current = []
      redraw()
      return
    }

    const isHL = activeTool === 'highlighter'
    const ann: Annotation = {
      id: genId(),
      type: activeTool as Exclude<ToolType, 'eraser'>,
      points: [...pts],
      color,
      strokeWidth: isHL ? strokeWidth * 3 : strokeWidth,
      opacity: isHL ? 0.4 : opacity / 100,
      fontSize,
    }
    currentPtsRef.current = []
    commitAnnotation(ann)
  }, [activeTool, color, strokeWidth, opacity, fontSize, commitAnnotation, currentPage,
      pushHistory, redraw, annotations, getAnnotation, selectedAnnId])

  // ── Export annotated PDF ─────────────────────────────

  const handleExport = useCallback(async () => {
    if (!pdfFile) return
    // Commit any editing
    if (editingTextId) commitTextEditing()
    setIsExporting(true)
    try {
      const doc = await PDFDocument.load(pdfFile.data)
      const pages = doc.getPages()

      for (const [pageStr, pageAnns] of Object.entries(annotations)) {
        const pageNum = parseInt(pageStr)
        if (pageNum < 1 || pageNum > pages.length || !pageAnns.length) continue

        const page = pages[pageNum - 1]
        const { width: origW, height: origH } = page.getSize()
        const rotation = pageRotations[pageNum] || 0

        // Apply rotation
        if (rotation !== 0) {
          const existingRot = page.getRotation().angle
          page.setRotation(degrees((existingRot + rotation) % 360))
        }

        for (const ann of pageAnns) {
          const r = parseInt(ann.color.slice(1, 3), 16) / 255
          const g = parseInt(ann.color.slice(3, 5), 16) / 255
          const bv = parseInt(ann.color.slice(5, 7), 16) / 255
          const c = rgb(r, g, bv)

          // Transform points to PDF coordinates
          const toPC = (p: Point) => toPdfCoords(p, origW, origH, rotation)

          switch (ann.type) {
            case 'pencil':
            case 'highlighter':
              for (let i = 0; i < ann.points.length - 1; i++) {
                const s = toPC(ann.points[i])
                const e = toPC(ann.points[i + 1])
                page.drawLine({
                  start: s, end: e,
                  thickness: ann.strokeWidth, color: c, opacity: ann.opacity,
                })
              }
              break
            case 'line':
              if (ann.points.length < 2) break
              page.drawLine({
                start: toPC(ann.points[0]), end: toPC(ann.points[1]),
                thickness: ann.strokeWidth, color: c, opacity: ann.opacity,
              })
              break
            case 'arrow': {
              if (ann.points.length < 2) break
              const s = toPC(ann.points[0])
              const e = toPC(ann.points[1])
              page.drawLine({ start: s, end: e, thickness: ann.strokeWidth, color: c, opacity: ann.opacity })
              const pdfAngle = Math.atan2(e.y - s.y, e.x - s.x)
              const hl = Math.max(8, ann.strokeWidth * 4)
              page.drawLine({
                start: e,
                end: { x: e.x - hl * Math.cos(pdfAngle - Math.PI / 6), y: e.y - hl * Math.sin(pdfAngle - Math.PI / 6) },
                thickness: ann.strokeWidth, color: c, opacity: ann.opacity,
              })
              page.drawLine({
                start: e,
                end: { x: e.x - hl * Math.cos(pdfAngle + Math.PI / 6), y: e.y - hl * Math.sin(pdfAngle + Math.PI / 6) },
                thickness: ann.strokeWidth, color: c, opacity: ann.opacity,
              })
              break
            }
            case 'rectangle': {
              if (ann.points.length < 2) break
              const tl = toPC({ x: Math.min(ann.points[0].x, ann.points[1].x), y: Math.max(ann.points[0].y, ann.points[1].y) })
              const w = Math.abs(ann.points[1].x - ann.points[0].x)
              const h = Math.abs(ann.points[1].y - ann.points[0].y)
              page.drawRectangle({
                x: tl.x, y: tl.y,
                width: w, height: h,
                borderWidth: ann.strokeWidth, borderColor: c, borderOpacity: ann.opacity,
              })
              break
            }
            case 'cloud': {
              if (ann.points.length < 2) break
              const [p1, p2] = ann.points
              const x1 = Math.min(p1.x, p2.x), y1 = Math.min(p1.y, p2.y)
              const x2 = Math.max(p1.x, p2.x), y2 = Math.max(p1.y, p2.y)
              const cloudEdges: [Point, Point][] = [
                [{ x: x1, y: y1 }, { x: x2, y: y1 }],
                [{ x: x2, y: y1 }, { x: x2, y: y2 }],
                [{ x: x2, y: y2 }, { x: x1, y: y2 }],
                [{ x: x1, y: y2 }, { x: x1, y: y1 }],
              ]
              for (const [start, end] of cloudEdges) {
                const edgeLen = Math.hypot(end.x - start.x, end.y - start.y)
                const arcSz = 20
                const numBumps = Math.max(2, Math.round(edgeLen / arcSz))
                const ddx = (end.x - start.x) / numBumps
                const ddy = (end.y - start.y) / numBumps
                const len = Math.hypot(ddx, ddy)
                if (len === 0) continue
                const nx = (-ddy / len) * arcSz * 0.4
                const ny = (ddx / len) * arcSz * 0.4
                for (let i = 0; i < numBumps; i++) {
                  const sx = start.x + ddx * i, sy = start.y + ddy * i
                  const ex = start.x + ddx * (i + 1), ey = start.y + ddy * (i + 1)
                  const mx = (sx + ex) / 2 + nx, my = (sy + ey) / 2 + ny
                  page.drawLine({ start: toPC({ x: sx, y: sy }), end: toPC({ x: mx, y: my }), thickness: ann.strokeWidth, color: c, opacity: ann.opacity })
                  page.drawLine({ start: toPC({ x: mx, y: my }), end: toPC({ x: ex, y: ey }), thickness: ann.strokeWidth, color: c, opacity: ann.opacity })
                }
              }
              break
            }
            case 'circle': {
              if (ann.points.length < 2) break
              const [c1, c2] = ann.points
              const center = toPC({ x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 })
              page.drawEllipse({
                x: center.x, y: center.y,
                xScale: Math.abs(c2.x - c1.x) / 2,
                yScale: Math.abs(c2.y - c1.y) / 2,
                borderWidth: ann.strokeWidth, borderColor: c, borderOpacity: ann.opacity,
              })
              break
            }
            case 'text': {
              if (!ann.text || !ann.points.length) break
              const fs = ann.fontSize || 16
              const lines = ann.width ? wrapText(ann.text, ann.width, fs) : ann.text.split('\n')
              for (let i = 0; i < lines.length; i++) {
                const linePt = toPC({ x: ann.points[0].x, y: ann.points[0].y + fs * 1.3 * i + fs })
                page.drawText(lines[i], {
                  x: linePt.x, y: linePt.y,
                  size: fs, color: c, opacity: ann.opacity,
                })
              }
              break
            }
          }
        }
      }

      // Apply rotation to pages without annotations too
      for (const [pageStr, rot] of Object.entries(pageRotations)) {
        const pageNum = parseInt(pageStr)
        if (rot === 0 || pageNum < 1 || pageNum > pages.length) continue
        if (annotations[pageNum]?.length) continue // already handled above
        const page = pages[pageNum - 1]
        const existingRot = page.getRotation().angle
        page.setRotation(degrees((existingRot + rot) % 360))
      }

      const pdfBytes = await doc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const fileName = `${pdfFile.name.replace(/\.pdf$/i, '')}-annotated.pdf`

      let saved = false
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          saved = true
        } catch (e: any) {
          if (e?.name === 'AbortError') return
        }
      }
      if (!saved) downloadBlob(blob, fileName)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsExporting(false)
    }
  }, [pdfFile, annotations, pageRotations, editingTextId, commitTextEditing])

  // ── Reset ────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPdfFile(null)
    setAnnotations({})
    historyRef.current = [{}]
    historyIdxRef.current = 0
    setCurrentPage(1)
    setZoom(1.0)
    setThumbnails({})
    setSidebarOpen(false)
    setSelectedThumbPage(null)
    loadingThumbs.current.clear()
    setPageRotations({})
    setSelectedAnnId(null)
    setEditingTextId(null)
    setEditingTextValue('')
  }, [])

  // ── Render ───────────────────────────────────────────

  if (!pdfFile) {
    return (
      <FileDropZone
        onFiles={handleFiles}
        accept="application/pdf"
        multiple={false}
        label="Drop a PDF file here"
        description="Annotate with pencil, shapes, text & more"
        className="h-full"
      />
    )
  }

  const zoomPct = Math.round(zoom * 100)
  const activeDrawDef = DRAW_TOOLS.find(s => s.type === activeTool) || DRAW_TOOLS.find(s => s.type === activeDraw)!
  const ActiveDrawIcon = activeDrawDef.icon

  // Get the editing text annotation for textarea overlay
  const editingAnn = editingTextId ? getAnnotation(editingTextId) : null

  return (
    <div className="h-full flex flex-col">
      {/* ── Toolbar ─────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] flex-shrink-0 flex-wrap">
        {/* Sidebar toggle */}
        {pdfFile.pageCount > 1 && (
          <>
            <button onClick={() => setSidebarOpen(o => !o)} title="Page thumbnails"
              className={`p-1.5 rounded-md transition-colors ${
                sidebarOpen ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
              }`}>
              <PanelLeft size={16} />
            </button>
            <div className="w-px h-5 bg-white/[0.08] mx-1" />
          </>
        )}

        {/* Draw tools dropdown */}
        <div ref={shapesDropdownRef} className="relative">
          <button
            onClick={() => { if (!isDrawTool) setActiveTool(activeDraw); setShapesDropdownOpen(o => !o) }}
            title={activeDrawDef.label}
            className={`p-1.5 rounded-md flex items-center gap-0.5 transition-colors ${
              isDrawTool ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
            }`}>
            <ActiveDrawIcon size={16} />
            <ChevronDown size={10} className="opacity-50" />
          </button>
          {shapesDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-[#001a24] border border-white/[0.1] rounded-lg shadow-lg z-50 py-1 min-w-[140px]">
              {DRAW_TOOLS.map(s => (
                <button key={s.type}
                  onClick={() => { setActiveTool(s.type); setActiveDraw(s.type); setShapesDropdownOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                    activeTool === s.type ? 'bg-[#F47B20]/20 text-[#F47B20]' : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                  }`}>
                  <s.icon size={14} />
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Highlighter */}
        <button onClick={() => setActiveTool('highlighter')} title="Highlighter"
          className={`p-1.5 rounded-md transition-colors ${
            activeTool === 'highlighter' ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
          }`}>
          <Highlighter size={16} />
        </button>

        {/* Text */}
        <button onClick={() => setActiveTool('text')} title="Text Box"
          className={`p-1.5 rounded-md transition-colors ${
            activeTool === 'text' ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
          }`}>
          <Type size={16} />
        </button>

        {/* Eraser */}
        <button onClick={() => setActiveTool('eraser')} title="Eraser"
          className={`p-1.5 rounded-md transition-colors ${
            activeTool === 'eraser' ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
          }`}>
          <Eraser size={16} />
        </button>

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        {/* Color */}
        <label className="w-7 h-7 rounded-md border border-white/[0.12] cursor-pointer flex-shrink-0 overflow-hidden"
          style={{ backgroundColor: color }}>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="opacity-0 w-0 h-0" />
        </label>

        {/* Stroke width */}
        {activeTool !== 'text' && activeTool !== 'eraser' && (
          <div className="flex items-center gap-1 ml-1">
            <span className="text-[10px] text-white/40">W</span>
            <input type="range" min={1} max={20} value={strokeWidth}
              onChange={e => setStrokeWidth(Number(e.target.value))}
              className="w-16 h-1 bg-white/[0.08] rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F47B20] [&::-webkit-slider-thumb]:cursor-pointer" />
            <span className="text-[10px] text-white/40 w-4">{strokeWidth}</span>
          </div>
        )}

        {/* Eraser size slider */}
        {activeTool === 'eraser' && (
          <div className="flex items-center gap-1 ml-1">
            <span className="text-[10px] text-white/40">Size</span>
            <input type="range" min={5} max={50} value={eraserRadius}
              onChange={e => setEraserRadius(Number(e.target.value))}
              className="w-16 h-1 bg-white/[0.08] rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F47B20] [&::-webkit-slider-thumb]:cursor-pointer" />
            <span className="text-[10px] text-white/40 w-5">{eraserRadius}</span>
          </div>
        )}

        {/* Text tool: font size */}
        {activeTool === 'text' && (
          <div className="flex items-center gap-1 ml-1">
            <span className="text-[10px] text-white/40">Sz</span>
            <input type="number" min={8} max={72} value={fontSize}
              onChange={e => setFontSize(Math.max(8, Math.min(72, Number(e.target.value))))}
              className="w-12 px-1 py-0.5 text-[10px] bg-dark-surface border border-white/[0.1] rounded text-white text-center" />
          </div>
        )}

        {/* Opacity (not for highlighter or eraser) */}
        {activeTool !== 'highlighter' && activeTool !== 'eraser' && (
          <div className="flex items-center gap-1 ml-1">
            <span className="text-[10px] text-white/40">O</span>
            <input type="range" min={10} max={100} step={5} value={opacity}
              onChange={e => setOpacity(Number(e.target.value))}
              className="w-14 h-1 bg-white/[0.08] rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F47B20] [&::-webkit-slider-thumb]:cursor-pointer" />
            <span className="text-[10px] text-white/40 w-6">{opacity}%</span>
          </div>
        )}

        {/* Straight-line mode toggle */}
        {(activeTool === 'pencil' || activeTool === 'highlighter') && (
          <button onClick={() => setStraightLineMode(m => !m)}
            title={straightLineMode ? 'Straight line mode (click for freehand)' : 'Freehand mode (click for straight)'}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ml-1 ${
              straightLineMode
                ? 'bg-[#F47B20]/20 text-[#F47B20] border border-[#F47B20]/30'
                : 'text-white/40 hover:text-white/60 border border-white/[0.08]'
            }`}>
            {straightLineMode ? 'Straight' : 'Free'}
          </button>
        )}

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        {/* Undo / Redo */}
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08] disabled:opacity-20 disabled:pointer-events-none">
          <Undo2 size={16} />
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08] disabled:opacity-20 disabled:pointer-events-none">
          <Redo2 size={16} />
        </button>

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        {/* Rotation */}
        <button onClick={() => rotatePage(-90)} title="Rotate CCW"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08]">
          <RotateCcw size={16} />
        </button>
        <button onClick={() => rotatePage(90)} title="Rotate CW"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08]">
          <RotateCw size={16} />
        </button>

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        {/* Zoom */}
        <button onClick={() => setZoom(z => Math.round(Math.max(0.25, z - 0.25) * 100) / 100)} title="Zoom out"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08]">
          <ZoomOut size={16} />
        </button>
        <span className="text-[11px] text-white/50 w-10 text-center">{zoomPct}%</span>
        <button onClick={() => setZoom(z => Math.round(Math.min(4.0, z + 0.25) * 100) / 100)} title="Zoom in"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08]">
          <ZoomIn size={16} />
        </button>
        <button onClick={fitToWindow} title="Fit to window"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08]">
          <Maximize size={16} />
        </button>

        <div className="flex-1" />

        {/* Export & Reset */}
        <Button size="sm" onClick={handleExport} disabled={isExporting} icon={<Download size={12} />}>
          {isExporting ? 'Exporting...' : 'Export PDF'}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleReset} icon={<RotateCcw size={12} />}>
          New
        </Button>
      </div>

      {/* ── Content: sidebar + canvas ──────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnail sidebar */}
        {sidebarOpen && (
          <div className="w-48 border-r border-white/[0.06] bg-black/20 flex flex-col flex-shrink-0">
            <div className="px-3 py-2 text-xs text-white/50 font-medium border-b border-white/[0.06]">
              Pages ({pdfFile.pageCount})
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {Array.from({ length: pdfFile.pageCount }, (_, i) => i + 1).map(pageNum => (
                <ThumbnailItem
                  key={pageNum}
                  pageNum={pageNum}
                  thumbnail={thumbnails[pageNum]}
                  isCurrent={pageNum === currentPage}
                  isSelected={pageNum === selectedThumbPage}
                  onVisible={() => loadThumbnail(pageNum)}
                  onClick={() => setSelectedThumbPage(pageNum)}
                  onDoubleClick={() => { setCurrentPage(pageNum); setSelectedThumbPage(null) }}
                />
              ))}
            </div>
            {selectedThumbPage && selectedThumbPage !== currentPage && (
              <div className="p-2 border-t border-white/[0.06]">
                <button
                  onClick={() => { setCurrentPage(selectedThumbPage); setSelectedThumbPage(null) }}
                  className="w-full px-3 py-1.5 text-xs bg-[#F47B20] text-white rounded-md hover:bg-[#E06D15] transition-colors">
                  Load Page {selectedThumbPage}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Canvas area ─────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-auto p-6 bg-black/20 relative group/canvas">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', margin: '0 auto' }} className="relative w-fit">
            <canvas ref={pdfCanvasRef} className="block" />
            <canvas
              ref={annCanvasRef}
              className="absolute top-0 left-0"
              style={{ cursor: activeTool === 'text' && selectedAnnId ? 'default' : CURSOR_MAP[activeTool] }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onMouseLeave={() => { if (activeTool === 'eraser') setEraserCursorPos(null) }}
            />
            {/* Eraser circle cursor */}
            {activeTool === 'eraser' && eraserCursorPos && (
              <div
                className="pointer-events-none absolute border-2 border-white/60 rounded-full mix-blend-difference"
                style={{
                  left: (eraserCursorPos.x - eraserRadius) / zoom,
                  top: (eraserCursorPos.y - eraserRadius) / zoom,
                  width: eraserRadius * 2 / zoom,
                  height: eraserRadius * 2 / zoom,
                }}
              />
            )}
            {/* Floating text editor for PowerPoint-style text boxes */}
            {editingAnn && editingAnn.width && editingAnn.height && (
              <textarea
                ref={textareaRef}
                value={editingTextValue}
                onChange={e => setEditingTextValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    commitTextEditing()
                  }
                }}
                onBlur={() => {
                  // Small delay to allow click events to fire first
                  setTimeout(() => commitTextEditing(), 100)
                }}
                style={{
                  position: 'absolute',
                  left: editingAnn.points[0].x * RENDER_SCALE,
                  top: editingAnn.points[0].y * RENDER_SCALE,
                  width: editingAnn.width * RENDER_SCALE,
                  height: editingAnn.height * RENDER_SCALE,
                  fontSize: (editingAnn.fontSize || 16) * RENDER_SCALE,
                  color: editingAnn.color,
                  lineHeight: '1.3',
                  opacity: editingAnn.opacity,
                }}
                className="bg-transparent border-2 border-[#3B82F6] outline-none resize-none font-sans p-0 m-0 overflow-hidden"
                placeholder="Type here..."
              />
            )}
          </div>

          {/* Page navigation arrows */}
          {pdfFile.pageCount > 1 && (
            <>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full
                  bg-black/40 text-white/40 hover:bg-black/60 hover:text-white/80
                  transition-all opacity-0 group-hover/canvas:opacity-60 hover:!opacity-100
                  disabled:!opacity-0 disabled:pointer-events-none z-10">
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(pdfFile.pageCount, p + 1))}
                disabled={currentPage === pdfFile.pageCount}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full
                  bg-black/40 text-white/40 hover:bg-black/60 hover:text-white/80
                  transition-all opacity-0 group-hover/canvas:opacity-60 hover:!opacity-100
                  disabled:!opacity-0 disabled:pointer-events-none z-10">
                <ChevronRight size={24} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Page navigation footer ─────────────────── */}
      <div className="flex items-center justify-center gap-3 px-3 py-2 border-t border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 truncate max-w-[200px]">{pdfFile.name}</span>
          <span className="text-[10px] text-white/25">{formatFileSize(pdfFile.size)}</span>
          {currentRotation !== 0 && (
            <span className="text-[10px] text-white/25">{currentRotation}°</span>
          )}
        </div>
        <div className="flex-1" />
        {pdfFile.pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
              className="px-2 py-1 text-xs text-white/40 hover:text-white disabled:opacity-30 rounded hover:bg-white/[0.06]">
              Prev
            </button>
            <span className="text-xs text-white/50">
              Page {currentPage} / {pdfFile.pageCount}
            </span>
            <button onClick={() => setCurrentPage(p => Math.min(pdfFile.pageCount, p + 1))} disabled={currentPage === pdfFile.pageCount}
              className="px-2 py-1 text-xs text-white/40 hover:text-white disabled:opacity-30 rounded hover:bg-white/[0.06]">
              Next
            </button>
          </div>
        )}
        <div className="flex items-center gap-1 text-[10px] text-white/25">
          <span>{(annotations[currentPage] || []).length} annotations</span>
          <span>· Ctrl+scroll to zoom</span>
        </div>
      </div>
    </div>
  )
}
