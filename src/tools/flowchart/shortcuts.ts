import type { FlowchartStore } from './flowchartStore.ts'

/**
 * Attach keyboard shortcuts to the document.
 * Returns a cleanup function for useEffect.
 */
export function attachShortcuts(
  store: FlowchartStore,
  onExport: () => void,
): () => void {
  const handler = (e: KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey
    const tag = (e.target as HTMLElement).tagName

    // Don't intercept when typing in inputs
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    // ── Undo: Ctrl/Cmd+Z ──────────────────────
    if (isMod && !e.shiftKey && e.key === 'z') {
      e.preventDefault()
      store.undo()
      return
    }

    // ── Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y ──
    if (isMod && e.shiftKey && e.key === 'z') {
      e.preventDefault()
      store.redo()
      return
    }
    if (isMod && e.key === 'y') {
      e.preventDefault()
      store.redo()
      return
    }

    // ── Delete selected: Delete or Backspace ───
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      store.deleteSelected()
      return
    }

    // ── Select all: Ctrl/Cmd+A ─────────────────
    if (isMod && e.key === 'a') {
      e.preventDefault()
      store.selectAll()
      return
    }

    // ── Copy: Ctrl/Cmd+C ──────────────────────
    if (isMod && e.key === 'c') {
      e.preventDefault()
      store.copySelected()
      return
    }

    // ── Paste: Ctrl/Cmd+V ─────────────────────
    if (isMod && e.key === 'v') {
      e.preventDefault()
      store.paste()
      return
    }

    // ── Cut: Ctrl/Cmd+X ──────────────────────
    if (isMod && e.key === 'x') {
      e.preventDefault()
      store.copySelected()
      store.deleteSelected()
      return
    }

    // ── Duplicate: Ctrl/Cmd+D ─────────────────
    if (isMod && e.key === 'd') {
      e.preventDefault()
      store.duplicateSelected()
      return
    }

    // ── Export: Ctrl/Cmd+E ────────────────────
    if (isMod && e.key === 'e') {
      e.preventDefault()
      onExport()
      return
    }

    // ── Escape: deselect / cancel mode ────────
    if (e.key === 'Escape') {
      store.setToolMode('select')
      store.setSelection({ nodeIds: new Set(), edgeIds: new Set() })
      store.setEditingNodeId(null)
      return
    }

    // ── Tool shortcuts ────────────────────────
    if (e.key === 'v' || e.key === 'V') {
      store.setToolMode('select')
      return
    }
    if (e.key === 'h' || e.key === 'H') {
      store.setToolMode('pan')
      return
    }
    if (e.key === 'r' || e.key === 'R') {
      store.setToolMode({ place: 'rectangle' })
      return
    }
    if (!isMod && (e.key === 'c' || e.key === 'C')) {
      store.setToolMode('connect')
      return
    }

    // ── Arrow key nudge ───────────────────────
    const nudge = e.shiftKey ? 10 : 1
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const moved = store.moveNodes(store.selection.nodeIds, -nudge, 0)
      store.commitMove(moved)
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const moved = store.moveNodes(store.selection.nodeIds, nudge, 0)
      store.commitMove(moved)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const moved = store.moveNodes(store.selection.nodeIds, 0, -nudge)
      store.commitMove(moved)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const moved = store.moveNodes(store.selection.nodeIds, 0, nudge)
      store.commitMove(moved)
      return
    }

    // ── Zoom shortcuts ────────────────────────
    if (isMod && (e.key === '=' || e.key === '+')) {
      e.preventDefault()
      store.zoomIn()
      return
    }
    if (isMod && e.key === '-') {
      e.preventDefault()
      store.zoomOut()
      return
    }
    if (isMod && e.key === '0') {
      e.preventDefault()
      store.resetZoom()
      return
    }
  }

  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}
