import { useState, useCallback, useRef, useEffect } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { loadPDFFile, renderPageToCanvas, generateThumbnail } from '@/utils/pdf.ts'
import { downloadBlob } from '@/utils/download.ts'
import { formatFileSize } from '@/utils/fileReader.ts'
import type { PDFFile } from '@/types'
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'
import {
  Download, RotateCcw, RotateCw, Undo2, Redo2,
  Pencil, Highlighter, Square, Circle, ArrowUpRight, Minus, Type, Eraser,
  ZoomIn, ZoomOut, Maximize, Cloud, ChevronDown, ChevronLeft, ChevronRight, PanelLeft,
  MessageSquare, X,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────

type ToolType = 'pencil' | 'highlighter' | 'rectangle' | 'circle' | 'arrow' | 'line' | 'text' | 'eraser' | 'cloud' | 'callout'

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
  fontFamily?: string
  width?: number   // textbox width (doc space) — text & callout
  height?: number  // textbox height (doc space) — text & callout
  arrows?: Point[] // callout only: arrow tip positions
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

const TEXT_TOOLS: ToolDef[] = [
  { type: 'text', icon: Type, label: 'Text' },
  { type: 'callout', icon: MessageSquare, label: 'Callout' },
]

const DRAW_TYPES = new Set(DRAW_TOOLS.map(s => s.type))
const TEXT_TYPES = new Set(TEXT_TOOLS.map(s => s.type))

const FONT_FAMILIES = [
  'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Calibri',
  'Times New Roman', 'Georgia', 'Palatino', 'Garamond',
  'Courier New', 'Consolas', 'Monaco', 'Lucida Console',
  'Comic Sans MS', 'Impact',
]

const PDF_FONT_MAP: Record<string, StandardFonts> = {
  'Arial': StandardFonts.Helvetica, 'Helvetica': StandardFonts.Helvetica,
  'Verdana': StandardFonts.Helvetica, 'Tahoma': StandardFonts.Helvetica,
  'Trebuchet MS': StandardFonts.Helvetica, 'Calibri': StandardFonts.Helvetica,
  'Times New Roman': StandardFonts.TimesRoman, 'Georgia': StandardFonts.TimesRoman,
  'Palatino': StandardFonts.TimesRoman, 'Garamond': StandardFonts.TimesRoman,
  'Courier New': StandardFonts.Courier, 'Consolas': StandardFonts.Courier,
  'Monaco': StandardFonts.Courier, 'Lucida Console': StandardFonts.Courier,
  'Comic Sans MS': StandardFonts.Helvetica, 'Impact': StandardFonts.Helvetica,
}

const CURSOR_MAP: Record<ToolType, string> = {
  pencil: 'crosshair', highlighter: 'crosshair', line: 'crosshair',
  arrow: 'crosshair', rectangle: 'crosshair', circle: 'crosshair',
  cloud: 'crosshair', text: 'crosshair', eraser: 'none',
  callout: 'crosshair',
}

function genId() { return Math.random().toString(36).substring(2, 11) }

/** Typed wrapper around the File System Access API — eliminates `any` casts */
interface PickerHandle {
  createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>
}
type PickerFn = (opts: {
  suggestedName: string
  types: Array<{ description: string; accept: Record<string, string[]> }>
}) => Promise<PickerHandle>

async function saveWithPicker(
  blob: Blob,
  suggestedName: string,
  fileType: { description: string; accept: Record<string, string[]> },
): Promise<'saved' | 'fallback' | 'cancelled'> {
  if (!('showSaveFilePicker' in window)) return 'fallback'
  try {
    const picker = (window as unknown as { showSaveFilePicker: PickerFn }).showSaveFilePicker
    const handle = await picker({ suggestedName, types: [fileType] })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return 'saved'
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    return 'fallback'
  }
}

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
  const nx = (dy / len) * arcSize * 0.4
  const ny = (-dx / len) * arcSize * 0.4

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

// ── Catmull-Rom path smoothing ───────────────────────

function drawSmoothPath(ctx: CanvasRenderingContext2D, pts: Point[], scale: number) {
  if (pts.length < 3) {
    ctx.beginPath()
    ctx.moveTo(pts[0].x * scale, pts[0].y * scale)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * scale, pts[i].y * scale)
    ctx.stroke()
    return
  }

  const tension = 0.3
  ctx.beginPath()
  ctx.moveTo(pts[0].x * scale, pts[0].y * scale)

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]

    const cp1x = (p1.x + (p2.x - p0.x) * tension) * scale
    const cp1y = (p1.y + (p2.y - p0.y) * tension) * scale
    const cp2x = (p2.x - (p3.x - p1.x) * tension) * scale
    const cp2y = (p2.y - (p3.y - p1.y) * tension) * scale

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x * scale, p2.y * scale)
  }
  ctx.stroke()
}

// ── Nearest point on rectangle edge ─────────────────

function nearestPointOnRect(rx: number, ry: number, rw: number, rh: number, px: number, py: number): Point {
  const cx = Math.max(rx, Math.min(rx + rw, px))
  const cy = Math.max(ry, Math.min(ry + rh, py))

  // If point is inside, project to nearest edge
  if (cx === px && cy === py) {
    const dLeft = px - rx, dRight = rx + rw - px
    const dTop = py - ry, dBottom = ry + rh - py
    const min = Math.min(dLeft, dRight, dTop, dBottom)
    if (min === dLeft) return { x: rx, y: py }
    if (min === dRight) return { x: rx + rw, y: py }
    if (min === dTop) return { x: px, y: ry }
    return { x: px, y: ry + rh }
  }
  return { x: cx, y: cy }
}

// ── Callout box hit-test ────────────────────────────

