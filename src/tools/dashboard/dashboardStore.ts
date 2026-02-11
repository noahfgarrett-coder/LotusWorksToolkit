/**
 * Dashboard Store — Custom hook store (no Zustand).
 * Follows the org-chart pattern: useState + useRef + structuredClone undo/redo.
 * Combines dashboard + data store into a single hook.
 */

import { useState, useRef, useCallback } from 'react'
import type {
  Dashboard,
  Widget,
  DataSource,
  DataSourceMeta,
  ChartConfig,
  ChartType,
  ResponsiveLayouts,
  LayoutItem,
  FilterGroup,
  DashboardBackground,
  DEFAULT_WIDGET_SIZES,
} from './types.ts'

const MAX_HISTORY = 50

// ── State Shape ─────────────────────────────────

interface DashboardState {
  // Dashboard data
  dashboards: Map<string, Dashboard>
  widgets: Map<string, Widget>
  activeDashboardId: string | null
  selectedWidgetId: string | null
  isEditMode: boolean

  // Data sources
  dataSources: Map<string, DataSource>
  dataSourcesMeta: Map<string, DataSourceMeta>
  activeDataSourceId: string | null
}

function createInitialState(): DashboardState {
  return {
    dashboards: new Map(),
    widgets: new Map(),
    activeDashboardId: null,
    selectedWidgetId: null,
    isEditMode: false,
    dataSources: new Map(),
    dataSourcesMeta: new Map(),
    activeDataSourceId: null,
  }
}

/** Serializable subset of state for undo/redo (excludes raw data) */
interface HistorySnapshot {
  dashboards: [string, Dashboard][]
  widgets: [string, Widget][]
  activeDashboardId: string | null
}

function takeSnapshot(state: DashboardState): HistorySnapshot {
  return structuredClone({
    dashboards: Array.from(state.dashboards.entries()),
    widgets: Array.from(state.widgets.entries()),
    activeDashboardId: state.activeDashboardId,
  })
}

// ── Hook ────────────────────────────────────────

