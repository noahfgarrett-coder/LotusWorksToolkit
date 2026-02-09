import { useRef, useState, useEffect, useCallback } from 'react'
import type { FormStore } from './formStore.ts'
import type { HandlePosition } from './FormElementView.tsx'
import {
  PAGE_SIZES, PAGE_GAP, MIN_ZOOM, MAX_ZOOM,
  MIN_ELEMENT_SIZE, ALIGN_THRESHOLD, pageTopY,
} from './types.ts'
import { FormPage } from './FormPage.tsx'

// ── Drag State ──────────────────────────────────────────────

interface DragState {
  type: 'pan' | 'move' | 'resize' | 'marquee'
  startScreenX: number
  startScreenY: number
  moved: boolean
  // move
  elementId?: string
  // resize
  resizeHandle?: HandlePosition
  resizeStart?: { x: number; y: number; w: number; h: number }
  // marquee
  canvasStartX?: number
  canvasStartY?: number
  canvasCurrentX?: number
  canvasCurrentY?: number
  shiftHeld?: boolean
  priorSelection?: Set<string>
}

// ── Snap guide ──────────────────────────────────────────────

interface SnapGuide {
  axis: 'x' | 'y'
  pos: number          // canvas-space coordinate
  pageIndex: number
}

// ── Component ───────────────────────────────────────────────

