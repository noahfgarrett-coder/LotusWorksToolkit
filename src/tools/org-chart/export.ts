import type { OrgNode, OrgChartState } from './types.ts'
import {
  NODE_WIDTH, NODE_HEIGHT, H_SPACING, V_SPACING,
  AVATAR_SIZE, CONNECTOR_RADIUS,
} from './types.ts'
import { downloadBlob, downloadText } from '@/utils/download.ts'
import { loadImage } from '@/utils/imageProcessing.ts'

// ── Layout types (local) ────────────────────────────────────

interface LayoutNode extends OrgNode {
  x: number
  y: number
  width: number
  height: number
  children: LayoutNode[]
}

// ── Bounds ──────────────────────────────────────────────────

function calcBounds(flat: LayoutNode[]) {
  if (flat.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 600 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of flat) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  return { minX: minX - 50, minY: minY - 50, maxX: maxX + 50, maxY: maxY + 50 }
}

// ── Build layout tree ───────────────────────────────────────

function buildLayout(nodes: OrgNode[]): LayoutNode[] {
  const root = nodes.find(n => !n.reportsTo)
  if (!root) return []

  const childMap = new Map<string, OrgNode[]>()
  for (const n of nodes) {
    if (n.reportsTo) {
      const arr = childMap.get(n.reportsTo) ?? []
      arr.push(n)
      childMap.set(n.reportsTo, arr)
    }
  }

  const buildSubtree = (node: OrgNode): LayoutNode => {
    const children = (childMap.get(node.id) ?? []).map(buildSubtree)
    return { ...node, x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT, children }
  }

  const tree = buildSubtree(root)
  layoutTopDown(tree, 0)
  const flat = flattenTree(tree)

  // Apply manual offsets from OrgNode
  for (const ln of flat) {
    ln.x += ln.offsetX
    ln.y += ln.offsetY
  }

  return flat
}

function layoutTopDown(node: LayoutNode, depth: number): number {
  node.y = depth * (NODE_HEIGHT + V_SPACING)
  if (node.children.length === 0) { node.x = 0; return NODE_WIDTH }

  let totalWidth = 0
  const widths: number[] = []
  for (const child of node.children) {
    const w = layoutTopDown(child, depth + 1)
    widths.push(w)
    totalWidth += w
  }
  totalWidth += (node.children.length - 1) * H_SPACING

  let offset = 0
  for (let i = 0; i < node.children.length; i++) {
    shiftX(node.children[i], offset)
    offset += widths[i] + H_SPACING
  }

  const first = node.children[0]
  const last = node.children[node.children.length - 1]
  node.x = (first.x + last.x + last.width) / 2 - NODE_WIDTH / 2
  return Math.max(NODE_WIDTH, totalWidth)
}

function shiftX(node: LayoutNode, dx: number) {
  node.x += dx
  for (const child of node.children) shiftX(child, dx)
}

function flattenTree(node: LayoutNode): LayoutNode[] {
  const result: LayoutNode[] = [node]
  for (const child of node.children) result.push(...flattenTree(child))
  return result
}

// ── Preload images ──────────────────────────────────────────

async function preloadImages(nodes: OrgNode[]): Promise<Map<string, HTMLImageElement>> {
  const cache = new Map<string, HTMLImageElement>()
  const promises: Promise<void>[] = []
  for (const n of nodes) {
    if (n.imageDataUrl && !cache.has(n.imageDataUrl)) {
      const url = n.imageDataUrl
      promises.push(
        loadImage(url).then(img => { cache.set(url, img) }).catch(() => {}),
      )
    }
  }
  await Promise.all(promises)
  return cache
}

// ── Render to offscreen canvas ──────────────────────────────

async function renderToCanvas(nodes: OrgNode[]): Promise<HTMLCanvasElement> {
  const flat = buildLayout(nodes)
  const imageCache = await preloadImages(nodes)
  const { minX, minY, maxX, maxY } = calcBounds(flat)
  const w = maxX - minX
  const h = maxY - minY
  const scale = 2

  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to create canvas 2D context')
  ctx.scale(scale, scale)
  ctx.translate(-minX, -minY)

  // Background
  ctx.fillStyle = '#0a0a14'
  ctx.fillRect(minX, minY, w, h)

  // Build tree for connector drawing
  const root = nodes.find(n => !n.reportsTo)
  if (root) {
    const childMap = new Map<string, LayoutNode[]>()
    for (const n of flat) {
      if (n.reportsTo) {
        const arr = childMap.get(n.reportsTo) ?? []
        arr.push(n)
        childMap.set(n.reportsTo, arr)
      }
    }
    // Draw connectors
    for (const parent of flat) {
      const children = childMap.get(parent.id) ?? []
      for (const child of children) {
        drawConnector(ctx, parent, child)
      }
    }
  }

  // Draw nodes
  for (const node of flat) {
    ctx.save()
    ctx.translate(node.x, node.y)
    drawNodeCard(ctx, node, imageCache)
    ctx.restore()
  }

  return canvas
}

