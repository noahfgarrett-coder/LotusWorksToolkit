import { useRef, useState, useEffect, useCallback } from 'react'
import type { OrgChartStore } from './orgChartStore.ts'
import type { OrgNode, LayoutNode, LayoutDirection } from './types.ts'
import {
  NODE_WIDTH, NODE_HEIGHT, H_SPACING, V_SPACING,
  AVATAR_SIZE, CONNECTOR_RADIUS, MIN_ZOOM, MAX_ZOOM,
} from './types.ts'
import { loadImage } from '@/utils/imageProcessing.ts'

// ── Constants ───────────────────────────────────────────────

const SELECTION_COLOR = '#3B82F6'
const NODE_BG = '#1a1a24'
const NODE_BORDER = 'rgba(255,255,255,0.08)'
const CONNECTOR_COLOR = 'rgba(255,255,255,0.12)'
const HOVER_BG = '#1e1e2a'
const ADD_BTN_SIZE = 18
const MOVE_THRESHOLD = 5 // px before drag starts
const ALIGN_THRESHOLD = 6 // px in diagram space for snap + guide display
const GUIDE_COLOR = 'rgba(59,130,246,0.5)'

// ── Alignment guides ────────────────────────────────────────

interface AlignGuide {
  type: 'h' | 'v'
  pos: number
}

// ── Drag state ──────────────────────────────────────────────

interface DragState {
  type: 'pan' | 'move' | 'marquee'
  startX: number
  startY: number
  currentX: number
  currentY: number
  // Move-specific
  sourceNodeId?: string    // node that was clicked to start the move
  canvasStartX?: number    // canvas-space coords at start (for move/marquee)
  canvasStartY?: number
  canvasCurrentX?: number
  canvasCurrentY?: number
  moved?: boolean          // has the drag exceeded the threshold?
  totalDx?: number         // accumulated canvas-space delta (for reparent revert)
  totalDy?: number
  // Marquee-specific
  shiftHeld?: boolean      // was shift held when marquee started?
  priorSelection?: Set<string> // selection before marquee started
}

interface ContextMenuState {
  x: number // screen coords
  y: number
  nodeId: string
}

// ── Component ───────────────────────────────────────────────

