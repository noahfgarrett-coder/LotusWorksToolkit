import type { DiagramNode, DiagramEdge, DiagramState } from './types.ts'
import { getShapeDef } from './shapes.ts'
import { edgePath, edgeMidpoint } from './connectors.ts'
import { downloadBlob, downloadText } from '@/utils/download.ts'

// ── Bounds calculation ──────────────────────────────────────

function calcBounds(nodes: DiagramNode[]) {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 800, maxY: 600 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  return { minX: minX - 40, minY: minY - 40, maxX: maxX + 40, maxY: maxY + 40 }
}

// ── Shared canvas rendering ─────────────────────────────────

function renderToCanvas(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): HTMLCanvasElement {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const { minX, minY, maxX, maxY } = calcBounds(nodes)
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

  // Draw edges
  for (const edge of edges) {
    const d = edgePath(edge, nodeMap)
    if (!d) continue

    ctx.strokeStyle = edge.style.stroke
    ctx.lineWidth = edge.style.strokeWidth
    if (edge.style.dashArray) {
      ctx.setLineDash(edge.style.dashArray.split(' ').map(Number))
    } else {
      ctx.setLineDash([])
    }

    const p = new Path2D(d)
    ctx.stroke(p)

    // Edge label
    if (edge.label) {
      const mid = edgeMidpoint(edge, nodeMap)
      if (mid) {
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const tw = ctx.measureText(edge.label).width + 8
        ctx.fillStyle = 'rgba(10,10,20,0.85)'
        ctx.fillRect(mid.x - tw / 2, mid.y - 9, tw, 18)
        ctx.fillStyle = edge.style.stroke
        ctx.fillText(edge.label, mid.x, mid.y)
      }
    }
  }

  ctx.setLineDash([])

  // Draw nodes (sorted by z-index)
  const sortedNodes = [...nodes].sort((a, b) => a.zIndex - b.zIndex)
  for (const node of sortedNodes) {
    ctx.save()
    ctx.translate(node.x, node.y)

    const def = getShapeDef(node.type)
    const path = def.svgPath(node.width, node.height)
    const p = new Path2D(path)

    ctx.fillStyle = node.style.fill
    ctx.fill(p)
    ctx.strokeStyle = node.style.stroke
    ctx.lineWidth = node.style.strokeWidth
    ctx.stroke(p)

    // Text
    ctx.fillStyle = node.style.fontColor
    ctx.font = `${node.style.fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Simple text wrapping
    const maxW = node.width - 16
    const words = node.label.split(' ')
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const test = line ? `${line} ${word}` : word
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line)
        line = word
      } else {
        line = test
      }
    }
    if (line) lines.push(line)

    const lineH = node.style.fontSize * 1.3
    const startY = node.height / 2 - ((lines.length - 1) * lineH) / 2
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], node.width / 2, startY + i * lineH)
    }

    ctx.restore()
  }

  return canvas
}

// ── Export as PNG ────────────────────────────────────────────

export async function exportPNG(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  filename: string = 'flowchart.png',
): Promise<void> {
  const canvas = renderToCanvas(nodes, edges)

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

export async function copyPNGToClipboard(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): Promise<void> {
  const canvas = renderToCanvas(nodes, edges)

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
          'Failed to copy to clipboard' +
          (err instanceof Error ? ': ' + err.message : ''),
        ))
      } finally {
        canvas.width = 0
        canvas.height = 0
      }
    }, 'image/png')
  })
}

// ── Export as SVG ────────────────────────────────────────────

export function exportSVG(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  filename: string = 'flowchart.svg',
): void {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const { minX, minY, maxX, maxY } = calcBounds(nodes)
  const w = maxX - minX
  const h = maxY - minY

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">`,
    `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="#0a0a14"/>`,
    // Arrow marker
    `<defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">`,
    `<polygon points="0 0, 10 3.5, 0 7" fill="rgba(244,123,32,0.5)"/></marker></defs>`,
  ]

  // Edges
  for (const edge of edges) {
    const d = edgePath(edge, nodeMap)
    if (!d) continue
    const marker = edge.style.markerEnd ? ' marker-end="url(#arrow)"' : ''
    const dash = edge.style.dashArray ? ` stroke-dasharray="${edge.style.dashArray}"` : ''
    parts.push(`<path d="${d}" fill="none" stroke="${edge.style.stroke}" stroke-width="${edge.style.strokeWidth}"${dash}${marker}/>`)

    if (edge.label) {
      const mid = edgeMidpoint(edge, nodeMap)
      if (mid) {
        parts.push(`<text x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="central" fill="${edge.style.stroke}" font-size="11" font-family="sans-serif">${escapeXml(edge.label)}</text>`)
      }
    }
  }

  // Nodes
  const sortedNodes = [...nodes].sort((a, b) => a.zIndex - b.zIndex)
  for (const node of sortedNodes) {
    const def = getShapeDef(node.type)
    const path = def.svgPath(node.width, node.height)
    parts.push(`<g transform="translate(${node.x},${node.y})">`)
    parts.push(`<path d="${path}" fill="${node.style.fill}" stroke="${node.style.stroke}" stroke-width="${node.style.strokeWidth}"/>`)
    parts.push(`<text x="${node.width / 2}" y="${node.height / 2}" text-anchor="middle" dominant-baseline="central" fill="${node.style.fontColor}" font-size="${node.style.fontSize}" font-family="sans-serif">${escapeXml(node.label)}</text>`)
    parts.push(`</g>`)
  }

  parts.push(`</svg>`)

  const blob = new Blob([parts.join('\n')], { type: 'image/svg+xml' })
  downloadBlob(blob, filename)
}

// ── Export as JSON (save/load) ───────────────────────────────

export function exportJSON(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  filename: string = 'flowchart.json',
): void {
  const state: DiagramState = { nodes, edges }
  downloadText(JSON.stringify(state, null, 2), filename, 'application/json')
}

export function importJSON(json: string): DiagramState {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON: failed to parse')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid flowchart JSON: expected an object')
  }

  const obj = parsed as Record<string, unknown>
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
    throw new Error('Invalid flowchart JSON: expected { nodes: [], edges: [] }')
  }

  // Validate nodes have required fields
  for (const node of obj.nodes) {
    if (!node || typeof node !== 'object' || !('id' in node) || !('type' in node) || !('x' in node) || !('y' in node)) {
      throw new Error('Invalid flowchart JSON: nodes must have id, type, x, and y fields')
    }
  }

  return obj as unknown as DiagramState
}

// ── Utility ─────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
