// ── Flowchart Diagram Types ──────────────────────────────────

export interface Point {
  x: number
  y: number
}

// ── Shape types ─────────────────────────────────────────────

export type ShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'diamond'
  | 'pill'
  | 'circle'
  | 'parallelogram'
  | 'cylinder'
  | 'triangle'
  | 'hexagon'
  | 'document'
  | 'cloud'
  | 'callout'
  | 'star'

export type PortPosition = 'top' | 'right' | 'bottom' | 'left'

// ── Node styling ────────────────────────────────────────────

export interface NodeStyle {
  fill: string
  stroke: string
  strokeWidth: number
  fontSize: number
  fontColor: string
}

export const DEFAULT_NODE_STYLE: NodeStyle = {
  fill: 'rgba(244,123,32,0.08)',
  stroke: 'rgba(244,123,32,0.4)',
  strokeWidth: 1.5,
  fontSize: 13,
  fontColor: '#ffffff',
}

// ── Edge styling ────────────────────────────────────────────

export type EdgeRouteType = 'straight' | 'orthogonal' | 'curved'

export interface EdgeStyle {
  stroke: string
  strokeWidth: number
  dashArray: string       // '' = solid, '6 3' = dashed, '2 2' = dotted
  markerEnd: boolean      // arrowhead on target
}

export const DEFAULT_EDGE_STYLE: EdgeStyle = {
  stroke: 'rgba(244,123,32,0.5)',
  strokeWidth: 1.5,
  dashArray: '',
  markerEnd: true,
}

// ── Diagram node ────────────────────────────────────────────

export interface DiagramNode {
  id: string
  type: ShapeType
  label: string
  x: number
  y: number
  width: number
  height: number
  style: NodeStyle
  zIndex: number
}

// ── Diagram edge ────────────────────────────────────────────

export interface DiagramEdge {
  id: string
  sourceId: string
  sourcePort: PortPosition
  targetId: string
  targetPort: PortPosition
  label: string
  routeType: EdgeRouteType
  style: EdgeStyle
  waypoints: Point[]
}

// ── Diagram state (for undo/redo snapshots) ─────────────────

export interface DiagramState {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

// ── Interaction modes ───────────────────────────────────────

export type ToolMode =
  | 'select'            // default pointer mode
  | 'pan'               // hand/pan tool
  | 'connect'           // click source then target to draw edge
  | { place: ShapeType } // click to place a shape of this type

// ── Selection ───────────────────────────────────────────────

export interface SelectionState {
  nodeIds: Set<string>
  edgeIds: Set<string>
}

export function emptySelection(): SelectionState {
  return { nodeIds: new Set(), edgeIds: new Set() }
}

// ── Canvas viewport ─────────────────────────────────────────

export interface Viewport {
  panX: number
  panY: number
  zoom: number
}

export const DEFAULT_VIEWPORT: Viewport = {
  panX: 0,
  panY: 0,
  zoom: 1,
}

export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 4

// ── Utility ─────────────────────────────────────────────────

export function genId(): string {
  return Math.random().toString(36).substring(2, 11)
}