export function FormCanvas({ store }: { store: FormStore }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const [guides, setGuides] = useState<SnapGuide[]>([])

  // ── Space key for pan mode ──────────────────────────────
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

  // ── Coordinate helpers ──────────────────────────────────

  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const { panX, panY, zoom } = store.viewport
    return {
      x: (clientX - rect.left - panX) / zoom,
      y: (clientY - rect.top - panY) / zoom,
    }
  }, [store.viewport])

  // ── Snap computation ──────────────────────────────────────

  const computeSnap = useCallback((
    movingIds: Set<string>,
    dx: number,
    dy: number,
  ): { snapDx: number; snapDy: number; guides: SnapGuide[] } => {
    const elements = store.doc.elements
    const pageSize = store.doc.pageSize
    const pageDim = PAGE_SIZES[pageSize]

    // Gather moving element edges
    const moving = elements.filter(el => movingIds.has(el.id))
    if (moving.length === 0) return { snapDx: dx, snapDy: dy, guides: [] }

    // Bounding box of moving elements (after applying proposed delta)
    const left   = Math.min(...moving.map(el => el.x + dx))
    const right  = Math.max(...moving.map(el => el.x + el.width + dx))
    const top    = Math.min(...moving.map(el => el.y + dy))
    const bottom = Math.max(...moving.map(el => el.y + el.height + dy))
    const cx     = (left + right) / 2
    const cy     = (top + bottom) / 2

    // Reference points: other elements on same page + page edges/center
    const pageIndex = moving[0].pageIndex
    const others = elements.filter(el => !movingIds.has(el.id) && el.pageIndex === pageIndex)

    const refXs: number[] = []
    const refYs: number[] = []

    // Page edges and center
    refXs.push(0, pageDim.widthPx, pageDim.widthPx / 2)
    refYs.push(0, pageDim.heightPx, pageDim.heightPx / 2)

    for (const o of others) {
      refXs.push(o.x, o.x + o.width, o.x + o.width / 2)
      refYs.push(o.y, o.y + o.height, o.y + o.height / 2)
    }

    // Find closest snap on each axis
    let bestSnapX = dx
    let bestDistX = ALIGN_THRESHOLD + 1
    let bestSnapY = dy
    let bestDistY = ALIGN_THRESHOLD + 1
    const newGuides: SnapGuide[] = []

    const movingXs = [left, right, cx]
    const movingYs = [top, bottom, cy]

    for (const mx of movingXs) {
      for (const rx of refXs) {
        const dist = Math.abs(mx - rx)
        if (dist < bestDistX) {
          bestDistX = dist
          bestSnapX = dx + (rx - mx)
        }
      }
    }
    for (const my of movingYs) {
      for (const ry of refYs) {
        const dist = Math.abs(my - ry)
        if (dist < bestDistY) {
          bestDistY = dist
          bestSnapY = dy + (ry - my)
        }
      }
    }

    // Build guide lines for snapped axes
    if (bestDistX <= ALIGN_THRESHOLD) {
      const snappedLeft = Math.min(...moving.map(el => el.x + bestSnapX))
      const snappedRight = Math.max(...moving.map(el => el.x + el.width + bestSnapX))
      const snappedCx = (snappedLeft + snappedRight) / 2
      for (const rx of refXs) {
        if ([snappedLeft, snappedRight, snappedCx].some(v => Math.abs(v - rx) < 1)) {
          newGuides.push({ axis: 'x', pos: rx, pageIndex })
        }
      }
    } else {
      bestSnapX = dx
    }

    if (bestDistY <= ALIGN_THRESHOLD) {
      const snappedTop = Math.min(...moving.map(el => el.y + bestSnapY))
      const snappedBottom = Math.max(...moving.map(el => el.y + el.height + bestSnapY))
      const snappedCy = (snappedTop + snappedBottom) / 2
      for (const ry of refYs) {
        if ([snappedTop, snappedBottom, snappedCy].some(v => Math.abs(v - ry) < 1)) {
          newGuides.push({ axis: 'y', pos: ry, pageIndex })
        }
      }
    } else {
      bestSnapY = dy
    }

    return { snapDx: bestSnapX, snapDy: bestSnapY, guides: newGuides }
  }, [store.doc.elements, store.doc.pageSize])

  // ── Pointer handlers ──────────────────────────────────────

  const MOVE_THRESHOLD = 5

  const handleBackgroundPointerDown = useCallback((e: React.PointerEvent) => {
    // Middle mouse button → pan
    if (e.button === 1) {
      e.preventDefault()
      setDrag({
        type: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        moved: false,
      })
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    if (e.button !== 0) return

    // Pan with space
    if (spaceHeldRef.current) {
      setDrag({
        type: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        moved: false,
      })
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    // Marquee on background
    const canvas = screenToCanvas(e.clientX, e.clientY)
    setDrag({
      type: 'marquee',
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      moved: false,
      canvasStartX: canvas.x,
      canvasStartY: canvas.y,
      canvasCurrentX: canvas.x,
      canvasCurrentY: canvas.y,
      shiftHeld: e.shiftKey,
      priorSelection: e.shiftKey ? new Set(store.selectedIds) : new Set(),
    })
    if (!e.shiftKey) store.selectElement(null)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [screenToCanvas, store])

  const handleElementPointerDown = useCallback((e: React.PointerEvent, elementId: string) => {
    e.stopPropagation()

    // Middle mouse button → pan
    if (e.button === 1) {
      e.preventDefault()
      setDrag({
        type: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        moved: false,
      })
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    if (e.button !== 0) return

    // Pan override with space
    if (spaceHeldRef.current) {
      setDrag({
        type: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        moved: false,
      })
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    // Select
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      store.selectElement(elementId, true)
    } else if (!store.selectedIds.has(elementId)) {
      store.selectElement(elementId)
    }

    // Start move
    setDrag({
      type: 'move',
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      moved: false,
      elementId,
    })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [store])

  const handleResizeStart = useCallback((e: React.PointerEvent, elementId: string, handle: HandlePosition) => {
    e.stopPropagation()
    const el = store.doc.elements.find(el => el.id === elementId)
    if (!el) return
    setDrag({
      type: 'resize',
      startScreenX: e.clientX,
      startScreenY: e.clientY,
      moved: false,
      elementId,
      resizeHandle: handle,
      resizeStart: { x: el.x, y: el.y, w: el.width, h: el.height },
    })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [store.doc.elements])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) {
      // Hover detection
      const target = (e.target as HTMLElement).closest('[data-element-id]') as HTMLElement | null
      setHoveredId(target?.dataset.elementId ?? null)
      return
    }

    const dxScreen = e.clientX - d.startScreenX
    const dyScreen = e.clientY - d.startScreenY

    if (!d.moved && Math.abs(dxScreen) < MOVE_THRESHOLD && Math.abs(dyScreen) < MOVE_THRESHOLD) return

    switch (d.type) {
      case 'pan': {
        store.setViewport(prev => ({
          ...prev,
          panX: prev.panX + (e.clientX - d.startScreenX),
          panY: prev.panY + (e.clientY - d.startScreenY),
        }))
        setDrag({ ...d, startScreenX: e.clientX, startScreenY: e.clientY, moved: true })
        break
      }

      case 'move': {
        const zoom = store.viewport.zoom
        const dx = (e.clientX - d.startScreenX) / zoom
        const dy = (e.clientY - d.startScreenY) / zoom

        // Compute snap
        const snap = computeSnap(store.selectedIds, dx, dy)
        store.moveElements(store.selectedIds, snap.snapDx, snap.snapDy)
        setGuides(snap.guides)
        setDrag({ ...d, startScreenX: e.clientX, startScreenY: e.clientY, moved: true })
        break
      }

      case 'resize': {
        if (!d.resizeHandle || !d.resizeStart || !d.elementId) break
        const zoom = store.viewport.zoom
        const dx = dxScreen / zoom
        const dy = dyScreen / zoom
        const { x: sx, y: sy, w: sw, h: sh } = d.resizeStart
        let nx = sx, ny = sy, nw = sw, nh = sh

        // Apply delta based on handle
        if (d.resizeHandle.includes('e')) { nw = Math.max(MIN_ELEMENT_SIZE, sw + dx) }
        if (d.resizeHandle.includes('w')) { nx = sx + dx; nw = Math.max(MIN_ELEMENT_SIZE, sw - dx) }
        if (d.resizeHandle.includes('s')) { nh = Math.max(MIN_ELEMENT_SIZE, sh + dy) }
        if (d.resizeHandle.includes('n')) { ny = sy + dy; nh = Math.max(MIN_ELEMENT_SIZE, sh - dy) }

        // Clamp: if width hit min, don't move x
        if (nw === MIN_ELEMENT_SIZE && d.resizeHandle.includes('w')) nx = sx + sw - MIN_ELEMENT_SIZE
        if (nh === MIN_ELEMENT_SIZE && d.resizeHandle.includes('n')) ny = sy + sh - MIN_ELEMENT_SIZE

        store.resizeElement(d.elementId, nx, ny, nw, nh)
        if (!d.moved) setDrag({ ...d, moved: true })
        break
      }

      case 'marquee': {
        const canvas = screenToCanvas(e.clientX, e.clientY)
        const updated = { ...d, canvasCurrentX: canvas.x, canvasCurrentY: canvas.y, moved: true }
        setDrag(updated)

        // Find elements inside marquee rect
        const x1 = Math.min(d.canvasStartX!, canvas.x)
        const y1 = Math.min(d.canvasStartY!, canvas.y)
        const x2 = Math.max(d.canvasStartX!, canvas.x)
        const y2 = Math.max(d.canvasStartY!, canvas.y)

        const pageSize = store.doc.pageSize
        const hits: string[] = []
        for (const el of store.doc.elements) {
          const py = pageTopY(el.pageIndex, pageSize)
          const elLeft = el.x
          const elTop = py + el.y
          const elRight = elLeft + el.width
          const elBottom = elTop + el.height
          if (elRight > x1 && elLeft < x2 && elBottom > y1 && elTop < y2) {
            hits.push(el.id)
          }
        }

        const ids = d.shiftHeld ? [...(d.priorSelection ?? []), ...hits] : hits
        store.selectElements(ids)
        break
      }
    }
  }, [store, screenToCanvas, computeSnap])

  const handlePointerUp = useCallback(() => {
    const d = dragRef.current
    if (!d) return

    if (d.type === 'move' && d.moved) {
      store.commitMove()
    } else if (d.type === 'resize' && d.moved) {
      store.commitResize()
    } else if (d.type === 'move' && !d.moved && d.elementId) {
      // Click without drag — select just this element
      store.selectElement(d.elementId)
    }

    setDrag(null)
    setGuides([])
  }, [store])

  // ── Wheel zoom (native listener for non-passive) ────────

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Pinch zoom
        const delta = -e.deltaY * 0.01
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, store.viewport.zoom * (1 + delta)))
        store.zoomTo(newZoom, { x: e.clientX, y: e.clientY })
      } else {
        // Pan
        store.setViewport(prev => ({
          ...prev,
          panX: prev.panX - e.deltaX,
          panY: prev.panY - e.deltaY,
        }))
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [store])

  // ── Fit to content ──────────────────────────────────────

  const fitToContent = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const { doc } = store
    const pageDim = PAGE_SIZES[doc.pageSize]
    const totalHeight = doc.pageCount * pageDim.heightPx + (doc.pageCount - 1) * PAGE_GAP
    const totalWidth = pageDim.widthPx

    const cw = container.clientWidth
    const ch = container.clientHeight
    const zoom = Math.min(cw / (totalWidth + 80), ch / (totalHeight + 80), 1.5)
    const panX = (cw - totalWidth * zoom) / 2
    const panY = 40 * zoom

    store.setViewport({ panX, panY, zoom })
  }, [store])

  // Expose fit function for external use (toolbar)
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__formFitToContent = fitToContent
    return () => { delete (window as unknown as Record<string, unknown>).__formFitToContent }
  }, [fitToContent])

  // Initial fit
  useEffect(() => {
    fitToContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Render ────────────────────────────────────────────────

  const { viewport, doc } = store
  const pageDim = PAGE_SIZES[doc.pageSize]

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden relative"
      style={{ cursor: spaceHeld ? (drag?.type === 'pan' ? 'grabbing' : 'grab') : drag?.type === 'pan' ? 'grabbing' : 'default' }}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Viewport transform wrapper */}
      <div
        style={{
          transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {/* Pages */}
        {Array.from({ length: doc.pageCount }, (_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              top: pageTopY(i, doc.pageSize),
            }}
          >
            <FormPage
              pageIndex={i}
              pageSize={doc.pageSize}
              elements={doc.elements.filter(el => el.pageIndex === i)}
              selectedIds={store.selectedIds}
              hoveredId={hoveredId}
              onElementPointerDown={handleElementPointerDown}
              onResizeStart={handleResizeStart}
            />
          </div>
        ))}

        {/* Snap guides */}
        {guides.map((g, i) => (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={g.axis === 'x' ? {
              left: g.pos,
              top: pageTopY(g.pageIndex, doc.pageSize),
              width: 1,
              height: pageDim.heightPx,
              borderLeft: '1px dashed rgba(59,130,246,0.5)',
            } : {
              left: 0,
              top: pageTopY(g.pageIndex, doc.pageSize) + g.pos,
              width: pageDim.widthPx,
              height: 1,
              borderTop: '1px dashed rgba(59,130,246,0.5)',
            }}
          />
        ))}

        {/* Marquee rectangle */}
        {drag?.type === 'marquee' && drag.moved && (
          <div
            className="absolute border border-[#3B82F6] bg-[#3B82F6]/10 pointer-events-none"
            style={{
              left: Math.min(drag.canvasStartX!, drag.canvasCurrentX!),
              top: Math.min(drag.canvasStartY!, drag.canvasCurrentY!),
              width: Math.abs(drag.canvasCurrentX! - drag.canvasStartX!),
              height: Math.abs(drag.canvasCurrentY! - drag.canvasStartY!),
            }}
          />
        )}
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3 text-[10px] text-white/20 select-none pointer-events-none">
        {Math.round(viewport.zoom * 100)}%
      </div>
    </div>
  )
}
