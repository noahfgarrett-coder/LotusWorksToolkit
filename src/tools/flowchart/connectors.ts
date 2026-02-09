import type { DiagramNode, DiagramEdge, Point, PortPosition } from './types.ts'
import { getPortPosition } from './shapes.ts'

// ── Edge path generation ────────────────────────────────────

/**
 * Generate an SVG path string for an edge based on its route type.
 * If the edge has waypoints, routes through them.
 */
export function edgePath(
  edge: DiagramEdge,
  nodeMap: Map<string, DiagramNode>,
): string {
  const source = nodeMap.get(edge.sourceId)
  const target = nodeMap.get(edge.targetId)
  if (!source || !target) return ''

  const from = getPortPosition(source, edge.sourcePort)
  const to = getPortPosition(target, edge.targetPort)
  const wp = edge.waypoints

  if (wp.length > 0) {
    switch (edge.routeType) {
      case 'straight':
        return polylinePath([from, ...wp, to])
      case 'curved':
        return smoothCurvePath([from, ...wp, to])
      case 'orthogonal':
      default:
        return orthogonalWaypointPath(from, to, wp, edge.sourcePort, edge.targetPort)
    }
  }

  switch (edge.routeType) {
    case 'straight':
      return straightPath(from, to)
    case 'curved':
      return curvedPath(from, to, edge.sourcePort, edge.targetPort)
    case 'orthogonal':
    default:
      return orthogonalPath(from, to, edge.sourcePort, edge.targetPort)
  }
}

// ── Straight line ───────────────────────────────────────────

function straightPath(from: Point, to: Point): string {
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
}

// ── Polyline (straight with waypoints) ──────────────────────

function polylinePath(points: Point[]): string {
  return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
}

// ── Smooth curve through multiple points ────────────────────

function smoothCurvePath(points: Point[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  }

  // Catmull-Rom-like approach: generate cubic bezier through all points
  let d = `M ${points[0].x} ${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]

    // Control points using Catmull-Rom to Bezier conversion
    const tension = 0.3
    const cp1 = {
      x: p1.x + (p2.x - p0.x) * tension,
      y: p1.y + (p2.y - p0.y) * tension,
    }
    const cp2 = {
      x: p2.x - (p3.x - p1.x) * tension,
      y: p2.y - (p3.y - p1.y) * tension,
    }

    d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`
  }

  return d
}

// ── Curved (cubic bezier) ───────────────────────────────────

function curvedPath(
  from: Point,
  to: Point,
  sourcePort: PortPosition,
  targetPort: PortPosition,
): string {
  const dist = Math.max(40, Math.hypot(to.x - from.x, to.y - from.y) * 0.4)

  const cp1 = controlPoint(from, sourcePort, dist)
  const cp2 = controlPoint(to, targetPort, dist)

  return `M ${from.x} ${from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${to.x} ${to.y}`
}

function controlPoint(pt: Point, port: PortPosition, dist: number): Point {
  switch (port) {
    case 'top':    return { x: pt.x, y: pt.y - dist }
    case 'bottom': return { x: pt.x, y: pt.y + dist }
    case 'left':   return { x: pt.x - dist, y: pt.y }
    case 'right':  return { x: pt.x + dist, y: pt.y }
  }
}

// ── Orthogonal (right-angle bends) ──────────────────────────

