/**
 * Dashboard keyboard shortcuts.
 * Returns a cleanup function for useEffect.
 */

import type { DashboardStore } from './dashboardStore.ts'

export function attachShortcuts(
  store: DashboardStore,
  callbacks: {
    onExport: () => void
    onSave: () => void
    onAddWidget: () => void
  },
): () => void {
  const handler = (e: KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey
    const tag = (e.target as HTMLElement).tagName

    // Don't intercept when typing in inputs
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    // Undo: Ctrl/Cmd+Z
    if (isMod && !e.shiftKey && e.key === 'z') {
      e.preventDefault()
      store.undo()
      return
    }

    // Redo: Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y
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

    // Save: Ctrl/Cmd+S
    if (isMod && e.key === 's') {
      e.preventDefault()
      callbacks.onSave()
      return
    }

    // Export: Ctrl/Cmd+E
    if (isMod && e.key === 'e') {
      e.preventDefault()
      callbacks.onExport()
      return
    }

    // Add widget: Ctrl/Cmd+Enter
    if (isMod && e.key === 'Enter') {
      e.preventDefault()
      callbacks.onAddWidget()
      return
    }

    // Delete selected widget: Delete or Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const widgetId = store.selectedWidgetId
      if (widgetId && store.isEditMode) {
        e.preventDefault()
        store.deleteWidget(widgetId)
      }
      return
    }

    // Toggle edit mode: Ctrl/Cmd+Shift+E
    if (isMod && e.shiftKey && e.key === 'E') {
      e.preventDefault()
      store.toggleEditMode()
      return
    }

    // Escape: deselect
    if (e.key === 'Escape') {
      store.selectWidget(null)
      return
    }
  }

  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}
