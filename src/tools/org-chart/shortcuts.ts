import type { OrgChartStore } from './orgChartStore.ts'

/**
 * Attach keyboard shortcuts to the document.
 * Returns a cleanup function for useEffect.
 */
export function attachShortcuts(
  store: OrgChartStore,
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

    // ── Select All: Ctrl/Cmd+A ─────────────────
    if (isMod && e.key === 'a') {
      e.preventDefault()
      store.selectAll()
      return
    }

    // ── Delete selected: Delete or Backspace ───
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (store.selectedNodeIds.size > 0) {
        e.preventDefault()
        store.removeSelectedNodes()
      }
      return
    }

    // ── Export: Ctrl/Cmd+E ────────────────────
    if (isMod && e.key === 'e') {
      e.preventDefault()
      onExport()
      return
    }

    // ── Escape: deselect ──────────────────────
    if (e.key === 'Escape') {
      store.selectNode(null)
      return
    }

    // ── Add person: Ctrl/Cmd+Enter ────────────
    if (isMod && e.key === 'Enter') {
      const parentId = store.selectedNodeId ?? store.nodes.find(n => !n.reportsTo)?.id
      if (parentId) {
        e.preventDefault()
        store.addNode(parentId)
      }
      return
    }

    // ── Tree navigation with arrow keys ───────
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (!store.selectedNodeId) return
      e.preventDefault()

      const current = store.nodes.find(n => n.id === store.selectedNodeId)
      if (!current) return

      if (e.key === 'ArrowDown') {
        // Navigate to first child
        const child = store.nodes.find(n => n.reportsTo === current.id)
        if (child) store.selectNode(child.id)
      } else if (e.key === 'ArrowUp') {
        // Navigate to parent
        if (current.reportsTo) {
          store.selectNode(current.reportsTo)
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // Navigate to sibling
        const siblings = store.nodes.filter(n => n.reportsTo === current.reportsTo)
        const idx = siblings.findIndex(n => n.id === current.id)
        if (idx < 0) return
        const next = e.key === 'ArrowRight' ? idx + 1 : idx - 1
        if (next >= 0 && next < siblings.length) {
          store.selectNode(siblings[next].id)
        }
      }
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