function hitTestCalloutBox(pt: Point, ann: Annotation): boolean {
  if (ann.type !== 'callout' || !ann.width || !ann.height || !ann.points.length) return false
  const { x, y } = ann.points[0]
  return pt.x >= x && pt.x <= x + ann.width && pt.y >= y && pt.y <= y + ann.height
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
  if ((ann.type !== 'text' && ann.type !== 'callout') || !ann.width || !ann.height || !ann.points.length) return null
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
  // strokeWidth/2 = visual extent from path centerline
  const th = threshold + ann.strokeWidth / 2
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
      if (ann.points.length < 3) return false
      // 8 = bump perpendicular offset (arcSize * 0.4 = 20 * 0.4)
      const cloudTh = th + 8
      for (let i = 0; i < ann.points.length; i++) {
        if (ptSegDist(p, ann.points[i], ann.points[(i + 1) % ann.points.length]) < cloudTh) return true
      }
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
      const tw = ann.width || (ann.text ? ann.text.length * (ann.fontSize || 16) * 0.6 : 0)
      const tLines = ann.text ? ann.text.split('\n') : ['']
      const tH = ann.height || tLines.length * (ann.fontSize || 16) * 1.3
      // Distance from point to nearest point on bounding box
      const nearX = Math.max(x, Math.min(x + tw, p.x))
      const nearY = Math.max(y, Math.min(y + tH, p.y))
      return Math.hypot(p.x - nearX, p.y - nearY) < th
    }
    case 'callout': {
      if (!ann.points.length || !ann.width || !ann.height) return false
      const { x, y } = ann.points[0]
      // Distance from point to nearest point on box
      const bNx = Math.max(x, Math.min(x + ann.width, p.x))
      const bNy = Math.max(y, Math.min(y + ann.height, p.y))
      if (Math.hypot(p.x - bNx, p.y - bNy) < th) return true
      // Hit if near any arrow line
      if (ann.arrows) {
        for (const tip of ann.arrows) {
          const origin = nearestPointOnRect(x, y, ann.width, ann.height, tip.x, tip.y)
          if (ptSegDist(p, origin, tip) < th) return true
        }
      }
      return false
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

// ── Shape → polyline conversion for partial erasing ──

/** Insert intermediate points every maxGap doc-units along a straight edge */
function densifyEdge(a: Point, b: Point, maxGap = 5): Point[] {
  const d = Math.hypot(b.x - a.x, b.y - a.y)
  const n = Math.max(1, Math.ceil(d / maxGap))
  const out: Point[] = [a]
  for (let i = 1; i < n; i++) {
    const t = i / n
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  out.push(b)
  return out
}

function shapeToPolyline(ann: Annotation): Point[] {
  const pts = ann.points
  switch (ann.type) {
    case 'line':
    case 'arrow':
      // Shaft only (arrowhead is decorative), densified for precise splitting
      return pts.length >= 2 ? densifyEdge(pts[0], pts[1]) : [...pts]
    case 'rectangle': {
      if (pts.length < 2) return [...pts]
      const tl = { x: Math.min(pts[0].x, pts[1].x), y: Math.min(pts[0].y, pts[1].y) }
      const tr = { x: Math.max(pts[0].x, pts[1].x), y: Math.min(pts[0].y, pts[1].y) }
      const br = { x: Math.max(pts[0].x, pts[1].x), y: Math.max(pts[0].y, pts[1].y) }
      const bl = { x: Math.min(pts[0].x, pts[1].x), y: Math.max(pts[0].y, pts[1].y) }
      // Densify each edge so fragments stay straight under Catmull-Rom smoothing
      const edges = [
        ...densifyEdge(tl, tr),
        ...densifyEdge(tr, br).slice(1),
        ...densifyEdge(br, bl).slice(1),
        ...densifyEdge(bl, tl).slice(1),
      ]
      return edges
    }
    case 'circle': {
      if (pts.length < 2) return [...pts]
      const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2
      const rx = Math.abs(pts[1].x - pts[0].x) / 2, ry = Math.abs(pts[1].y - pts[0].y) / 2
      const out: Point[] = []
      const steps = 72
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2
        out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) })
      }
      return out
    }
    case 'cloud': {
      if (pts.length < 3) return [...pts]
      const out: Point[] = []
      const arcSize = 20
      for (let ei = 0; ei < pts.length; ei++) {
        const a = pts[ei], b = pts[(ei + 1) % pts.length]
        const edgeLen = Math.hypot(b.x - a.x, b.y - a.y)
        const numBumps = Math.max(2, Math.round(edgeLen / arcSize))
        const dx = (b.x - a.x) / numBumps, dy = (b.y - a.y) / numBumps
        const len = Math.hypot(dx, dy)
        if (len === 0) continue
        const nx = (dy / len) * arcSize * 0.4, ny = (-dx / len) * arcSize * 0.4
        for (let j = 0; j < numBumps; j++) {
          const sx = a.x + dx * j, sy = a.y + dy * j
          const ex = a.x + dx * (j + 1), ey = a.y + dy * (j + 1)
          const mx = (sx + ex) / 2 + nx, my = (sy + ey) / 2 + ny
          // Approximate quadratic bezier with 8 sub-segments
          for (let k = 0; k <= 8; k++) {
            const t = k / 8
            out.push({
              x: (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex,
              y: (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey,
            })
          }
        }
      }
      if (out.length > 0) out.push(out[0]) // close loop
      return out
    }
    default:
      return [...pts]
  }
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
      drawSmoothPath(ctx, pts, scale)
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
      const angle = Math.atan2(ey - sy, ex - sx)
      const hl = Math.min(28, Math.max(14, ann.strokeWidth * scale * 2.5))
      const halfAngle = Math.PI / 7
      // Line stops at arrowhead base to avoid bleed-through
      const baseX = ex - hl * Math.cos(angle)
      const baseY = ey - hl * Math.sin(angle)
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(baseX, baseY); ctx.stroke()
      // Filled arrowhead
      ctx.beginPath()
      ctx.moveTo(ex, ey)
      ctx.lineTo(ex - hl * Math.cos(angle - halfAngle), ey - hl * Math.sin(angle - halfAngle))
      ctx.lineTo(ex - hl * Math.cos(angle + halfAngle), ey - hl * Math.sin(angle + halfAngle))
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
      if (pts.length < 3) break
      const arcSize = 20 * scale
      ctx.beginPath()
      ctx.moveTo(pts[0].x * scale, pts[0].y * scale)
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]
        const b = pts[(i + 1) % pts.length]
        drawCloudEdge(ctx, a.x * scale, a.y * scale, b.x * scale, b.y * scale, arcSize)
      }
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
      const ff = ann.fontFamily || 'Arial'
      ctx.font = `${fs}px "${ff}", sans-serif`
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
    case 'callout': {
      if (!pts.length || !ann.width || !ann.height) break
      const bx = pts[0].x * scale, by = pts[0].y * scale
      const bw = ann.width * scale, bh = ann.height * scale

      // White-filled box with black border
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 1
      ctx.fillRect(bx, by, bw, bh)
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 1.5 * scale
      ctx.strokeRect(bx, by, bw, bh)

      // Text inside the box
      if (ann.text) {
        const fs = (ann.fontSize || 14) * scale
        const ff = ann.fontFamily || 'Arial'
        ctx.font = `${fs}px "${ff}", sans-serif`
        ctx.fillStyle = '#000000'
        ctx.textBaseline = 'top'
        const lines = wrapText(ann.text, ann.width, ann.fontSize || 14)
        const lineH = (ann.fontSize || 14) * 1.3
        const padding = 4 * scale
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], bx + padding, by + padding + lineH * i * scale)
        }
      }

      // Arrows from box to each tip
      if (ann.arrows && ann.arrows.length > 0) {
        ctx.strokeStyle = '#000000'
        ctx.fillStyle = '#000000'
        ctx.lineWidth = 1.5 * scale
        ctx.globalAlpha = 1
        for (const tip of ann.arrows) {
          const origin = nearestPointOnRect(pts[0].x, pts[0].y, ann.width, ann.height, tip.x, tip.y)
          const ox = origin.x * scale, oy = origin.y * scale
          const tx = tip.x * scale, ty = tip.y * scale
          const aAngle = Math.atan2(ty - oy, tx - ox)
          const aHl = Math.min(28, Math.max(14, 1.5 * scale * 2.5))
          const aHalf = Math.PI / 7
          const abx = tx - aHl * Math.cos(aAngle)
          const aby = ty - aHl * Math.sin(aAngle)
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(abx, aby); ctx.stroke()
          ctx.beginPath()
          ctx.moveTo(tx, ty)
          ctx.lineTo(tx - aHl * Math.cos(aAngle - aHalf), ty - aHl * Math.sin(aAngle - aHalf))
          ctx.lineTo(tx - aHl * Math.cos(aAngle + aHalf), ty - aHl * Math.sin(aAngle + aHalf))
          ctx.closePath(); ctx.fill()
        }
      }
      break
    }
  }
  ctx.restore()
}