function orthogonalPath(
  from: Point,
  to: Point,
  sourcePort: PortPosition,
  targetPort: PortPosition,
): string {
  const MARGIN = 20 // standoff distance from port before bending

  // Extend from each port in its normal direction
  const p1 = extendPort(from, sourcePort, MARGIN)
  const p4 = extendPort(to, targetPort, MARGIN)

  // Simple strategy: one or two bends depending on alignment
  const isVerticalSource = sourcePort === 'top' || sourcePort === 'bottom'
  const isVerticalTarget = targetPort === 'top' || targetPort === 'bottom'

  if (isVerticalSource && isVerticalTarget) {
    // Both vertical: use horizontal midline
    const midY = (p1.y + p4.y) / 2
    return [
      `M ${from.x} ${from.y}`,
      `L ${p1.x} ${p1.y}`,
      `L ${p1.x} ${midY}`,
      `L ${p4.x} ${midY}`,
      `L ${p4.x} ${p4.y}`,
      `L ${to.x} ${to.y}`,
    ].join(' ')
  }

  if (!isVerticalSource && !isVerticalTarget) {
    // Both horizontal: use vertical midline
    const midX = (p1.x + p4.x) / 2
    return [
      `M ${from.x} ${from.y}`,
      `L ${p1.x} ${p1.y}`,
      `L ${midX} ${p1.y}`,
      `L ${midX} ${p4.y}`,
      `L ${p4.x} ${p4.y}`,
      `L ${to.x} ${to.y}`,
    ].join(' ')
  }

  // Mixed: one vertical, one horizontal — single elbow
  if (isVerticalSource) {
    return [
      `M ${from.x} ${from.y}`,
      `L ${p1.x} ${p1.y}`,
      `L ${p1.x} ${p4.y}`,
      `L ${p4.x} ${p4.y}`,
      `L ${to.x} ${to.y}`,
    ].join(' ')
  }

  return [
    `M ${from.x} ${from.y}`,
    `L ${p1.x} ${p1.y}`,
    `L ${p4.x} ${p1.y}`,
    `L ${p4.x} ${p4.y}`,
    `L ${to.x} ${to.y}`,
  ].join(' ')
}

// ── Orthogonal with waypoints ───────────────────────────────

function orthogonalWaypointPath(
  from: Point,
  to: Point,
  waypoints: Point[],
  sourcePort: PortPosition,
  targetPort: PortPosition,
): string {
  const MARGIN = 20
  const p1 = extendPort(from, sourcePort, MARGIN)
  const pLast = extendPort(to, targetPort, MARGIN)

  // Route: source → p1 → each waypoint (with right-angle bends) → pLast → target
  const allPoints = [from, p1, ...waypoints, pLast, to]
  const segments: string[] = [`M ${allPoints[0].x} ${allPoints[0].y}`]

  for (let i = 1; i < allPoints.length; i++) {
    const prev = allPoints[i - 1]
    const curr = allPoints[i]
    // For the first and last segments (port extensions), go direct
    if (i <= 1 || i >= allPoints.length - 1) {
      segments.push(`L ${curr.x} ${curr.y}`)
    } else {
      // Route through waypoint with right-angle: horizontal then vertical
      segments.push(`L ${curr.x} ${prev.y}`)
      segments.push(`L ${curr.x} ${curr.y}`)
    }
  }

  return segments.join(' ')
}

function extendPort(pt: Point, port: PortPosition, dist: number): Point {
  switch (port) {
    case 'top':    return { x: pt.x, y: pt.y - dist }
    case 'bottom': return { x: pt.x, y: pt.y + dist }
    case 'left':   return { x: pt.x - dist, y: pt.y }
    case 'right':  return { x: pt.x + dist, y: pt.y }
  }
}

// ── Edge label position ─────────────────────────────────────

/**
 * Returns the midpoint of an edge path for label placement.
 * If waypoints exist, uses the middle waypoint or mid-segment.
 */
export function edgeMidpoint(
  edge: DiagramEdge,
  nodeMap: Map<string, DiagramNode>,
): Point | null {
  const source = nodeMap.get(edge.sourceId)
  const target = nodeMap.get(edge.targetId)
  if (!source || !target) return null

  const from = getPortPosition(source, edge.sourcePort)
  const to = getPortPosition(target, edge.targetPort)

  if (edge.waypoints.length > 0) {
    // Use the middle waypoint as the label position
    const midIdx = Math.floor(edge.waypoints.length / 2)
    const wp = edge.waypoints[midIdx]
    return { x: wp.x, y: wp.y }
  }

  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  }
}

// ── Get all segments of an edge path ────────────────────────

/**
 * Returns the polyline points of an edge for hit testing.
 */
