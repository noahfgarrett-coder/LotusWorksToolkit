import { useState, useCallback, useRef, useEffect } from 'react'
import { useOrgChartStore } from './orgChartStore.ts'
import { Canvas } from './Canvas.tsx'
import { Toolbar } from './Toolbar.tsx'
import { PropertiesPanel } from './PropertiesPanel.tsx'
import { attachShortcuts } from './shortcuts.ts'
import { exportPNG, exportSVG, exportJSON, exportCSV, importJSON, copyPNGToClipboard } from './export.ts'
import { TEMPLATES } from './templates.ts'
import { Modal } from '@/components/common/Modal.tsx'
import { useAppStore } from '@/stores/appStore.ts'
import {
  Image as ImageIcon, FileJson, FileCode, Clipboard, FileSpreadsheet, Users,
} from 'lucide-react'

// ── Helper: trigger fitToContent via window bridge ──────────

function triggerFitToContent() {
  setTimeout(() => {
    const fn = (window as unknown as Record<string, unknown>).__orgChartFitToContent as (() => void) | undefined
    fn?.()
  }, 100)
}

// ── Component ───────────────────────────────────────────────

export default function OrgChartTool() {
  const store = useOrgChartStore()
  const { addToast } = useAppStore()

  // ── Keyboard shortcuts ──────────────────────────────────
  useEffect(() => {
    return attachShortcuts(store, () => setShowExport(true))
  }, [store])

  // ── Modal state ────────────────────────────────────────────
  const [showExport, setShowExport] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Export handlers ────────────────────────────────────────
  const handleExportPNG = useCallback(async () => {
    try {
      await exportPNG(store.nodes)
      addToast({ type: 'success', message: 'PNG exported successfully' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.nodes, addToast])

  const handleCopyPNG = useCallback(async () => {
    try {
      await copyPNGToClipboard(store.nodes)
      addToast({ type: 'success', message: 'Copied to clipboard' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Copy failed' })
    }
    setShowExport(false)
  }, [store.nodes, addToast])

  const handleExportSVG = useCallback(async () => {
    try {
      await exportSVG(store.nodes)
      addToast({ type: 'success', message: 'SVG exported successfully' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.nodes, addToast])

  const handleExportJSON = useCallback(() => {
    try {
      exportJSON(store.nodes)
      addToast({ type: 'success', message: 'JSON saved successfully' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.nodes, addToast])

  const handleExportCSV = useCallback(() => {
    try {
      exportCSV(store.nodes)
      addToast({ type: 'success', message: 'CSV exported successfully' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.nodes, addToast])

  // ── Import JSON handler ───────────────────────────────────
  const handleImportJSON = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const state = importJSON(reader.result as string)
        store.loadDiagram(state)
        triggerFitToContent()
        addToast({ type: 'success', message: `Loaded ${state.nodes.length} people` })
      } catch (err) {
        addToast({ type: 'error', message: err instanceof Error ? err.message : 'Invalid JSON file' })
      }
    }
    reader.readAsText(file)

    // Reset input so the same file can be re-selected
    e.target.value = ''
  }, [store, addToast])

  // ── Template handler ──────────────────────────────────────
  const handleSelectTemplate = useCallback((templateIdx: number) => {
    const template = TEMPLATES[templateIdx]
    if (!template) return
    store.loadDiagram(template.build())
    triggerFitToContent()
    setShowTemplates(false)
    addToast({ type: 'success', message: `Loaded "${template.name}" template (${template.nodeCount} people)` })
  }, [store, addToast])

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <Toolbar
        store={store}
        onExport={() => setShowExport(true)}
        onImportJSON={() => fileInputRef.current?.click()}
        onTemplates={() => setShowTemplates(true)}
      />

      {/* Main area: Canvas | PropertiesPanel */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          <Canvas store={store} />

          {/* Empty state overlay */}
          {store.nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-center space-y-3 pointer-events-auto">
                <p className="text-sm text-white/30">Start by clicking "Add Person" or pick a template</p>
              </div>
            </div>
          )}
        </div>

        <PropertiesPanel store={store} />
      </div>

      {/* Hidden file input for JSON import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportJSON}
        className="hidden"
      />

      {/* ── Export modal ──────────────────────────────── */}
      <Modal open={showExport} onClose={() => setShowExport(false)} title="Export Org Chart" width="sm">
        <div className="space-y-2">
          <ExportButton
            icon={ImageIcon}
            label="Export as PNG"
            description="High-resolution raster image (2x scale)"
            onClick={handleExportPNG}
            disabled={store.nodes.length === 0}
          />
          <ExportButton
            icon={Clipboard}
            label="Copy as PNG"
            description="Copy diagram image to clipboard"
            onClick={handleCopyPNG}
            disabled={store.nodes.length === 0}
          />
          <ExportButton
            icon={FileCode}
            label="Export as SVG"
            description="Scalable vector graphic with avatars"
            onClick={handleExportSVG}
            disabled={store.nodes.length === 0}
          />
          <ExportButton
            icon={FileJson}
            label="Save as JSON"
            description="Re-importable diagram data"
            onClick={handleExportJSON}
            disabled={store.nodes.length === 0}
          />
          <ExportButton
            icon={FileSpreadsheet}
            label="Export as CSV"
            description="Spreadsheet-compatible format"
            onClick={handleExportCSV}
            disabled={store.nodes.length === 0}
          />
        </div>
      </Modal>

      {/* ── Templates modal ──────────────────────────── */}
      <Modal open={showTemplates} onClose={() => setShowTemplates(false)} title="Templates" width="md">
        <div className="space-y-2">
          {TEMPLATES.map((t, i) => (
            <TemplateCard
              key={t.name}
              name={t.name}
              description={t.description}
              nodeCount={t.nodeCount}
              onClick={() => handleSelectTemplate(i)}
            />
          ))}
        </div>
      </Modal>
    </div>
  )
}

// ── Export button row ────────────────────────────────────────

function ExportButton({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: typeof ImageIcon
  label: string
  description: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors
        ${disabled
          ? 'opacity-30 pointer-events-none'
          : 'hover:bg-white/[0.04]'
        }
      `}
    >
      <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-white/40" />
      </div>
      <div>
        <p className="text-sm text-white font-medium">{label}</p>
        <p className="text-[10px] text-white/30">{description}</p>
      </div>
    </button>
  )
}

// ── Template card ────────────────────────────────────────────

function TemplateCard({
  name,
  description,
  nodeCount,
  onClick,
}: {
  name: string
  description: string
  nodeCount: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left hover:bg-white/[0.04] transition-colors"
    >
      <div className="w-8 h-8 rounded-lg bg-[#F47B20]/10 flex items-center justify-center flex-shrink-0">
        <Users size={14} className="text-[#F47B20]" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-white font-medium">{name}</p>
        <p className="text-[10px] text-white/30">{description}</p>
      </div>
      <span className="text-[10px] text-white/20">{nodeCount} people</span>
    </button>
  )
}