// ── Selection UI drawing ────────────────────────────────

function drawSelectionUI(ctx: CanvasRenderingContext2D, ann: Annotation, scale: number) {
  if ((ann.type !== 'text' && ann.type !== 'callout') || !ann.width || !ann.height || !ann.points.length) return
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [pdfReady, setPdfReady] = useState(0)

  const [fontFamily, setFontFamily] = useState('Arial')

  // Shapes dropdown
  const [shapesDropdownOpen, setShapesDropdownOpen] = useState(false)
  const [activeDraw, setActiveDraw] = useState<ToolType>('pencil')

  // Text tools dropdown
  const [textDropdownOpen, setTextDropdownOpen] = useState(false)
  const [activeText, setActiveText] = useState<ToolType>('text')

  // Straight-line mode
  const [straightLineMode, setStraightLineMode] = useState(false)

  // Eraser
  const [eraserRadius, setEraserRadius] = useState(15)
  const [eraserMode, setEraserMode] = useState<'partial' | 'object'>('partial')
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

  // Callout arrow drag
  const calloutArrowDragRef = useRef<{ tipPt: Point } | null>(null)

  // Cloud polygon placement
  const cloudPreviewRef = useRef<Point | null>(null)
  const cloudLastClickRef = useRef<{ time: number; pt: Point }>({ time: 0, pt: { x: 0, y: 0 } })

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
  const textDropdownRef = useRef<HTMLDivElement>(null)
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
  const isTextTool = TEXT_TYPES.has(activeTool)
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
    for (let i = pageAnns.length - 1; i >= 0; i--) {
      const ann = pageAnns[i]
      if (ann.type === 'text' && hitTest(pt, ann, 4)) return ann
    }
    return undefined
  }, [annotations, currentPage])

  const findCalloutAt = useCallback((pt: Point): Annotation | undefined => {
    const pageAnns = annotations[currentPage] || []
    for (let i = pageAnns.length - 1; i >= 0; i--) {
      const ann = pageAnns[i]
      if (ann.type === 'callout' && hitTest(pt, ann, 4)) return ann
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
    if (isDrawingRef.current && activeTool !== 'eraser' && activeTool !== 'text' && activeTool !== 'callout' && activeTool !== 'cloud') {
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

    // Cloud polygon vertex placement preview
    if (activeTool === 'cloud' && currentPtsRef.current.length > 0) {
      const cpts = currentPtsRef.current
      const preview = cloudPreviewRef.current
      const scale = RENDER_SCALE
      const arcSize = 20 * scale

      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = strokeWidth * scale
      ctx.globalAlpha = opacity / 100

      // Draw placed edges with cloud bumps
      if (cpts.length >= 2) {
        ctx.beginPath()
        ctx.moveTo(cpts[0].x * scale, cpts[0].y * scale)
        for (let i = 0; i < cpts.length - 1; i++) {
          drawCloudEdge(ctx, cpts[i].x * scale, cpts[i].y * scale, cpts[i + 1].x * scale, cpts[i + 1].y * scale, arcSize)
        }
        ctx.stroke()
      }

      // Preview edge from last vertex to cursor
      if (preview) {
        ctx.globalAlpha = (opacity / 100) * 0.5
        ctx.beginPath()
        ctx.moveTo(cpts[cpts.length - 1].x * scale, cpts[cpts.length - 1].y * scale)
        drawCloudEdge(ctx, cpts[cpts.length - 1].x * scale, cpts[cpts.length - 1].y * scale, preview.x * scale, preview.y * scale, arcSize)
        ctx.stroke()

        // Dashed closing edge from cursor to first vertex
        if (cpts.length >= 2) {
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.moveTo(preview.x * scale, preview.y * scale)
          drawCloudEdge(ctx, preview.x * scale, preview.y * scale, cpts[0].x * scale, cpts[0].y * scale, arcSize)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // Vertex dots
      ctx.globalAlpha = 1
      ctx.fillStyle = '#3B82F6'
      for (const p of cpts) {
        ctx.beginPath()
        ctx.arc(p.x * scale, p.y * scale, 4, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.setLineDash([])
      ctx.restore()
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

    // In-progress callout box creation
    if (isDrawingRef.current && activeTool === 'callout' && !calloutArrowDragRef.current) {
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

    // Callout arrow drag preview
    if (calloutArrowDragRef.current && selectedAnnId) {
      const ann = getAnnotation(selectedAnnId)
      if (ann && ann.type === 'callout' && ann.width && ann.height) {
        const tip = calloutArrowDragRef.current.tipPt
        const origin = nearestPointOnRect(ann.points[0].x, ann.points[0].y, ann.width, ann.height, tip.x, tip.y)
        ctx.save()
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = 1.5 * RENDER_SCALE
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.moveTo(origin.x * RENDER_SCALE, origin.y * RENDER_SCALE)
        ctx.lineTo(tip.x * RENDER_SCALE, tip.y * RENDER_SCALE)
        ctx.stroke()
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
    setLoadError(null)
    try {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setLoadError(`Failed to load PDF: ${msg}`)
    }
  }, [])

  // ── Thumbnail loading ────────────────────────────────

  const loadThumbnail = useCallback(async (pageNum: number) => {
    if (loadingThumbs.current.has(pageNum) || !pdfFile) return
    loadingThumbs.current.add(pageNum)
    try {
      const thumb = await generateThumbnail(pdfFile, pageNum, 300)
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
      try {
        const canvas = pdfCanvasRef.current!
        await renderPageToCanvas(pdfFile, currentPage, canvas, RENDER_SCALE, rotation)
        pageDimsRef.current = { width: canvas.width / RENDER_SCALE, height: canvas.height / RENDER_SCALE }
        const ann = annCanvasRef.current!
        ann.width = canvas.width
        ann.height = canvas.height
        setPdfReady(v => v + 1)
        requestAnimationFrame(() => fitToWindow())
      } catch {
        // Page render can fail if the PDF is corrupt or the component unmounted
      }
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
    calloutArrowDragRef.current = null
    cloudPreviewRef.current = null
    cloudLastClickRef.current = { time: 0, pt: { x: 0, y: 0 } }
    setStraightLineMode(false)
    setEraserCursorPos(null)
    setSelectedAnnId(null)
    if (activeTool === 'cloud') setColor('#ff0000')
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

  // ── Close text dropdown on outside click ──────────────

  useEffect(() => {
    if (!textDropdownOpen) return
    const handler = (e: PointerEvent) => {
      if (textDropdownRef.current && !textDropdownRef.current.contains(e.target as Node)) {
        setTextDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [textDropdownOpen])

  // ── Escape key to cancel cloud polygon placement ────

  useEffect(() => {
    if (activeTool !== 'cloud') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && currentPtsRef.current.length > 0) {
        currentPtsRef.current = []
        cloudPreviewRef.current = null
        redraw()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeTool, redraw])

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

    // ── Cloud tool: click-to-place vertices ──
    if (activeTool === 'cloud') {
      const now = Date.now()
      const last = cloudLastClickRef.current
      const isDbl = (now - last.time) < 400 && Math.hypot(pt.x - last.pt.x, pt.y - last.pt.y) < 20
      cloudLastClickRef.current = { time: now, pt }

      // Double-click: finalize polygon if we have enough vertices
      if (isDbl && currentPtsRef.current.length >= 3) {
        const pts = [...currentPtsRef.current]
        const ann: Annotation = {
          id: genId(), type: 'cloud',
          points: pts, color, strokeWidth, opacity: opacity / 100, fontSize,
        }
        commitAnnotation(ann)
        currentPtsRef.current = []
        cloudPreviewRef.current = null
        cloudLastClickRef.current = { time: 0, pt: { x: 0, y: 0 } }
        redraw()
        return
      }
      // Single click: add vertex
      currentPtsRef.current.push(pt)
      cloudPreviewRef.current = pt
      redraw()
      return
    }

    // ── Callout tool ──
    if (activeTool === 'callout') {
      if (editingTextId) commitTextEditing()

      // Check resize handles on selected callout
      if (selectedAnnId) {
        const ann = getAnnotation(selectedAnnId)
        if (ann && ann.type === 'callout' && ann.width && ann.height) {
          const handleThreshold = HANDLE_SIZE / zoom + 4
          const handle = hitTestHandle(pt, ann, handleThreshold)
          if (handle) {
            isDrawingRef.current = true
            textDragRef.current = {
              mode: handle, startPt: pt,
              origPoints: [...ann.points], origWidth: ann.width, origHeight: ann.height,
            }
            return
          }

          // Click inside box → edit text
          if (hitTestCalloutBox(pt, ann)) {
            enterEditMode(ann.id)
            return
          }

          // Click outside box → start arrow drag
          isDrawingRef.current = true
          calloutArrowDragRef.current = { tipPt: pt }
          redraw()
          return
        }
      }

      // Check if clicking on an existing callout
      const hitCallout = findCalloutAt(pt)
      if (hitCallout) {
        if (hitCallout.id === selectedAnnId) {
          enterEditMode(hitCallout.id)
        } else {
          setSelectedAnnId(hitCallout.id)
          if (e.detail >= 2) enterEditMode(hitCallout.id)
          if (hitCallout.width && hitCallout.height) {
            isDrawingRef.current = true
            textDragRef.current = {
              mode: 'move', startPt: pt,
              origPoints: [...hitCallout.points], origWidth: hitCallout.width, origHeight: hitCallout.height,
            }
          }
        }
        return
      }

      // Empty space → start creating new callout box
      setSelectedAnnId(null)
      isDrawingRef.current = true
      currentPtsRef.current = [pt]
      return
    }

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
        if (eraserMode === 'object') {
          // Object mode: delete whole annotation on hit
          if (ann.type === 'pencil' || ann.type === 'highlighter') {
            const effectiveR = docRadius + ann.strokeWidth / 2
            if (pathHitsCircle(ann.points, pt, effectiveR)) eraserModsRef.current.removed.add(ann.id)
          } else if (hitTest(pt, ann, docRadius)) {
            eraserModsRef.current.removed.add(ann.id)
          }
        } else {
          // Partial mode: split paths at eraser boundary
          if (ann.type === 'pencil' || ann.type === 'highlighter') {
            const effectiveR = docRadius + ann.strokeWidth / 2
            const hasHit = pathHitsCircle(ann.points, pt, effectiveR)
            if (hasHit) {
              eraserModsRef.current.removed.add(ann.id)
              eraserModsRef.current.added.push(...splitPathByEraser(ann, pt, effectiveR))
            }
          } else if (ann.type === 'text' || ann.type === 'callout') {
            if (hitTest(pt, ann, docRadius)) eraserModsRef.current.removed.add(ann.id)
          } else if (hitTest(pt, ann, docRadius)) {
            const polyline = shapeToPolyline(ann)
            const effectiveR = docRadius + ann.strokeWidth / 2
            const tempAnn: Annotation = { ...ann, type: 'pencil', points: polyline }
            eraserModsRef.current.removed.add(ann.id)
            eraserModsRef.current.added.push(...splitPathByEraser(tempAnn, pt, effectiveR))
          }
        }
      }
      redraw()
      return
    }

    currentPtsRef.current = [pt]
    redraw()
  }, [getPoint, activeTool, annotations, currentPage, editingTextId, selectedAnnId,
      commitTextEditing, commitAnnotation, getAnnotation, findTextAnnotationAt, findCalloutAt, enterEditMode, redraw,
      eraserRadius, eraserMode, zoom, color, strokeWidth, fontSize, opacity])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Eraser cursor
    if (activeTool === 'eraser' && annCanvasRef.current) {
      const rect = annCanvasRef.current.getBoundingClientRect()
      setEraserCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    }

    // Cloud polygon: track cursor for preview
    if (activeTool === 'cloud' && currentPtsRef.current.length > 0) {
      cloudPreviewRef.current = getPoint(e)
      redraw()
      return
    }

    if (!isDrawingRef.current) return
    const pt = getPoint(e)

    // Callout tool: arrow drag or move/resize
    if (activeTool === 'callout') {
      if (calloutArrowDragRef.current) {
        calloutArrowDragRef.current.tipPt = pt
        redraw()
        return
      }
      if (textDragRef.current) {
        // Reuse text move/resize logic for callout
        const drag = textDragRef.current
        const dx = pt.x - drag.startPt.x
        const dy = pt.y - drag.startPt.y
        if (drag.mode === 'move') {
          setAnnotations(prev => ({
            ...prev,
            [currentPage]: (prev[currentPage] || []).map(a =>
              a.id === selectedAnnId ? { ...a, points: [{ x: drag.origPoints[0].x + dx, y: drag.origPoints[0].y + dy }] } : a
            ),
          }))
        } else {
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
      // Creating callout box
      currentPtsRef.current = [currentPtsRef.current[0], pt]
      redraw()
      return
    }

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
        if (eraserMode === 'object') {
          // Object mode: delete whole annotation on hit
          if (ann.type === 'pencil' || ann.type === 'highlighter') {
            const effectiveR = docRadius + ann.strokeWidth / 2
            if (pathHitsCircle(ann.points, pt, effectiveR)) mods.removed.add(ann.id)
          } else if (hitTest(pt, ann, docRadius)) {
            mods.removed.add(ann.id)
          }
        } else {
          // Partial mode: split paths at eraser boundary
          if (ann.type === 'pencil' || ann.type === 'highlighter') {
            const effectiveR = docRadius + ann.strokeWidth / 2
            if (pathHitsCircle(ann.points, pt, effectiveR)) {
              mods.removed.add(ann.id)
              mods.added.push(...splitPathByEraser(ann, pt, effectiveR))
            }
          } else if (ann.type === 'text' || ann.type === 'callout') {
            if (hitTest(pt, ann, docRadius)) mods.removed.add(ann.id)
          } else if (hitTest(pt, ann, docRadius)) {
            const polyline = shapeToPolyline(ann)
            const effectiveR = docRadius + ann.strokeWidth / 2
            const tempAnn: Annotation = { ...ann, type: 'pencil', points: polyline }
            mods.removed.add(ann.id)
            mods.added.push(...splitPathByEraser(tempAnn, pt, effectiveR))
          }
        }
      }
      // In object mode, also remove any previously-added fragments that get hit
      if (eraserMode === 'object') {
        mods.added = mods.added.filter(frag => {
          const effectiveR = docRadius + frag.strokeWidth / 2
          return !pathHitsCircle(frag.points, pt, effectiveR)
        })
      } else {
        const newAdded: Annotation[] = []
        for (const frag of mods.added) {
          const effectiveR = docRadius + frag.strokeWidth / 2
          if (pathHitsCircle(frag.points, pt, effectiveR)) {
            newAdded.push(...splitPathByEraser(frag, pt, effectiveR))
          } else {
            newAdded.push(frag)
          }
        }
        mods.added = newAdded
      }
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
  }, [getPoint, activeTool, annotations, currentPage, redraw, eraserRadius, eraserMode, zoom, straightLineMode, selectedAnnId])

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    // Callout tool: finish arrow drag, move/resize, or create box
    if (activeTool === 'callout') {
      if (calloutArrowDragRef.current && selectedAnnId) {
        const tip = calloutArrowDragRef.current.tipPt
        const ann = getAnnotation(selectedAnnId)
        if (ann && ann.type === 'callout') {
          updateAnnotation(selectedAnnId, { arrows: [...(ann.arrows || []), tip] })
        }
        calloutArrowDragRef.current = null
        redraw()
        return
      }
      if (textDragRef.current) {
        const ann = getAnnotation(selectedAnnId!)
        if (ann) pushHistory(structuredClone(annotations))
        textDragRef.current = null
        return
      }
      // Creating new callout box
      const pts = currentPtsRef.current
      if (pts.length >= 2) {
        const x = Math.min(pts[0].x, pts[1].x)
        const y = Math.min(pts[0].y, pts[1].y)
        const w = Math.abs(pts[1].x - pts[0].x)
        const h = Math.abs(pts[1].y - pts[0].y)
        const boxW = w > 20 ? w : DEFAULT_TEXTBOX_W
        const boxH = h > 20 ? h : DEFAULT_TEXTBOX_H
        const boxX = w > 20 ? x : pts[0].x
        const boxY = h > 20 ? y : pts[0].y
        const newAnn: Annotation = {
          id: genId(), type: 'callout',
          points: [{ x: boxX, y: boxY }],
          color, fontSize, fontFamily, strokeWidth: 1,
          opacity: 1,
          text: '', width: boxW, height: boxH, arrows: [],
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
          color, fontSize, fontFamily, strokeWidth: 1,
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
      pushHistory, redraw, annotations, getAnnotation, updateAnnotation, selectedAnnId])

  // ── Export annotated PDF ─────────────────────────────

  const handleExport = useCallback(async () => {
    if (!pdfFile) return
    // Commit any editing
    if (editingTextId) commitTextEditing()
    setIsExporting(true)
    setExportError(null)
    try {
      const doc = await PDFDocument.load(pdfFile.data)
      const pages = doc.getPages()
      const fontCache = new Map<StandardFonts, Awaited<ReturnType<typeof doc.embedFont>>>()
      const getFont = async (ff: string) => {
        const std = PDF_FONT_MAP[ff] || StandardFonts.Helvetica
        if (!fontCache.has(std)) fontCache.set(std, await doc.embedFont(std))
        return fontCache.get(std)!
      }

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
              const pdfAngle = Math.atan2(e.y - s.y, e.x - s.x)
              const hl = Math.min(20, Math.max(10, ann.strokeWidth * 2.5))
              const halfAngle = Math.PI / 7
              // Line stops at arrowhead base
              const baseX = e.x - hl * Math.cos(pdfAngle)
              const baseY = e.y - hl * Math.sin(pdfAngle)
              page.drawLine({ start: s, end: { x: baseX, y: baseY }, thickness: ann.strokeWidth, color: c, opacity: ann.opacity })
              // Filled arrowhead via SVG path (relative offsets, Y negated for SVG Y-down)
              const lxOff = -hl * Math.cos(pdfAngle - halfAngle)
              const lyOff = hl * Math.sin(pdfAngle - halfAngle)
              const rxOff = -hl * Math.cos(pdfAngle + halfAngle)
              const ryOff = hl * Math.sin(pdfAngle + halfAngle)
              page.drawSvgPath(`M 0 0 L ${lxOff} ${lyOff} L ${rxOff} ${ryOff} Z`, {
                x: e.x, y: e.y, color: c, opacity: ann.opacity, borderWidth: 0,
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
              if (ann.points.length < 3) break
              for (let ei = 0; ei < ann.points.length; ei++) {
                const start = ann.points[ei]
                const end = ann.points[(ei + 1) % ann.points.length]
                const edgeLen = Math.hypot(end.x - start.x, end.y - start.y)
                const arcSz = 20
                const numBumps = Math.max(2, Math.round(edgeLen / arcSz))
                const ddx = (end.x - start.x) / numBumps
                const ddy = (end.y - start.y) / numBumps
                const len = Math.hypot(ddx, ddy)
                if (len === 0) continue
                const nx = (ddy / len) * arcSz * 0.4
                const ny = (-ddx / len) * arcSz * 0.4
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
              const pdfFont = await getFont(ann.fontFamily || 'Arial')
              const lines = ann.width ? wrapText(ann.text, ann.width, fs) : ann.text.split('\n')
              for (let i = 0; i < lines.length; i++) {
                const linePt = toPC({ x: ann.points[0].x, y: ann.points[0].y + fs * 1.3 * i + fs })
                page.drawText(lines[i], {
                  x: linePt.x, y: linePt.y,
                  size: fs, font: pdfFont, color: c, opacity: ann.opacity,
                })
              }
              break
            }
            case 'callout': {
              if (!ann.points.length || !ann.width || !ann.height) break
              const boxPt = ann.points[0]
              const cfs = ann.fontSize || 14

              // White-filled box with black border
              const bl = toPC({ x: boxPt.x, y: boxPt.y + ann.height })
              page.drawRectangle({
                x: bl.x, y: bl.y,
                width: ann.width, height: ann.height,
                color: rgb(1, 1, 1), borderColor: rgb(0, 0, 0),
                borderWidth: 1.5, opacity: 1, borderOpacity: 1,
              })

              // Text inside box
              if (ann.text) {
                const calloutFont = await getFont(ann.fontFamily || 'Arial')
                const cLines = wrapText(ann.text, ann.width - 8, cfs)
                for (let i = 0; i < cLines.length; i++) {
                  const lPt = toPC({ x: boxPt.x + 4, y: boxPt.y + 4 + cfs * 1.3 * i + cfs })
                  page.drawText(cLines[i], {
                    x: lPt.x, y: lPt.y,
                    size: cfs, font: calloutFont, color: rgb(0, 0, 0), opacity: 1,
                  })
                }
              }

              // Arrows
              if (ann.arrows) {
                for (const tip of ann.arrows) {
                  const origin = nearestPointOnRect(boxPt.x, boxPt.y, ann.width, ann.height, tip.x, tip.y)
                  const aS = toPC(origin)
                  const aE = toPC(tip)
                  const aAngle = Math.atan2(aE.y - aS.y, aE.x - aS.x)
                  const aHl = Math.min(20, Math.max(10, 1.5 * 2.5))
                  const aHalf = Math.PI / 7
                  const abX = aE.x - aHl * Math.cos(aAngle)
                  const abY = aE.y - aHl * Math.sin(aAngle)
                  page.drawLine({
                    start: aS, end: { x: abX, y: abY },
                    thickness: 1.5, color: rgb(0, 0, 0), opacity: 1,
                  })
                  const aLxOff = -aHl * Math.cos(aAngle - aHalf)
                  const aLyOff = aHl * Math.sin(aAngle - aHalf)
                  const aRxOff = -aHl * Math.cos(aAngle + aHalf)
                  const aRyOff = aHl * Math.sin(aAngle + aHalf)
                  page.drawSvgPath(`M 0 0 L ${aLxOff} ${aLyOff} L ${aRxOff} ${aRyOff} Z`, {
                    x: aE.x, y: aE.y, color: rgb(0, 0, 0), opacity: 1, borderWidth: 0,
                  })
                }
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

      const pickerResult = await saveWithPicker(blob, fileName, {
        description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] },
      })
      if (pickerResult === 'cancelled') return
      if (pickerResult === 'fallback') downloadBlob(blob, fileName)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setExportError(`Export failed: ${msg}`)
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
      <div className="h-full flex flex-col gap-4">
        <FileDropZone
          onFiles={handleFiles}
          accept="application/pdf"
          multiple={false}
          label="Drop a PDF file here"
          description="Annotate with pencil, shapes, text & more"
          className="h-full"
        />
        {loadError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400 flex-1">{loadError}</p>
            <button
              onClick={() => setLoadError(null)}
              className="p-1 rounded text-red-400/60 hover:text-red-400 transition-colors"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    )
  }

  const zoomPct = Math.round(zoom * 100)
  const activeDrawDef = DRAW_TOOLS.find(s => s.type === activeTool) || DRAW_TOOLS.find(s => s.type === activeDraw)!
  const ActiveDrawIcon = activeDrawDef.icon
  const activeTextDef = TEXT_TOOLS.find(s => s.type === activeTool) || TEXT_TOOLS.find(s => s.type === activeText)!
  const ActiveTextIcon = activeTextDef.icon

  // Get the editing text annotation for textarea overlay
  const editingAnn = editingTextId ? getAnnotation(editingTextId) : null

  return (
    <div className="h-full flex flex-col">
      {/* ── Toolbar ─────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] flex-shrink-0 flex-wrap">
        {/* Sidebar toggle */}
        {pdfFile.pageCount > 1 && (
          <>
            <button onClick={() => setSidebarOpen(o => !o)} title="Page thumbnails" aria-label="Toggle page thumbnails"
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
            aria-label={`Drawing tool: ${activeDrawDef.label}`}
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
        <button onClick={() => setActiveTool('highlighter')} title="Highlighter" aria-label="Highlighter"
          className={`p-1.5 rounded-md transition-colors ${
            activeTool === 'highlighter' ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
          }`}>
          <Highlighter size={16} />
        </button>

        {/* Text tools dropdown */}
        <div ref={textDropdownRef} className="relative">
          <button
            onClick={() => { if (!isTextTool) setActiveTool(activeText); setTextDropdownOpen(o => !o) }}
            title={activeTextDef.label}
            aria-label={`Text tool: ${activeTextDef.label}`}
            className={`p-1.5 rounded-md flex items-center gap-0.5 transition-colors ${
              isTextTool ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
            }`}>
            <ActiveTextIcon size={16} />
            <ChevronDown size={10} className="opacity-50" />
          </button>
          {textDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-[#001a24] border border-white/[0.1] rounded-lg shadow-lg z-50 py-1 min-w-[140px]">
              {TEXT_TOOLS.map(s => (
                <button key={s.type}
                  onClick={() => { setActiveTool(s.type); setActiveText(s.type); setTextDropdownOpen(false) }}
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

        {/* Eraser */}
        <button onClick={() => setActiveTool('eraser')} title="Eraser" aria-label="Eraser"
          className={`p-1.5 rounded-md transition-colors ${
            activeTool === 'eraser' ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
          }`}>
          <Eraser size={16} />
        </button>

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        {/* Color */}
        <label className="w-7 h-7 rounded-md border border-white/[0.12] cursor-pointer flex-shrink-0 overflow-hidden"
          style={{ backgroundColor: color }} aria-label="Annotation color">
          <input type="color" value={color} onChange={e => setColor(e.target.value)} className="opacity-0 w-0 h-0" aria-label="Choose annotation color" />
        </label>

        {/* Stroke width */}
        {activeTool !== 'text' && activeTool !== 'callout' && activeTool !== 'eraser' && (
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

        {/* Eraser controls */}
        {activeTool === 'eraser' && (
          <>
            {/* Mode toggle */}
            <div className="flex items-center bg-white/[0.06] rounded-md p-0.5 ml-1">
              <button onClick={() => setEraserMode('partial')} title="Partial erase — only removes what's under cursor"
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  eraserMode === 'partial' ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white'
                }`}>Partial</button>
              <button onClick={() => setEraserMode('object')} title="Object erase — deletes entire annotation on touch"
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  eraserMode === 'object' ? 'bg-[#F47B20] text-white' : 'text-white/50 hover:text-white'
                }`}>Object</button>
            </div>
            {/* Size slider */}
            <div className="flex items-center gap-1 ml-1">
              <span className="text-[10px] text-white/40">Size</span>
              <input type="range" min={5} max={50} value={eraserRadius}
                onChange={e => setEraserRadius(Number(e.target.value))}
                className="w-16 h-1 bg-white/[0.08] rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F47B20] [&::-webkit-slider-thumb]:cursor-pointer" />
              <span className="text-[10px] text-white/40 w-5">{eraserRadius}</span>
            </div>
          </>
        )}

        {/* Text/Callout: font family & size */}
        {(activeTool === 'text' || activeTool === 'callout') && (
          <>
            <select value={fontFamily} onChange={e => setFontFamily(e.target.value)}
              className="ml-1 px-1 py-0.5 text-[10px] bg-dark-surface border border-white/[0.1] rounded text-white max-w-[100px]">
              {FONT_FAMILIES.map(ff => (
                <option key={ff} value={ff} style={{ fontFamily: ff }}>{ff}</option>
              ))}
            </select>
            <div className="flex items-center gap-1 ml-1">
              <span className="text-[10px] text-white/40">Sz</span>
              <input type="number" min={8} max={72} step={0.5} value={fontSize}
                onChange={e => setFontSize(Math.max(8, Math.min(72, Number(e.target.value))))}
                className="w-12 px-1 py-0.5 text-[10px] bg-dark-surface border border-white/[0.1] rounded text-white text-center" />
            </div>
          </>
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
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08] disabled:opacity-20 disabled:pointer-events-none">
          <Undo2 size={16} />
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08] disabled:opacity-20 disabled:pointer-events-none">
          <Redo2 size={16} />
        </button>

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        {/* Rotation */}
        <button onClick={() => rotatePage(-90)} title="Rotate CCW" aria-label="Rotate counter-clockwise"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08]">
          <RotateCcw size={16} />
        </button>
        <button onClick={() => rotatePage(90)} title="Rotate CW" aria-label="Rotate clockwise"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08]">
          <RotateCw size={16} />
        </button>

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        {/* Zoom */}
        <button onClick={() => setZoom(z => Math.round(Math.max(0.25, z - 0.25) * 100) / 100)} title="Zoom out" aria-label="Zoom out"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08]">
          <ZoomOut size={16} />
        </button>
        <span className="text-[11px] text-white/50 w-10 text-center">{zoomPct}%</span>
        <button onClick={() => setZoom(z => Math.round(Math.min(4.0, z + 0.25) * 100) / 100)} title="Zoom in" aria-label="Zoom in"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08]">
          <ZoomIn size={16} />
        </button>
        <button onClick={fitToWindow} title="Fit to window" aria-label="Fit to window"
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/[0.08]">
          <Maximize size={16} />
        </button>

        <div className="flex-1" />

        {/* Export & Reset */}
        {exportError && (
          <div className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 border border-red-500/20">
            <span className="text-[10px] text-red-400">{exportError}</span>
            <button onClick={() => setExportError(null)} className="p-0.5 text-red-400/60 hover:text-red-400" aria-label="Dismiss error">
              <X size={10} />
            </button>
          </div>
        )}
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
              style={{ cursor: (activeTool === 'text' || activeTool === 'callout') && selectedAnnId ? 'default' : CURSOR_MAP[activeTool] }}
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
                  fontSize: (editingAnn.fontSize || (editingAnn.type === 'callout' ? 14 : 16)) * RENDER_SCALE,
                  fontFamily: `"${editingAnn.fontFamily || 'Arial'}", sans-serif`,
                  color: editingAnn.type === 'callout' ? '#000000' : editingAnn.color,
                  backgroundColor: editingAnn.type === 'callout' ? '#ffffff' : 'transparent',
                  lineHeight: '1.3',
                  opacity: editingAnn.type === 'callout' ? 1 : editingAnn.opacity,
                  padding: editingAnn.type === 'callout' ? `${4 * RENDER_SCALE}px` : '0',
                }}
                className={`border-2 border-[#3B82F6] outline-none resize-none font-sans m-0 overflow-hidden ${
                  editingAnn.type === 'callout' ? '' : 'bg-transparent p-0'
                }`}
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
                aria-label="Previous page"
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full
                  bg-black/40 text-white/40 hover:bg-black/60 hover:text-white/80
                  transition-all opacity-0 group-hover/canvas:opacity-60 hover:!opacity-100
                  disabled:!opacity-0 disabled:pointer-events-none z-10">
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(pdfFile.pageCount, p + 1))}
                disabled={currentPage === pdfFile.pageCount}
                aria-label="Next page"
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