// ── Drawing helpers ─────────────────────────────────────────

function drawConnector(ctx: CanvasRenderingContext2D, parent: LayoutNode, child: LayoutNode) {
  const px = parent.x + parent.width / 2
  const py = parent.y + parent.height
  const cx = child.x + child.width / 2
  const cy = child.y
  const midY = (py + cy) / 2
  const r = Math.min(CONNECTOR_RADIUS, Math.abs(midY - py), Math.abs(cx - px) / 2 || CONNECTOR_RADIUS)

  ctx.beginPath()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5

  if (Math.abs(cx - px) < 1) {
    ctx.moveTo(px, py)
    ctx.lineTo(cx, cy)
  } else {
    ctx.moveTo(px, py)
    ctx.lineTo(px, midY - r)
    if (cx > px) {
      ctx.arcTo(px, midY, px + r, midY, r)
      ctx.lineTo(cx - r, midY)
      ctx.arcTo(cx, midY, cx, midY + r, r)
    } else {
      ctx.arcTo(px, midY, px - r, midY, r)
      ctx.lineTo(cx + r, midY)
      ctx.arcTo(cx, midY, cx, midY + r, r)
    }
    ctx.lineTo(cx, cy)
  }
  ctx.stroke()
}

function drawNodeCard(ctx: CanvasRenderingContext2D, node: LayoutNode, imageCache: Map<string, HTMLImageElement>) {
  const w = NODE_WIDTH
  const h = NODE_HEIGHT
  const radius = 8

  // Background
  drawRoundedRect(ctx, 0, 0, w, h, radius)
  ctx.fillStyle = '#1a1a24'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Top accent bar
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(w - radius, 0)
  ctx.arcTo(w, 0, w, radius, radius)
  ctx.lineTo(w, 3)
  ctx.lineTo(0, 3)
  ctx.lineTo(0, radius)
  ctx.arcTo(0, 0, radius, 0, radius)
  ctx.closePath()
  ctx.fillStyle = node.nodeColor
  ctx.fill()
  ctx.restore()

  // Avatar
  const avatarX = 14
  const avatarY = h / 2
  const avatarR = AVATAR_SIZE / 2
  const img = node.imageDataUrl ? imageCache.get(node.imageDataUrl) : null

  if (img) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(avatarX + avatarR, avatarY, avatarR, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, avatarX, avatarY - avatarR, AVATAR_SIZE, AVATAR_SIZE)
    ctx.restore()
    ctx.beginPath()
    ctx.arc(avatarX + avatarR, avatarY, avatarR, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.stroke()
  } else {
    const initials = getInitials(node.name)
    ctx.beginPath()
    ctx.arc(avatarX + avatarR, avatarY, avatarR, 0, Math.PI * 2)
    ctx.fillStyle = node.nodeColor + '30'
    ctx.fill()
    ctx.strokeStyle = node.nodeColor + '50'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = node.nodeColor
    ctx.fillText(initials, avatarX + avatarR, avatarY)
  }

  // Text
  const textX = avatarX + AVATAR_SIZE + 12
  const maxTextW = w - textX - 10

  ctx.font = '600 12px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(truncateText(ctx, node.name, maxTextW), textX, 16)

  ctx.font = '400 10px -apple-system, BlinkMacSystemFont, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.50)'
  ctx.fillText(truncateText(ctx, node.title, maxTextW), textX, 34)

  if (node.department) {
    ctx.font = '400 9px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.30)'
    ctx.fillText(truncateText(ctx, node.department, maxTextW), textX, 50)
  }
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1)
  return t + '…'
}

// ── Export as PNG ────────────────────────────────────────────

export async function exportPNG(nodes: OrgNode[], filename = 'org-chart.png'): Promise<void> {
  const canvas = await renderToCanvas(nodes)
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        downloadBlob(blob, filename)
        resolve()
      } else {
        reject(new Error('Failed to create PNG'))
      }
      canvas.width = 0
      canvas.height = 0
    }, 'image/png')
  })
}

// ── Copy as PNG to clipboard ────────────────────────────────

export async function copyPNGToClipboard(nodes: OrgNode[]): Promise<void> {
  const canvas = await renderToCanvas(nodes)
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) {
        reject(new Error('Failed to create PNG'))
        canvas.width = 0
        canvas.height = 0
        return
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
        resolve()
      } catch (err) {
        reject(new Error(
          'Failed to copy to clipboard' + (err instanceof Error ? ': ' + err.message : ''),
        ))
      } finally {
        canvas.width = 0
        canvas.height = 0
      }
    }, 'image/png')
  })
}

// ── Export as SVG ────────────────────────────────────────────

