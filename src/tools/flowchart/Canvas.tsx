import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import type { FlowchartStore } from './flowchartStore.ts'
import type { Point, DiagramNode, DiagramEdge, PortPosition } from './types.ts'
import { emptySelection, MIN_ZOOM, MAX_ZOOM } from './types.ts'
import { getShapeDef, getPortPosition } from './shapes.ts'
import { edgePath, edgeMidpoint, hitTestEdge, autoDetectPorts, findClosestSegment } from './connectors.ts'

// ── Constants ───────────────────────────────────────────────

const PORT_RADIUS = 5
const RESIZE_HANDLE_SIZE = 7
const WAYPOINT_HANDLE_SIZE = 5
const SELECTION_COLOR = '#3B82F6'
const PORT_COLOR = '#3B82F6'
const GUIDE_COLOR = 'rgba(59,130,246,0.5)'
const GRID_DOT_COLOR = 'rgba(255,255,255,0.06)'
const ALIGN_THRESHOLD = 6 // px in diagram space for snap + guide display

// ── Interaction state (not in store — transient) ────────────

interface DragState {
  type: 'move' | 'pan' | 'rubberband' | 'connectPort' | 'resize' | 'moveWaypoint'
  startX: number
  startY: number
  currentX: number
  currentY: number
  // For move
  moved?: boolean
  // For connectPort
  sourceNodeId?: string
  sourcePort?: PortPosition
  // For resize
  resizeNodeId?: string
  resizeHandle?: string
  origNode?: { x: number; y: number; width: number; height: number }
  // For moveWaypoint
  waypointEdgeId?: string
  waypointIndex?: number
}

interface ContextMenuState {
  x: number  // screen coordinates
  y: number
  items: { label: string; action: () => void; danger?: boolean; disabled?: boolean }[]
}

interface AlignGuide {
  type: 'h' | 'v'
  pos: number
}

// ── Component ───────────────────────────────────────────────

