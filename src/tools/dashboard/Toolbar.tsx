/**
 * Dashboard Toolbar — ToolbarButton/Group/Divider pattern (matches org-chart).
 * Includes dashboard switcher dropdown with inline rename.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { DashboardStore } from './dashboardStore.ts'
import {
  Undo2, Redo2, Plus, Pencil, Eye,
  Download, Upload, Save, Database, Trash2,
  Paintbrush, FileUp, FolderX, ChevronDown,
  LayoutDashboard, Copy, ArrowLeft, Check, X,
} from 'lucide-react'

// ── Sub-components ─────────────────────────────

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-white/[0.08] mx-1" />
}

function ToolbarButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  danger = false,
  onClick,
}: {
  icon: typeof Undo2
  label: string
  active?: boolean
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`
        p-1.5 rounded transition-colors
        ${disabled ? 'opacity-30 pointer-events-none' : ''}
        ${active
          ? 'bg-[#F47B20]/20 text-[#F47B20]'
          : danger
            ? 'text-white/40 hover:text-red-400 hover:bg-red-500/10'
            : 'text-white/40 hover:text-white hover:bg-white/[0.06]'
        }
      `}
    >
      <Icon size={15} />
    </button>
  )
}

// ── Props ───────────────────────────────────────

interface ToolbarProps {
  store: DashboardStore
  onAddWidget: () => void
  onViewData: () => void
  onImportData: () => void
  onBackground: () => void
  onExportPNG: () => void
  onExportJSON: () => void
  onImportJSON: () => void
  onSave: () => void
  onDelete?: () => void
  onNewDashboard?: () => void
  onGoToList?: () => void
}

// ── Component ───────────────────────────────────

export function Toolbar({
  store,
  onAddWidget,
  onViewData,
  onImportData,
  onBackground,
  onExportPNG,
  onExportJSON,
  onImportJSON,
  onSave,
  onDelete,
  onNewDashboard,
  onGoToList,
}: ToolbarProps) {
  const {
    canUndo, canRedo, undo, redo,
    isEditMode, setIsEditMode,
    activeDashboardId,
    selectedWidgetId, deleteWidget,
    dashboards, setActiveDashboard, duplicateDashboard, updateDashboard,
  } = store

  const canDeleteWidget = isEditMode && !!selectedWidgetId

  // ── Dashboard switcher dropdown ────────────────

  const [switcherOpen, setSwitcherOpen] = useState(false)
  const switcherBtnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)

  // ── Inline rename state ──────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const startRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }, [])

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      updateDashboard(renamingId, { name: renameValue.trim() })
    }
    setRenamingId(null)
    setRenameValue('')
  }, [renamingId, renameValue, updateDashboard])

  const cancelRename = useCallback(() => {
    setRenamingId(null)
    setRenameValue('')
  }, [])

  // Focus rename input when it mounts
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  // Position dropdown based on button rect (fixed positioning avoids overflow clip)
  const openSwitcher = useCallback(() => {
    if (switcherBtnRef.current) {
      const rect = switcherBtnRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
    setSwitcherOpen(true)
  }, [])

  // Close on click-outside (check both button and dropdown)
  useEffect(() => {
    if (!switcherOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        switcherBtnRef.current && !switcherBtnRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setSwitcherOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [switcherOpen])

  const activeDashboard = activeDashboardId ? dashboards.get(activeDashboardId) : null
  const dashboardList = Array.from(dashboards.values())

  // ── Inline rename for toolbar title ──────────
  const isRenamingToolbar = renamingId === activeDashboardId

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-dark-elevated border-b border-white/[0.06] flex-shrink-0 overflow-x-auto">
      {/* ── Dashboard switcher ─────────────────────── */}
      <div className="relative flex items-center">
        <button
          ref={switcherBtnRef}
          onClick={() => switcherOpen ? setSwitcherOpen(false) : openSwitcher()}
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/[0.06] transition-colors"
        >
          <LayoutDashboard size={13} className="text-[#F47B20] flex-shrink-0" />
          {isRenamingToolbar ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') cancelRename()
                e.stopPropagation()
              }}
              onClick={(e) => e.stopPropagation()}
              onBlur={commitRename}
              className="text-[11px] font-medium text-dark-text-primary bg-white/[0.08] border border-[#F47B20]/40 rounded px-1.5 py-0.5 outline-none w-[120px]"
            />
          ) : (
            <span
              className="text-[11px] font-medium text-dark-text-primary truncate max-w-[160px] cursor-pointer"
              onDoubleClick={(e) => {
                e.stopPropagation()
                if (activeDashboardId && activeDashboard) {
                  startRename(activeDashboardId, activeDashboard.name)
                }
              }}
              title="Double-click to rename"
            >
              {activeDashboard?.name ?? 'Dashboards'}
            </span>
          )}
          <ChevronDown size={12} className={`text-dark-text-muted flex-shrink-0 transition-transform ${switcherOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown rendered via portal with fixed positioning */}
        {switcherOpen && dropdownPos && createPortal(
          <div
            ref={dropdownRef}
            className="fixed w-64 bg-[#1a1a28] border border-white/[0.1] rounded-lg shadow-2xl py-1 max-h-[320px] overflow-auto"
            style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          >
            {/* All dashboards link */}
            {onGoToList && (
              <>
                <button
                  onClick={() => { onGoToList(); setSwitcherOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-dark-text-muted hover:bg-white/[0.06] transition-colors"
                >
                  <ArrowLeft size={12} />
                  All Dashboards
                </button>
                <div className="h-px bg-white/[0.06] my-1" />
              </>
            )}

            {/* Dashboard list */}
            {dashboardList.map((d) => {
              const isActive = d.id === activeDashboardId
              const isRenaming = renamingId === d.id

              if (isRenaming) {
                return (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-1.5">
                    <LayoutDashboard size={12} className="text-[#F47B20] flex-shrink-0" />
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') cancelRename()
                        e.stopPropagation()
                      }}
                      onBlur={commitRename}
                      className="flex-1 min-w-0 text-xs text-dark-text-primary bg-white/[0.08] border border-[#F47B20]/40 rounded px-1.5 py-1 outline-none"
                    />
                    <button
                      onClick={commitRename}
                      className="p-0.5 rounded hover:bg-white/[0.06] text-emerald-400"
                      title="Confirm"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={cancelRename}
                      className="p-0.5 rounded hover:bg-white/[0.06] text-dark-text-muted"
                      title="Cancel"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )
              }

              return (
                <button
                  key={d.id}
                  onClick={() => { setActiveDashboard(d.id); setSwitcherOpen(false) }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    startRename(d.id, d.name)
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors group ${
                    isActive
                      ? 'bg-[#F47B20]/10 text-[#F47B20]'
                      : 'text-dark-text-secondary hover:bg-white/[0.06]'
                  }`}
                  title="Click to switch · Double-click to rename"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <LayoutDashboard size={12} className="flex-shrink-0" />
                    <span className="truncate">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`text-[10px] ${isActive ? 'text-[#F47B20]/60' : 'text-dark-text-muted'}`}>
                      {d.widgetIds.length}w
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        startRename(d.id, d.name)
                      }}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100
                        hover:bg-white/[0.08] text-dark-text-muted hover:text-[#F47B20] transition-all"
                      title="Rename"
                    >
                      <Pencil size={10} />
                    </button>
                  </div>
                </button>
              )
            })}

            {dashboardList.length === 0 && (
              <p className="px-3 py-2 text-xs text-dark-text-muted">No dashboards</p>
            )}

            {/* New dashboard + duplicate */}
            <div className="h-px bg-white/[0.06] my-1" />
            {onNewDashboard && (
              <button
                onClick={() => { onNewDashboard(); setSwitcherOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-dark-text-muted hover:bg-white/[0.06] hover:text-dark-text-primary transition-colors"
              >
                <Plus size={12} />
                New Dashboard
              </button>
            )}
            {activeDashboardId && (
              <button
                onClick={() => { duplicateDashboard(activeDashboardId); setSwitcherOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-dark-text-muted hover:bg-white/[0.06] hover:text-dark-text-primary transition-colors"
              >
                <Copy size={12} />
                Duplicate Current
              </button>
            )}
          </div>,
          document.body,
        )}
      </div>

      <ToolbarDivider />

      {/* ── Undo / Redo ──────────────────────────── */}
      <ToolbarGroup>
        <ToolbarButton icon={Undo2} label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo} />
        <ToolbarButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo} />
      </ToolbarGroup>

      <ToolbarDivider />

      {/* ── Edit / View toggle ───────────────────── */}
      <ToolbarGroup>
        <ToolbarButton
          icon={isEditMode ? Eye : Pencil}
          label={isEditMode ? 'View Mode (Ctrl+Shift+E)' : 'Edit Mode (Ctrl+Shift+E)'}
          active={isEditMode}
          onClick={() => setIsEditMode(!isEditMode)}
        />
      </ToolbarGroup>

      <ToolbarDivider />

      {/* ── Add Widget ───────────────────────────── */}
      {isEditMode && (
        <>
          <ToolbarGroup>
            <button
              onClick={onAddWidget}
              disabled={!activeDashboardId}
              className="px-2.5 py-1 text-[10px] font-medium text-white/50 hover:text-white hover:bg-white/[0.06] rounded transition-colors flex items-center gap-1 disabled:opacity-30 disabled:pointer-events-none"
            >
              <Plus size={12} />
              Add Widget
            </button>
          </ToolbarGroup>

          <ToolbarDivider />
        </>
      )}

      {/* ── Background (edit mode) ─────────────── */}
      {isEditMode && (
        <>
          <ToolbarGroup>
            <ToolbarButton icon={Paintbrush} label="Background" onClick={onBackground} />
          </ToolbarGroup>
          <ToolbarDivider />
        </>
      )}

      {/* ── Data ─────────────────────────────────── */}
      <ToolbarGroup>
        <ToolbarButton icon={Database} label="View Data" onClick={onViewData} />
        <ToolbarButton icon={FileUp} label="Import Data" onClick={onImportData} />
      </ToolbarGroup>

      {/* ── Data source badge ────────────────────── */}
      {store.activeDataSourceId && store.dataSourcesMeta.get(store.activeDataSourceId) && (
        <span className="text-[9px] text-white/30 truncate max-w-[150px]">
          {store.dataSourcesMeta.get(store.activeDataSourceId)!.fileName}
          {' · '}
          {store.dataSourcesMeta.get(store.activeDataSourceId)!.rowCount.toLocaleString()} rows
        </span>
      )}

      {/* ── Spacer ───────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Actions ──────────────────────────────── */}
      <ToolbarGroup>
        <button
          onClick={onImportJSON}
          className="px-2.5 py-1 text-[10px] font-medium text-white/50 hover:text-white hover:bg-white/[0.06] rounded transition-colors flex items-center gap-1"
        >
          <Upload size={12} />
          Import
        </button>
        <button
          onClick={onExportJSON}
          className="px-2.5 py-1 text-[10px] font-medium text-white/50 hover:text-white hover:bg-white/[0.06] rounded transition-colors flex items-center gap-1"
        >
          <Download size={12} />
          Export
        </button>
        <ToolbarButton icon={Save} label="Save (Ctrl+S)" onClick={onSave} />
      </ToolbarGroup>

      {/* ── Delete ────────────────────────────────── */}
      {canDeleteWidget && (
        <>
          <ToolbarDivider />
          <ToolbarGroup>
            <ToolbarButton
              icon={Trash2}
              label="Delete Widget (Del)"
              onClick={() => deleteWidget(selectedWidgetId!)}
              danger
            />
          </ToolbarGroup>
        </>
      )}

      {onDelete && (
        <>
          <ToolbarDivider />
          <ToolbarGroup>
            <ToolbarButton
              icon={FolderX}
              label="Delete Dashboard"
              onClick={onDelete}
              danger
            />
          </ToolbarGroup>
        </>
      )}
    </div>
  )
}