export function useDashboardStore() {
  // ── Core state ──────────────────────────────
  const [dashboards, setDashboards] = useState<Map<string, Dashboard>>(new Map())
  const [widgets, setWidgets] = useState<Map<string, Widget>>(new Map())
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null)
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)

  // Data
  const [dataSources, setDataSources] = useState<Map<string, DataSource>>(new Map())
  const [dataSourcesMeta, setDataSourcesMeta] = useState<Map<string, DataSourceMeta>>(new Map())
  const [activeDataSourceId, setActiveDataSourceId] = useState<string | null>(null)

  // Refs for latest state access inside callbacks
  const dashboardsRef = useRef(dashboards)
  dashboardsRef.current = dashboards
  const widgetsRef = useRef(widgets)
  widgetsRef.current = widgets

  // ── Undo/Redo ───────────────────────────────
  const historyRef = useRef<HistorySnapshot[]>([])
  const historyIdxRef = useRef(-1)
  const [, forceRender] = useState(0)

  const canUndo = historyIdxRef.current > 0
  const canRedo = historyIdxRef.current < historyRef.current.length - 1

  const pushHistory = useCallback(() => {
    const snapshot = takeSnapshot({
      dashboards: dashboardsRef.current,
      widgets: widgetsRef.current,
      activeDashboardId,
      selectedWidgetId: null,
      isEditMode: false,
      dataSources: new Map(),
      dataSourcesMeta: new Map(),
      activeDataSourceId: null,
    })

    const h = historyRef.current.slice(0, historyIdxRef.current + 1)
    h.push(snapshot)
    if (h.length > MAX_HISTORY) h.shift()
    historyRef.current = h
    historyIdxRef.current = h.length - 1
    forceRender(v => v + 1)
  }, [activeDashboardId])

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current--
    const snapshot = structuredClone(historyRef.current[historyIdxRef.current])
    setDashboards(new Map(snapshot.dashboards))
    setWidgets(new Map(snapshot.widgets))
    setActiveDashboardId(snapshot.activeDashboardId)
    setSelectedWidgetId(null)
    forceRender(v => v + 1)
  }, [])

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current++
    const snapshot = structuredClone(historyRef.current[historyIdxRef.current])
    setDashboards(new Map(snapshot.dashboards))
    setWidgets(new Map(snapshot.widgets))
    setActiveDashboardId(snapshot.activeDashboardId)
    setSelectedWidgetId(null)
    forceRender(v => v + 1)
  }, [])

  // ── Dashboard CRUD ──────────────────────────

  const createDashboard = useCallback((name: string): string => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const dashboard: Dashboard = {
      id,
      name,
      layouts: { lg: [], md: [], sm: [] },
      widgetIds: [],
      createdAt: now,
      updatedAt: now,
    }
    setDashboards(prev => {
      const next = new Map(prev)
      next.set(id, dashboard)
      return next
    })
    setActiveDashboardId(id)
    pushHistory()
    return id
  }, [pushHistory])

  const updateDashboard = useCallback((id: string, updates: Partial<Dashboard>) => {
    setDashboards(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updatedAt: new Date().toISOString() })
      return next
    })
    pushHistory()
  }, [pushHistory])

  const deleteDashboard = useCallback((id: string) => {
    setDashboards(prev => {
      const dashboard = prev.get(id)
      if (!dashboard) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })

    // Clean up widgets that belonged to this dashboard
    const dashboard = dashboardsRef.current.get(id)
    if (dashboard) {
      setWidgets(prev => {
        const next = new Map(prev)
        for (const wId of dashboard.widgetIds) {
          next.delete(wId)
        }
        return next
      })
    }

    setActiveDashboardId(prev => prev === id ? null : prev)
    setSelectedWidgetId(null)
    pushHistory()
  }, [pushHistory])

  const duplicateDashboard = useCallback((id: string): string | null => {
    const source = dashboardsRef.current.get(id)
    if (!source) return null

    const newId = crypto.randomUUID()
    const now = new Date().toISOString()
    const widgetIdMap = new Map<string, string>()

    // Duplicate widgets
    const newWidgetIds: string[] = []
    setWidgets(prev => {
      const next = new Map(prev)
      for (const wId of source.widgetIds) {
        const widget = prev.get(wId)
        if (!widget) continue
        const newWId = crypto.randomUUID()
        widgetIdMap.set(wId, newWId)
        newWidgetIds.push(newWId)
        next.set(newWId, { ...widget, id: newWId, createdAt: now, updatedAt: now })
      }
      return next
    })

    // Map layout IDs
    const mapLayout = (layout: LayoutItem[]): LayoutItem[] =>
      layout.map((item) => ({
        ...item,
        i: widgetIdMap.get(item.i) ?? item.i,
      }))

    const newDashboard: Dashboard = {
      ...source,
      id: newId,
      name: `${source.name} (Copy)`,
      widgetIds: newWidgetIds,
      layouts: {
        lg: mapLayout(source.layouts.lg),
        md: mapLayout(source.layouts.md),
        sm: mapLayout(source.layouts.sm),
      },
      createdAt: now,
      updatedAt: now,
    }

    setDashboards(prev => {
      const next = new Map(prev)
      next.set(newId, newDashboard)
      return next
    })
    setActiveDashboardId(newId)
    pushHistory()
    return newId
  }, [pushHistory])

  const setActiveDashboard = useCallback((id: string | null) => {
    setActiveDashboardId(id)
    setSelectedWidgetId(null)
  }, [])

  // ── Widget CRUD ─────────────────────────────

  const addWidget = useCallback((
    dashboardId: string,
    type: ChartType,
    config: ChartConfig,
    dataSourceId?: string,
    title?: string,
  ): string | null => {
    const dashboard = dashboardsRef.current.get(dashboardId)
    if (!dashboard) return null

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const widget: Widget = {
      id,
      type,
      dataSourceId,
      title: title ?? `${type} widget`,
      config,
      createdAt: now,
      updatedAt: now,
    }

    setWidgets(prev => {
      const next = new Map(prev)
      next.set(id, widget)
      return next
    })

    // Import DEFAULT_WIDGET_SIZES inline to avoid circular dependency issues
    const sizes: Record<string, { w: number; h: number; minW: number; minH: number }> = {
      bar: { w: 4, h: 3, minW: 2, minH: 2 },
      line: { w: 4, h: 3, minW: 2, minH: 2 },
      area: { w: 4, h: 3, minW: 2, minH: 2 },
      pie: { w: 3, h: 3, minW: 2, minH: 2 },
      scatter: { w: 4, h: 3, minW: 2, minH: 2 },
      heatmap: { w: 4, h: 4, minW: 3, minH: 3 },
      treemap: { w: 4, h: 3, minW: 2, minH: 2 },
      kpi: { w: 2, h: 2, minW: 2, minH: 2 },
      text: { w: 4, h: 2, minW: 2, minH: 1 },
      divider: { w: 12, h: 1, minW: 2, minH: 1 },
    }
    const size = sizes[type] ?? { w: 4, h: 3, minW: 2, minH: 2 }

    // Find next available Y position
    const maxY = dashboard.layouts.lg.reduce((max, item) => Math.max(max, item.y + item.h), 0)

    const layoutItem: LayoutItem = {
      i: id,
      x: 0,
      y: maxY,
      w: size.w,
      h: size.h,
      minW: size.minW,
      minH: size.minH,
    }

    setDashboards(prev => {
      const existing = prev.get(dashboardId)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(dashboardId, {
        ...existing,
        widgetIds: [...existing.widgetIds, id],
        layouts: {
          lg: [...existing.layouts.lg, layoutItem],
          md: [...existing.layouts.md, { ...layoutItem, w: Math.min(size.w, 10) }],
          sm: [...existing.layouts.sm, { ...layoutItem, w: Math.min(size.w, 6) }],
        },
        updatedAt: now,
      })
      return next
    })

    pushHistory()
    return id
  }, [pushHistory])

  const updateWidget = useCallback((id: string, updates: Partial<Widget>) => {
    setWidgets(prev => {
      const existing = prev.get(id)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(id, { ...existing, ...updates, updatedAt: new Date().toISOString() })
      return next
    })
    pushHistory()
  }, [pushHistory])

  const deleteWidget = useCallback((widgetId: string) => {
    setWidgets(prev => {
      const next = new Map(prev)
      next.delete(widgetId)
      return next
    })

    // Remove from dashboard
    setDashboards(prev => {
      const next = new Map(prev)
      for (const [dId, dashboard] of next) {
        if (dashboard.widgetIds.includes(widgetId)) {
          next.set(dId, {
            ...dashboard,
            widgetIds: dashboard.widgetIds.filter(id => id !== widgetId),
            layouts: {
              lg: dashboard.layouts.lg.filter(l => l.i !== widgetId),
              md: dashboard.layouts.md.filter(l => l.i !== widgetId),
              sm: dashboard.layouts.sm.filter(l => l.i !== widgetId),
            },
            updatedAt: new Date().toISOString(),
          })
        }
      }
      return next
    })

    setSelectedWidgetId(prev => prev === widgetId ? null : prev)
    pushHistory()
  }, [pushHistory])

  const duplicateWidget = useCallback((widgetId: string, dashboardId: string): string | null => {
    const widget = widgetsRef.current.get(widgetId)
    const dashboard = dashboardsRef.current.get(dashboardId)
    if (!widget || !dashboard) return null

    const newId = crypto.randomUUID()
    const now = new Date().toISOString()
    const newWidget: Widget = { ...widget, id: newId, title: `${widget.title} (Copy)`, createdAt: now, updatedAt: now }

    setWidgets(prev => {
      const next = new Map(prev)
      next.set(newId, newWidget)
      return next
    })

    // Copy layout position, offset by 1 row
    const lgItem = dashboard.layouts.lg.find(l => l.i === widgetId)
    const newLayoutItem: LayoutItem = lgItem
      ? { ...lgItem, i: newId, y: lgItem.y + lgItem.h }
      : { i: newId, x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 }

    setDashboards(prev => {
      const existing = prev.get(dashboardId)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(dashboardId, {
        ...existing,
        widgetIds: [...existing.widgetIds, newId],
        layouts: {
          lg: [...existing.layouts.lg, newLayoutItem],
          md: [...existing.layouts.md, { ...newLayoutItem, w: Math.min(newLayoutItem.w, 10) }],
          sm: [...existing.layouts.sm, { ...newLayoutItem, w: Math.min(newLayoutItem.w, 6) }],
        },
        updatedAt: now,
      })
      return next
    })

    pushHistory()
    return newId
  }, [pushHistory])

  const selectWidget = useCallback((id: string | null) => {
    setSelectedWidgetId(id)
  }, [])

  // ── Layout ──────────────────────────────────

  const updateLayouts = useCallback((dashboardId: string, layouts: ResponsiveLayouts) => {
    setDashboards(prev => {
      const existing = prev.get(dashboardId)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(dashboardId, { ...existing, layouts, updatedAt: new Date().toISOString() })
      return next
    })
    // No pushHistory — layout changes during drag are frequent
  }, [])

  const commitLayoutChange = useCallback(() => {
    pushHistory()
  }, [pushHistory])

  // ── Edit mode ───────────────────────────────

  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => !prev)
    setSelectedWidgetId(null)
  }, [])

  // ── Data source CRUD ────────────────────────

  const addDataSource = useCallback((dataSource: DataSource) => {
    // Check for existing source with same filename — update it
    let existingId: string | null = null
    for (const [id, meta] of dataSourcesMeta) {
      if (meta.fileName === dataSource.fileName) {
        existingId = id
        break
      }
    }
    const idToUse = existingId ?? dataSource.id

    const finalSource = existingId ? { ...dataSource, id: idToUse } : dataSource

    const meta: DataSourceMeta = {
      id: idToUse,
      name: finalSource.name,
      fileName: finalSource.fileName,
      columns: finalSource.columns,
      rowCount: finalSource.rowCount,
      createdAt: existingId
        ? (dataSourcesMeta.get(existingId)?.createdAt ?? finalSource.createdAt)
        : finalSource.createdAt,
      fileHandleId: finalSource.fileHandleId,
    }

    setDataSources(prev => {
      const next = new Map(prev)
      next.set(idToUse, finalSource)
      return next
    })
    setDataSourcesMeta(prev => {
      const next = new Map(prev)
      next.set(idToUse, meta)
      return next
    })
    setActiveDataSourceId(prev => prev ?? idToUse)
  }, [dataSourcesMeta])

  const removeDataSource = useCallback((id: string) => {
    setDataSources(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setDataSourcesMeta(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setActiveDataSourceId(prev => prev === id ? null : prev)
  }, [])

  const setActiveDataSource = useCallback((id: string | null) => {
    setActiveDataSourceId(id)
  }, [])

  const getDataSource = useCallback((id: string): DataSource | undefined => {
    return dataSources.get(id)
  }, [dataSources])

  const getRows = useCallback((id: string, limit?: number, offset = 0): Row[] => {
    const ds = dataSources.get(id)
    if (!ds) return []
    if (limit === undefined) return ds.rows
    return ds.rows.slice(offset, offset + limit)
  }, [dataSources])

  const reloadFromHandle = useCallback((metaId: string, data: Row[], columns: Column[]) => {
    const meta = dataSourcesMeta.get(metaId)
    if (!meta) return

    const dataSource: DataSource = {
      id: meta.id,
      name: meta.name,
      fileName: meta.fileName,
      columns,
      rows: data,
      rowCount: data.length,
      createdAt: meta.createdAt,
      fileHandleId: meta.fileHandleId,
    }

    setDataSources(prev => {
      const next = new Map(prev)
      next.set(metaId, dataSource)
      return next
    })
    setDataSourcesMeta(prev => {
      const next = new Map(prev)
      next.set(metaId, { ...meta, columns, rowCount: data.length })
      return next
    })
  }, [dataSourcesMeta])

  // ── Import/Export ───────────────────────────

  const importDashboard = useCallback((json: string): string | null => {
    try {
      const data = JSON.parse(json) as { version?: number; dashboard?: Dashboard; widgets?: Widget[] }
      if (!data.dashboard || !data.widgets) return null

      const { dashboard, widgets: importedWidgets } = data
      const newDashboardId = crypto.randomUUID()
      const widgetIdMap = new Map<string, string>()
      const now = new Date().toISOString()

      const newWidgetIds: string[] = []
      setWidgets(prev => {
        const next = new Map(prev)
        for (const w of importedWidgets) {
          const newWId = crypto.randomUUID()
          widgetIdMap.set(w.id, newWId)
          newWidgetIds.push(newWId)
          next.set(newWId, { ...w, id: newWId, createdAt: now, updatedAt: now })
        }
        return next
      })

      const mapLayout = (layout: LayoutItem[]): LayoutItem[] =>
        layout.map(item => ({ ...item, i: widgetIdMap.get(item.i) ?? item.i }))

      const newDashboard: Dashboard = {
        ...dashboard,
        id: newDashboardId,
        name: `${dashboard.name} (Imported)`,
        widgetIds: newWidgetIds,
        layouts: {
          lg: mapLayout(dashboard.layouts.lg),
          md: mapLayout(dashboard.layouts.md),
          sm: mapLayout(dashboard.layouts.sm),
        },
        createdAt: now,
        updatedAt: now,
      }

      setDashboards(prev => {
        const next = new Map(prev)
        next.set(newDashboardId, newDashboard)
        return next
      })
      setActiveDashboardId(newDashboardId)
      pushHistory()
      return newDashboardId
    } catch {
      return null
    }
  }, [pushHistory])

  const exportDashboard = useCallback((id: string): string | null => {
    const dashboard = dashboardsRef.current.get(id)
    if (!dashboard) return null

    const dashboardWidgets = dashboard.widgetIds
      .map(wId => widgetsRef.current.get(wId))
      .filter((w): w is Widget => w !== undefined)

    return JSON.stringify(
      { version: 1, dashboard, widgets: dashboardWidgets, exportedAt: new Date().toISOString() },
      null,
      2,
    )
  }, [])

  // ── Background ──────────────────────────────

  const setDashboardBackground = useCallback((dashboardId: string, background: DashboardBackground | undefined) => {
    setDashboards(prev => {
      const existing = prev.get(dashboardId)
      if (!existing) return prev
      const next = new Map(prev)
      next.set(dashboardId, { ...existing, background, updatedAt: new Date().toISOString() })
      return next
    })
    pushHistory()
  }, [pushHistory])

  // ── Bulk load (from storage) ────────────────

  const loadState = useCallback((
    storedDashboards: [string, Dashboard][],
    storedWidgets: [string, Widget][],
    activeId: string | null,
  ) => {
    setDashboards(new Map(storedDashboards))
    setWidgets(new Map(storedWidgets))
    setActiveDashboardId(activeId)
    setSelectedWidgetId(null)
    // Initialize history with loaded state
    historyRef.current = [{
      dashboards: structuredClone(storedDashboards),
      widgets: structuredClone(storedWidgets),
      activeDashboardId: activeId,
    }]
    historyIdxRef.current = 0
    forceRender(v => v + 1)
  }, [])

  // ── Derived state ───────────────────────────

  const activeDashboard = activeDashboardId ? dashboards.get(activeDashboardId) ?? null : null

  const getDashboardWidgets = useCallback((dashboardId: string): Widget[] => {
    const dashboard = dashboards.get(dashboardId)
    if (!dashboard) return []
    return dashboard.widgetIds
      .map(wId => widgets.get(wId))
      .filter((w): w is Widget => w !== undefined)
  }, [dashboards, widgets])

  // ── Return ──────────────────────────────────

  return {
    // Dashboard state
    dashboards,
    widgets,
    activeDashboardId,
    activeDashboard,
    selectedWidgetId,
    isEditMode,
    canUndo,
    canRedo,

    // Data state
    dataSources,
    dataSourcesMeta,
    activeDataSourceId,

    // Dashboard actions
    createDashboard,
    updateDashboard,
    deleteDashboard,
    duplicateDashboard,
    setActiveDashboard,
    setDashboardBackground,

    // Widget actions
    addWidget,
    updateWidget,
    deleteWidget,
    duplicateWidget,
    selectWidget,

    // Layout
    updateLayouts,
    commitLayoutChange,

    // Edit mode
    toggleEditMode,
    setIsEditMode,

    // Data actions
    addDataSource,
    removeDataSource,
    setActiveDataSource,
    getDataSource,
    getRows,
    reloadFromHandle,

    // Import/Export
    importDashboard,
    exportDashboard,

    // History
    undo,
    redo,

    // Bulk load
    loadState,

    // Derived
    getDashboardWidgets,
  }
}

export type DashboardStore = ReturnType<typeof useDashboardStore>

// Re-export Row and Column for shortcuts.ts to use
import type { Row, Column } from './types.ts'
export type { Row, Column }