export function getEdgePoints(
  edge: DiagramEdge,
  nodeMap: Map<string, DiagramNode>,
): Point[] {
  const source = nodeMap.get(edge.sourceId)
  const target = nodeMap.get(edge.targetId)
  if (!source || !target) return []

  const from = getPortPosition(source, edge.sourcePort)
  const to = getPortPosition(target, edge.targetPort)

  if (edge.waypoints.length > 0) {
    if (edge.routeType === 'straight') {
      return [from, ...edge.waypoints, to]
    }
    // For orthogonal with waypoints, return the full segment list
    const MARGIN = 20
    const p1 = extendPort(from, edge.sourcePort, MARGIN)
    const pLast = extendPort(to, edge.targetPort, MARGIN)
    const allPoints = [from, p1, ...edge.waypoints, pLast, to]
    const result: Point[] = [allPoints[0]]
    for (let i = 1; i < allPoints.length; i++) {
      const prev = allPoints[i - 1]
      const curr = allPoints[i]
      if (i > 1 && i < allPoints.length - 1) {
        result.push({ x: curr.x, y: prev.y })
      }
      result.push(curr)
    }
    return result
  }

  if (edge.routeType === 'straight') {
    return [from, to]
  }

  return getOrthogonalSegments(from, to, edge.sourcePort, edge.targetPort)
}

// ── Hit testing ─────────────────────────────────────────────

/**
 * Test if a point is within `threshold` pixels of an edge path.
 */
export function hitTestEdge(
  edge: DiagramEdge,
  nodeMap: Map<string, DiagramNode>,
  pt: Point,
  threshold: number = 6,
): boolean {
  const segments = getEdgePoints(edge, nodeMap)
  if (segments.length < 2) return false

  for (let i = 0; i < segments.length - 1; i++) {
    if (distToSegment(pt, segments[i], segments[i + 1]) < threshold) {
      return true
    }
  }
  return false
}

/**
 * Find the segment index closest to a point on an edge.
 * Returns the index where a new waypoint should be inserted.
 */
export function findClosestSegment(
  edge: DiagramEdge,
  nodeMap: Map<string, DiagramNode>,
  pt: Point,
): number {
  const source = nodeMap.get(edge.sourceId)
  const target = nodeMap.get(edge.targetId)
  if (!source || !target) return 0

  const from = getPortPosition(source, edge.sourcePort)
  const to = getPortPosition(target, edge.targetPort)
  const points = [from, ...edge.waypoints, to]

  let minDist = Infinity
  let bestIdx = 0

  for (let i = 0; i < points.length - 1; i++) {
    const d = distToSegment(pt, points[i], points[i + 1])
    if (d < minDist) {
      minDist = d
      bestIdx = i
    }
  }

  // Return the waypoint insertion index (0-based into waypoints array)
  return bestIdx
}

function getOrthogonalSegments(
  from: Point,
  to: Point,
  sourcePort: PortPosition,
  targetPort: PortPosition,
): Point[] {
  const MARGIN = 20
  const p1 = extendPort(from, sourcePort, MARGIN)
  const p4 = extendPort(to, targetPort, MARGIN)
  const isVerticalSource = sourcePort === 'top' || sourcePort === 'bottom'
  const isVerticalTarget = targetPort === 'top' || targetPort === 'bottom'

  if (isVerticalSource && isVerticalTarget) {
    const midY = (p1.y + p4.y) / 2
    return [from, p1, { x: p1.x, y: midY }, { x: p4.x, y: midY }, p4, to]
  }
  if (!isVerticalSource && !isVerticalTarget) {
    const midX = (p1.x + p4.x) / 2
    return [from, p1, { x: midX, y: p1.y }, { x: midX, y: p4.y }, p4, to]
  }
  if (isVerticalSource) {
    return [from, p1, { x: p1.x, y: p4.y }, p4, to]
  }
  return [from, p1, { x: p4.x, y: p1.y }, p4, to]
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

// ── Auto-detect best port pair ──────────────────────────────

/**
 * Given two nodes, determine the best source/target ports
 * based on relative position.
 */
export function autoDetectPorts(
  source: DiagramNode,
  target: DiagramNode,
): { sourcePort: PortPosition; targetPort: PortPosition } {
  const sCx = source.x + source.width / 2
  const sCy = source.y + source.height / 2
  const tCx = target.x + target.width / 2
  const tCy = target.y + target.height / 2

  const dx = tCx - sCx
  const dy = tCy - sCy

  // Determine dominant direction
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal
    return dx > 0
      ? { sourcePort: 'right', targetPort: 'left' }
      : { sourcePort: 'left', targetPort: 'right' }
  } else {
    // Vertical
    return dy > 0
      ? { sourcePort: 'bottom', targetPort: 'top' }
      : { sourcePort: 'top', targetPort: 'bottom' }
  }
}
