import { useState, useEffect, useCallback, useRef } from 'react'
import { useFlowchartStore } from './flowchartStore.ts'
import { Canvas } from './Canvas.tsx'
import { Toolbar } from './Toolbar.tsx'
import { ShapeLibrary } from './ShapeLibrary.tsx'
import { PropertiesPanel } from './PropertiesPanel.tsx'
import { attachShortcuts } from './shortcuts.ts'
import { exportPNG, exportSVG, exportJSON, importJSON, copyPNGToClipboard } from './export.ts'
import { importFromText, TEMPLATES } from './textImport.ts'
import { Modal } from '@/components/common/Modal.tsx'
import { Button } from '@/components/common/Button.tsx'
import { useAppStore } from '@/stores/appStore.ts'
import {
  Upload, FileJson, Image as ImageIcon, FileCode, ChevronDown, Clipboard,
} from 'lucide-react'

// ── Component ───────────────────────────────────────────────

export default function FlowchartTool() {
  const store = useFlowchartStore()
  const { addToast } = useAppStore()

  // ── Export modal ────────────────────────────────────────
  const [showExport, setShowExport] = useState(false)
  const [showImportText, setShowImportText] = useState(false)
  const [importText, setImportText] = useState(TEMPLATES[1].text)
  const [showTemplates, setShowTemplates] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Keyboard shortcuts ──────────────────────────────────
  useEffect(() => {
    return attachShortcuts(store, () => setShowExport(true))
  }, [store])

  // ── Export handlers ─────────────────────────────────────
  const handleExportPNG = useCallback(async () => {
    try {
      await exportPNG(store.nodes, store.edges)
      addToast({ type: 'success', message: 'PNG exported successfully' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.nodes, store.edges, addToast])

  const handleExportSVG = useCallback(() => {
    try {
      exportSVG(store.nodes, store.edges)
      addToast({ type: 'success', message: 'SVG exported successfully' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.nodes, store.edges, addToast])

  const handleExportJSON = useCallback(() => {
    try {
      exportJSON(store.nodes, store.edges)
      addToast({ type: 'success', message: 'JSON saved successfully' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.nodes, store.edges, addToast])

  const handleCopyPNG = useCallback(async () => {
    try {
      await copyPNGToClipboard(store.nodes, store.edges)
      addToast({ type: 'success', message: 'Copied to clipboard' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Copy failed' })
    }
    setShowExport(false)
  }, [store.nodes, store.edges, addToast])

  // ── Import handlers ─────────────────────────────────────
  const handleImportText = useCallback(() => {
    try {
      const state = importFromText(importText)
      store.loadDiagram(state)
      store.fitToContent()
      setShowImportText(false)
      addToast({ type: 'success', message: `Imported ${state.nodes.length} nodes` })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Import failed' })
    }
  }, [importText, store, addToast])

  const handleImportJSON = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const state = importJSON(reader.result as string)
        store.loadDiagram(state)
        store.fitToContent()
        addToast({ type: 'success', message: `Loaded ${state.nodes.length} nodes` })
      } catch (err) {
        addToast({ type: 'error', message: err instanceof Error ? err.message : 'Invalid JSON file' })
      }
    }
    reader.readAsText(file)

    // Reset input so the same file can be re-selected
    e.target.value = ''
  }, [store, addToast])

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <Toolbar
        store={store}
        onExport={() => setShowExport(true)}
        onImportText={() => setShowImportText(true)}
      />

      {/* Main area: ShapeLibrary | Canvas | PropertiesPanel */}
      <div className="flex-1 flex overflow-hidden">
        <ShapeLibrary store={store} />

        <div className="flex-1 relative">
          <Canvas store={store} />

          {/* Empty state overlay */}
          {store.nodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-center space-y-3 pointer-events-auto">
                <p className="text-sm text-white/30">Start by placing shapes from the left panel</p>
                <p className="text-xs text-white/20">or</p>
                <div className="flex gap-2 justify-center">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Upload size={12} />}
                    onClick={() => setShowImportText(true)}
                  >
                    Import from Text
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<FileJson size={12} />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Load JSON
                  </Button>
                </div>
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
      <Modal open={showExport} onClose={() => setShowExport(false)} title="Export Diagram" width="sm">
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
            description="Scalable vector graphic"
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
        </div>
      </Modal>

      {/* ── Import from Text modal ────────────────────── */}
      <Modal open={showImportText} onClose={() => setShowImportText(false)} title="Import from Text" width="lg">
        <div className="space-y-3">
          {/* Syntax guide */}
          <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/40 space-y-1">
            <p><span className="text-green-400/60">START</span> — Start node</p>
            <p><span className="text-white/60">Plain text</span> — Process step</p>
            <p><span className="text-[#F47B20]/60">IF</span> — Decision (diamond)</p>
            <p><span className="text-[#F47B20]/60">THEN / YES</span> — Yes branch</p>
            <p><span className="text-[#F47B20]/60">OR / NO / ELSE</span> — No branch</p>
            <p><span className="text-red-400/60">END</span> — End node</p>
          </div>

          {/* Template dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-white/60 bg-white/[0.04] border border-white/[0.08] rounded-lg hover:border-white/[0.15] transition-colors"
            >
              Templates <ChevronDown size={12} />
            </button>
            {showTemplates && (
              <div className="absolute top-full left-0 right-0 mt-1 z-10 bg-dark-surface border border-white/[0.1] rounded-lg shadow-xl overflow-hidden">
                {TEMPLATES.map(t => (
                  <button
                    key={t.name}
                    onClick={() => { setImportText(t.text); setShowTemplates(false) }}
                    className="w-full text-left px-3 py-2 text-xs text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Text input */}
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            rows={10}
            placeholder="Type your flowchart here..."
            className="w-full px-3 py-2 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white font-mono leading-relaxed resize-none focus:outline-none focus:border-[#F47B20]/40"
          />

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowImportText(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleImportText}>
              Import
            </Button>
          </div>
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
