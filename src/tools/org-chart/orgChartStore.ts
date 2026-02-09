import { useState, useRef, useCallback } from 'react'
import type { OrgNode, OrgChartState, Viewport, LayoutDirection } from './types.ts'
import { createNode, DEFAULT_VIEWPORT, MIN_ZOOM, MAX_ZOOM } from './types.ts'

const MAX_HISTORY = 50

// ── Hook: useOrgChartStore ──────────────────────────────────

export function useOrgChartStore() {
  // ── Core state ──────────────────────────────────────────
  const [nodes, setNodes] = useState<OrgNode[]>([
    createNode({ id: 'root', name: 'CEO', title: 'Chief Executive Officer', reportsTo: '' }),
  ])
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT)
  const [layoutDirection, setLayoutDirection] = useState<LayoutDirection>('top-down')

  // Derived: first selected node ID for backward compat (PropertiesPanel)
  const selectedNodeId = selectedNodeIds.size > 0 ? [...selectedNodeIds][0] : null

  // Ref to track latest nodes for commitMove
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  // ── Undo/redo (ref-based, structuredClone) ──────────────
  const historyRef = useRef<OrgChartState[]>([{ nodes: [] }])
  const historyIdxRef = useRef(0)
  const [, forceRender] = useState(0)

  const canUndo = historyIdxRef.current > 0
  const canRedo = historyIdxRef.current < historyRef.current.length - 1

  const pushHistory = useCallback((nextNodes: OrgNode[]) => {
    const h = historyRef.current.slice(0, historyIdxRef.current + 1)
    h.push(structuredClone({ nodes: nextNodes }))
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
    setSelectedNodeIds(new Set())
    forceRender(v => v + 1)
  }, [])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current++
    const state = structuredClone(historyRef.current[historyIdxRef.current])
    setNodes(state.nodes)
    setSelectedNodeIds(new Set())
    forceRender(v => v + 1)
  }, [])

  // ── Node CRUD ─────────────────────────────────────────

  const addNode = useCallback((parentId: string, overrides?: Partial<OrgNode>) => {
    const node = createNode({ reportsTo: parentId, ...overrides })
    const nextNodes = [...nodes, node]
    setNodes(nextNodes)
    pushHistory(nextNodes)
    setSelectedNodeIds(new Set([node.id]))
    return node
  }, [nodes, pushHistory])

  const updateNode = useCallback((id: string, updates: Partial<OrgNode>) => {
    const nextNodes = nodes.map(n => n.id === id ? { ...n, ...updates } : n)
    setNodes(nextNodes)
    pushHistory(nextNodes)
  }, [nodes, pushHistory])

  const removeNode = useCallback((id: string) => {
    // Don't allow removing the root node
    const node = nodes.find(n => n.id === id)
    if (!node || !node.reportsTo) return

    // Cascade delete: find all descendants
    const toRemove = new Set<string>([id])
    let found = true
    while (found) {
      found = false
      for (const n of nodes) {
        if (!toRemove.has(n.id) && toRemove.has(n.reportsTo)) {
          toRemove.add(n.id)
          found = true
        }
      }
    }

    const nextNodes = nodes.filter(n => !toRemove.has(n.id))
    setNodes(nextNodes)
    pushHistory(nextNodes)
    setSelectedNodeIds(prev => {
      const next = new Set(prev)
      for (const rid of toRemove) next.delete(rid)
      return next.size !== prev.size ? next : prev
    })
  }, [nodes, pushHistory])

  const removeSelectedNodes = useCallback(() => {
    const toRemove = new Set<string>()
    for (const id of selectedNodeIds) {
      const node = nodes.find(n => n.id === id)
      if (node && node.reportsTo) toRemove.add(id) // skip root
    }
    // Cascade
    let found = true
    while (found) {
      found = false
      for (const n of nodes) {
        if (!toRemove.has(n.id) && toRemove.has(n.reportsTo)) {
          toRemove.add(n.id)
          found = true
        }
      }
    }
    if (toRemove.size === 0) return
    const nextNodes = nodes.filter(n => !toRemove.has(n.id))
    setNodes(nextNodes)
    pushHistory(nextNodes)
    setSelectedNodeIds(new Set())
  }, [nodes, selectedNodeIds, pushHistory])

  const reparentNode = useCallback((nodeId: string, newParentId: string) => {
    // Prevent self-parenting
    if (nodeId === newParentId) return

    // Prevent parenting to a descendant (would create cycle)
    if (isDescendant(nodes, nodeId, newParentId)) return

    const nextNodes = nodes.map(n =>
      n.id === nodeId ? { ...n, reportsTo: newParentId } : n,
    )
    setNodes(nextNodes)
    pushHistory(nextNodes)
  }, [nodes, pushHistory])

  /** Atomically revert drag offsets + reparent selected nodes (uses nodesRef for latest state).
   *  Preserves internal hierarchy: only "top-level" selected nodes (whose parent is NOT
   *  also in the selection) get reparented. Internal relationships stay intact. */
  const reparentAfterDrag = useCallback((
    draggedIds: Set<string>,
    newParentId: string,
    revertDx: number,
    revertDy: number,
  ) => {
    const current = nodesRef.current

    // Find top-level selected nodes: those whose parent is NOT also selected.
    // Internal nodes (parent is in selection) keep their existing reportsTo.
    const topLevel = new Set<string>()
    for (const id of draggedIds) {
      const node = current.find(n => n.id === id)
      if (!node || !node.reportsTo) continue // skip root
      if (draggedIds.has(node.reportsTo)) continue // internal — parent is also selected
      topLevel.add(id)
    }

    // Validate top-level nodes for reparent (no self-parenting, no cycles)
    const canReparent = new Set<string>()
    for (const id of topLevel) {
      if (id === newParentId) continue
      if (isDescendant(current, id, newParentId)) continue
      canReparent.add(id)
    }
    if (canReparent.size === 0) return

    const nextNodes = current.map(n => {
      if (canReparent.has(n.id)) {
        // Top-level reparented: change parent + reset offsets
        return { ...n, reportsTo: newParentId, offsetX: 0, offsetY: 0 }
      }
      if (draggedIds.has(n.id)) {
        if (draggedIds.has(n.reportsTo)) {
          // Internal node (parent also selected): subtree follows, reset offsets
          return { ...n, offsetX: 0, offsetY: 0 }
        }
        // Not internal, not reparented (e.g. root): revert drag offsets
        return { ...n, offsetX: n.offsetX + revertDx, offsetY: n.offsetY + revertDy }
      }
      return n
    })
    setNodes(nextNodes)
    pushHistory(nextNodes)
    setSelectedNodeIds(draggedIds)
  }, [pushHistory])

  // ── Selection ─────────────────────────────────────────

  const selectNode = useCallback((id: string | null, additive = false) => {
    if (id === null) {
      setSelectedNodeIds(new Set())
      return
    }
    if (additive) {
      setSelectedNodeIds(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else {
      setSelectedNodeIds(new Set([id]))
    }
  }, [])

  const selectAll = useCallback(() => {
    setSelectedNodeIds(new Set(nodes.map(n => n.id)))
  }, [nodes])

  const selectNodes = useCallback((ids: string[]) => {
    setSelectedNodeIds(new Set(ids))
  }, [])

  // ── Move operations (no history push during drag) ─────

  const moveNodes = useCallback((ids: Set<string>, dx: number, dy: number) => {
    setNodes(prev => prev.map(n =>
      ids.has(n.id) ? { ...n, offsetX: n.offsetX + dx, offsetY: n.offsetY + dy } : n,
    ))
  }, [])

  const commitMove = useCallback(() => {
    pushHistory(nodesRef.current)
  }, [pushHistory])

  const resetLayout = useCallback(() => {
    const hasOffsets = nodes.some(n => n.offsetX !== 0 || n.offsetY !== 0)
    if (!hasOffsets) return
    const nextNodes = nodes.map(n => ({ ...n, offsetX: 0, offsetY: 0 }))
    setNodes(nextNodes)
    pushHistory(nextNodes)
  }, [nodes, pushHistory])

  const hasManualOffsets = nodes.some(n => n.offsetX !== 0 || n.offsetY !== 0)

  // ── Diagram operations ────────────────────────────────

  const loadDiagram = useCallback((state: OrgChartState) => {
    setNodes(state.nodes)
    setSelectedNodeIds(new Set())
    historyRef.current = [structuredClone(state)]
    historyIdxRef.current = 0
    forceRender(v => v + 1)
    setViewport(DEFAULT_VIEWPORT)
  }, [])

  const clearDiagram = useCallback(() => {
    loadDiagram({ nodes: [createNode({ id: 'root', name: 'CEO', title: 'Chief Executive Officer', reportsTo: '' })] })
  }, [loadDiagram])

  // ── Viewport helpers ──────────────────────────────────

  const zoomTo = useCallback((newZoom: number, center?: { x: number; y: number }) => {
    setViewport(prev => {
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
      if (center) {
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

  // fitToContent needs to be called from Canvas where we know the container size
  // We expose setViewport so Canvas can compute and apply the fit

  // ── Return ────────────────────────────────────────────

  return {
    // State
    nodes, selectedNodeIds, selectedNodeId, viewport, layoutDirection,
    canUndo, canRedo, hasManualOffsets,

    // Setters
    setViewport, setLayoutDirection,

    // Node actions
    addNode, updateNode, removeNode, removeSelectedNodes, reparentNode, reparentAfterDrag,

    // Selection
    selectNode, selectAll, selectNodes,

    // Move
    moveNodes, commitMove, resetLayout,

    // Diagram actions
    loadDiagram, clearDiagram,

    // History
    undo, redo,

    // Zoom
    zoomIn, zoomOut, resetZoom, zoomTo,
  }
}

export type OrgChartStore = ReturnType<typeof useOrgChartStore>

// ── Utility ─────────────────────────────────────────────────

/** Check if `ancestorId` is an ancestor of `nodeId` in the tree. */
function isDescendant(nodes: OrgNode[], ancestorId: string, nodeId: string): boolean {
  let current = nodeId
  const visited = new Set<string>()
  while (current) {
    if (current === ancestorId) return true
    if (visited.has(current)) return false // safety: break cycles
    visited.add(current)
    const node = nodes.find(n => n.id === current)
    current = node?.reportsTo || ''
  }
  return false
}