export function Canvas({ store }: { store: OrgChartStore }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef<LayoutNode | null>(null)
  const flatLayoutRef = useRef<LayoutNode[]>([])

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const guidesRef = useRef<AlignGuide[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [reparentTarget, setReparentTarget] = useState<string | null>(null)

  // ── Space key for pan mode ────────────────────────────────
  const spaceHeldRef = useRef(false)
  const [spaceHeld, setSpaceHeld] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spaceHeldRef.current) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        spaceHeldRef.current = true
        setSpaceHeld(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false
        setSpaceHeld(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // ── Image cache ─────────────────────────────────────────
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const [imageCacheVer, setImageCacheVer] = useState(0)

  useEffect(() => {
    const newCache = new Map<string, HTMLImageElement>()
    const promises: Promise<void>[] = []

    for (const node of store.nodes) {
      if (!node.imageDataUrl) continue
      const existing = imageCacheRef.current.get(node.imageDataUrl)
      if (existing) {
        newCache.set(node.imageDataUrl, existing)
      } else {
        const url = node.imageDataUrl
        promises.push(
          loadImage(url).then(img => {
            newCache.set(url, img)
          }).catch(() => { /* skip broken images */ }),
        )
      }
    }

    if (promises.length > 0) {
      Promise.all(promises).then(() => {
        imageCacheRef.current = newCache
        setImageCacheVer(v => v + 1)
      })
    } else {
      imageCacheRef.current = newCache
    }
  }, [store.nodes])

  // ── Coordinate conversion ───────────────────────────────

  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const { panX, panY, zoom } = store.viewport
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top - panY) / zoom,
    }
  }, [store.viewport])

  // ── Hit testing ─────────────────────────────────────────

  const hitTestNode = useCallback((pt: { x: number; y: number }): LayoutNode | null => {
    for (const node of flatLayoutRef.current) {
      if (pt.x >= node.x && pt.x <= node.x + node.width &&
          pt.y >= node.y && pt.y <= node.y + node.height) {
        return node
      }
    }
    return null
  }, [])

  const hitTestAddButton = useCallback((pt: { x: number; y: number }): string | null => {
    for (const node of flatLayoutRef.current) {
      const bx = node.x + node.width / 2
      const by = node.y + node.height + ADD_BTN_SIZE / 2 + 4
      const dist = Math.hypot(pt.x - bx, pt.y - by)
      if (dist <= ADD_BTN_SIZE / 2 + 2) return node.id
    }
    return null
  }, [])

  // ── Mouse handlers ──────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (contextMenu) setContextMenu(null)
    if (e.button === 1) {
      // Middle click → pan
      setDrag({ type: 'pan', startX: e.clientX - store.viewport.panX, startY: e.clientY - store.viewport.panY, currentX: e.clientX, currentY: e.clientY })
      e.preventDefault()
      return
    }

    if (e.button !== 0) return

    // Space+drag → pan
    if (spaceHeldRef.current) {
      setDrag({ type: 'pan', startX: e.clientX - store.viewport.panX, startY: e.clientY - store.viewport.panY, currentX: e.clientX, currentY: e.clientY })
      e.preventDefault()
      return
    }

    const pt = screenToCanvas(e.clientX, e.clientY)

    // Check add button first
    const addBtnNode = hitTestAddButton(pt)
    if (addBtnNode) {
      store.addNode(addBtnNode)
      return
    }

    const hit = hitTestNode(pt)
    if (hit) {
      // Select the hit node (shift for multi-select toggle)
      if (e.shiftKey) {
        store.selectNode(hit.id, true)
      } else if (!store.selectedNodeIds.has(hit.id)) {
        store.selectNode(hit.id)
      }
      // Start move drag for all selected nodes
      setDrag({
        type: 'move',
        startX: e.clientX, startY: e.clientY,
        currentX: e.clientX, currentY: e.clientY,
        canvasStartX: pt.x, canvasStartY: pt.y,
        canvasCurrentX: pt.x, canvasCurrentY: pt.y,
        moved: false,
        sourceNodeId: hit.id,
        totalDx: 0, totalDy: 0,
      })
    } else {
      // Click empty area
      if (e.shiftKey) {
        // Shift+click empty → start marquee (additive)
        setDrag({
          type: 'marquee',
          startX: e.clientX, startY: e.clientY,
          currentX: e.clientX, currentY: e.clientY,
          canvasStartX: pt.x, canvasStartY: pt.y,
          canvasCurrentX: pt.x, canvasCurrentY: pt.y,
          shiftHeld: true,
          priorSelection: new Set(store.selectedNodeIds),
        })
      } else {
        // Plain click empty → start marquee (replace selection)
        store.selectNode(null)
        setDrag({
          type: 'marquee',
          startX: e.clientX, startY: e.clientY,
          currentX: e.clientX, currentY: e.clientY,
          canvasStartX: pt.x, canvasStartY: pt.y,
          canvasCurrentX: pt.x, canvasCurrentY: pt.y,
          shiftHeld: false,
          priorSelection: new Set(),
        })
      }
    }
  }, [screenToCanvas, hitTestNode, hitTestAddButton, store, contextMenu])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pt = screenToCanvas(e.clientX, e.clientY)
    const hit = hitTestNode(pt)
    const addBtn = hitTestAddButton(pt)
    setHoveredNodeId(hit?.id ?? addBtn ?? null)

    const d = dragRef.current
    if (!d) return

    if (d.type === 'pan') {
      store.setViewport(prev => ({
        ...prev,
        panX: e.clientX - d.startX,
        panY: e.clientY - d.startY,
      }))
      setDrag({ ...d, currentX: e.clientX, currentY: e.clientY })
      return
    }

    if (d.type === 'move') {
      const screenDx = e.clientX - d.currentX
      const screenDy = e.clientY - d.currentY
      const rawDx = screenDx / store.viewport.zoom
      const rawDy = screenDy / store.viewport.zoom

      const totalDist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY)
      const hasMoved = d.moved || totalDist > MOVE_THRESHOLD

      let appliedDx = 0
      let appliedDy = 0

      if (hasMoved) {
        const selectedIds = store.selectedNodeIds

        // Check if cursor is over a non-selected node (potential reparent target)
        // Allow reparent if any selected non-root node exists
        const canReparent = [...selectedIds].some(id => {
          const n = store.nodes.find(node => node.id === id)
          return n && !!n.reportsTo
        })
        const dropTarget = canReparent
          ? flatLayoutRef.current.find(n =>
            !selectedIds.has(n.id) &&
            pt.x >= n.x && pt.x <= n.x + n.width &&
            pt.y >= n.y && pt.y <= n.y + n.height,
          )
          : null

        if (dropTarget) {
          // Over a reparent target — move but hide snap guides
          setReparentTarget(dropTarget.id)
          guidesRef.current = []
          store.moveNodes(selectedIds, rawDx, rawDy)
          appliedDx = rawDx
          appliedDy = rawDy
        } else {
          // Not over a target — compute snap guides
          setReparentTarget(null)
          const movingProjected = flatLayoutRef.current
            .filter(n => selectedIds.has(n.id))
            .map(n => ({ ...n, x: n.x + rawDx, y: n.y + rawDy }))
          const others = flatLayoutRef.current.filter(n => !selectedIds.has(n.id))
          const { guides, snapDx, snapDy } = computeAlignSnap(movingProjected, others, ALIGN_THRESHOLD)
          guidesRef.current = guides
          store.moveNodes(selectedIds, rawDx + snapDx, rawDy + snapDy)
          appliedDx = rawDx + snapDx
          appliedDy = rawDy + snapDy
        }
      }

      setDrag({
        ...d,
        currentX: e.clientX, currentY: e.clientY,
        canvasCurrentX: pt.x, canvasCurrentY: pt.y,
        moved: hasMoved,
        totalDx: (d.totalDx ?? 0) + appliedDx,
        totalDy: (d.totalDy ?? 0) + appliedDy,
      })
      return
    }

    if (d.type === 'marquee') {
      setDrag({
        ...d,
        currentX: e.clientX, currentY: e.clientY,
        canvasCurrentX: pt.x, canvasCurrentY: pt.y,
      })

      // Compute marquee rect in canvas coords
      const x1 = Math.min(d.canvasStartX!, pt.x)
      const y1 = Math.min(d.canvasStartY!, pt.y)
      const x2 = Math.max(d.canvasStartX!, pt.x)
      const y2 = Math.max(d.canvasStartY!, pt.y)

      // Find all nodes intersecting the marquee
      const marqueeIds: string[] = []
      for (const node of flatLayoutRef.current) {
        if (node.x + node.width >= x1 && node.x <= x2 &&
            node.y + node.height >= y1 && node.y <= y2) {
          marqueeIds.push(node.id)
        }
      }

      // Combine with prior selection if shift held
      if (d.shiftHeld) {
        const combined = new Set(d.priorSelection)
        for (const id of marqueeIds) combined.add(id)
        store.selectNodes([...combined])
      } else {
        store.selectNodes(marqueeIds)
      }
      return
    }
  }, [screenToCanvas, hitTestNode, hitTestAddButton, store])

  const handleMouseUp = useCallback(() => {
    const d = dragRef.current

    if (d?.type === 'move' && d.moved) {
      if (reparentTarget) {
        // Drop on node → reparent all selected nodes
        store.reparentAfterDrag(
          store.selectedNodeIds,
          reparentTarget,
          -(d.totalDx ?? 0),
          -(d.totalDy ?? 0),
        )
      } else {
        // Drop on empty → commit position change
        store.commitMove()
      }
    }

    guidesRef.current = []
    setDrag(null)
    setReparentTarget(null)
  }, [store, reparentTarget])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = -e.deltaY * 0.001
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, store.viewport.zoom * (1 + delta)))
    store.zoomTo(newZoom, { x: e.clientX, y: e.clientY })
  }, [store])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const pt = screenToCanvas(e.clientX, e.clientY)
    const hit = hitTestNode(pt)
    if (hit) {
      store.selectNode(hit.id)
      // Focus the name input in PropertiesPanel (panel will auto-focus when selectedNodeId changes)
    }
  }, [screenToCanvas, hitTestNode, store])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const pt = screenToCanvas(e.clientX, e.clientY)
    const hit = hitTestNode(pt)
    if (hit) {
      store.selectNode(hit.id)
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: hit.id })
    }
  }, [screenToCanvas, hitTestNode, store])

  // ── Fit to content ──────────────────────────────────────

  const fitToContent = useCallback(() => {
    const tree = layoutRef.current
    if (!tree || !containerRef.current) return
    const flat = flatLayoutRef.current
    if (flat.length === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of flat) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width)
      maxY = Math.max(maxY, n.y + n.height)
    }

    const container = containerRef.current
    const cw = container.clientWidth
    const ch = container.clientHeight
    const contentW = maxX - minX + 80
    const contentH = maxY - minY + 80
    const zoom = Math.max(MIN_ZOOM, Math.min(1.5, Math.min(cw / contentW, ch / contentH)))

    store.setViewport({
      panX: (cw - contentW * zoom) / 2 - minX * zoom + 40 * zoom,
      panY: (ch - contentH * zoom) / 2 - minY * zoom + 40 * zoom,
      zoom,
    })
  }, [store])

  // Expose fitToContent via a ref for Toolbar to call
  const fitToContentRef = useRef(fitToContent)
  fitToContentRef.current = fitToContent

  // ── Render loop ─────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cw = container.clientWidth
    const ch = container.clientHeight

    canvas.width = cw * dpr
    canvas.height = ch * dpr
    canvas.style.width = cw + 'px'
    canvas.style.height = ch + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Build layout tree
    const tree = buildLayoutTree(store.nodes, store.layoutDirection)
    layoutRef.current = tree
    flatLayoutRef.current = tree ? flattenTree(tree) : []

    // Apply manual offsets to layout positions
    for (const ln of flatLayoutRef.current) {
      ln.x += ln.offsetX
      ln.y += ln.offsetY
    }

    // Clear
    ctx.clearRect(0, 0, cw, ch)

    if (!tree) return

    // Apply viewport
    ctx.save()
    ctx.translate(store.viewport.panX, store.viewport.panY)
    ctx.scale(store.viewport.zoom, store.viewport.zoom)

    const imageCache = imageCacheRef.current

    // Draw connectors
    drawConnectors(ctx, tree)

    // Draw nodes
    const flat = flatLayoutRef.current
    for (const node of flat) {
      const isSelected = store.selectedNodeIds.has(node.id)
      const isHovered = node.id === hoveredNodeId
      const isReparentDrop = node.id === reparentTarget
      drawNode(ctx, node, isSelected, isHovered, isReparentDrop, imageCache, store.viewport.zoom)
    }

    // Draw hover add button
    if (hoveredNodeId) {
      const hNode = flat.find(n => n.id === hoveredNodeId)
      if (hNode) drawAddButton(ctx, hNode)
    }

    // Draw snap alignment guides
    const currentGuides = guidesRef.current
    if (currentGuides.length > 0) {
      ctx.save()
      ctx.strokeStyle = GUIDE_COLOR
      ctx.lineWidth = 1 / store.viewport.zoom
      ctx.setLineDash([4 / store.viewport.zoom, 3 / store.viewport.zoom])
      for (const guide of currentGuides) {
        ctx.beginPath()
        if (guide.type === 'v') {
          ctx.moveTo(guide.pos, -10000)
          ctx.lineTo(guide.pos, 10000)
        } else {
          ctx.moveTo(-10000, guide.pos)
          ctx.lineTo(10000, guide.pos)
        }
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.restore()
    }

    // Draw marquee selection rectangle
    if (drag?.type === 'marquee' && drag.canvasStartX != null && drag.canvasCurrentX != null) {
      const x1 = Math.min(drag.canvasStartX, drag.canvasCurrentX)
      const y1 = Math.min(drag.canvasStartY!, drag.canvasCurrentY!)
      const x2 = Math.max(drag.canvasStartX, drag.canvasCurrentX)
      const y2 = Math.max(drag.canvasStartY!, drag.canvasCurrentY!)
      const w = x2 - x1
      const h = y2 - y1

      if (w > 2 || h > 2) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.08)'
        ctx.fillRect(x1, y1, w, h)
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)'
        ctx.lineWidth = 1 / store.viewport.zoom
        ctx.setLineDash([4 / store.viewport.zoom, 4 / store.viewport.zoom])
        ctx.strokeRect(x1, y1, w, h)
        ctx.setLineDash([])
      }
    }

    ctx.restore()
  }, [store.nodes, store.viewport, store.selectedNodeIds, store.layoutDirection, hoveredNodeId, reparentTarget, drag, imageCacheVer, screenToCanvas])

  // ── Resize observer ─────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => forceUpdate(v => v + 1))
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const [, forceUpdate] = useState(0)

  // Auto-fit on first load
  useEffect(() => {
    if (store.nodes.length > 0) {
      const timer = setTimeout(() => fitToContentRef.current(), 100)
      return () => clearTimeout(timer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cursor ──────────────────────────────────────────────

  let cursor = 'default'
  if (drag?.type === 'pan') cursor = 'grabbing'
  else if (drag?.type === 'move' && drag.moved) cursor = 'grabbing'
  else if (drag?.type === 'marquee') cursor = 'crosshair'
  else if (spaceHeld) cursor = 'grab'
  else if (hoveredNodeId) cursor = 'pointer'

  return (
    <div ref={containerRef} className="w-full h-full relative" style={{ cursor }}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />

      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-dark-elevated/80 text-[10px] text-white/40 pointer-events-none">
        {Math.round(store.viewport.zoom * 100)}%
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 min-w-[160px] bg-dark-surface border border-white/[0.1] rounded-lg shadow-xl py-1 overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <ContextMenuItem label="Add Report" onClick={() => { store.addNode(contextMenu.nodeId); setContextMenu(null) }} />
            <ContextMenuItem label="Select" onClick={() => { store.selectNode(contextMenu.nodeId); setContextMenu(null) }} />
            <div className="h-px bg-white/[0.06] mx-1 my-0.5" />
            {store.nodes.find(n => n.id === contextMenu.nodeId)?.reportsTo && (
              <ContextMenuItem label="Delete" danger onClick={() => { store.removeNode(contextMenu.nodeId); setContextMenu(null) }} />
            )}
          </div>
        </>
      )}

      {/* Fit-to-content ref exposed */}
      <FitToContentBridge fitRef={fitToContentRef} />
    </div>
  )
}

// ── Bridge to expose fitToContent ───────────────────────────

function FitToContentBridge({ fitRef }: { fitRef: React.MutableRefObject<() => void> }) {
  // Store the ref globally so Toolbar can access it
  ;(window as unknown as Record<string, unknown>).__orgChartFitToContent = fitRef.current
  return null
}

// ── Context menu item ───────────────────────────────────────

function ContextMenuItem({
  label, onClick, danger = false,
}: {
  label: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
        danger
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
      }`}
    >
      {label}
    </button>
  )
}

// ── Tree layout ─────────────────────────────────────────────

function buildLayoutTree(nodes: OrgNode[], direction: LayoutDirection): LayoutNode | null {
  const root = nodes.find(n => !n.reportsTo)
  if (!root) return null

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

  if (direction === 'top-down') {
    layoutTopDown(tree, 0)
  } else {
    layoutLeftRight(tree, 0)
  }

  return tree
}

function layoutTopDown(node: LayoutNode, depth: number): number {
  node.y = depth * (NODE_HEIGHT + V_SPACING)

  if (node.children.length === 0) {
    node.x = 0
    return NODE_WIDTH
  }

  let totalWidth = 0
  const childWidths: number[] = []
  for (const child of node.children) {
    const w = layoutTopDown(child, depth + 1)
    childWidths.push(w)
    totalWidth += w
  }
  totalWidth += (node.children.length - 1) * H_SPACING

  let xOffset = 0
  for (let i = 0; i < node.children.length; i++) {
    shiftX(node.children[i], xOffset)
    xOffset += childWidths[i] + H_SPACING
  }

  const firstChild = node.children[0]
  const lastChild = node.children[node.children.length - 1]
  node.x = (firstChild.x + lastChild.x + lastChild.width) / 2 - NODE_WIDTH / 2

  return Math.max(NODE_WIDTH, totalWidth)
}

function layoutLeftRight(node: LayoutNode, depth: number): number {
  node.x = depth * (NODE_WIDTH + H_SPACING)

  if (node.children.length === 0) {
    node.y = 0
    return NODE_HEIGHT
  }

  let totalHeight = 0
  const childHeights: number[] = []
  for (const child of node.children) {
    const h = layoutLeftRight(child, depth + 1)
    childHeights.push(h)
    totalHeight += h
  }
  totalHeight += (node.children.length - 1) * V_SPACING / 2

  let yOffset = 0
  for (let i = 0; i < node.children.length; i++) {
    shiftY(node.children[i], yOffset)
    yOffset += childHeights[i] + V_SPACING / 2
  }

  const firstChild = node.children[0]
  const lastChild = node.children[node.children.length - 1]
  node.y = (firstChild.y + lastChild.y + lastChild.height) / 2 - NODE_HEIGHT / 2

  return Math.max(NODE_HEIGHT, totalHeight)
}

function shiftX(node: LayoutNode, dx: number) {
  node.x += dx
  for (const child of node.children) shiftX(child, dx)
}

function shiftY(node: LayoutNode, dy: number) {
  node.y += dy
  for (const child of node.children) shiftY(child, dy)
}

function flattenTree(node: LayoutNode): LayoutNode[] {
  const result: LayoutNode[] = [node]
  for (const child of node.children) {
    result.push(...flattenTree(child))
  }
  return result
}

// ── Drawing functions ───────────────────────────────────────

function drawConnectors(ctx: CanvasRenderingContext2D, node: LayoutNode) {
  for (const child of node.children) {
    drawConnector(ctx, node, child)
    drawConnectors(ctx, child)
  }
}

function drawConnector(ctx: CanvasRenderingContext2D, parent: LayoutNode, child: LayoutNode) {
  const px = parent.x + parent.width / 2
  const py = parent.y + parent.height
  const cx = child.x + child.width / 2
  const cy = child.y
  const midY = (py + cy) / 2
  const r = Math.min(CONNECTOR_RADIUS, Math.abs(midY - py), Math.abs(cx - px) / 2 || CONNECTOR_RADIUS)

  ctx.beginPath()
  ctx.strokeStyle = CONNECTOR_COLOR
  ctx.lineWidth = 1.5

  if (Math.abs(cx - px) < 1) {
    // Straight vertical line
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

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode,
  isSelected: boolean,
  isHovered: boolean,
  isReparentDrop: boolean,
  imageCache: Map<string, HTMLImageElement>,
  zoom: number,
) {
  ctx.save()
  ctx.translate(node.x, node.y)
  drawNodeCard(ctx, node, isSelected, isHovered, isReparentDrop, imageCache, zoom)
  ctx.restore()
}

function drawNodeCard(
  ctx: CanvasRenderingContext2D,
  node: LayoutNode | OrgNode & { width: number; height: number },
  isSelected: boolean,
  isHovered: boolean,
  isReparentDrop: boolean,
  imageCache: Map<string, HTMLImageElement>,
  zoom: number,
) {
  const w = NODE_WIDTH
  const h = NODE_HEIGHT
  const radius = 8

  // Background
  drawRoundedRect(ctx, 0, 0, w, h, radius)
  ctx.fillStyle = isHovered ? HOVER_BG : NODE_BG
  ctx.fill()

  // Border
  if (isReparentDrop) {
    ctx.strokeStyle = '#22C55E'
    ctx.lineWidth = 2.5
  } else if (isSelected) {
    ctx.strokeStyle = SELECTION_COLOR
    ctx.lineWidth = 2
  } else {
    ctx.strokeStyle = NODE_BORDER
    ctx.lineWidth = 1
  }
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

  // Avatar area
  const avatarX = 14
  const avatarY = h / 2
  const avatarR = AVATAR_SIZE / 2
  const img = node.imageDataUrl ? imageCache.get(node.imageDataUrl) : null

  if (img) {
    // Circular clipped avatar
    ctx.save()
    ctx.beginPath()
    ctx.arc(avatarX + avatarR, avatarY, avatarR, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, avatarX, avatarY - avatarR, AVATAR_SIZE, AVATAR_SIZE)
    ctx.restore()

    // Avatar border
    ctx.beginPath()
    ctx.arc(avatarX + avatarR, avatarY, avatarR, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
    ctx.lineWidth = 1
    ctx.stroke()
  } else {
    // Initials circle
    const initials = getInitials(node.name)
    ctx.beginPath()
    ctx.arc(avatarX + avatarR, avatarY, avatarR, 0, Math.PI * 2)
    ctx.fillStyle = node.nodeColor + '30' // 30 = ~19% opacity hex
    ctx.fill()
    ctx.strokeStyle = node.nodeColor + '50'
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.font = `600 ${13}px -apple-system, BlinkMacSystemFont, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = node.nodeColor
    ctx.fillText(initials, avatarX + avatarR, avatarY)
  }

  // Text area (to the right of avatar)
  const textX = avatarX + AVATAR_SIZE + 12
  const maxTextW = w - textX - 10

  // Name
  ctx.font = `600 12px -apple-system, BlinkMacSystemFont, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(truncateText(ctx, node.name, maxTextW), textX, 16)

  // Title
  ctx.font = `400 10px -apple-system, BlinkMacSystemFont, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.50)'
  ctx.fillText(truncateText(ctx, node.title, maxTextW), textX, 34)

  // Department
  if (node.department) {
    ctx.font = `400 9px -apple-system, BlinkMacSystemFont, sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.30)'
    ctx.fillText(truncateText(ctx, node.department, maxTextW), textX, 50)
  }
}

function drawAddButton(ctx: CanvasRenderingContext2D, node: LayoutNode) {
  const cx = node.x + node.width / 2
  const cy = node.y + node.height + ADD_BTN_SIZE / 2 + 4
  const r = ADD_BTN_SIZE / 2

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = '#1a1a24'
  ctx.fill()
  ctx.strokeStyle = 'rgba(244,123,32,0.4)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // Plus sign
  const s = 4
  ctx.beginPath()
  ctx.moveTo(cx - s, cy)
  ctx.lineTo(cx + s, cy)
  ctx.moveTo(cx, cy - s)
  ctx.lineTo(cx, cy + s)
  ctx.strokeStyle = '#F47B20'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

// ── Drawing helpers ─────────────────────────────────────────

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
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
  let truncated = text
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + '…'
}

// ── Alignment snap computation ──────────────────────────────

function computeAlignSnap(
  movingNodes: { x: number; y: number; width: number; height: number; id: string }[],
  otherNodes: { x: number; y: number; width: number; height: number; id: string }[],
  threshold: number,
): { guides: AlignGuide[]; snapDx: number; snapDy: number } {
  const unique = new Map<string, AlignGuide>()

  let bestSnapX = Infinity
  let bestDistX = threshold
  let bestSnapY = Infinity
  let bestDistY = threshold

  for (const moving of movingNodes) {
    const mx1 = moving.x
    const mx2 = moving.x + moving.width
    const mcx = moving.x + moving.width / 2
    const my1 = moving.y
    const my2 = moving.y + moving.height
    const mcy = moving.y + moving.height / 2

    for (const other of otherNodes) {
      const ox1 = other.x
      const ox2 = other.x + other.width
      const ocx = other.x + other.width / 2
      const oy1 = other.y
      const oy2 = other.y + other.height
      const ocy = other.y + other.height / 2

      // Vertical guides (X alignment): left-left, right-right, center-center, left-right, right-left
      const xChecks: [number, number][] = [
        [mx1, ox1], [mx2, ox2], [mcx, ocx], [mx1, ox2], [mx2, ox1],
      ]
      for (const [a, b] of xChecks) {
        const dist = Math.abs(a - b)
        if (dist < threshold) {
          unique.set(`v:${Math.round(b)}`, { type: 'v', pos: b })
          if (dist < bestDistX) {
            bestDistX = dist
            bestSnapX = b - a
          }
        }
      }

      // Horizontal guides (Y alignment): top-top, bottom-bottom, center-center, top-bottom, bottom-top
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
