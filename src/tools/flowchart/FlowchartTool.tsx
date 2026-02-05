import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/common/Button.tsx'
import { downloadBlob } from '@/utils/download.ts'
import { Download, RotateCcw, Play, ChevronDown } from 'lucide-react'

// ── Types ──────────────────────────────────────────────

interface FlowNode {
  id: string
  type: 'start' | 'end' | 'process' | 'decision'
  label: string
  x: number
  y: number
}

interface FlowEdge {
  from: string
  to: string
  label?: string
}

// ── Constants ──────────────────────────────────────────

const NODE_W = 180
const NODE_H = 50
const PILL_W = 160
const PILL_H = 46
const DIAMOND_W = 150
const DIAMOND_H = 80
const V_GAP = 80
const BRANCH_OFFSET = 170
const CENTER_X = 400

const TEMPLATES: { name: string; text: string }[] = [
  {
    name: 'Simple Process',
    text: 'START Begin\nStep 1\nStep 2\nStep 3\nEND Done',
  },
  {
    name: 'Decision Flow',
    text: 'START Receive Request\nValidate Input\nIF Input Valid?\nTHEN Process Request\nOR Return Error\nSend Response\nEND Complete',
  },
  {
    name: 'Approval Process',
    text: 'START Submit Application\nReview Documents\nIF Documents Complete?\nTHEN Run Background Check\nOR Request Missing Docs\nIF Background Clear?\nTHEN Approve Application\nOR Deny Application\nNotify Applicant\nEND Process Complete',
  },
  {
    name: 'Support Ticket',
    text: 'START Customer Contacts Support\nLog Ticket\nIF Urgent Issue?\nTHEN Escalate to Senior\nOR Assign to Queue\nInvestigate Issue\nIF Resolved?\nTHEN Close Ticket\nOR Escalate Further\nSend Follow-up\nEND Ticket Closed',
  },
]

function genId() { return Math.random().toString(36).substring(2, 11) }

// ── Parser ─────────────────────────────────────────────

function parseFlowchart(text: string): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('#'))
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  let lastMainId: string | null = null
  let currentDecisionId: string | null = null
  const pendingBranchIds: string[] = []

  for (const raw of lines) {
    const trimmed = raw.trim()
    const upper = trimmed.toUpperCase()

    let type: FlowNode['type'] = 'process'
    let label = trimmed
    let branchType: 'then' | 'or' | null = null

    if (upper.startsWith('START')) {
      type = 'start'
      label = trimmed.replace(/^START[:\s]*/i, '') || 'Start'
    } else if (upper.startsWith('END')) {
      type = 'end'
      label = trimmed.replace(/^END[:\s]*/i, '') || 'End'
    } else if (upper.startsWith('IF ') || upper.startsWith('IF:')) {
      type = 'decision'
      label = trimmed.replace(/^IF[:\s]*/i, '')
    } else if (upper.startsWith('THEN ') || upper.startsWith('THEN:') || upper.startsWith('YES ') || upper.startsWith('YES:')) {
      branchType = 'then'
      label = trimmed.replace(/^(THEN|YES)[:\s]*/i, '')
    } else if (upper.startsWith('OR ') || upper.startsWith('OR:') || upper.startsWith('ELSE ') ||
               upper.startsWith('ELSE:') || upper.startsWith('NO ') || upper.startsWith('NO:')) {
      branchType = 'or'
      label = trimmed.replace(/^(OR|ELSE|NO)[:\s]*/i, '')
    }

    const id = genId()
    const node: FlowNode = { id, type, label, x: 0, y: 0 }

    if (branchType) {
      nodes.push(node)
      if (currentDecisionId) {
        edges.push({ from: currentDecisionId, to: id, label: branchType === 'then' ? 'Yes' : 'No' })
      }
      pendingBranchIds.push(id)
    } else {
      // Reconnect pending branches
      if (pendingBranchIds.length > 0) {
        for (const bid of pendingBranchIds) edges.push({ from: bid, to: id })
        pendingBranchIds.length = 0
        currentDecisionId = null
      } else if (lastMainId) {
        edges.push({ from: lastMainId, to: id })
      }

      nodes.push(node)
      lastMainId = id

      if (type === 'decision') {
        currentDecisionId = id
      }
    }
  }

  return { nodes, edges }
}

// ── Layout ─────────────────────────────────────────────

