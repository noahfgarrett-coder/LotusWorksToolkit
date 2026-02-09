import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { ProgressBar } from '@/components/common/ProgressBar.tsx'
import { loadPDFFile, generateThumbnail, extractPages } from '@/utils/pdf.ts'
import { downloadBlob } from '@/utils/download.ts'
import { formatFileSize } from '@/utils/fileReader.ts'
import type { PDFFile } from '@/types'
import {
  DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Download, RotateCcw, ZoomIn, ZoomOut, Loader2, FilePlus,
  Trash2, X, Pencil, Check, Package, Lock, Unlock,
} from 'lucide-react'
import JSZip from 'jszip'

/* ── Types ── */

interface SourcePage {
  uid: string
  pageNumber: number
  thumbnail: string
  assignedTo: string[]        // doc IDs — a page can belong to multiple documents
}

interface OutputDocument {
  id: string
  name: string
  pageUids: string[]
  color: string
}

/* ── Helpers ── */

let _uid = 0
function makeUid(): string { return `sp-${++_uid}` }
function makeDocId(): string { return `doc-${++_uid}` }

const DOC_COLORS = ['#F47B20', '#3B82F6', '#22C55E', '#A855F7', '#EC4899', '#14B8A6', '#F59E0B', '#6366F1']

/** Typed wrapper around the File System Access API — eliminates `any` casts */
interface PickerHandle {
  createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>
}
type PickerFn = (opts: {
  suggestedName: string
  types: Array<{ description: string; accept: Record<string, string[]> }>
}) => Promise<PickerHandle>

async function saveWithPicker(
  blob: Blob,
  suggestedName: string,
  fileType: { description: string; accept: Record<string, string[]> },
): Promise<'saved' | 'fallback' | 'cancelled'> {
  if (!('showSaveFilePicker' in window)) return 'fallback'
  try {
    const picker = (window as unknown as { showSaveFilePicker: PickerFn }).showSaveFilePicker
    const handle = await picker({ suggestedName, types: [fileType] })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return 'saved'
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    return 'fallback'
  }
}

const RES_LEVELS = [
  { label: 'Low', height: 150 },
  { label: 'Med', height: 300 },
  { label: 'High', height: 600 },
]

/* ── Source page thumbnail with lazy loading ── */

interface SourcePageItemProps {
  page: SourcePage
  otherDocColors: string[]
  activeDocColor: string | null
  isAssignedToActive: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onMouseEnter: (e: React.MouseEvent) => void
  scrollRoot: HTMLDivElement | null
  onThumbnailNeeded: () => void
}

