import type { FormStore } from './formStore.ts'

/**
 * Attach keyboard shortcuts to the document.
 * Returns a cleanup function for useEffect.
 */
export function attachShortcuts(
  store: FormStore,
  callbacks: {
    onExport: () => void
    onSave: () => void
  },
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
      if (store.selectedIds.size > 0) {
        e.preventDefault()
        store.removeSelectedElements()
      }
      return
    }

    // ── Duplicate: Ctrl/Cmd+D ───────────────────
    if (isMod && e.key === 'd') {
      e.preventDefault()
      store.duplicateSelected()
      return
    }

    // ── Copy: Ctrl/Cmd+C ────────────────────────
    if (isMod && e.key === 'c') {
      e.preventDefault()
      store.copySelected()
      return
    }

    // ── Paste: Ctrl/Cmd+V ───────────────────────
    if (isMod && e.key === 'v') {
      e.preventDefault()
      store.pasteClipboard()
      return
    }

    // ── Save: Ctrl/Cmd+S ────────────────────────
    if (isMod && e.key === 's') {
      e.preventDefault()
      callbacks.onSave()
      return
    }

    // ── Export: Ctrl/Cmd+E ──────────────────────
    if (isMod && e.key === 'e') {
      e.preventDefault()
      callbacks.onExport()
      return
    }

    // ── Escape: deselect ────────────────────────
    if (e.key === 'Escape') {
      store.selectElement(null)
      return
    }

    // ── Nudge with arrow keys ───────────────────
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (store.selectedIds.size === 0) return
      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      let dx = 0, dy = 0
      if (e.key === 'ArrowLeft')  dx = -step
      if (e.key === 'ArrowRight') dx = step
      if (e.key === 'ArrowUp')    dy = -step
      if (e.key === 'ArrowDown')  dy = step
      store.moveElements(store.selectedIds, dx, dy)
      store.commitMove()
      return
    }

    // ── Zoom shortcuts ──────────────────────────
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