function layoutNodes(nodes: FlowNode[], edges: FlowEdge[]): void {
  const incomingLabels = new Map<string, string>()
  for (const edge of edges) {
    if (edge.label) incomingLabels.set(edge.to, edge.label)
  }

  let y = 50
  let decisionY = 0
  let hasPendingBranches = false
  let branchBottomY = 0

  for (const node of nodes) {
    const label = incomingLabels.get(node.id)

    if (label === 'Yes') {
      node.x = CENTER_X - BRANCH_OFFSET
      node.y = decisionY + V_GAP
      branchBottomY = Math.max(branchBottomY, node.y + NODE_H)
      hasPendingBranches = true
      continue
    }

    if (label === 'No') {
      node.x = CENTER_X + BRANCH_OFFSET
      node.y = decisionY + V_GAP
      branchBottomY = Math.max(branchBottomY, node.y + NODE_H)
      hasPendingBranches = true
      continue
    }

    if (hasPendingBranches) {
      y = branchBottomY + V_GAP * 0.6
      hasPendingBranches = false
    }

    node.x = CENTER_X
    node.y = y

    if (node.type === 'decision') {
      decisionY = y
    }

    y += V_GAP
  }
}

// ── Dimension helpers ──────────────────────────────────

function nodeHalfH(node: FlowNode): number {
  return node.type === 'decision' ? DIAMOND_H / 2 : (node.type === 'start' || node.type === 'end' ? PILL_H / 2 : NODE_H / 2)
}

function nodeHalfW(node: FlowNode): number {
  return node.type === 'decision' ? DIAMOND_W / 2 : (node.type === 'start' || node.type === 'end' ? PILL_W / 2 : NODE_W / 2)
}

function wrapText(text: string, maxChars: number = 22): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    if (cur.length + word.length + 1 > maxChars && cur.length > 0) {
      lines.push(cur); cur = word
    } else {
      cur = cur ? `${cur} ${word}` : word
    }
  }
  if (cur) lines.push(cur)
  return lines
}

// ── Edge path ──────────────────────────────────────────

function edgePath(edge: FlowEdge, nodeMap: Map<string, FlowNode>): string {
  const from = nodeMap.get(edge.from)
  const to = nodeMap.get(edge.to)
  if (!from || !to) return ''

  const fy = from.y + nodeHalfH(from)
  const ty = to.y - nodeHalfH(to)

  if (Math.abs(from.x - to.x) < 2) {
    return `M ${from.x} ${fy} L ${to.x} ${ty}`
  }

  const midY = (fy + ty) / 2
  return `M ${from.x} ${fy} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${ty}`
}

function edgeLabelPos(edge: FlowEdge, nodeMap: Map<string, FlowNode>): { x: number; y: number } | null {
  if (!edge.label) return null
  const from = nodeMap.get(edge.from)
  const to = nodeMap.get(edge.to)
  if (!from || !to) return null

  const fy = from.y + nodeHalfH(from)
  const ty = to.y - nodeHalfH(to)
  const midY = (fy + ty) / 2
  const midX = (from.x + to.x) / 2

  return { x: midX, y: midY - 6 }
}

// ── Component ──────────────────────────────────────────

