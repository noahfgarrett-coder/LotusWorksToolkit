import { useState, useCallback, useRef, useEffect } from 'react'
import { useFormStore } from './formStore.ts'
import { FormCanvas } from './FormCanvas.tsx'
import { Toolbar } from './Toolbar.tsx'
import { ElementPalette } from './ElementPalette.tsx'
import { PropertiesPanel } from './PropertiesPanel.tsx'
import { attachShortcuts } from './shortcuts.ts'
import { exportFillablePDF, exportStaticPDF, exportWordDoc, exportJSON, importJSON } from './export.ts'
import { saveForm, loadForm, listForms, deleteForm, isStorageNearLimit } from './storage.ts'
import { TEMPLATES } from './templates.ts'
import { Modal } from '@/components/common/Modal.tsx'
import { useAppStore } from '@/stores/appStore.ts'
import type { FormElementType } from './types.ts'
import {
  FileText, FileCode, FileJson,
  Trash2, LayoutGrid, FolderOpen, AlertTriangle,
} from 'lucide-react'

// ── Component ───────────────────────────────────────────────

export default function FormCreatorTool() {
  const store = useFormStore()
  const { addToast } = useAppStore()

  // ── Modal state ──────────────────────────────────────────
  const [showExport, setShowExport] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showSavedForms, setShowSavedForms] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Save handler ─────────────────────────────────────────
  const handleSave = useCallback(() => {
    saveForm(store.doc)
    addToast({ type: 'success', message: `Saved "${store.doc.title}"` })
    if (isStorageNearLimit()) {
      addToast({ type: 'warning', message: 'Storage is nearly full. Consider deleting unused forms.' })
    }
  }, [store.doc, addToast])

  // ── Auto-save (debounced 2s) ─────────────────────────────
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // Don't auto-save empty untouched docs
    if (store.doc.elements.length === 0 && store.doc.title === 'Untitled Form') return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      saveForm(store.doc)
    }, 2000)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [store.doc])

  // ── Keyboard shortcuts ───────────────────────────────────
  useEffect(() => {
    return attachShortcuts(store, {
      onExport: () => setShowExport(true),
      onSave: handleSave,
    })
  }, [store, handleSave])

  // ── Export handlers ──────────────────────────────────────
  const handleExportFillablePDF = useCallback(async () => {
    try {
      await exportFillablePDF(store.doc)
      addToast({ type: 'success', message: 'Fillable PDF exported' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.doc, addToast])

  const handleExportStaticPDF = useCallback(async () => {
    try {
      await exportStaticPDF(store.doc)
      addToast({ type: 'success', message: 'Static PDF exported' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.doc, addToast])

  const handleExportWord = useCallback(async () => {
    try {
      await exportWordDoc(store.doc)
      addToast({ type: 'success', message: 'Word document exported' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.doc, addToast])

  const handleExportJSON = useCallback(() => {
    try {
      exportJSON(store.doc)
      addToast({ type: 'success', message: 'JSON exported' })
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Export failed' })
    }
    setShowExport(false)
  }, [store.doc, addToast])

  // ── Import handler ───────────────────────────────────────
  const handleImportJSON = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const doc = importJSON(reader.result as string)
        store.loadDocument(doc)
        addToast({ type: 'success', message: `Loaded "${doc.title}" (${doc.elements.length} elements)` })
      } catch (err) {
        addToast({ type: 'error', message: err instanceof Error ? err.message : 'Invalid JSON file' })
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [store, addToast])

  // ── Template handler ─────────────────────────────────────
  const handleSelectTemplate = useCallback((idx: number) => {
    const template = TEMPLATES[idx]
    if (!template) return
    store.loadDocument(template.build())
    setShowTemplates(false)
    addToast({ type: 'success', message: `Loaded "${template.name}" template` })
    setTimeout(() => {
      const fn = (window as unknown as Record<string, unknown>).__formFitToContent as (() => void) | undefined
      fn?.()
    }, 100)
  }, [store, addToast])

  // ── Add element from palette ─────────────────────────────
  const handleAddElement = useCallback((type: FormElementType) => {
    store.addElement(type, 0)
  }, [store])

  // ── Saved forms handlers ─────────────────────────────────
  const handleLoadSavedForm = useCallback((id: string) => {
    const doc = loadForm(id)
    if (!doc) {
      addToast({ type: 'error', message: 'Form not found' })
      return
    }
    store.loadDocument(doc)
    setShowSavedForms(false)
    addToast({ type: 'success', message: `Loaded "${doc.title}"` })
    setTimeout(() => {
      const fn = (window as unknown as Record<string, unknown>).__formFitToContent as (() => void) | undefined
      fn?.()
    }, 100)
  }, [store, addToast])

  const handleDeleteSavedForm = useCallback((id: string) => {
    deleteForm(id)
    addToast({ type: 'success', message: 'Form deleted' })
  }, [addToast])

  // ── Render ───────────────────────────────────────────────

  const hasElements = store.doc.elements.length > 0

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <Toolbar
        store={store}
        onExport={() => setShowExport(true)}
        onImportJSON={() => fileInputRef.current?.click()}
        onTemplates={() => setShowTemplates(true)}
        onSavedForms={() => setShowSavedForms(true)}
        onSave={handleSave}
      />

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Element palette */}
        <ElementPalette onAddElement={handleAddElement} />

        {/* Center: Canvas */}
        <div className="flex-1 relative">
          <FormCanvas store={store} />

          {/* Empty state */}
          {!hasElements && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-center space-y-3 pointer-events-auto">
                <p className="text-sm text-white/30">Add elements from the left panel or choose a template</p>
                <button
                  onClick={() => setShowTemplates(true)}
                  className="px-4 py-2 text-xs bg-[#F47B20]/10 text-[#F47B20] rounded-lg hover:bg-[#F47B20]/20 transition-colors"
                >
                  Browse Templates
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Properties panel */}
        <PropertiesPanel store={store} />
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportJSON}
        className="hidden"
      />

      {/* ── Export modal ──────────────────────────── */}
      <Modal open={showExport} onClose={() => setShowExport(false)} title="Export Form" width="sm">
        <div className="space-y-2">
          <ExportButton
            icon={FileText}
            label="Fillable PDF"
            description="PDF with interactive form fields (text, checkboxes, dropdowns)"
            onClick={handleExportFillablePDF}
            disabled={!hasElements}
          />
          <ExportButton
            icon={FileText}
            label="Static PDF"
            description="Clean PDF for printing (no interactive fields)"
            onClick={handleExportStaticPDF}
            disabled={!hasElements}
          />
          <ExportButton
            icon={FileCode}
            label="Word Document"
            description="Linear layout approximation (.docx)"
            onClick={handleExportWord}
            disabled={!hasElements}
          />
          <ExportButton
            icon={FileJson}
            label="Save as JSON"
            description="Re-importable form data for sharing"
            onClick={handleExportJSON}
            disabled={!hasElements}
          />
          <div className="flex items-start gap-2 px-3 py-2 mt-2 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
            <AlertTriangle size={12} className="text-yellow-500/50 mt-0.5 flex-shrink-0" />
            <p className="text-[9px] text-white/30 leading-relaxed">
              Word export renders elements top-to-bottom. Absolute positioning is not supported in .docx format.
            </p>
          </div>
        </div>
      </Modal>

      {/* ── Templates modal ──────────────────────── */}
      <Modal open={showTemplates} onClose={() => setShowTemplates(false)} title="Templates" width="md">
        <div className="space-y-2">
          {TEMPLATES.map((t, i) => (
            <button
              key={t.name}
              onClick={() => handleSelectTemplate(i)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left hover:bg-white/[0.04] transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-[#F47B20]/10 flex items-center justify-center flex-shrink-0">
                <LayoutGrid size={14} className="text-[#F47B20]" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-white font-medium">{t.name}</p>
                <p className="text-[10px] text-white/30">{t.description}</p>
              </div>
              <span className="text-[10px] text-white/20">{t.elementCount} elements</span>
            </button>
          ))}
        </div>
      </Modal>

      {/* ── Saved forms modal ────────────────────── */}
      <Modal open={showSavedForms} onClose={() => setShowSavedForms(false)} title="Saved Forms" width="md">
        <SavedFormsList
          onLoad={handleLoadSavedForm}
          onDelete={handleDeleteSavedForm}
        />
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
  icon: typeof FileText
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
        ${disabled ? 'opacity-30 pointer-events-none' : 'hover:bg-white/[0.04]'}
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

// ── Saved forms list ────────────────────────────────────────

function SavedFormsList({
  onLoad,
  onDelete,
}: {
  onLoad: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [forms, setForms] = useState(() => listForms())
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const handleDelete = (id: string) => {
    onDelete(id)
    setForms(listForms())
    setConfirmDelete(null)
  }

  if (forms.length === 0) {
    return (
      <div className="text-center py-8">
        <FolderOpen size={24} className="mx-auto text-white/15 mb-2" />
        <p className="text-xs text-white/30">No saved forms yet</p>
        <p className="text-[10px] text-white/20 mt-1">Forms are auto-saved as you work</p>
      </div>
    )
  }

  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {forms.map(f => (
        <div
          key={f.id}
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/[0.04] transition-colors"
        >
          <button
            onClick={() => onLoad(f.id)}
            className="flex-1 text-left min-w-0"
          >
            <p className="text-sm text-white font-medium truncate">{f.title}</p>
            <p className="text-[10px] text-white/30">
              {f.elementCount} elements &middot; {f.pageCount} page{f.pageCount !== 1 ? 's' : ''} &middot; {formatDate(f.updatedAt)}
            </p>
          </button>
          {confirmDelete === f.id ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleDelete(f.id)}
                className="px-2 py-1 text-[10px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-2 py-1 text-[10px] text-white/40 hover:text-white/60"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(f.id)}
              className="p-1.5 text-white/20 hover:text-red-400 rounded transition-colors"
              title="Delete form"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
