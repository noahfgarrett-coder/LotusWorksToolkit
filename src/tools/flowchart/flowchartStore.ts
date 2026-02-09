import { useState, useRef, useCallback } from 'react'
import type {
  DiagramNode, DiagramEdge, DiagramState,
  ToolMode, SelectionState, Viewport, Point, ShapeType, PortPosition,
} from './types.ts'
import {
  genId, emptySelection, DEFAULT_VIEWPORT, DEFAULT_NODE_STYLE, DEFAULT_EDGE_STYLE,
  MIN_ZOOM, MAX_ZOOM,
} from './types.ts'
import { getShapeDef } from './shapes.ts'
import { autoDetectPorts } from './connectors.ts'

const MAX_HISTORY = 50

// ── Hook: useFlowchartStore ─────────────────────────────────

export function useFlowchartStore() {
  // ── Core state ──────────────────────────────────────────
  const [nodes, setNodes] = useState<DiagramNode[]>([])
  const [edges, setEdges] = useState<DiagramEdge[]>([])
  const [selection, setSelection] = useState<SelectionState>(emptySelection)
  const [toolMode, setToolMode] = useState<ToolMode>('select')
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [gridEnabled, setGridEnabled] = useState(true)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [gridSize, setGridSize] = useState(20)

  // ── Undo/redo (ref-based, same pattern as pdf-annotate) ──
  const historyRef = useRef<DiagramState[]>([{ nodes: [], edges: [] }])
  const historyIdxRef = useRef(0)
  const [, forceRender] = useState(0)

  const canUndo = historyIdxRef.current > 0
  const canRedo = historyIdxRef.current < historyRef.current.length - 1

  const pushHistory = useCallback((nextNodes: DiagramNode[], nextEdges: DiagramEdge[]) => {
    const h = historyRef.current.slice(0, historyIdxRef.current + 1)
    h.push(structuredClone({ nodes: nextNodes, edges: nextEdges }))
    if (h.length > MAX_HISTORY) h.shift()
    historyRef.current = h
    historyIdxRef.current = h.length - 1
    forceRender(v => v + 1)
  }, [])

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current--
    const state = structuredClone(historyRef.current[historyIdxRef.current])
    setNodes(state.nodes)
    setEdges(state.edges)
    setSelection(emptySelection())
    setEditingNodeId(null)
    forceRender(v => v + 1)
  }, [])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current++
    const state = structuredClone(historyRef.current[historyIdxRef.current])
    setNodes(state.nodes)
    setEdges(state.edges)
    setSelection(emptySelection())
    setEditingNodeId(null)
    forceRender(v => v + 1)
  }, [])

  // ── Node operations ─────────────────────────────────────

  const addNode = useCallback((type: ShapeType, x: number, y: number) => {
    const def = getShapeDef(type)
    const node: DiagramNode = {
      id: genId(),
      type,
      label: def.label,
      x: x - def.defaultWidth / 2,
      y: y - def.defaultHeight / 2,
      width: def.defaultWidth,
      height: def.defaultHeight,
      style: { ...DEFAULT_NODE_STYLE },
      zIndex: nodes.length,
    }
    const nextNodes = [...nodes, node]
    setNodes(nextNodes)
    pushHistory(nextNodes, edges)
    setSelection({ nodeIds: new Set([node.id]), edgeIds: new Set() })
    return node
  }, [nodes, edges, pushHistory])

  const updateNode = useCallback((id: string, updates: Partial<DiagramNode>) => {
    const nextNodes = nodes.map(n => n.id === id ? { ...n, ...updates } : n)
    setNodes(nextNodes)
    pushHistory(nextNodes, edges)
  }, [nodes, edges, pushHistory])

  const moveNodes = useCallback((ids: Set<string>, dx: number, dy: number) => {
    const nextNodes = nodes.map(n =>
      ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n,
    )
    setNodes(nextNodes)
    // Don't push history on every move frame — only on mouse up
    return nextNodes
  }, [nodes])

  const commitMove = useCallback((currentNodes: DiagramNode[]) => {
    pushHistory(currentNodes, edges)
  }, [edges, pushHistory])

  const resizeNode = useCallback((id: string, width: number, height: number, x: number, y: number) => {
    const nextNodes = nodes.map(n =>
      n.id === id ? { ...n, width: Math.max(40, width), height: Math.max(30, height), x, y } : n,
    )
    setNodes(nextNodes)
    return nextNodes
  }, [nodes])

  const commitResize = useCallback((currentNodes: DiagramNode[]) => {
    pushHistory(currentNodes, edges)
  }, [edges, pushHistory])

  // ── Edge operations ─────────────────────────────────────

  const addEdge = useCallback((
    sourceId: string,
    sourcePort: PortPosition,
    targetId: string,
    targetPort: PortPosition,
  ) => {
    // Prevent self-connecting edges
    if (sourceId === targetId) return

    // Prevent duplicate edges between same source+target ports
    const exists = edges.some(e =>
      e.sourceId === sourceId && e.sourcePort === sourcePort &&
      e.targetId === targetId && e.targetPort === targetPort,
    )
    if (exists) return

    const edge: DiagramEdge = {
      id: genId(),
      sourceId,
      sourcePort,
      targetId,
      targetPort,
      label: '',
      routeType: 'orthogonal',
      style: { ...DEFAULT_EDGE_STYLE },
      waypoints: [],
    }
    const nextEdges = [...edges, edge]
    setEdges(nextEdges)
    pushHistory(nodes, nextEdges)
    setSelection({ nodeIds: new Set(), edgeIds: new Set([edge.id]) })
  }, [nodes, edges, pushHistory])

  const addEdgeAutoPort = useCallback((sourceId: string, targetId: string) => {
    const source = nodes.find(n => n.id === sourceId)
    const target = nodes.find(n => n.id === targetId)
    if (!source || !target) return
    const { sourcePort, targetPort } = autoDetectPorts(source, target)
    addEdge(sourceId, sourcePort, targetId, targetPort)
  }, [nodes, addEdge])

  const updateEdge = useCallback((id: string, updates: Partial<DiagramEdge>) => {
    const nextEdges = edges.map(e => e.id === id ? { ...e, ...updates } : e)
    setEdges(nextEdges)
    pushHistory(nodes, nextEdges)
  }, [nodes, edges, pushHistory])

  // ── Delete selected ─────────────────────────────────────

  const deleteSelected = useCallback(() => {
    if (selection.nodeIds.size === 0 && selection.edgeIds.size === 0) return
    const nextNodes = nodes.filter(n => !selection.nodeIds.has(n.id))
    // Also remove edges connected to deleted nodes
    const nextEdges = edges.filter(e =>
      !selection.edgeIds.has(e.id) &&
      !selection.nodeIds.has(e.sourceId) &&
      !selection.nodeIds.has(e.targetId),
    )
    setNodes(nextNodes)
    setEdges(nextEdges)
    setSelection(emptySelection())
    setEditingNodeId(null)
    pushHistory(nextNodes, nextEdges)
  }, [nodes, edges, selection, pushHistory])

  // ── Copy / Paste ────────────────────────────────────────

  const clipboardRef = useRef<{ nodes: DiagramNode[]; edges: DiagramEdge[] } | null>(null)

  const copySelected = useCallback(() => {
    const copiedNodes = nodes.filter(n => selection.nodeIds.has(n.id))
    const copiedEdges = edges.filter(e =>
      selection.edgeIds.has(e.id) ||
      (selection.nodeIds.has(e.sourceId) && selection.nodeIds.has(e.targetId)),
    )
    if (copiedNodes.length === 0 && copiedEdges.length === 0) return
    clipboardRef.current = structuredClone({ nodes: copiedNodes, edges: copiedEdges })
  }, [nodes, edges, selection])

  const paste = useCallback(() => {
    if (!clipboardRef.current) return
    const { nodes: clipNodes, edges: clipEdges } = clipboardRef.current

    // Generate new IDs and offset positions
    const idMap = new Map<string, string>()
    const offset = 30

    const newNodes = clipNodes.map((n, i) => {
      const newId = genId()
      idMap.set(n.id, newId)
      return {
        ...structuredClone(n),
        id: newId,
        x: n.x + offset,
        y: n.y + offset,
        zIndex: nodes.length + i,
      }
    })

    const newEdges = clipEdges
      .filter(e => idMap.has(e.sourceId) && idMap.has(e.targetId))
      .map(e => ({
        ...structuredClone(e),
        id: genId(),
        sourceId: idMap.get(e.sourceId)!,
        targetId: idMap.get(e.targetId)!,
      }))

    const nextNodes = [...nodes, ...newNodes]
    const nextEdges = [...edges, ...newEdges]
    setNodes(nextNodes)
    setEdges(nextEdges)
    pushHistory(nextNodes, nextEdges)
    setSelection({
      nodeIds: new Set(newNodes.map(n => n.id)),
      edgeIds: new Set(newEdges.map(e => e.id)),
    })
  }, [nodes, edges, pushHistory])

  // ── Duplicate selected ──────────────────────────────────

  const duplicateSelected = useCallback(() => {
    copySelected()
    paste()
  }, [copySelected, paste])

  // ── Select all ──────────────────────────────────────────

  const selectAll = useCallback(() => {
    setSelection({
      nodeIds: new Set(nodes.map(n => n.id)),
      edgeIds: new Set(edges.map(e => e.id)),
    })
  }, [nodes, edges])

  // ── Load diagram state (from import or JSON) ───────────

  const loadDiagram = useCallback((state: DiagramState) => {
    setNodes(state.nodes)
    setEdges(state.edges)
    setSelection(emptySelection())
    setEditingNodeId(null)
    // Reset history
    historyRef.current = [structuredClone(state)]
    historyIdxRef.current = 0
    forceRender(v => v + 1)
    // Reset viewport
    setViewport(DEFAULT_VIEWPORT)
  }, [])

  // ── Clear ───────────────────────────────────────────────

  const clearDiagram = useCallback(() => {
    loadDiagram({ nodes: [], edges: [] })
  }, [loadDiagram])

  // ── Viewport helpers ────────────────────────────────────

  const zoomTo = useCallback((newZoom: number, center?: Point) => {
    setViewport(prev => {
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
      if (center) {
        // Zoom toward the cursor position
        const scale = clampedZoom / prev.zoom
        return {
          panX: center.x - (center.x - prev.panX) * scale,
          panY: center.y - (center.y - prev.panY) * scale,
          zoom: clampedZoom,
        }
      }
      return { ...prev, zoom: clampedZoom }
    })
  }, [])

  const zoomIn = useCallback(() => {
    setViewport(prev => ({
      ...prev,
      zoom: Math.min(MAX_ZOOM, prev.zoom * 1.2),
    }))
  }, [])

  const zoomOut = useCallback(() => {
    setViewport(prev => ({
      ...prev,
      zoom: Math.max(MIN_ZOOM, prev.zoom / 1.2),
    }))
  }, [])

  const resetZoom = useCallback(() => {
    setViewport(DEFAULT_VIEWPORT)
  }, [])

  const fitToContent = useCallback(() => {
    if (nodes.length === 0) {
      resetZoom()
      return
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width)
      maxY = Math.max(maxY, n.y + n.height)
    }

    // We'll compute the proper fit when we know the container size
    // For now, just center the content
    const contentW = maxX - minX
    const contentH = maxY - minY
    const zoom = Math.min(1, 800 / (contentW + 100), 600 / (contentH + 100))

    setViewport({
      panX: -(minX - 50) * zoom,
      panY: -(minY - 50) * zoom,
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)),
    })
  }, [nodes, resetZoom])

  // ── Z-index operations ──────────────────────────────────

  const bringToFront = useCallback(() => {
    if (selection.nodeIds.size === 0) return
    const maxZ = Math.max(0, ...nodes.map(n => n.zIndex))
    let z = maxZ + 1
    const nextNodes = nodes.map(n =>
      selection.nodeIds.has(n.id) ? { ...n, zIndex: z++ } : n,
    )
    setNodes(nextNodes)
    pushHistory(nextNodes, edges)
  }, [nodes, edges, selection, pushHistory])

  const sendToBack = useCallback(() => {
    if (selection.nodeIds.size === 0) return
    const minZ = Math.min(0, ...nodes.map(n => n.zIndex))
    let z = minZ - selection.nodeIds.size
    const nextNodes = nodes.map(n =>
      selection.nodeIds.has(n.id) ? { ...n, zIndex: z++ } : n,
    )
    setNodes(nextNodes)
    pushHistory(nextNodes, edges)
  }, [nodes, edges, selection, pushHistory])

  // ── Snap helper ─────────────────────────────────────────

  const snapToGrid = useCallback((val: number): number => {
    if (!snapEnabled) return val
    return Math.round(val / gridSize) * gridSize
  }, [snapEnabled, gridSize])

  // ── Waypoint operations ───────────────────────────────

  const addWaypoint = useCallback((edgeId: string, point: Point, index?: number) => {
    const nextEdges = edges.map(e => {
      if (e.id !== edgeId) return e
      const wp = [...e.waypoints]
      if (index !== undefined) {
        wp.splice(index, 0, point)
      } else {
        wp.push(point)
      }
      return { ...e, waypoints: wp }
    })
    setEdges(nextEdges)
    pushHistory(nodes, nextEdges)
  }, [nodes, edges, pushHistory])

  const moveWaypoint = useCallback((edgeId: string, index: number, point: Point) => {
    const nextEdges = edges.map(e => {
      if (e.id !== edgeId) return e
      const wp = [...e.waypoints]
      wp[index] = point
      return { ...e, waypoints: wp }
    })
    setEdges(nextEdges)
    return nextEdges
  }, [edges])

  const commitWaypointMove = useCallback((currentEdges: DiagramEdge[]) => {
    pushHistory(nodes, currentEdges)
  }, [nodes, pushHistory])

  const removeWaypoint = useCallback((edgeId: string, index: number) => {
    const nextEdges = edges.map(e => {
      if (e.id !== edgeId) return e
      const wp = [...e.waypoints]
      wp.splice(index, 1)
      return { ...e, waypoints: wp }
    })
    setEdges(nextEdges)
    pushHistory(nodes, nextEdges)
  }, [nodes, edges, pushHistory])

  // ── Return all state and actions ────────────────────────

  return {
    // State
    nodes, edges, selection, toolMode, viewport,
    editingNodeId, gridEnabled, snapEnabled, gridSize,
    canUndo, canRedo,

    // State setters
    setNodes, setEdges, setSelection, setToolMode, setViewport,
    setEditingNodeId, setGridEnabled, setSnapEnabled, setGridSize,

    // Node actions
    addNode, updateNode, moveNodes, commitMove, resizeNode, commitResize,

    // Edge actions
    addEdge, addEdgeAutoPort, updateEdge,

    // Waypoint actions
    addWaypoint, moveWaypoint, commitWaypointMove, removeWaypoint,

    // Selection actions
    deleteSelected, copySelected, paste, duplicateSelected, selectAll,

    // Diagram actions
    loadDiagram, clearDiagram,

    // History
    undo, redo, pushHistory,

    // Viewport
    zoomTo, zoomIn, zoomOut, resetZoom, fitToContent,

    // Z-index
    bringToFront, sendToBack,

    // Grid/Snap
    snapToGrid,
  }
}

export type FlowchartStore = ReturnType<typeof useFlowchartStore>