export default function FlowchartTool() {
  const [text, setText] = useState(TEMPLATES[1].text)
  const [nodes, setNodes] = useState<FlowNode[]>([])
  const [edges, setEdges] = useState<FlowEdge[]>([])
  const [generated, setGenerated] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)

  // Generate flowchart from text
  const generate = useCallback(() => {
    const { nodes: n, edges: e } = parseFlowchart(text)
    layoutNodes(n, e)
    setNodes(n)
    setEdges(e)
    setGenerated(true)
  }, [text])

  // Build node map for lookups
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Calculate SVG bounds
  const calcBounds = useCallback(() => {
    if (nodes.length === 0) return { minX: 0, minY: 0, w: 800, h: 600 }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodes) {
      const hw = nodeHalfW(node) + 20
      const hh = nodeHalfH(node) + 20
      minX = Math.min(minX, node.x - hw)
      minY = Math.min(minY, node.y - hh)
      maxX = Math.max(maxX, node.x + hw)
      maxY = Math.max(maxY, node.y + hh)
    }
    const pad = 50
    return { minX: minX - pad, minY: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
  }, [nodes])

  const bounds = calcBounds()

  // ── SVG coordinate conversion ────────────────────────

  const getSVGPoint = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const svgPt = pt.matrixTransform(ctm.inverse())
    return { x: svgPt.x, y: svgPt.y }
  }, [])

  // ── Drag handlers ────────────────────────────────────

  const handleNodeDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const pt = getSVGPoint(e)
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return
    setDragId(nodeId)
    setDragOffset({ x: pt.x - node.x, y: pt.y - node.y })
  }, [getSVGPoint, nodes])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragId) return
    const pt = getSVGPoint(e)
    setNodes(prev => prev.map(n =>
      n.id === dragId ? { ...n, x: pt.x - dragOffset.x, y: pt.y - dragOffset.y } : n,
    ))
  }, [dragId, dragOffset, getSVGPoint])

  const handleMouseUp = useCallback(() => { setDragId(null) }, [])

  // ── Export to PNG via canvas ──────────────────────────

  const handleExportPNG = useCallback(() => {
    if (nodes.length === 0) return

    const pad = 50
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      const hw = nodeHalfW(n) + 20; const hh = nodeHalfH(n) + 20
      minX = Math.min(minX, n.x - hw); minY = Math.min(minY, n.y - hh)
      maxX = Math.max(maxX, n.x + hw); maxY = Math.max(maxY, n.y + hh)
    }

    const w = maxX - minX + pad * 2
    const h = maxY - minY + pad * 2
    const scale = 2

    const canvas = document.createElement('canvas')
    canvas.width = w * scale
    canvas.height = h * scale
    const ctx = canvas.getContext('2d')!
    ctx.scale(scale, scale)
    ctx.translate(pad - minX, pad - minY)

    // Background
    ctx.fillStyle = '#0a0a14'
    ctx.fillRect(minX - pad, minY - pad, w, h)

    // Draw edges
    ctx.strokeStyle = 'rgba(244,123,32,0.25)'
    ctx.lineWidth = 1.5
    for (const edge of edges) {
      const path = edgePath(edge, nodeMap)
      if (!path) continue
      const p = new Path2D(path)
      ctx.stroke(p)

      // Arrowhead
      const to = nodeMap.get(edge.to)
      if (to) {
        const ty = to.y - nodeHalfH(to)
        const tx = to.x
        ctx.fillStyle = 'rgba(244,123,32,0.4)'
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(tx - 5, ty - 8)
        ctx.lineTo(tx + 5, ty - 8)
        ctx.closePath()
        ctx.fill()
      }

      // Edge label
      if (edge.label) {
        const lp = edgeLabelPos(edge, nodeMap)
        if (lp) {
          ctx.fillStyle = 'rgba(244,123,32,0.7)'
          ctx.font = '10px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(edge.label, lp.x, lp.y)
        }
      }
    }

    // Draw nodes
    for (const node of nodes) {
      const hw = nodeHalfW(node)
      const hh = nodeHalfH(node)

      ctx.lineWidth = 1.5
      if (node.type === 'start') {
        ctx.fillStyle = 'rgba(34,197,94,0.12)'
        ctx.strokeStyle = 'rgba(34,197,94,0.4)'
        ctx.beginPath()
        ctx.roundRect(node.x - hw, node.y - hh, hw * 2, hh * 2, hh)
        ctx.fill(); ctx.stroke()
      } else if (node.type === 'end') {
        ctx.fillStyle = 'rgba(239,68,68,0.12)'
        ctx.strokeStyle = 'rgba(239,68,68,0.4)'
        ctx.beginPath()
        ctx.roundRect(node.x - hw, node.y - hh, hw * 2, hh * 2, hh)
        ctx.fill(); ctx.stroke()
      } else if (node.type === 'decision') {
        ctx.fillStyle = 'rgba(244,123,32,0.12)'
        ctx.strokeStyle = 'rgba(244,123,32,0.4)'
        ctx.beginPath()
        ctx.moveTo(node.x, node.y - hh)
        ctx.lineTo(node.x + hw, node.y)
        ctx.lineTo(node.x, node.y + hh)
        ctx.lineTo(node.x - hw, node.y)
        ctx.closePath()
        ctx.fill(); ctx.stroke()
      } else {
        ctx.fillStyle = 'rgba(244,123,32,0.08)'
        ctx.strokeStyle = 'rgba(244,123,32,0.25)'
        ctx.beginPath()
        ctx.roundRect(node.x - hw, node.y - hh, hw * 2, hh * 2, 6)
        ctx.fill(); ctx.stroke()
      }

      // Node text
      ctx.fillStyle = '#ffffff'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const lines = wrapText(node.label, node.type === 'decision' ? 16 : 22)
      const lineH = 14
      const startY = node.y - ((lines.length - 1) * lineH) / 2
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], node.x, startY + i * lineH)
      }
    }

    canvas.toBlob(blob => { if (blob) downloadBlob(blob, 'flowchart.png') })
  }, [nodes, edges, nodeMap])

  // ── Re-layout ────────────────────────────────────────

  const handleRelayout = useCallback(() => {
    setNodes(prev => {
      const copy = prev.map(n => ({ ...n }))
      layoutNodes(copy, edges)
      return copy
    })
  }, [edges])

  // ── Render ───────────────────────────────────────────

  return (
    <div className="h-full flex gap-6">
      {/* ── Left panel: Text editor ─────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3 overflow-y-auto pr-2">
        {/* Syntax guide */}
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/40 space-y-1">
          <p className="text-xs text-white/60 font-medium mb-1.5">Syntax Guide</p>
          <p><span className="text-green-400/60">START</span> — Start node</p>
          <p><span className="text-white/60">Plain text</span> — Process step</p>
          <p><span className="text-[#F47B20]/60">IF</span> — Decision (diamond)</p>
          <p><span className="text-[#F47B20]/60">THEN / YES</span> — Yes branch</p>
          <p><span className="text-[#F47B20]/60">OR / NO / ELSE</span> — No branch</p>
          <p><span className="text-red-400/60">END</span> — End node</p>
          <p className="text-white/25 mt-1">Lines starting with // are comments</p>
        </div>

        {/* Template selector */}
        <div className="relative">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-white/60 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:border-white/[0.15] transition-colors"
          >
            Templates <ChevronDown size={12} />
          </button>
          {showTemplates && (
            <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-dark-surface border border-white/[0.1] rounded-lg shadow-xl overflow-hidden">
              {TEMPLATES.map(t => (
                <button
                  key={t.name}
                  onClick={() => { setText(t.text); setShowTemplates(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Text input */}
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={14}
          placeholder="Type your flowchart here..."
          className="w-full px-3 py-2 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white font-mono leading-relaxed resize-none focus:outline-none focus:border-[#F47B20]/40"
        />

        {/* Generate button */}
        <Button onClick={generate} icon={<Play size={14} />} className="w-full">
          Generate Flowchart
        </Button>

        {/* Actions (only show after generation) */}
        {generated && nodes.length > 0 && (
          <div className="space-y-2">
            <Button onClick={handleRelayout} variant="secondary" className="w-full" icon={<RotateCcw size={14} />}>
              Auto Re-layout
            </Button>
            <Button onClick={handleExportPNG} variant="secondary" className="w-full" icon={<Download size={14} />}>
              Download PNG
            </Button>
          </div>
        )}

        {/* Stats */}
        {generated && (
          <div className="text-[10px] text-white/25 space-y-0.5">
            <p>{nodes.length} nodes · {edges.length} connections</p>
            <p className="text-white/20">Drag nodes to reposition</p>
          </div>
        )}
      </div>

      {/* ── Right panel: Flowchart SVG ──────────── */}
      <div className="flex-1 overflow-auto rounded-2xl bg-white/[0.02] border border-white/[0.06]">
        {!generated || nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center text-white/20 text-sm">
            Type a flowchart and click Generate
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={Math.max(bounds.w, 600)}
            height={Math.max(bounds.h, 400)}
            viewBox={`${bounds.minX} ${bounds.minY} ${Math.max(bounds.w, 600)} ${Math.max(bounds.h, 400)}`}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: dragId ? 'grabbing' : 'default' }}
          >
            {/* Arrow marker */}
            <defs>
              <marker id="flowArrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="rgba(244,123,32,0.4)" />
              </marker>
            </defs>

            {/* Edges */}
            {edges.map((edge, i) => {
              const d = edgePath(edge, nodeMap)
              if (!d) return null
              const lp = edgeLabelPos(edge, nodeMap)
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="rgba(244,123,32,0.25)" strokeWidth={1.5} markerEnd="url(#flowArrow)" />
                  {edge.label && lp && (
                    <text x={lp.x} y={lp.y} textAnchor="middle" fill="rgba(244,123,32,0.7)" fontSize={10} fontFamily="sans-serif">
                      {edge.label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const hw = nodeHalfW(node)
              const hh = nodeHalfH(node)
              const lines = wrapText(node.label, node.type === 'decision' ? 16 : 22)
              const lineH = 14

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseDown={e => handleNodeDown(node.id, e)}
                  style={{ cursor: dragId === node.id ? 'grabbing' : 'grab' }}
                >
                  {/* Shape */}
                  {node.type === 'start' && (
                    <rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} rx={hh}
                      fill="rgba(34,197,94,0.12)" stroke="rgba(34,197,94,0.4)" strokeWidth={1.5} />
                  )}
                  {node.type === 'end' && (
                    <rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} rx={hh}
                      fill="rgba(239,68,68,0.12)" stroke="rgba(239,68,68,0.4)" strokeWidth={1.5} />
                  )}
                  {node.type === 'process' && (
                    <rect x={-hw} y={-hh} width={hw * 2} height={hh * 2} rx={6}
                      fill="rgba(244,123,32,0.08)" stroke="rgba(244,123,32,0.25)" strokeWidth={1.5} />
                  )}
                  {node.type === 'decision' && (
                    <polygon
                      points={`0,${-hh} ${hw},0 0,${hh} ${-hw},0`}
                      fill="rgba(244,123,32,0.12)" stroke="rgba(244,123,32,0.4)" strokeWidth={1.5}
                    />
                  )}

                  {/* Label */}
                  {lines.map((line, i) => (
                    <text
                      key={i}
                      x={0}
                      y={-((lines.length - 1) * lineH) / 2 + i * lineH}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize={12}
                      fontFamily="sans-serif"
                    >
                      {line}
                    </text>
                  ))}
                </g>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}