export async function exportSVG(nodes: OrgNode[], filename = 'org-chart.svg'): Promise<void> {
  const flat = buildLayout(nodes)
  const { minX, minY, maxX, maxY } = calcBounds(flat)
  const w = maxX - minX
  const h = maxY - minY

  const childMap = new Map<string, LayoutNode[]>()
  for (const n of flat) {
    if (n.reportsTo) {
      const arr = childMap.get(n.reportsTo) ?? []
      arr.push(n)
      childMap.set(n.reportsTo, arr)
    }
  }

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">`,
    `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#0a0a14"/>`,
    `<defs>`,
  ]

  // Add clip paths for avatars
  for (const node of flat) {
    if (node.imageDataUrl) {
      parts.push(`<clipPath id="avatar-${node.id}"><circle cx="${node.x + 14 + AVATAR_SIZE / 2}" cy="${node.y + NODE_HEIGHT / 2}" r="${AVATAR_SIZE / 2}"/></clipPath>`)
    }
  }
  parts.push(`</defs>`)

  // Connectors
  for (const parent of flat) {
    const children = childMap.get(parent.id) ?? []
    for (const child of children) {
      const px = parent.x + parent.width / 2
      const py = parent.y + parent.height
      const cx = child.x + child.width / 2
      const cy = child.y
      const midY = (py + cy) / 2
      parts.push(`<path d="M${px},${py} L${px},${midY} L${cx},${midY} L${cx},${cy}" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>`)
    }
  }

  // Nodes
  for (const node of flat) {
    const nx = node.x
    const ny = node.y
    parts.push(`<g>`)
    parts.push(`<rect x="${nx}" y="${ny}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="8" fill="#1a1a24" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`)
    parts.push(`<rect x="${nx}" y="${ny}" width="${NODE_WIDTH}" height="3" rx="2" fill="${node.nodeColor}"/>`)

    // Avatar
    if (node.imageDataUrl) {
      parts.push(`<image href="${node.imageDataUrl}" x="${nx + 14}" y="${ny + NODE_HEIGHT / 2 - AVATAR_SIZE / 2}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" clip-path="url(#avatar-${node.id})"/>`)
    } else {
      const initials = getInitials(node.name)
      parts.push(`<circle cx="${nx + 14 + AVATAR_SIZE / 2}" cy="${ny + NODE_HEIGHT / 2}" r="${AVATAR_SIZE / 2}" fill="${node.nodeColor}30" stroke="${node.nodeColor}50" stroke-width="1"/>`)
      parts.push(`<text x="${nx + 14 + AVATAR_SIZE / 2}" y="${ny + NODE_HEIGHT / 2}" text-anchor="middle" dominant-baseline="central" fill="${node.nodeColor}" font-size="13" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${escapeXml(initials)}</text>`)
    }

    // Text
    const textX = nx + 14 + AVATAR_SIZE + 12
    parts.push(`<text x="${textX}" y="${ny + 24}" fill="#ffffff" font-size="12" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${escapeXml(node.name)}</text>`)
    parts.push(`<text x="${textX}" y="${ny + 42}" fill="rgba(255,255,255,0.5)" font-size="10" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${escapeXml(node.title)}</text>`)
    if (node.department) {
      parts.push(`<text x="${textX}" y="${ny + 56}" fill="rgba(255,255,255,0.3)" font-size="9" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${escapeXml(node.department)}</text>`)
    }
    parts.push(`</g>`)
  }

  parts.push(`</svg>`)

  const blob = new Blob([parts.join('\n')], { type: 'image/svg+xml' })
  downloadBlob(blob, filename)
}

// ── Export as JSON ───────────────────────────────────────────

export function exportJSON(nodes: OrgNode[], filename = 'org-chart.json'): void {
  const state: OrgChartState = { nodes }
  downloadText(JSON.stringify(state, null, 2), filename, 'application/json')
}

export function importJSON(json: string): OrgChartState {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON: failed to parse')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid org chart JSON: expected an object')
  }

  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.nodes)) {
    throw new Error('Invalid org chart JSON: expected { nodes: [...] }')
  }

  for (const node of obj.nodes) {
    if (!node || typeof node !== 'object' || !('id' in node) || !('name' in node)) {
      throw new Error('Invalid org chart JSON: nodes must have id and name fields')
    }
  }

  return obj as unknown as OrgChartState
}

// ── Export as CSV ────────────────────────────────────────────

export function exportCSV(nodes: OrgNode[], filename = 'org-chart.csv'): void {
  const nameMap = new Map(nodes.map(n => [n.id, n.name]))

  const header = ['Name', 'Title', 'Department', 'Reports To', 'Email', 'Phone', 'Location']
  const rows = nodes.map(n => [
    csvEscape(n.name),
    csvEscape(n.title),
    csvEscape(n.department),
    csvEscape(n.reportsTo ? (nameMap.get(n.reportsTo) ?? '') : ''),
    csvEscape(n.email),
    csvEscape(n.phone),
    csvEscape(n.location),
  ].join(','))

  const csv = [header.join(','), ...rows].join('\n')
  downloadText(csv, filename, 'text/csv')
}

// ── Utilities ───────────────────────────────────────────────

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}