function SourcePageItem({
  page, otherDocColors, activeDocColor, isAssignedToActive,
  onMouseDown, onMouseEnter, scrollRoot, onThumbnailNeeded,
}: SourcePageItemProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const thumbCbRef = useRef(onThumbnailNeeded)
  thumbCbRef.current = onThumbnailNeeded

  useEffect(() => {
    if (page.thumbnail) return
    const el = nodeRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          thumbCbRef.current()
          observer.disconnect()
        }
      },
      { root: scrollRoot, rootMargin: '600px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [page.thumbnail, scrollRoot])

  const borderColor = isAssignedToActive
    ? activeDocColor ?? undefined
    : otherDocColors.length > 0
      ? otherDocColors[0]
      : undefined

  return (
    <div
      ref={nodeRef}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      className={`
        relative group rounded-lg border-2 p-1 transition-all cursor-pointer flex items-center justify-center select-none
        ${isAssignedToActive ? 'ring-2 shadow-md' : ''}
        ${page.assignedTo.length === 0 ? 'border-white/[0.08] hover:border-white/[0.2]' : ''}
      `}
      style={{
        borderColor: borderColor ?? undefined,
        ...(isAssignedToActive ? { boxShadow: `0 0 8px ${activeDocColor}40` } : {}),
      }}
      title={`Page ${page.pageNumber}${page.assignedTo.length > 0 ? ` (in ${page.assignedTo.length} doc${page.assignedTo.length > 1 ? 's' : ''})` : ''}`}
    >
      {page.thumbnail ? (
        <img
          src={page.thumbnail}
          alt={`Page ${page.pageNumber}`}
          className="w-full h-auto rounded object-contain"
          draggable={false}
        />
      ) : (
        <div className="w-full aspect-[8.5/11] rounded bg-white/[0.04] animate-pulse flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-white/20" />
        </div>
      )}

      {/* Page number badge */}
      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white/80">
        {page.pageNumber}
      </div>

      {/* Doc color dots — show all non-active assignments */}
      {otherDocColors.length > 0 && (
        <div className="absolute top-1.5 left-1.5 flex gap-0.5">
          {otherDocColors.map((c, i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full border border-black/40"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}

      {/* Active doc checkmark */}
      {isAssignedToActive && activeDocColor && (
        <div
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: activeDocColor }}
        >
          <Check size={11} className="text-white" strokeWidth={3} />
        </div>
      )}
    </div>
  )
}

/* ── Sortable page chip inside sidebar document ── */

interface SortablePageChipProps {
  uid: string
  pageNumber: number
  docColor: string
  onRemove: () => void
  isActiveDoc: boolean
}

function SortablePageChip({ uid, pageNumber, docColor, onRemove, isActiveDoc }: SortablePageChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: uid })

  const chipStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    backgroundColor: `${docColor}15`,
    color: docColor,
  }

  return (
    <div
      ref={setNodeRef}
      style={chipStyle}
      {...attributes}
      {...listeners}
      className={`
        inline-flex items-center gap-0.5 pl-1.5 rounded-md text-[10px] font-medium group/chip
        cursor-grab active:cursor-grabbing transition-colors select-none
        ${isDragging ? 'opacity-30' : 'hover:bg-white/[0.08]'}
      `}
      title={`Page ${pageNumber} · Drag to reorder${isActiveDoc ? ' · Click × to remove' : ''}`}
    >
      {pageNumber}
      {isActiveDoc ? (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="p-0.5 rounded text-white/0 group-hover/chip:text-white/40 hover:!text-red-400 transition-colors"
          aria-label={`Remove page ${pageNumber}`}
        >
          <X size={8} />
        </button>
      ) : (
        <span className="pr-1.5" />
      )}
    </div>
  )
}

/* ── Main Component ── */

export default function PdfSplitTool() {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null)
  const [pages, setPages] = useState<SourcePage[]>([])
  const [outputDocs, setOutputDocs] = useState<OutputDocument[]>([])
  const [activeDocId, setActiveDocId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [docCounter, setDocCounter] = useState(0)

  // Paint-select state
  const isPainting = useRef(false)
  const paintMode = useRef<'assign' | 'unassign'>('assign')
  const paintedThisStroke = useRef(new Set<string>())

  // Zoom
  const MIN_COLS = 2
  const MAX_COLS = 10
  const [zoomCols, setZoomCols] = useState(5)
  const zoomIn = () => setZoomCols((c) => Math.max(c - 1, MIN_COLS))
  const zoomOut = () => setZoomCols((c) => Math.min(c + 1, MAX_COLS))

  // Resolution
  const [resIdx, setResIdx] = useState(1)
  const resRef = useRef(RES_LEVELS[1].height)
  resRef.current = RES_LEVELS[resIdx].height

  // Scroll container
  const scrollRef = useRef<HTMLDivElement>(null)

  // Lazy loading refs
  const pdfRef = useRef<PDFFile | null>(null)
  pdfRef.current = pdfFile
  const loadingThumbs = useRef(new Set<string>())

  // Refs for paint callbacks (avoid stale closures)
  const activeDocIdRef = useRef(activeDocId)
  activeDocIdRef.current = activeDocId
  const pagesRef = useRef(pages)
  pagesRef.current = pages

  // dnd-kit sensors for sidebar reorder
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  /* ── Lazy thumbnail loader ── */

  const loadPageThumbnail = useCallback(async (pageUid: string, pageNumber: number) => {
    if (loadingThumbs.current.has(pageUid)) return
    loadingThumbs.current.add(pageUid)

    const file = pdfRef.current
    if (!file) return

    try {
      const thumbnail = await generateThumbnail(file, pageNumber, resRef.current)
      setPages((prev) => prev.map((p) => p.uid === pageUid ? { ...p, thumbnail } : p))
    } catch (err) {
      console.error(`[PDF Split] Thumbnail gen failed for page ${pageNumber}:`, err)
      loadingThumbs.current.delete(pageUid)
    }
  }, [])

  /* ── Resolution change ── */

  const changeResolution = (newIdx: number) => {
    setResIdx(newIdx)
    loadingThumbs.current.clear()
    setPages((prev) => prev.map((p) => ({ ...p, thumbnail: '' })))
  }

  /* ── File loading — auto-creates Document 1 ── */

  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return

    setIsLoading(true)
    setLoadError(null)
    setProgress(0)
    try {
      const pdf = await loadPDFFile(file)
      setPdfFile(pdf)

      const sourcePages: SourcePage[] = Array.from({ length: pdf.pageCount }, (_, i) => ({
        uid: makeUid(),
        pageNumber: i + 1,
        thumbnail: '',
        assignedTo: [],
      }))
      setPages(sourcePages)

      // Auto-create Document 1
      const firstDocId = makeDocId()
      const firstDoc: OutputDocument = {
        id: firstDocId,
        name: 'Document 1',
        pageUids: [],
        color: DOC_COLORS[0],
      }
      setOutputDocs([firstDoc])
      setActiveDocId(firstDocId)
      setDocCounter(1)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setLoadError(`Failed to load PDF: ${msg}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  /* ── Assign / unassign a page to/from the active doc ── */

  const assignPage = useCallback((pageUid: string) => {
    const docId = activeDocIdRef.current
    if (!docId) return

    setPages((prev) => prev.map((p) => {
      if (p.uid !== pageUid) return p
      if (p.assignedTo.includes(docId)) return p  // already assigned
      return { ...p, assignedTo: [...p.assignedTo, docId] }
    }))

    setOutputDocs((prev) => prev.map((d) => {
      if (d.id !== docId) return d
      if (d.pageUids.includes(pageUid)) return d  // already in list
      return { ...d, pageUids: [...d.pageUids, pageUid] }
    }))
  }, [])

  const unassignPage = useCallback((pageUid: string) => {
    const docId = activeDocIdRef.current
    if (!docId) return

    setPages((prev) => prev.map((p) => {
      if (p.uid !== pageUid) return p
      return { ...p, assignedTo: p.assignedTo.filter((id) => id !== docId) }
    }))

    setOutputDocs((prev) => prev.map((d) => {
      if (d.id !== docId) return d
      return { ...d, pageUids: d.pageUids.filter((u) => u !== pageUid) }
    }))
  }, [])

  /* ── Paint-select: mousedown starts, mouseenter continues, mouseup ends ── */

  const handlePageMouseDown = useCallback((e: React.MouseEvent, pageUid: string) => {
    e.preventDefault()
    if (!activeDocIdRef.current) return

    const page = pagesRef.current.find((p) => p.uid === pageUid)
    if (!page) return

    isPainting.current = true
    paintedThisStroke.current = new Set([pageUid])

    // Determine paint mode: if page is in the active doc, unassign; otherwise assign
    if (page.assignedTo.includes(activeDocIdRef.current)) {
      paintMode.current = 'unassign'
      unassignPage(pageUid)
    } else {
      paintMode.current = 'assign'
      assignPage(pageUid)
    }
  }, [assignPage, unassignPage])

  const handlePageMouseEnter = useCallback((_e: React.MouseEvent, pageUid: string) => {
    if (!isPainting.current || !activeDocIdRef.current) return
    if (paintedThisStroke.current.has(pageUid)) return
    paintedThisStroke.current.add(pageUid)

    if (paintMode.current === 'assign') {
      assignPage(pageUid)
    } else {
      unassignPage(pageUid)
    }
  }, [assignPage, unassignPage])

  // Global mouseup to end painting
  useEffect(() => {
    const handleMouseUp = () => {
      isPainting.current = false
      paintedThisStroke.current.clear()
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  /* ── New Document: lock current, create next ── */

  const createNewDocument = useCallback(() => {
    const num = docCounter + 1
    setDocCounter(num)

    const newDocId = makeDocId()
    const color = DOC_COLORS[(num - 1) % DOC_COLORS.length]

    const newDoc: OutputDocument = {
      id: newDocId,
      name: `Document ${num}`,
      pageUids: [],
      color,
    }

    setOutputDocs((prev) => [...prev, newDoc])
    setActiveDocId(newDocId)
  }, [docCounter])

  /* ── Edit (unlock) a locked document ── */

  const editDocument = useCallback((docId: string) => {
    setActiveDocId(docId)
  }, [])

  /* ── Remove page from a specific document ── */

  const removePageFromDoc = useCallback((docId: string, pageUid: string) => {
    setOutputDocs((prev) => prev.map((d) => {
      if (d.id !== docId) return d
      return { ...d, pageUids: d.pageUids.filter((u) => u !== pageUid) }
    }))

    setPages((prev) => prev.map((p) => {
      if (p.uid !== pageUid) return p
      return { ...p, assignedTo: p.assignedTo.filter((id) => id !== docId) }
    }))
  }, [])

  /* ── Delete entire document ── */

  const deleteDocument = useCallback((docId: string) => {
    const doc = outputDocs.find((d) => d.id === docId)
    if (!doc) return

    const uidsInDoc = new Set(doc.pageUids)
    setPages((prev) => prev.map((p) => {
      if (!uidsInDoc.has(p.uid)) return p
      return { ...p, assignedTo: p.assignedTo.filter((id) => id !== docId) }
    }))
    setOutputDocs((prev) => prev.filter((d) => d.id !== docId))

    // If we deleted the active doc, switch to another or create one
    if (docId === activeDocId) {
      const remaining = outputDocs.filter((d) => d.id !== docId)
      if (remaining.length > 0) {
        setActiveDocId(remaining[remaining.length - 1].id)
      } else {
        const num = docCounter + 1
        setDocCounter(num)
        const newDocId = makeDocId()
        const newDoc: OutputDocument = {
          id: newDocId,
          name: `Document ${num}`,
          pageUids: [],
          color: DOC_COLORS[(num - 1) % DOC_COLORS.length],
        }
        setOutputDocs([newDoc])
        setActiveDocId(newDocId)
      }
    }
  }, [outputDocs, activeDocId, docCounter])

  /* ── Rename document ── */

  const startRename = (doc: OutputDocument) => {
    setEditingDocId(doc.id)
    setEditingName(doc.name)
  }

  const commitRename = () => {
    if (!editingDocId) return
    const trimmed = editingName.trim()
    if (trimmed) {
      setOutputDocs((prev) => prev.map((d) =>
        d.id === editingDocId ? { ...d, name: trimmed } : d
      ))
    }
    setEditingDocId(null)
  }

  /* ── Sidebar page reorder ── */

  const handleSidebarDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  const handleSidebarDragEnd = (event: DragEndEvent, docId: string) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOutputDocs((prev) => prev.map((d) => {
      if (d.id !== docId) return d
      const oldIdx = d.pageUids.indexOf(active.id as string)
      const newIdx = d.pageUids.indexOf(over.id as string)
      if (oldIdx === -1 || newIdx === -1) return d
      return { ...d, pageUids: arrayMove(d.pageUids, oldIdx, newIdx) }
    }))
  }

  /* ── Export ── */

  const handleExport = useCallback(async () => {
    if (!pdfFile || outputDocs.length === 0) return

    const docsWithPages = outputDocs.filter((d) => d.pageUids.length > 0)
    if (docsWithPages.length === 0) return

    setIsExporting(true)
    setExportError(null)
    setProgress(0)

    try {
      const total = docsWithPages.length

      if (total === 1) {
        const doc = docsWithPages[0]
        const pageNumbers = doc.pageUids
          .map((uid) => pages.find((p) => p.uid === uid)?.pageNumber)
          .filter((n): n is number => n != null)

        if (pageNumbers.length === 0) return

        const result = await extractPages(pdfFile.data, pageNumbers)
        const blob = new Blob([result], { type: 'application/pdf' })
        const fileName = doc.name.endsWith('.pdf') ? doc.name : `${doc.name}.pdf`

        const pickerResult = await saveWithPicker(blob, fileName, {
          description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] },
        })
        if (pickerResult === 'cancelled') return
        if (pickerResult === 'fallback') downloadBlob(blob, fileName)
      } else {
        const zip = new JSZip()

        for (let i = 0; i < total; i++) {
          const doc = docsWithPages[i]
          const pageNumbers = doc.pageUids
            .map((uid) => pages.find((p) => p.uid === uid)?.pageNumber)
            .filter((n): n is number => n != null)

          if (pageNumbers.length === 0) continue

          const result = await extractPages(pdfFile.data, pageNumbers)
          const fileName = doc.name.endsWith('.pdf') ? doc.name : `${doc.name}.pdf`
          zip.file(fileName, result)
          setProgress(Math.round(((i + 1) / total) * 80))
        }

        const zipBlob = await zip.generateAsync(
          { type: 'blob' },
          (meta) => setProgress(80 + Math.round(meta.percent * 0.2)),
        )

        const baseName = pdfFile.name.replace(/\.pdf$/i, '')
        const zipName = `${baseName}-split.zip`

        const pickerResult = await saveWithPicker(zipBlob, zipName, {
          description: 'ZIP Archive', accept: { 'application/zip': ['.zip'] },
        })
        if (pickerResult === 'cancelled') return
        if (pickerResult === 'fallback') downloadBlob(zipBlob, zipName)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setExportError(`Export failed: ${msg}`)
    } finally {
      setIsExporting(false)
      setProgress(0)
    }
  }, [pdfFile, outputDocs, pages])

  /* ── Derived values ── */

  const docColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const doc of outputDocs) {
      map.set(doc.id, doc.color)
    }
    return map
  }, [outputDocs])

  /** Get colors of all docs this page is assigned to, excluding the active doc */
  const getOtherDocColors = (page: SourcePage): string[] => {
    return page.assignedTo
      .filter((id) => id !== activeDocId)
      .map((id) => docColorMap.get(id))
      .filter((c): c is string => c != null)
  }

  const activeDoc = outputDocs.find((d) => d.id === activeDocId)
  const activeDocColor = activeDoc?.color ?? null
  const totalAssigned = useMemo(() => pages.filter((p) => p.assignedTo.length > 0).length, [pages])
  const docsWithPages = useMemo(() => outputDocs.filter((d) => d.pageUids.length > 0).length, [outputDocs])

  /* ── Reset ── */

  const handleReset = () => {
    setPdfFile(null)
    setPages([])
    setOutputDocs([])
    setActiveDocId(null)
    setDocCounter(0)
    loadingThumbs.current.clear()
  }

  /* ── Render: empty state ── */

  if (!pdfFile) {
    return (
      <div className="h-full flex flex-col gap-4">
        <FileDropZone
          onFiles={handleFiles}
          accept="application/pdf"
          multiple={false}
          label="Drop a PDF file here"
          description="Select pages to split into documents"
          className="h-full"
        />
        {isLoading && (
          <ProgressBar value={progress} max={100} label="Loading PDF..." />
        )}
        {loadError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400 flex-1">{loadError}</p>
            <button
              onClick={() => setLoadError(null)}
              className="p-1 rounded text-red-400/60 hover:text-red-400 transition-colors"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    )
  }

  /* ── Render: main two-panel layout ── */

  return (
    <div className="h-full min-h-0 flex gap-0">
      {/* ═══ Left panel: source pages ═══ */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 pr-0">
        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-shrink-0 flex-wrap px-1">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate">{pdfFile.name}</p>
            <p className="text-xs text-white/40">
              {pdfFile.pageCount} pages · {formatFileSize(pdfFile.size)}
              {totalAssigned > 0 && ` · ${totalAssigned} assigned`}
            </p>
          </div>

          {/* Active doc indicator */}
          {activeDoc && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06]">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeDoc.color }} />
              <span className="text-[11px] text-white/50">Painting to:</span>
              <span className="text-[11px] text-white/80 font-medium">{activeDoc.name}</span>
            </div>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              disabled={zoomCols >= MAX_COLS}
              className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20 disabled:pointer-events-none transition-colors"
              title="Zoom out (more columns)"
              aria-label="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-[10px] text-white/30 min-w-[28px] text-center">{zoomCols}col</span>
            <button
              onClick={zoomIn}
              disabled={zoomCols <= MIN_COLS}
              className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20 disabled:pointer-events-none transition-colors"
              title="Zoom in (fewer columns)"
              aria-label="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
          </div>

          {/* Resolution slider */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/25">Res</span>
            <input
              type="range"
              min={0}
              max={2}
              step={1}
              value={resIdx}
              onChange={(e) => changeResolution(Number(e.target.value))}
              className="w-14 h-1 accent-[#F47B20] cursor-pointer"
              title={`Thumbnail resolution: ${RES_LEVELS[resIdx].label} (${RES_LEVELS[resIdx].height}px)`}
            />
            <span className="text-[10px] text-white/30 min-w-[20px]">{RES_LEVELS[resIdx].label}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={12} />}
            onClick={handleReset}
          >
            New
          </Button>
        </div>

        {/* Page grid */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-1">
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${zoomCols}, 1fr)` }}>
            {pages.map((page) => (
              <SourcePageItem
                key={page.uid}
                page={page}
                otherDocColors={getOtherDocColors(page)}
                activeDocColor={activeDocColor}
                isAssignedToActive={page.assignedTo.includes(activeDocId ?? '')}
                onMouseDown={(e) => handlePageMouseDown(e, page.uid)}
                onMouseEnter={(e) => handlePageMouseEnter(e, page.uid)}
                scrollRoot={scrollRef.current}
                onThumbnailNeeded={() => loadPageThumbnail(page.uid, page.pageNumber)}
              />
            ))}
          </div>
        </div>

        {/* Footer hint */}
        <p className="text-[10px] text-white/25 text-center flex-shrink-0 px-1">
          Click or drag to paint pages · Pages can belong to multiple documents · Press "New Document" to start another
        </p>
      </div>

      {/* ═══ Right panel: output documents sidebar ═══ */}
      <div className="w-72 flex-shrink-0 border-l border-white/[0.06] flex flex-col bg-white/[0.01]">
        {/* Sidebar header */}
        <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
          <Package size={14} className="text-white/40" />
          <span className="text-xs text-white/60 font-medium flex-1">Output Documents</span>
          <span className="text-[10px] text-white/30">{outputDocs.length}</span>
        </div>

        {/* Document list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-2 space-y-2">
            {outputDocs.map((doc) => {
              const isActive = doc.id === activeDocId
              return (
                <div
                  key={doc.id}
                  className={`rounded-lg border overflow-hidden transition-all ${
                    isActive
                      ? 'border-white/[0.15] bg-white/[0.04]'
                      : 'border-white/[0.06] bg-white/[0.02] opacity-70'
                  }`}
                  style={isActive ? { borderColor: `${doc.color}40` } : undefined}
                >
                  {/* Doc header */}
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: doc.color }} />

                    {editingDocId === doc.id ? (
                      <form
                        className="flex-1 min-w-0 flex items-center gap-1"
                        onSubmit={(e) => { e.preventDefault(); commitRename() }}
                      >
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          autoFocus
                          onBlur={commitRename}
                          className="flex-1 min-w-0 text-xs bg-transparent border-b border-[#F47B20]/40 text-white outline-none px-0 py-0.5"
                        />
                        <button type="submit" className="p-0.5 text-[#F47B20]" aria-label="Confirm rename">
                          <Check size={10} />
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => startRename(doc)}
                        className="flex-1 min-w-0 text-left text-xs text-white truncate hover:text-[#F47B20] transition-colors group/name flex items-center gap-1"
                        title="Click to rename"
                      >
                        {doc.name}
                        <Pencil size={9} className="text-white/0 group-hover/name:text-white/30 flex-shrink-0" />
                      </button>
                    )}

                    <span className="text-[10px] text-white/30 flex-shrink-0">
                      {doc.pageUids.length}p
                    </span>

                    {/* Edit / active toggle */}
                    {!isActive ? (
                      <button
                        onClick={() => editDocument(doc.id)}
                        className="p-0.5 rounded text-white/30 hover:text-[#F47B20] transition-colors flex-shrink-0"
                        title="Edit this document"
                        aria-label={`Edit ${doc.name}`}
                      >
                        <Unlock size={11} />
                      </button>
                    ) : (
                      <div className="p-0.5 text-[#F47B20] flex-shrink-0" title="Currently editing">
                        <Lock size={11} />
                      </div>
                    )}

                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="p-0.5 rounded text-white/20 hover:text-red-400 transition-colors flex-shrink-0"
                      title="Delete document"
                      aria-label={`Delete ${doc.name}`}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  {/* Active label */}
                  {isActive && (
                    <div className="px-2.5 pb-1">
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ color: doc.color, backgroundColor: `${doc.color}15` }}
                      >
                        Active — click pages to assign
                      </span>
                    </div>
                  )}

                  {/* Doc pages — sortable chips */}
                  {doc.pageUids.length > 0 && (
                    <div className="px-2 pb-2">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleSidebarDragStart}
                        onDragEnd={(event) => handleSidebarDragEnd(event, doc.id)}
                      >
                        <SortableContext items={doc.pageUids} strategy={rectSortingStrategy}>
                          <div className="flex flex-wrap gap-1">
                            {doc.pageUids.map((uid) => {
                              const page = pages.find((p) => p.uid === uid)
                              if (!page) return null
                              return (
                                <SortablePageChip
                                  key={uid}
                                  uid={uid}
                                  pageNumber={page.pageNumber}
                                  docColor={doc.color}
                                  onRemove={() => removePageFromDoc(doc.id, uid)}
                                  isActiveDoc={isActive}
                                />
                              )
                            })}
                          </div>
                        </SortableContext>
                        <DragOverlay>
                          {activeDragId && (() => {
                            const page = pages.find((p) => p.uid === activeDragId)
                            if (!page) return null
                            return (
                              <div
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium shadow-lg"
                                style={{ backgroundColor: doc.color, color: 'white' }}
                              >
                                {page.pageNumber}
                              </div>
                            )
                          })()}
                        </DragOverlay>
                      </DndContext>
                    </div>
                  )}

                  {/* Empty doc placeholder */}
                  {doc.pageUids.length === 0 && isActive && (
                    <div className="px-2.5 pb-2 pt-1">
                      <p className="text-[10px] text-white/20 italic">No pages yet — click or drag on pages</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="p-3 border-t border-white/[0.06] space-y-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<FilePlus size={12} />}
            onClick={createNewDocument}
            className="w-full justify-center"
          >
            New Document
          </Button>

          {exportError && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-[11px] text-red-400 flex-1">{exportError}</p>
              <button
                onClick={() => setExportError(null)}
                className="p-0.5 rounded text-red-400/60 hover:text-red-400 transition-colors"
                aria-label="Dismiss error"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {docsWithPages > 0 && (
            <>
              {isExporting && (
                <ProgressBar value={progress} max={100} label="Exporting..." />
              )}
              <Button
                onClick={handleExport}
                disabled={isExporting}
                icon={<Download size={14} />}
                className="w-full justify-center"
              >
                {isExporting
                  ? 'Exporting...'
                  : docsWithPages === 1
                    ? 'Export Document'
                    : `Export All (${docsWithPages} docs)`
                }
              </Button>
              <p className="text-[9px] text-white/20 text-center">
                {docsWithPages > 1 ? 'Downloads as ZIP' : 'Saves as PDF'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
