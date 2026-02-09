// ── Org Chart Types ──────────────────────────────────────────

export interface OrgNode {
  id: string
  name: string
  title: string
  reportsTo: string           // parent node id, '' for root
  department: string
  email: string
  phone: string
  location: string
  imageDataUrl: string | null // base64 avatar (max 128px, JPEG)
  nodeColor: string           // accent color (top bar on card)
  offsetX: number             // manual position offset from auto-layout (default 0)
  offsetY: number             // manual position offset from auto-layout (default 0)
}

export interface LayoutNode extends OrgNode {
  x: number
  y: number
  width: number
  height: number
  children: LayoutNode[]
}

export interface OrgChartState {
  nodes: OrgNode[]
}

// ── Viewport ────────────────────────────────────────────────

export interface Viewport {
  panX: number
  panY: number
  zoom: number
}

export const DEFAULT_VIEWPORT: Viewport = { panX: 0, panY: 0, zoom: 1 }
export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 4

// ── Layout ──────────────────────────────────────────────────

export type LayoutDirection = 'top-down' | 'left-right'

// ── Constants ───────────────────────────────────────────────

export const NODE_WIDTH = 220
export const NODE_HEIGHT = 90
export const H_SPACING = 50
export const V_SPACING = 90
export const AVATAR_SIZE = 40
export const CONNECTOR_RADIUS = 6

// ── Department color presets ────────────────────────────────

export const DEPARTMENT_COLORS: Record<string, string> = {
  Engineering: '#3B82F6',
  Marketing: '#22C55E',
  Sales: '#F59E0B',
  Finance: '#8B5CF6',
  HR: '#EC4899',
  Operations: '#F97316',
  Design: '#06B6D4',
  Legal: '#6366F1',
}

// ── Factory ─────────────────────────────────────────────────

export function genId(): string {
  return Math.random().toString(36).substring(2, 11)
}

export function createNode(overrides: Partial<OrgNode> = {}): OrgNode {
  return {
    id: genId(),
    name: 'New Person',
    title: 'Title',
    reportsTo: '',
    department: '',
    email: '',
    phone: '',
    location: '',
    imageDataUrl: null,
    nodeColor: '#F47B20',
    offsetX: 0,
    offsetY: 0,
    ...overrides,
  }
}
