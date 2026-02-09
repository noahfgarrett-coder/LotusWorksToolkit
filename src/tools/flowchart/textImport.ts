import type { DiagramNode, DiagramEdge, DiagramState } from './types.ts'
import { genId, DEFAULT_NODE_STYLE } from './types.ts'
import { getShapeDef } from './shapes.ts'

// ── Text parser ─────────────────────────────────────────────
// Parses a simple text DSL into a diagram:
//   START Begin          → pill node (green)
//   END Done             → pill node (red)
//   IF Condition?        → diamond node
//   THEN / YES Label     → Yes branch
//   OR / NO / ELSE Label → No branch
//   Plain text           → rectangle process node
//   // comment           → ignored
//   # comment            → ignored

interface ParsedNode {
  id: string
  type: 'start' | 'end' | 'process' | 'decision'
  label: string
  x: number
  y: number
}

interface ParsedEdge {
  from: string
  to: string
  label?: string
}

function parseFlowchartText(text: string): { nodes: ParsedNode[]; edges: ParsedEdge[] } {
  const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('#'))
  const nodes: ParsedNode[] = []
  const edges: ParsedEdge[] = []

  let lastMainId: string | null = null
  let currentDecisionId: string | null = null
  const pendingBranchIds: string[] = []

  for (const raw of lines) {
    const trimmed = raw.trim()
    const upper = trimmed.toUpperCase()

    let type: ParsedNode['type'] = 'process'
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
    const node: ParsedNode = { id, type, label, x: 0, y: 0 }

    if (branchType) {
      nodes.push(node)
      if (currentDecisionId) {
        edges.push({ from: currentDecisionId, to: id, label: branchType === 'then' ? 'Yes' : 'No' })
      }
      pendingBranchIds.push(id)
    } else {
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

// ── Layout ──────────────────────────────────────────────────

const V_GAP = 80
const BRANCH_OFFSET = 170
const CENTER_X = 400

function layoutParsedNodes(nodes: ParsedNode[], edges: ParsedEdge[]): void {
  const incomingLabels = new Map<string, string>()
  for (const edge of edges) {
    if (edge.label) incomingLabels.set(edge.to, edge.label)
  }

  let y = 50
  let decisionY = 0
  let hasPendingBranches = false
  let branchBottomY = 0

  const NODE_H = 50

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

// ── Convert parsed format → DiagramState ────────────────────

function parsedToDiagram(
  parsed: { nodes: ParsedNode[]; edges: ParsedEdge[] },
): DiagramState {
  const nodeMap = new Map<string, ParsedNode>()
  for (const n of parsed.nodes) nodeMap.set(n.id, n)

  const diagramNodes: DiagramNode[] = parsed.nodes.map((n, i) => {
    let shapeType: DiagramNode['type'] = 'rounded-rectangle'
    let style = { ...DEFAULT_NODE_STYLE }

    if (n.type === 'start') {
      shapeType = 'pill'
      style = { ...style, fill: 'rgba(34,197,94,0.12)', stroke: 'rgba(34,197,94,0.4)' }
    } else if (n.type === 'end') {
      shapeType = 'pill'
      style = { ...style, fill: 'rgba(239,68,68,0.12)', stroke: 'rgba(239,68,68,0.4)' }
    } else if (n.type === 'decision') {
      shapeType = 'diamond'
      style = { ...style, fill: 'rgba(244,123,32,0.12)', stroke: 'rgba(244,123,32,0.4)' }
    }

    const def = getShapeDef(shapeType)
    return {
      id: n.id,
      type: shapeType,
      label: n.label,
      x: n.x - def.defaultWidth / 2,    // convert from center to top-left
      y: n.y - def.defaultHeight / 2,
      width: def.defaultWidth,
      height: def.defaultHeight,
      style,
      zIndex: i,
    }
  })

  const diagramEdges: DiagramEdge[] = parsed.edges.map(e => {
    const source = nodeMap.get(e.from)
    const target = nodeMap.get(e.to)

    // Determine ports based on relative position
    let sourcePort: DiagramEdge['sourcePort'] = 'bottom'
    let targetPort: DiagramEdge['targetPort'] = 'top'

    if (source && target) {
      if (Math.abs(source.x - target.x) > 50) {
        // Horizontal branch
        sourcePort = source.x < target.x ? 'right' : 'left'
        targetPort = 'top'
      }
    }

    return {
      id: genId(),
      sourceId: e.from,
      sourcePort,
      targetId: e.to,
      targetPort,
      label: e.label || '',
      routeType: 'orthogonal' as const,
      style: {
        stroke: 'rgba(244,123,32,0.5)',
        strokeWidth: 1.5,
        dashArray: '',
        markerEnd: true,
      },
      waypoints: [],
    }
  })

  return { nodes: diagramNodes, edges: diagramEdges }
}

// ── Public API ──────────────────────────────────────────────

export function importFromText(text: string): DiagramState {
  const parsed = parseFlowchartText(text)
  layoutParsedNodes(parsed.nodes, parsed.edges)
  return parsedToDiagram(parsed)
}

// ── Templates ───────────────────────────────────────────────

export const TEMPLATES: { name: string; text: string }[] = [
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
