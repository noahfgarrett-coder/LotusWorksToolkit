import type { OrgChartStore } from './orgChartStore.ts'
import type { LayoutDirection } from './types.ts'
import {
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2,
  ArrowDown, ArrowRight, UserPlus, Trash2, Download, Upload,
  LayoutGrid, RotateCcw,
} from 'lucide-react'

// ── Component ───────────────────────────────────────────────

export function Toolbar({
  store,
  onExport,
  onImportJSON,
  onTemplates,
}: {
  store: OrgChartStore
  onExport: () => void
  onImportJSON: () => void
  onTemplates: () => void
}) {
  const {
    viewport, canUndo, canRedo, undo, redo,
    zoomIn, zoomOut, layoutDirection, setLayoutDirection,
    selectedNodeId, selectedNodeIds, nodes, addNode, removeSelectedNodes,
    hasManualOffsets, resetLayout,
  } = store

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null
  const canDelete = selectedNodeIds.size > 0 && (
    // Can delete if at least one selected node is not root
    [...selectedNodeIds].some(id => {
      const n = nodes.find(node => node.id === id)
      return n && !!n.reportsTo
    })
  )

  const fitToContent = () => {
    const fn = (window as unknown as Record<string, unknown>).__orgChartFitToContent as (() => void) | undefined
    fn?.()
  }

  const toggleDirection = () => {
    setLayoutDirection(layoutDirection === 'top-down' ? 'left-right' : 'top-down')
    // Re-fit after layout change
    setTimeout(fitToContent, 50)
  }

  const handleAddPerson = () => {
    const parentId = selectedNodeId ?? nodes.find(n => !n.reportsTo)?.id
    if (parentId) addNode(parentId)
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-dark-elevated border-b border-white/[0.06] flex-shrink-0 overflow-x-auto">
      {/* ── Undo / Redo ──────────────────────────── */}
      <ToolbarGroup>
        <ToolbarButton icon={Undo2} label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo} />
        <ToolbarButton icon={Redo2} label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo} />
      </ToolbarGroup>

      <ToolbarDivider />

      {/* ── Zoom ───────────────────────────────── */}
      <ToolbarGroup>
        <ToolbarButton icon={ZoomOut} label="Zoom Out" onClick={zoomOut} />
        <span className="text-[10px] text-white/40 min-w-[36px] text-center tabular-nums">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <ToolbarButton icon={ZoomIn} label="Zoom In" onClick={zoomIn} />
        <ToolbarButton icon={Maximize2} label="Fit to Content" onClick={fitToContent} />
      </ToolbarGroup>

      <ToolbarDivider />

      {/* ── Layout direction + Reset ──────────── */}
      <ToolbarGroup>
        <ToolbarButton
          icon={layoutDirection === 'top-down' ? ArrowDown : ArrowRight}
          label={`Layout: ${layoutDirection === 'top-down' ? 'Top-Down' : 'Left-Right'}`}
          onClick={toggleDirection}
        />
        <ToolbarButton
          icon={RotateCcw}
          label="Reset Layout"
          disabled={!hasManualOffsets}
          onClick={resetLayout}
        />
      </ToolbarGroup>

      <ToolbarDivider />

      {/* ── Add Person ───────────────────────── */}
      <ToolbarGroup>
        <ToolbarButton icon={UserPlus} label="Add Person" onClick={handleAddPerson} />
      </ToolbarGroup>

      {/* ── Spacer ─────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Actions ────────────────────────────── */}
      <ToolbarGroup>
        <button
          onClick={onTemplates}
          className="px-2.5 py-1 text-[10px] font-medium text-white/50 hover:text-white hover:bg-white/[0.06] rounded transition-colors flex items-center gap-1"
        >
          <LayoutGrid size={12} />
          Templates
        </button>
        <button
          onClick={onImportJSON}
          className="px-2.5 py-1 text-[10px] font-medium text-white/50 hover:text-white hover:bg-white/[0.06] rounded transition-colors flex items-center gap-1"
        >
          <Upload size={12} />
          Import
        </button>
        <ToolbarButton icon={Download} label="Export" onClick={onExport} />
        {canDelete && (
          <ToolbarButton
            icon={Trash2}
            label="Delete Selected"
            onClick={removeSelectedNodes}
            danger
          />
        )}
      </ToolbarGroup>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────

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
  icon: typeof ZoomIn
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