export function Canvas({ store }: { store: FlowchartStore }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [hoveredPort, setHoveredPort] = useState<{ nodeId: string; port: PortPosition } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag

  // ── Connect tool state ────────────────────────────────
  const [connectSource, setConnectSource] = useState<string | null>(null)
  const [connectCursor, setConnectCursor] = useState<Point | null>(null)

  // ── Context menu ──────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // ── Edge label editing ────────────────────────────────
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null)

  // ── Place mode preview cursor ────────────────────────
  const [placeCursor, setPlaceCursor] = useState<Point | null>(null)

  // ── Alignment guides ──────────────────────────────────
  const [guides, setGuides] = useState<AlignGuide[]>([])

  const {
    nodes, edges, selection, toolMode, viewport,
    editingNodeId, gridEnabled, gridSize, snapEnabled,
    setSelection, setToolMode, setEditingNodeId, setViewport,
    addNode, moveNodes, commitMove, resizeNode, commitResize,
    addEdge, addEdgeAutoPort, deleteSelected, snapToGrid,
    moveWaypoint, commitWaypointMove, addWaypoint, removeWaypoint,
    updateEdge, copySelected, paste, duplicateSelected,
    bringToFront, sendToBack,
  } = store

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  // ── SVG coordinate conversion ─────────────────────────────

  const screenToSvg = useCallback((clientX: number, clientY: number): Point => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    return {
      x: (clientX - rect.left - viewport.panX) / viewport.zoom,
      y: (clientY - rect.top - viewport.panY) / viewport.zoom,
    }
  }, [viewport])

  // Reset connect source when tool mode changes away from connect
  useEffect(() => {
    if (toolMode !== 'connect') {
      setConnectSource(null)
      setConnectCursor(null)
    }
  }, [toolMode])

  // ── Wheel zoom ────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const zoomFactor = e.deltaY < 0 ? 1.08 : 1 / 1.08
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * zoomFactor))
      const scale = newZoom / viewport.zoom

      setViewport({
        panX: mouseX - (mouseX - viewport.panX) * scale,
        panY: mouseY - (mouseY - viewport.panY) * scale,
        zoom: newZoom,
      })
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [viewport, setViewport])

  // ── Mouse down ────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Close context menu on any click
    if (contextMenu) setContextMenu(null)

    if (e.button === 1 || (e.button === 0 && toolMode === 'pan')) {
      setDrag({
        type: 'pan',
        startX: e.clientX - viewport.panX,
        startY: e.clientY - viewport.panY,
        currentX: e.clientX,
        currentY: e.clientY,
      })
      return
    }

    if (e.button !== 0) return

    const pt = screenToSvg(e.clientX, e.clientY)

    // ── Connect mode ──────────────────────────
    if (toolMode === 'connect') {
      const sorted = [...nodes].sort((a, b) => b.zIndex - a.zIndex)
      for (const node of sorted) {
        if (hitTestNode(pt, node)) {
          if (!connectSource) {
            // First click — set source
            setConnectSource(node.id)
            setSelection({ nodeIds: new Set([node.id]), edgeIds: new Set() })
          } else if (connectSource !== node.id) {
            // Second click — create edge
            addEdgeAutoPort(connectSource, node.id)
            setConnectSource(null)
            setConnectCursor(null)
          }
          return
        }
      }
      // Click on empty space — cancel
      setConnectSource(null)
      setConnectCursor(null)
      return
    }

    // Place mode — drop a shape (hold Cmd/Ctrl to keep placing)
    if (typeof toolMode === 'object' && 'place' in toolMode) {
      const x = snapEnabled ? snapToGrid(pt.x) : pt.x
      const y = snapEnabled ? snapToGrid(pt.y) : pt.y
      addNode(toolMode.place, x, y)
      if (!e.metaKey && !e.ctrlKey) {
        setToolMode('select')
      }
      return
    }

    // Select mode — check what's under cursor
    const sorted = [...nodes].sort((a, b) => b.zIndex - a.zIndex)

    // Check resize handles first
    if (selection.nodeIds.size === 1) {
      const selNode = nodes.find(n => selection.nodeIds.has(n.id))
      if (selNode) {
        const handle = hitTestResizeHandle(pt, selNode)
        if (handle) {
          setDrag({
            type: 'resize',
            startX: pt.x,
            startY: pt.y,
            currentX: pt.x,
            currentY: pt.y,
            resizeNodeId: selNode.id,
            resizeHandle: handle,
            origNode: { x: selNode.x, y: selNode.y, width: selNode.width, height: selNode.height },
          })
          return
        }
      }
    }

    // Check waypoint handles on selected edges
    if (selection.edgeIds.size === 1) {
      const selEdge = edges.find(e => selection.edgeIds.has(e.id))
      if (selEdge && selEdge.waypoints.length > 0) {
        for (let i = 0; i < selEdge.waypoints.length; i++) {
          const wp = selEdge.waypoints[i]
          if (Math.hypot(pt.x - wp.x, pt.y - wp.y) < 10 / viewport.zoom) {
            setDrag({
              type: 'moveWaypoint',
              startX: pt.x,
              startY: pt.y,
              currentX: pt.x,
              currentY: pt.y,
              waypointEdgeId: selEdge.id,
              waypointIndex: i,
            })
            return
          }
        }
      }
    }

    for (const node of sorted) {
      if (hitTestNode(pt, node)) {
        const alreadySelected = selection.nodeIds.has(node.id)

        if (e.shiftKey) {
          const next = new Set(selection.nodeIds)
          if (alreadySelected) next.delete(node.id)
          else next.add(node.id)
          setSelection({ ...selection, nodeIds: next })
        } else if (!alreadySelected) {
          setSelection({ nodeIds: new Set([node.id]), edgeIds: new Set() })
        }

        setDrag({
          type: 'move',
          startX: pt.x,
          startY: pt.y,
          currentX: pt.x,
          currentY: pt.y,
          moved: false,
        })
        return
      }
    }

    // Check edges
    for (const edge of edges) {
      if (hitTestEdge(edge, nodeMap, pt, 8 / viewport.zoom)) {
        if (e.shiftKey) {
          const next = new Set(selection.edgeIds)
          if (selection.edgeIds.has(edge.id)) next.delete(edge.id)
          else next.add(edge.id)
          setSelection({ ...selection, edgeIds: next })
        } else {
          setSelection({ nodeIds: new Set(), edgeIds: new Set([edge.id]) })
        }
        return
      }
    }

    // Click on empty canvas → rubber-band selection
    if (!e.shiftKey) {
      setSelection(emptySelection())
    }
    setDrag({
      type: 'rubberband',
      startX: pt.x,
      startY: pt.y,
      currentX: pt.x,
      currentY: pt.y,
    })
  }, [
    toolMode, viewport, screenToSvg, nodes, edges, selection, nodeMap, contextMenu,
    setSelection, addNode, addEdgeAutoPort, snapEnabled, snapToGrid, connectSource,
  ])

  // ── Mouse move ────────────────────────────────────────────

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Track cursor for connect mode preview
    if (toolMode === 'connect' && connectSource) {
      const pt = screenToSvg(e.clientX, e.clientY)
      setConnectCursor(pt)
    }

    // Track cursor for place mode preview
    if (typeof toolMode === 'object' && 'place' in toolMode) {
      const pt = screenToSvg(e.clientX, e.clientY)
      setPlaceCursor(pt)
    } else if (placeCursor) {
      setPlaceCursor(null)
    }

    const d = dragRef.current
    if (!d) return

    if (d.type === 'pan') {
      setViewport(prev => ({
        ...prev,
        panX: e.clientX - d.startX,
        panY: e.clientY - d.startY,
      }))
      setDrag({ ...d, currentX: e.clientX, currentY: e.clientY })
      return
    }

    const pt = screenToSvg(e.clientX, e.clientY)

    if (d.type === 'move') {
      const dx = pt.x - d.currentX
      const dy = pt.y - d.currentY
      if (Math.abs(pt.x - d.startX) > 2 || Math.abs(pt.y - d.startY) > 2) {
        const idsToMove = selection.nodeIds.size > 0 ? selection.nodeIds : new Set<string>()
        moveNodes(idsToMove, dx, dy)

        // Compute alignment guides + snap offsets
        const movingNodes = nodes.filter(n => idsToMove.has(n.id))
        const { guides: newGuides, snapDx, snapDy } = computeAlignSnap(movingNodes, nodes, ALIGN_THRESHOLD)
        setGuides(newGuides)

        // Apply snap correction so nodes lock to the guide position
        if (snapDx !== 0 || snapDy !== 0) {
          moveNodes(idsToMove, snapDx, snapDy)
        }

        setDrag({ ...d, currentX: pt.x, currentY: pt.y, moved: true })
      }
      return
    }

    if (d.type === 'resize' && d.resizeNodeId && d.resizeHandle && d.origNode) {
      const dx = pt.x - d.startX
      const dy = pt.y - d.startY
      const { x, y, width, height } = computeResize(d.origNode, d.resizeHandle, dx, dy, snapEnabled ? gridSize : 0)
      resizeNode(d.resizeNodeId, width, height, x, y)
      setDrag({ ...d, currentX: pt.x, currentY: pt.y })
      return
    }

    if (d.type === 'moveWaypoint' && d.waypointEdgeId !== undefined && d.waypointIndex !== undefined) {
      moveWaypoint(d.waypointEdgeId, d.waypointIndex, pt)
      setDrag({ ...d, currentX: pt.x, currentY: pt.y })
      return
    }

    if (d.type === 'rubberband') {
      setDrag({ ...d, currentX: pt.x, currentY: pt.y })
      return
    }

    if (d.type === 'connectPort') {
      setDrag({ ...d, currentX: pt.x, currentY: pt.y })
      return
    }
  }, [screenToSvg, selection, moveNodes, resizeNode, moveWaypoint, setViewport, snapEnabled, gridSize, toolMode, connectSource, placeCursor, nodes])

  // ── Mouse up ──────────────────────────────────────────────

  const handleMouseUp = useCallback(() => {
    const d = dragRef.current
    if (!d) return

    if (d.type === 'move' && d.moved) {
      commitMove(nodes)
    }

    if (d.type === 'resize') {
      commitResize(nodes)
    }

    if (d.type === 'moveWaypoint') {
      commitWaypointMove(edges)
    }

    if (d.type === 'rubberband') {
      const x1 = Math.min(d.startX, d.currentX)
      const y1 = Math.min(d.startY, d.currentY)
      const x2 = Math.max(d.startX, d.currentX)
      const y2 = Math.max(d.startY, d.currentY)

      if (Math.abs(x2 - x1) > 4 || Math.abs(y2 - y1) > 4) {
        const hitNodes = new Set<string>()
        const hitEdges = new Set<string>()

        for (const node of nodes) {
          if (node.x + node.width > x1 && node.x < x2 &&
              node.y + node.height > y1 && node.y < y2) {
            hitNodes.add(node.id)
          }
        }

        setSelection({ nodeIds: hitNodes, edgeIds: hitEdges })
      }
    }

    if (d.type === 'connectPort' && d.sourceNodeId && d.sourcePort) {
      const pt = { x: d.currentX, y: d.currentY }
      const sorted = [...nodes].sort((a, b) => b.zIndex - a.zIndex)
      for (const node of sorted) {
        if (node.id === d.sourceNodeId) continue
        const port = hitTestPorts(pt, node, 12)
        if (port) {
          addEdge(d.sourceNodeId, d.sourcePort, node.id, port)
          break
        }
        if (hitTestNode(pt, node)) {
          const source = nodeMap.get(d.sourceNodeId)
          if (source) {
            const { targetPort } = autoDetectPorts(source, node)
            addEdge(d.sourceNodeId, d.sourcePort, node.id, targetPort)
          }
          break
        }
      }
    }

    // Clear guides
    setGuides([])
    setDrag(null)
  }, [nodes, edges, nodeMap, selection, commitMove, commitResize, commitWaypointMove, addEdge, setSelection])

  // ── Double click ──────────────────────────────────────────

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const pt = screenToSvg(e.clientX, e.clientY)
    const sorted = [...nodes].sort((a, b) => b.zIndex - a.zIndex)

    // Check nodes first
    for (const node of sorted) {
      if (hitTestNode(pt, node)) {
        setEditingNodeId(node.id)
        setSelection({ nodeIds: new Set([node.id]), edgeIds: new Set() })
        return
      }
    }

    // Check edges — double-click to edit label or add waypoint
    for (const edge of edges) {
      if (hitTestEdge(edge, nodeMap, pt, 10 / viewport.zoom)) {
        // If near the midpoint, edit the label
        const mid = edgeMidpoint(edge, nodeMap)
        if (mid && Math.hypot(pt.x - mid.x, pt.y - mid.y) < 20 / viewport.zoom) {
          setEditingEdgeId(edge.id)
          setSelection({ nodeIds: new Set(), edgeIds: new Set([edge.id]) })
        } else {
          // Otherwise, add a waypoint at the clicked position
          const idx = findClosestSegment(edge, nodeMap, pt)
          addWaypoint(edge.id, pt, idx)
          setSelection({ nodeIds: new Set(), edgeIds: new Set([edge.id]) })
        }
        return
      }
    }
  }, [nodes, edges, nodeMap, screenToSvg, viewport, setEditingNodeId, setSelection, addWaypoint])

  // ── Context menu ──────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const pt = screenToSvg(e.clientX, e.clientY)
    const sorted = [...nodes].sort((a, b) => b.zIndex - a.zIndex)

    // Check nodes
    for (const node of sorted) {
      if (hitTestNode(pt, node)) {
        if (!selection.nodeIds.has(node.id)) {
          setSelection({ nodeIds: new Set([node.id]), edgeIds: new Set() })
        }
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            { label: 'Edit Label', action: () => { setEditingNodeId(node.id); setContextMenu(null) } },
            { label: 'Duplicate', action: () => { duplicateSelected(); setContextMenu(null) } },
            { label: 'Bring to Front', action: () => { bringToFront(); setContextMenu(null) } },
            { label: 'Send to Back', action: () => { sendToBack(); setContextMenu(null) } },
            { label: 'Delete', action: () => { deleteSelected(); setContextMenu(null) }, danger: true },
          ],
        })
        return
      }
    }

    // Check edges
    for (const edge of edges) {
      if (hitTestEdge(edge, nodeMap, pt, 8 / viewport.zoom)) {
        setSelection({ nodeIds: new Set(), edgeIds: new Set([edge.id]) })
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          items: [
            { label: 'Edit Label', action: () => { setEditingEdgeId(edge.id); setContextMenu(null) } },
            { label: 'Add Waypoint', action: () => {
              const idx = findClosestSegment(edge, nodeMap, pt)
              addWaypoint(edge.id, pt, idx)
              setContextMenu(null)
            }},
            ...(edge.waypoints.length > 0 ? [{
              label: 'Clear Waypoints',
              action: () => {
                updateEdge(edge.id, { waypoints: [] })
                setContextMenu(null)
              },
            }] : []),
            { label: 'Straight', action: () => { updateEdge(edge.id, { routeType: 'straight' }); setContextMenu(null) } },
            { label: 'Orthogonal', action: () => { updateEdge(edge.id, { routeType: 'orthogonal' }); setContextMenu(null) } },
            { label: 'Curved', action: () => { updateEdge(edge.id, { routeType: 'curved' }); setContextMenu(null) } },
            { label: 'Delete', action: () => { deleteSelected(); setContextMenu(null) }, danger: true },
          ],
        })
        return
      }
    }

    // Empty canvas
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Paste', action: () => { paste(); setContextMenu(null) }, disabled: false },
        { label: 'Select All', action: () => { store.selectAll(); setContextMenu(null) } },
        { label: 'Fit to Content', action: () => { store.fitToContent(); setContextMenu(null) } },
        { label: 'Reset Zoom', action: () => { store.resetZoom(); setContextMenu(null) } },
      ],
    })
  }, [
    nodes, edges, nodeMap, viewport, selection, screenToSvg,
    setSelection, setEditingNodeId, deleteSelected, duplicateSelected,
    bringToFront, sendToBack, paste, addWaypoint, updateEdge, store,
  ])

  // ── Port interaction start ────────────────────────────────

  const handlePortMouseDown = useCallback((e: React.MouseEvent, nodeId: string, port: PortPosition) => {
    e.stopPropagation()
    const node = nodeMap.get(nodeId)
    if (!node) return
    const portPos = getPortPosition(node, port)

    setDrag({
      type: 'connectPort',
      startX: portPos.x,
      startY: portPos.y,
      currentX: portPos.x,
      currentY: portPos.y,
      sourceNodeId: nodeId,
      sourcePort: port,
    })
  }, [nodeMap])

  // ── Render helpers ────────────────────────────────────────

  const renderGrid = () => {
    if (!gridEnabled) return null
    const size = gridSize
    return (
      <defs>
        <pattern id="grid-dots" width={size} height={size} patternUnits="userSpaceOnUse">
          <circle cx={size / 2} cy={size / 2} r={0.8} fill={GRID_DOT_COLOR} />
        </pattern>
      </defs>
    )
  }

  const renderGridRect = () => {
    if (!gridEnabled) return null
    return (
      <rect
        x={-10000} y={-10000} width={20000} height={20000}
        fill="url(#grid-dots)"
        pointerEvents="none"
      />
    )
  }

  const renderNode = (node: DiagramNode) => {
    const def = getShapeDef(node.type)
    const isSelected = selection.nodeIds.has(node.id)
    const isHovered = hoveredNodeId === node.id
    const isEditing = editingNodeId === node.id
    const isConnectSource = connectSource === node.id
    const path = def.svgPath(node.width, node.height)

    return (
      <g
        key={node.id}
        transform={`translate(${node.x}, ${node.y})`}
        onMouseEnter={() => setHoveredNodeId(node.id)}
        onMouseLeave={() => { setHoveredNodeId(null); setHoveredPort(null) }}
        style={{ cursor: toolMode === 'connect' ? 'crosshair' : drag?.type === 'move' ? 'grabbing' : 'grab' }}
      >
        {/* Shape */}
        <path
          d={path}
          fill={node.style.fill}
          stroke={isConnectSource ? '#22C55E' : isSelected ? SELECTION_COLOR : node.style.stroke}
          strokeWidth={isConnectSource ? 2.5 : isSelected ? 2 : node.style.strokeWidth}
          strokeDasharray={isConnectSource ? `${6} ${3}` : undefined}
        />

        {/* Label */}
        {!isEditing && (
          <foreignObject
            x={0} y={0}
            width={node.width}
            height={node.height}
            pointerEvents="none"
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 8px',
                fontSize: `${node.style.fontSize}px`,
                color: node.style.fontColor,
                textAlign: 'center',
                lineHeight: 1.3,
                overflow: 'hidden',
                wordBreak: 'break-word',
              }}
            >
              {node.label}
            </div>
          </foreignObject>
        )}

        {/* Inline text editing */}
        {isEditing && (
          <foreignObject
            x={2} y={2}
            width={node.width - 4}
            height={node.height - 4}
          >
            <textarea
              autoFocus
              defaultValue={node.label}
              onBlur={(e) => {
                store.updateNode(node.id, { label: e.target.value })
                setEditingNodeId(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ;(e.target as HTMLTextAreaElement).blur()
                }
                if (e.key === 'Escape') {
                  setEditingNodeId(null)
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                background: 'rgba(0,0,0,0.5)',
                border: `1px solid ${SELECTION_COLOR}`,
                borderRadius: '4px',
                color: node.style.fontColor,
                fontSize: `${node.style.fontSize}px`,
                textAlign: 'center',
                resize: 'none',
                outline: 'none',
                padding: '4px',
                lineHeight: 1.3,
                display: 'flex',
                overflow: 'hidden',
              }}
            />
          </foreignObject>
        )}

        {/* Ports — show on hover or when selected */}
        {(isHovered || isSelected) && !isEditing && (
          <>
            {(['top', 'right', 'bottom', 'left'] as const).map(port => {
              const pos = def.ports(node.width, node.height)[port]
              const isPortHovered = hoveredPort?.nodeId === node.id && hoveredPort?.port === port
              return (
                <circle
                  key={port}
                  cx={pos.x}
                  cy={pos.y}
                  r={isPortHovered ? PORT_RADIUS + 2 : PORT_RADIUS}
                  fill={isPortHovered ? PORT_COLOR : 'rgba(59,130,246,0.3)'}
                  stroke={PORT_COLOR}
                  strokeWidth={1.5}
                  style={{ cursor: 'crosshair' }}
                  onMouseEnter={() => setHoveredPort({ nodeId: node.id, port })}
                  onMouseLeave={() => setHoveredPort(null)}
                  onMouseDown={(e) => handlePortMouseDown(e, node.id, port)}
                />
              )
            })}
          </>
        )}

        {/* Resize handles — show for single selected node */}
        {isSelected && selection.nodeIds.size === 1 && !isEditing && (
          <>{renderResizeHandles(node)}</>
        )}
      </g>
    )
  }

  const renderResizeHandles = (node: DiagramNode) => {
    const w = node.width
    const h = node.height
    const hs = RESIZE_HANDLE_SIZE / viewport.zoom
    const half = hs / 2

    const handles = [
      { id: 'nw', x: -half, y: -half },
      { id: 'n', x: w / 2 - half, y: -half },
      { id: 'ne', x: w - half, y: -half },
      { id: 'e', x: w - half, y: h / 2 - half },
      { id: 'se', x: w - half, y: h - half },
      { id: 's', x: w / 2 - half, y: h - half },
      { id: 'sw', x: -half, y: h - half },
      { id: 'w', x: -half, y: h / 2 - half },
    ]

    const cursors: Record<string, string> = {
      nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize', e: 'e-resize',
      se: 'se-resize', s: 's-resize', sw: 'sw-resize', w: 'w-resize',
    }

    return handles.map(h => (
      <rect
        key={h.id}
        x={h.x}
        y={h.y}
        width={hs}
        height={hs}
        fill="white"
        stroke={SELECTION_COLOR}
        strokeWidth={1.5 / viewport.zoom}
        style={{ cursor: cursors[h.id] }}
      />
    ))
  }

  const renderEdge = (edge: DiagramEdge) => {
    const d = edgePath(edge, nodeMap)
    if (!d) return null
    const isSelected = selection.edgeIds.has(edge.id)
    const mid = edge.label || isSelected ? edgeMidpoint(edge, nodeMap) : null

    return (
      <g key={edge.id}>
        {/* Invisible wider path for easier click targeting */}
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={12 / viewport.zoom}
          style={{ cursor: 'pointer' }}
        />
        {/* Visible edge */}
        <path
          d={d}
          fill="none"
          stroke={isSelected ? SELECTION_COLOR : edge.style.stroke}
          strokeWidth={isSelected ? 2 : edge.style.strokeWidth}
          strokeDasharray={edge.style.dashArray || undefined}
          markerEnd={edge.style.markerEnd ? `url(#arrowhead${isSelected ? '-selected' : ''})` : undefined}
        />
        {/* Label */}
        {mid && edge.label && !editingEdgeId && (
          <g transform={`translate(${mid.x}, ${mid.y})`}>
            <rect
              x={-edge.label.length * 3.5 - 4}
              y={-9}
              width={edge.label.length * 7 + 8}
              height={18}
              rx={3}
              fill="rgba(10,10,20,0.85)"
              stroke={isSelected ? SELECTION_COLOR : 'rgba(255,255,255,0.1)'}
              strokeWidth={0.5}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fill={isSelected ? SELECTION_COLOR : 'rgba(244,123,32,0.8)'}
              fontSize={11}
              fontFamily="sans-serif"
            >
              {edge.label}
            </text>
          </g>
        )}
        {/* Waypoint handles — show when edge is selected */}
        {isSelected && edge.waypoints.map((wp, i) => (
          <circle
            key={`wp-${i}`}
            cx={wp.x}
            cy={wp.y}
            r={WAYPOINT_HANDLE_SIZE / viewport.zoom}
            fill="white"
            stroke={SELECTION_COLOR}
            strokeWidth={1.5 / viewport.zoom}
            style={{ cursor: 'grab' }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              removeWaypoint(edge.id, i)
            }}
          />
        ))}
      </g>
    )
  }

  const renderRubberBand = () => {
    if (!drag || drag.type !== 'rubberband') return null
    const x = Math.min(drag.startX, drag.currentX)
    const y = Math.min(drag.startY, drag.currentY)
    const w = Math.abs(drag.currentX - drag.startX)
    const h = Math.abs(drag.currentY - drag.startY)
    if (w < 2 && h < 2) return null
    return (
      <rect
        x={x} y={y} width={w} height={h}
        fill="rgba(59,130,246,0.08)"
        stroke={SELECTION_COLOR}
        strokeWidth={1 / viewport.zoom}
        strokeDasharray={`${4 / viewport.zoom} ${3 / viewport.zoom}`}
        pointerEvents="none"
      />
    )
  }

  const renderConnectionPreview = () => {
    if (!drag || drag.type !== 'connectPort') return null
    return (
      <line
        x1={drag.startX} y1={drag.startY}
        x2={drag.currentX} y2={drag.currentY}
        stroke={PORT_COLOR}
        strokeWidth={2 / viewport.zoom}
        strokeDasharray={`${6 / viewport.zoom} ${3 / viewport.zoom}`}
        markerEnd="url(#arrowhead-preview)"
        pointerEvents="none"
      />
    )
  }

  const renderConnectModePreview = () => {
    if (toolMode !== 'connect' || !connectSource || !connectCursor) return null
    const sourceNode = nodeMap.get(connectSource)
    if (!sourceNode) return null
    const cx = sourceNode.x + sourceNode.width / 2
    const cy = sourceNode.y + sourceNode.height / 2
    return (
      <line
        x1={cx} y1={cy}
        x2={connectCursor.x} y2={connectCursor.y}
        stroke="#22C55E"
        strokeWidth={2 / viewport.zoom}
        strokeDasharray={`${8 / viewport.zoom} ${4 / viewport.zoom}`}
        markerEnd="url(#arrowhead-preview)"
        pointerEvents="none"
        opacity={0.7}
      />
    )
  }

  const renderAlignGuides = () => {
    if (guides.length === 0) return null
    return (
      <g pointerEvents="none">
        {guides.map((g, i) => (
          g.type === 'v'
            ? <line key={i} x1={g.pos} y1={-10000} x2={g.pos} y2={10000}
                stroke={GUIDE_COLOR} strokeWidth={1 / viewport.zoom}
                strokeDasharray={`${4 / viewport.zoom} ${3 / viewport.zoom}`} />
            : <line key={i} x1={-10000} y1={g.pos} x2={10000} y2={g.pos}
                stroke={GUIDE_COLOR} strokeWidth={1 / viewport.zoom}
                strokeDasharray={`${4 / viewport.zoom} ${3 / viewport.zoom}`} />
        ))}
      </g>
    )
  }

  const renderPlacePreview = () => {
    if (typeof toolMode !== 'object' || !('place' in toolMode) || !placeCursor) return null
    const def = getShapeDef(toolMode.place)
    const x = snapEnabled ? snapToGrid(placeCursor.x) : placeCursor.x
    const y = snapEnabled ? snapToGrid(placeCursor.y) : placeCursor.y
    const px = x - def.defaultWidth / 2
    const py = y - def.defaultHeight / 2
    return (
      <g transform={`translate(${px}, ${py})`} pointerEvents="none" opacity={0.45}>
        <path
          d={def.svgPath(def.defaultWidth, def.defaultHeight)}
          fill="rgba(244,123,32,0.08)"
          stroke="#F47B20"
          strokeWidth={1.5 / viewport.zoom}
          strokeDasharray={`${5 / viewport.zoom} ${3 / viewport.zoom}`}
        />
        <text
          x={def.defaultWidth / 2}
          y={def.defaultHeight / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(244,123,32,0.6)"
          fontSize={12 / viewport.zoom}
          pointerEvents="none"
        >
          {def.label}
        </text>
      </g>
    )
  }

  // Sort nodes by z-index for rendering
  const sortedNodes = [...nodes].sort((a, b) => a.zIndex - b.zIndex)

  // ── Determine cursor ──────────────────────────────────────

  let cursor = 'default'
  if (toolMode === 'pan' || drag?.type === 'pan') cursor = drag?.type === 'pan' ? 'grabbing' : 'grab'
  else if (toolMode === 'connect') cursor = 'crosshair'
  else if (typeof toolMode === 'object' && 'place' in toolMode) cursor = 'crosshair'
  else if (drag?.type === 'move') cursor = 'grabbing'

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden rounded-xl bg-dark-base relative"
      style={{ cursor }}
    >
      <svg
        ref={svgRef}
        className="w-full h-full"
        role="application"
        aria-label="Flowchart diagram canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Transform group for zoom/pan */}
        <g transform={`translate(${viewport.panX}, ${viewport.panY}) scale(${viewport.zoom})`}>
          {/* Grid */}
          {renderGrid()}
          {renderGridRect()}

          {/* Arrow markers */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10" markerHeight="7"
              refX="9" refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="rgba(244,123,32,0.5)" />
            </marker>
            <marker
              id="arrowhead-selected"
              markerWidth="10" markerHeight="7"
              refX="9" refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={SELECTION_COLOR} />
            </marker>
            <marker
              id="arrowhead-preview"
              markerWidth="8" markerHeight="6"
              refX="7" refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill={PORT_COLOR} />
            </marker>
          </defs>

          {/* Edges (below nodes) */}
          {edges.map(renderEdge)}

          {/* Nodes */}
          {sortedNodes.map(renderNode)}

          {/* Rubber band selection */}
          {renderRubberBand()}

          {/* Connection preview line */}
          {renderConnectionPreview()}

          {/* Connect mode preview */}
          {renderConnectModePreview()}

          {/* Alignment guides */}
          {renderAlignGuides()}

          {/* Place mode ghost preview */}
          {renderPlacePreview()}
        </g>
      </svg>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-dark-elevated/80 text-[10px] text-white/40 pointer-events-none">
        {Math.round(viewport.zoom * 100)}%
      </div>

      {/* Connect mode hint */}
      {toolMode === 'connect' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded bg-green-900/60 border border-green-500/30 text-[10px] text-green-300 pointer-events-none">
          {connectSource ? 'Click target node to connect' : 'Click source node'}
        </div>
      )}

      {/* Inline edge label editing */}
      {editingEdgeId && (() => {
        const edge = edges.find(e => e.id === editingEdgeId)
        if (!edge) return null
        const mid = edgeMidpoint(edge, nodeMap)
        if (!mid) return null
        const screenX = mid.x * viewport.zoom + viewport.panX
        const screenY = mid.y * viewport.zoom + viewport.panY
        return (
          <div
            className="absolute"
            style={{
              left: screenX - 60,
              top: screenY - 14,
            }}
          >
            <input
              autoFocus
              type="text"
              defaultValue={edge.label}
              onBlur={(e) => {
                updateEdge(edge.id, { label: e.target.value })
                setEditingEdgeId(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur()
                }
                if (e.key === 'Escape') {
                  setEditingEdgeId(null)
                }
              }}
              className="w-[120px] px-2 py-1 text-xs text-center bg-dark-surface border border-[#F47B20]/40 rounded text-white outline-none"
              placeholder="Edge label..."
            />
          </div>
        )
      })()}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-50 bg-dark-surface border border-white/[0.1] rounded-lg shadow-xl overflow-hidden py-1 min-w-[150px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.items.map((item, i) => (
              <button
                key={i}
                onClick={item.action}
                disabled={item.disabled}
                className={`
                  w-full text-left px-3 py-1.5 text-xs transition-colors
                  ${item.disabled
                    ? 'text-white/20 pointer-events-none'
                    : item.danger
                      ? 'text-red-400 hover:bg-red-500/10'
                      : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
                  }
                `}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Hit testing ─────────────────────────────────────────────

function hitTestNode(pt: Point, node: DiagramNode): boolean {
  return (
    pt.x >= node.x && pt.x <= node.x + node.width &&
    pt.y >= node.y && pt.y <= node.y + node.height
  )
}

function hitTestPorts(pt: Point, node: DiagramNode, threshold: number): PortPosition | null {
  const def = getShapeDef(node.type)
  const ports = def.ports(node.width, node.height)

  for (const [key, pos] of Object.entries(ports)) {
    const abs = { x: node.x + pos.x, y: node.y + pos.y }
    if (Math.hypot(pt.x - abs.x, pt.y - abs.y) < threshold) {
      return key as PortPosition
    }
  }
  return null
}

function hitTestResizeHandle(pt: Point, node: DiagramNode): string | null {
  const hs = RESIZE_HANDLE_SIZE + 2
  const w = node.width
  const h = node.height

  const handles = [
    { id: 'nw', x: node.x, y: node.y },
    { id: 'n', x: node.x + w / 2, y: node.y },
    { id: 'ne', x: node.x + w, y: node.y },
    { id: 'e', x: node.x + w, y: node.y + h / 2 },
    { id: 'se', x: node.x + w, y: node.y + h },
    { id: 's', x: node.x + w / 2, y: node.y + h },
    { id: 'sw', x: node.x, y: node.y + h },
    { id: 'w', x: node.x, y: node.y + h / 2 },
  ]

  for (const handle of handles) {
    if (Math.abs(pt.x - handle.x) < hs && Math.abs(pt.y - handle.y) < hs) {
      return handle.id
    }
  }
  return null
}

function computeResize(
  orig: { x: number; y: number; width: number; height: number },
  handle: string,
  dx: number,
  dy: number,
  gridSize: number,
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = orig
  const minW = 40, minH = 30

  const snap = (v: number) => gridSize > 0 ? Math.round(v / gridSize) * gridSize : v

  switch (handle) {
    case 'se':
      width = Math.max(minW, snap(orig.width + dx))
      height = Math.max(minH, snap(orig.height + dy))
      break
    case 'e':
      width = Math.max(minW, snap(orig.width + dx))
      break
    case 's':
      height = Math.max(minH, snap(orig.height + dy))
      break
    case 'nw':
      width = Math.max(minW, snap(orig.width - dx))
      height = Math.max(minH, snap(orig.height - dy))
      x = orig.x + orig.width - width
      y = orig.y + orig.height - height
      break
    case 'n':
      height = Math.max(minH, snap(orig.height - dy))
      y = orig.y + orig.height - height
      break
    case 'ne':
      width = Math.max(minW, snap(orig.width + dx))
      height = Math.max(minH, snap(orig.height - dy))
      y = orig.y + orig.height - height
      break
    case 'sw':
      width = Math.max(minW, snap(orig.width - dx))
      height = Math.max(minH, snap(orig.height + dy))
      x = orig.x + orig.width - width
      break
    case 'w':
      width = Math.max(minW, snap(orig.width - dx))
      x = orig.x + orig.width - width
      break
  }

  return { x, y, width, height }
}

// ── Alignment guide computation + snap ──────────────────────

function computeAlignSnap(
  movingNodes: DiagramNode[],
  allNodes: DiagramNode[],
  threshold: number,
): { guides: AlignGuide[]; snapDx: number; snapDy: number } {
  const movingIds = new Set(movingNodes.map(n => n.id))
  const others = allNodes.filter(n => !movingIds.has(n.id))
  const unique = new Map<string, AlignGuide>()

  // Track the closest snap in each axis
  let bestSnapX = Infinity  // signed offset to apply
  let bestDistX = threshold // closest distance found so far
  let bestSnapY = Infinity
  let bestDistY = threshold

  for (const moving of movingNodes) {
    const mx1 = moving.x, mx2 = moving.x + moving.width, mcx = moving.x + moving.width / 2
    const my1 = moving.y, my2 = moving.y + moving.height, mcy = moving.y + moving.height / 2

    for (const other of others) {
      const ox1 = other.x, ox2 = other.x + other.width, ocx = other.x + other.width / 2
      const oy1 = other.y, oy2 = other.y + other.height, ocy = other.y + other.height / 2

      // Vertical guides (X alignment): [movingEdge, otherEdge]
      const xChecks: [number, number][] = [
        [mx1, ox1], [mx2, ox2], [mcx, ocx], [mx1, ox2], [mx2, ox1],
      ]
      for (const [a, b] of xChecks) {
        const dist = Math.abs(a - b)
        if (dist < threshold) {
          unique.set(`v:${Math.round(b)}`, { type: 'v', pos: b })
          if (dist < bestDistX) {
            bestDistX = dist
            bestSnapX = b - a  // offset to move the node so 'a' aligns to 'b'
          }
        }
      }

      // Horizontal guides (Y alignment): [movingEdge, otherEdge]
      const yChecks: [number, number][] = [
        [my1, oy1], [my2, oy2], [mcy, ocy], [my1, oy2], [my2, oy1],
      ]
      for (const [a, b] of yChecks) {
        const dist = Math.abs(a - b)
        if (dist < threshold) {
          unique.set(`h:${Math.round(b)}`, { type: 'h', pos: b })
          if (dist < bestDistY) {
            bestDistY = dist
            bestSnapY = b - a
          }
        }
      }
    }
  }

  return {
    guides: [...unique.values()],
    snapDx: bestSnapX !== Infinity ? bestSnapX : 0,
    snapDy: bestSnapY !== Infinity ? bestSnapY : 0,
  }
}
