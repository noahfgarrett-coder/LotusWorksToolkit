/**
 * DashboardTool — Main orchestrator for the dashboard BI tool.
 * Wires together: store, shortcuts, auto-save, data import,
 * dashboard canvas, widget palette, data table, and export.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore.ts'
import { BarChart3, Plus, Upload, FolderOpen, Trash2, Copy, FileJson, AlertTriangle, DatabaseZap, FileUp } from 'lucide-react'
import { useDashboardStore } from './dashboardStore.ts'
import { useFileHandle } from './useFileHandle.ts'
import { attachShortcuts } from './shortcuts.ts'
import { saveDashboard, loadAllDashboards, deleteDashboard as deleteFromStorage } from './storage.ts'
import { exportDashboardPNG, exportDashboardJSON, parseDashboardJSON, exportDataCSV } from './export.ts'
import { Toolbar } from './Toolbar.tsx'
import { DashboardCanvas } from './DashboardCanvas.tsx'
import { WidgetPalette } from './WidgetPalette.tsx'
import { DataImporter } from './DataImporter.tsx'
import { DataTable } from './DataTable.tsx'
import { BackgroundEditor } from './BackgroundEditor.tsx'
import type { Dashboard, Widget } from './types.ts'

// ── Modal views ─────────────────────────────────

type ModalView = 'none' | 'addWidget' | 'importData' | 'viewData' | 'background'

// ── Component ───────────────────────────────────

export default function DashboardTool() {
  const store = useDashboardStore()
  const fileHandle = useFileHandle()
  const [modalView, setModalView] = useState<ModalView>('none')
  const [isLoaded, setIsLoaded] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // ── Load from localStorage on mount ───────────

  useEffect(() => {
    const entries = loadAllDashboards()
    if (entries.length > 0) {
      const storedDashboards: [string, Dashboard][] = []
      const storedWidgets: [string, Widget][] = []
      let activeId: string | null = null

      for (const entry of entries) {
        storedDashboards.push([entry.dashboard.id, entry.dashboard])
        for (const w of entry.widgets) {
          storedWidgets.push([w.id, w])
        }
        if (!activeId) activeId = entry.dashboard.id
      }

      store.loadState(storedDashboards, storedWidgets, activeId)
    }
    setIsLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Auto-save on dashboard/widget changes ─────

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!isLoaded) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    saveTimeoutRef.current = setTimeout(() => {
      for (const [, dashboard] of store.dashboards) {
        const widgets = store.getDashboardWidgets(dashboard.id)
        saveDashboard(dashboard, widgets)
      }
    }, 1000)

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [store.dashboards, store.widgets, store.getDashboardWidgets, isLoaded])

  // ── Keyboard shortcuts ────────────────────────

  const handleExportPNG = useCallback(async () => {
    if (!gridRef.current) return
    try {
      await exportDashboardPNG(gridRef.current)
    } catch {
      useAppStore.getState().addToast({ type: 'error', message: 'PNG export failed' })
    }
  }, [])

  const handleSave = useCallback(() => {
    for (const [, dashboard] of store.dashboards) {
      const widgets = store.getDashboardWidgets(dashboard.id)
      saveDashboard(dashboard, widgets)
    }
  }, [store.dashboards, store.getDashboardWidgets])

  useEffect(() => {
    return attachShortcuts(store, {
      onExport: handleExportPNG,
      onSave: handleSave,
      onAddWidget: () => setModalView('addWidget'),
    })
  }, [store, handleExportPNG, handleSave])

  // ── Callbacks ─────────────────────────────────

  const handleExportJSON = useCallback(() => {
    if (!store.activeDashboardId) return
    const dashboard = store.dashboards.get(store.activeDashboardId)
    if (!dashboard) return
    const widgets = store.getDashboardWidgets(dashboard.id)
    exportDashboardJSON(dashboard, widgets, store.dataSources)
  }, [store.activeDashboardId, store.dashboards, store.getDashboardWidgets, store.dataSources])

  const handleImportJSON = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        parseDashboardJSON(text) // validate
        store.importDashboard(text)
      } catch {
        useAppStore.getState().addToast({ type: 'error', message: 'Invalid dashboard JSON file' })
      }
    }
    input.click()
  }, [store])

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleDeleteDashboard = useCallback(() => {
    if (!store.activeDashboardId) return
    setConfirmDelete(store.activeDashboardId)
  }, [store.activeDashboardId])

  const confirmDeleteDashboard = useCallback((id: string) => {
    store.deleteDashboard(id)
    deleteFromStorage(id)
    setConfirmDelete(null)
  }, [store])

  const handleDataImportSuccess = useCallback((dataSourceId: string) => {
    setModalView('none')
    store.setActiveDataSource(dataSourceId)

    // If no dashboard exists, create one
    if (store.dashboards.size === 0) {
      store.createDashboard('Dashboard 1')
      store.setIsEditMode(true)
    }
  }, [store])

  const handleExportCSV = useCallback(() => {
    if (!store.activeDataSourceId) return
    const ds = store.getDataSource(store.activeDataSourceId)
    if (!ds) return
    exportDataCSV(ds.columns, ds.rows, `${ds.name}.csv`)
  }, [store])

  // ── Dashboard list view (no active dashboard) ─

  if (isLoaded && !store.activeDashboardId) {
    const dashboardList = Array.from(store.dashboards.values())
    const hasData = store.dataSources.size > 0

    return (
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-1 pb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-[#F47B20]" />
            <h2 className="text-sm font-semibold text-dark-text-primary">Dashboards</h2>
          </div>
          <div className="flex items-center gap-2">
            {!hasData && (
              <button
                onClick={() => setModalView('importData')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg
                  bg-white/[0.06] hover:bg-white/[0.1] text-dark-text-muted transition-colors"
              >
                <Upload size={14} />
                Import Data
              </button>
            )}
            <button
              onClick={handleImportJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg
                bg-white/[0.06] hover:bg-white/[0.1] text-dark-text-muted transition-colors"
            >
              <FileJson size={14} />
              Import JSON
            </button>
            <button
              onClick={() => {
                const id = store.createDashboard(`Dashboard ${dashboardList.length + 1}`)
                store.setActiveDashboard(id)
                store.setIsEditMode(true)
                if (!hasData) setModalView('importData')
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                bg-[#F47B20] hover:bg-[#F47B20]/90 text-white transition-colors"
            >
              <Plus size={14} />
              New Dashboard
            </button>
          </div>
        </div>

        {/* Dashboard cards or empty state */}
        {dashboardList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center">
              <BarChart3 size={28} className="text-white/20" />
            </div>
            <div>
              <p className="text-sm font-medium text-dark-text-primary">No dashboards yet</p>
              <p className="text-xs text-dark-text-muted mt-1">
                {hasData
                  ? 'Create a dashboard to start visualizing your data'
                  : 'Import data and create your first dashboard'}
              </p>
            </div>
            <button
              onClick={() => {
                const id = store.createDashboard('Dashboard 1')
                store.setActiveDashboard(id)
                store.setIsEditMode(true)
                if (!hasData) setModalView('importData')
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg
                bg-[#F47B20] hover:bg-[#F47B20]/90 text-white transition-colors"
            >
              <Plus size={14} />
              Create Dashboard
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {dashboardList.map((d) => {
                const widgetCount = d.widgetIds.length
                return (
                  <button
                    key={d.id}
                    onClick={() => store.setActiveDashboard(d.id)}
                    className="text-left p-4 rounded-xl border border-dark-border bg-white/[0.02]
                      hover:bg-white/[0.05] hover:border-white/[0.12] transition-all group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-8 h-8 rounded-lg bg-[#F47B20]/10 flex items-center justify-center">
                        <BarChart3 size={16} className="text-[#F47B20]" />
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            store.duplicateDashboard(d.id)
                          }}
                          className="p-1 rounded hover:bg-white/[0.1] text-dark-text-muted"
                          title="Duplicate"
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDelete(d.id)
                          }}
                          className="p-1 rounded hover:bg-red-500/20 text-dark-text-muted hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-dark-text-primary truncate">{d.name}</p>
                    <p className="text-xs text-dark-text-muted mt-1">
                      {widgetCount} widget{widgetCount !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[10px] text-dark-text-muted/60 mt-1">
                      Updated {new Date(d.updatedAt).toLocaleDateString()}
                    </p>
                  </button>
                )
              })}

              {/* New dashboard card */}
              <button
                onClick={() => {
                  const id = store.createDashboard(`Dashboard ${dashboardList.length + 1}`)
                  store.setActiveDashboard(id)
                  store.setIsEditMode(true)
                  if (!hasData) setModalView('importData')
                }}
                className="flex flex-col items-center justify-center p-4 rounded-xl
                  border-2 border-dashed border-dark-border hover:border-[#F47B20]/40
                  text-dark-text-muted hover:text-[#F47B20] transition-all min-h-[120px]"
              >
                <Plus size={20} className="mb-1" />
                <span className="text-xs">New Dashboard</span>
              </button>
            </div>
          </div>
        )}

        {/* Data import modal */}
        {modalView === 'importData' && (
          <ModalOverlay onClose={() => setModalView('none')}>
            <DataImporter
              store={store}
              fileHandle={fileHandle}
              onSuccess={handleDataImportSuccess}
              onCancel={() => setModalView('none')}
            />
          </ModalOverlay>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <ConfirmDeleteDialog
            name={store.dashboards.get(confirmDelete)?.name ?? 'this dashboard'}
            onConfirm={() => confirmDeleteDashboard(confirmDelete)}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </div>
    )
  }

  // ── Active dashboard view ─────────────────────

  const activeDs = store.activeDataSourceId
    ? store.getDataSource(store.activeDataSourceId)
    : undefined

  // Detect widgets referencing data sources that aren't loaded
  const missingDataSourceIds = useMemo(() => {
    if (!store.activeDashboardId) return new Set<string>()
    const widgets = store.getDashboardWidgets(store.activeDashboardId)
    const missing = new Set<string>()
    for (const w of widgets) {
      if (w.dataSourceId && !store.dataSources.has(w.dataSourceId)) {
        missing.add(w.dataSourceId)
      }
    }
    return missing
  }, [store.activeDashboardId, store.getDashboardWidgets, store.dataSources])

  const hasNoData = store.dataSources.size === 0
  const hasMissingData = missingDataSourceIds.size > 0

  // Try auto-reconnect via stored file handles
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [reconnectFailed, setReconnectFailed] = useState(false)

  const handleReconnect = useCallback(async () => {
    setIsReconnecting(true)
    setReconnectFailed(false)

    let anyReconnected = false
    for (const dsId of missingDataSourceIds) {
      try {
        const file = await fileHandle.requestPermission(dsId)
        if (file) {
          const { parseFile } = await import('./xlsxParser.ts')
          const dataSource = await parseFile(file)
          // Re-add with same ID so widget references reconnect
          store.addDataSource({ ...dataSource, id: dsId })
          store.setActiveDataSource(dsId)
          anyReconnected = true
        }
      } catch {
        // individual reconnect failed — continue trying others
      }
    }

    setIsReconnecting(false)
    if (!anyReconnected) setReconnectFailed(true)
  }, [missingDataSourceIds, fileHandle, store])

  // Check if we have stored handles for the missing sources
  const hasStoredHandles = fileHandle.storedHandles.some(
    (h) => missingDataSourceIds.has(h.id),
  )

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <Toolbar
        store={store}
        onAddWidget={() => setModalView('addWidget')}
        onViewData={() => setModalView('viewData')}
        onImportData={() => setModalView('importData')}
        onBackground={() => setModalView('background')}
        onExportPNG={handleExportPNG}
        onExportJSON={handleExportJSON}
        onImportJSON={handleImportJSON}
        onSave={handleSave}
        onDelete={handleDeleteDashboard}
        onNewDashboard={() => {
          const id = store.createDashboard(`Dashboard ${store.dashboards.size + 1}`)
          store.setActiveDashboard(id)
          store.setIsEditMode(true)
          if (store.dataSources.size === 0) setModalView('importData')
        }}
        onGoToList={() => store.setActiveDashboard(null)}
      />

      {/* Data source needed banner */}
      {(hasNoData || hasMissingData) && store.activeDashboardId && (
        <DataSourceBanner
          hasStoredHandles={hasStoredHandles}
          isReconnecting={isReconnecting}
          reconnectFailed={reconnectFailed}
          onReconnect={handleReconnect}
          onImportData={() => setModalView('importData')}
        />
      )}

      {/* Dashboard Canvas */}
      <div ref={gridRef} className="flex-1 overflow-auto min-h-0">
        {store.activeDashboardId && (
          <DashboardCanvas store={store} dashboardId={store.activeDashboardId} />
        )}
      </div>

      {/* Modals */}
      {modalView === 'addWidget' && store.activeDashboardId && (
        <ModalOverlay onClose={() => setModalView('none')}>
          <WidgetPalette
            dashboardId={store.activeDashboardId}
            store={store}
            onClose={() => setModalView('none')}
          />
        </ModalOverlay>
      )}

      {modalView === 'importData' && (
        <ModalOverlay onClose={() => setModalView('none')}>
          <DataImporter
            store={store}
            fileHandle={fileHandle}
            onSuccess={handleDataImportSuccess}
            onCancel={() => setModalView('none')}
          />
        </ModalOverlay>
      )}

      {modalView === 'background' && store.activeDashboardId && (
        <ModalOverlay onClose={() => setModalView('none')}>
          <BackgroundEditor
            current={store.activeDashboard?.background}
            onApply={(bg) => {
              if (store.activeDashboardId) {
                store.setDashboardBackground(store.activeDashboardId, bg)
              }
              setModalView('none')
            }}
            onClose={() => setModalView('none')}
          />
        </ModalOverlay>
      )}

      {modalView === 'viewData' && activeDs && (
        <ModalOverlay onClose={() => setModalView('none')} wide>
          <div className="h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-[#F47B20]" />
                <span className="text-sm font-medium text-dark-text-primary">{activeDs.name}</span>
                <span className="text-xs text-dark-text-muted">
                  {activeDs.rowCount.toLocaleString()} rows &middot; {activeDs.columns.length} columns
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.06] hover:bg-white/[0.1]
                    text-dark-text-muted transition-colors"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => setModalView('none')}
                  className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.06] hover:bg-white/[0.1]
                    text-dark-text-muted transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            <DataTable
              columns={activeDs.columns}
              rows={activeDs.rows}
              name={activeDs.name}
            />
          </div>
        </ModalOverlay>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDeleteDialog
          name={store.dashboards.get(confirmDelete)?.name ?? 'this dashboard'}
          onConfirm={() => confirmDeleteDashboard(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Loading overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-dark-base/80 flex items-center justify-center z-50">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#F47B20] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-dark-text-muted">Loading...</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Confirm Delete Dialog ────────────────────────

function ConfirmDeleteDialog({
  name,
  onConfirm,
  onCancel,
}: {
  name: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]"
      onClick={onCancel}
    >
      <div
        className="bg-[#12121a] border border-white/[0.1] rounded-xl shadow-2xl w-[380px] max-w-[90vw] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-dark-text-primary">Delete Dashboard</h3>
            <p className="text-xs text-dark-text-muted mt-0.5">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-dark-text-secondary mb-6">
          Are you sure you want to delete <strong className="text-dark-text-primary">{name}</strong> and all its widgets?
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-dark-text-muted hover:text-dark-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            Delete Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Data Source Banner ───────────────────────────

function DataSourceBanner({
  hasStoredHandles,
  isReconnecting,
  reconnectFailed,
  onReconnect,
  onImportData,
}: {
  hasStoredHandles: boolean
  isReconnecting: boolean
  reconnectFailed: boolean
  onReconnect: () => void
  onImportData: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/[0.08] border-b border-amber-500/20 flex-shrink-0">
      <DatabaseZap size={16} className="text-amber-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-amber-300/90">
          {reconnectFailed
            ? 'Auto-reconnect failed. Please re-import your data file.'
            : 'This dashboard needs data to display its widgets.'}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {hasStoredHandles && !reconnectFailed && (
          <button
            onClick={onReconnect}
            disabled={isReconnecting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
              bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors
              disabled:opacity-50"
          >
            {isReconnecting ? (
              <>
                <div className="w-3 h-3 border-[1.5px] border-amber-300 border-t-transparent rounded-full animate-spin" />
                Reconnecting...
              </>
            ) : (
              <>
                <DatabaseZap size={12} />
                Reconnect Data
              </>
            )}
          </button>
        )}
        <button
          onClick={onImportData}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
            bg-[#F47B20]/20 hover:bg-[#F47B20]/30 text-[#F47B20] transition-colors"
        >
          <FileUp size={12} />
          Import Data
        </button>
      </div>
    </div>
  )
}

// ── Modal Overlay ───────────────────────────────

function ModalOverlay({
  children,
  onClose,
  wide = false,
}: {
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className={`bg-[#12121a] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden ${
          wide ? 'w-[90vw] max-w-[1200px]' : 'w-[500px] max-w-[90vw]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
