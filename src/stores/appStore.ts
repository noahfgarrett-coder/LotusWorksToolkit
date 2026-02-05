import { create } from 'zustand'
import type { ToolId, Toast } from '@/types/index.ts'

interface AppState {
  // Navigation
  activeTool: ToolId | null
  sidebarExpanded: boolean
  sidebarCategories: Record<string, boolean>

  // Toasts
  toasts: Toast[]

  // Actions
  setActiveTool: (tool: ToolId | null) => void
  goHome: () => void
  toggleSidebar: () => void
  setSidebarExpanded: (expanded: boolean) => void
  toggleCategory: (category: string) => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeTool: null,
  sidebarExpanded: true,
  sidebarCategories: {
    documents: true,
    images: true,
    files: true,
    creators: true,
    utilities: true,
  },
  toasts: [],

  setActiveTool: (tool) => set({ activeTool: tool }),
  goHome: () => set({ activeTool: null }),

  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),

  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),

  toggleCategory: (category) =>
    set((s) => ({
      sidebarCategories: {
        ...s.sidebarCategories,
        [category]: !s.sidebarCategories[category],
      },
    })),

  addToast: (toast) => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    const duration = toast.duration ?? 3000
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, duration)
    }
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
