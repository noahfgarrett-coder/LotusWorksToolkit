import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { ProgressBar } from '@/components/common/ProgressBar.tsx'
import { useAppStore } from '@/stores/appStore.ts'
import { loadPDFFile, generateThumbnail, mergePDFs, removePDFFromCache } from '@/utils/pdf.ts'
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
  Download, Trash2, GripVertical, Plus, ArrowUp, ArrowDown,
  ChevronDown, ChevronRight, Loader2, Eye, EyeOff, ZoomIn, ZoomOut, Copy,
} from 'lucide-react'

/* ── Types ── */

interface PageEntry {
  uid: string
  pageNumber: number
  thumbnail: string
  excluded: boolean
  copiedFrom?: number
}

interface MergeFile extends PDFFile {
  thumbnail?: string
  pages: PageEntry[]
  expanded: boolean
  loadingPages: boolean
}

/* ── Helpers ── */

let _pageUid = 0
function makePageUid(): string {
  return `pg-${++_pageUid}`
}

/* ── Sortable page thumbnail ── */

interface SortablePageItemProps {
  page: PageEntry
  pageIdx: number
  fileId: string
  isSelected: boolean
  isCopiedSource: boolean
  onContextMenu: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
  onToggleExclude: (e: React.MouseEvent) => void
  scrollRoot: HTMLDivElement | null
  onThumbnailNeeded: () => void
}

function SortablePageItem({
  page, pageIdx, isSelected, isCopiedSource,
  onContextMenu, onClick, onToggleExclude,
  scrollRoot, onThumbnailNeeded,
}: SortablePageItemProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: page.uid })

  const nodeRef = useRef<HTMLDivElement | null>(null)
  const thumbCbRef = useRef(onThumbnailNeeded)
  thumbCbRef.current = onThumbnailNeeded

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Lazy thumbnail via IntersectionObserver with generous 600px buffer
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

  return (
    <div
      ref={(node) => { setNodeRef(node); nodeRef.current = node }}
      data-uid={page.uid}
      style={style}
      {...attributes}
      {...listeners}
      onContextMenu={onContextMenu}
      onClick={onClick}
      className={`
        relative group rounded-lg border p-1.5 transition-shadow flex items-center justify-center
        ${isDragging ? 'opacity-30 z-10' : 'cursor-grab active:cursor-grabbing'}
        ${isSelected && !isDragging ? 'border-[#F47B20] ring-2 ring-[#F47B20]/30' : ''}
        ${!isSelected && !isDragging && page.excluded ? 'opacity-30 border-white/[0.04]' : ''}
        ${!isSelected && !isDragging && !page.excluded ? 'border-white/[0.08] hover:border-[#F47B20]/30' : ''}
      `}
      title={`Page ${page.pageNumber}${page.excluded ? ' (excluded)' : ''}${page.copiedFrom ? ` (copy of p${page.copiedFrom})` : ''} · Click to select · Right-click to toggle`}
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

      {/* Original page number badge (bottom-left) */}
      <div className={`
        absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-0.5
        ${page.excluded
          ? 'bg-red-500/60 text-white/80 line-through'
          : page.copiedFrom
            ? 'bg-purple-500/70 text-white/90'
            : 'bg-black/60 text-white/80'
        }
      `}>
        {page.copiedFrom && <Copy size={8} />}
        p{page.pageNumber}
      </div>

      {/* Current position badge (top-left) — always shown; orange when reordered or copied */}
      <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${
        pageIdx + 1 !== page.pageNumber || page.copiedFrom ? 'bg-[#F47B20]/80' : 'bg-black/50'
      }`}>
        #{pageIdx + 1}
      </div>

      {/* "Copied!" flash overlay */}
      {isCopiedSource && (
        <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-[#F47B20]/20 animate-pulse pointer-events-none">
          <span className="text-[#F47B20] text-xs font-bold bg-black/60 px-2 py-1 rounded">Copied!</span>
        </div>
      )}

      {/* Excluded overlay */}
      {page.excluded && (
        <div className="absolute inset-1.5 rounded flex items-center justify-center">
          <EyeOff size={20} className="text-white/40" />
        </div>
      )}

      {/* Quick toggle on hover */}
      <button
        onClick={onToggleExclude}
        className="absolute top-2 right-2 p-1 rounded bg-black/50 text-white/0 group-hover:text-white/70 hover:!text-white transition-colors"
        title={page.excluded ? 'Include page' : 'Exclude page'}
      >
        {page.excluded ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
    </div>
  )
}

/* ── Component ── */

export default function PdfMergeTool() {
  const [files, setFiles] = useState<MergeFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isMerging, setIsMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  // File-level drag state (native HTML5 DnD for file rows)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Page selection & copy/paste
  const [selectedPage, setSelectedPage] = useState<{ fileId: string; pageIdx: number } | null>(null)
  const [copiedPage, setCopiedPage] = useState<{ fileId: string; page: PageEntry } | null>(null)
  const [showCopied, setShowCopied] = useState(false)

  // dnd-kit page-level drag
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [activeDragWidth, setActiveDragWidth] = useState(0)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Thumbnail zoom — controls columns per row
  const MIN_COLS = 2
  const MAX_COLS = 10
  const [zoomCols, setZoomCols] = useState(5)
  const zoomIn = () => setZoomCols((c) => Math.max(c - 1, MIN_COLS))
  const zoomOut = () => setZoomCols((c) => Math.min(c + 1, MAX_COLS))

  // Thumbnail resolution
  const RES_LEVELS = [
    { label: 'Low', height: 150 },
    { label: 'Med', height: 300 },
    { label: 'High', height: 600 },
  ]
  const [resIdx, setResIdx] = useState(1) // default Medium
  const resRef = useRef(RES_LEVELS[1].height)
  resRef.current = RES_LEVELS[resIdx].height

  // Scroll container ref
  const scrollRef = useRef<HTMLDivElement>(null)

  // Lazy thumbnail loading refs
  const filesRef = useRef(files)
  filesRef.current = files
  const loadingThumbs = useRef(new Set<string>())
  const MAX_LOADING_THUMBS = 1000

  // Memory estimation
  const MAX_MEMORY_MB = 4096
  const memoryMB = useMemo(() => {
    let bytes = 0
    for (const f of files) {
      bytes += f.data.byteLength
      if (f.pages.length > 0) bytes += f.data.byteLength * 1.5
      if (f.thumbnail) bytes += f.thumbnail.length * 2
      for (const p of f.pages) {
        if (p.thumbnail) bytes += p.thumbnail.length * 2
      }
    }
    return bytes / (1024 * 1024)
  }, [files])

  const memoryPct = Math.min((memoryMB / MAX_MEMORY_MB) * 100, 100)
  const memoryColor = memoryPct < 50 ? '#22c55e' : memoryPct < 75 ? '#F47B20' : '#ef4444'

  /* ── Lazy thumbnail loader ── */

  const loadPageThumbnail = useCallback(async (fileId: string, pageUid: string, pageNumber: number) => {
    if (loadingThumbs.current.has(pageUid)) return
    // Evict oldest entries if Set exceeds max size
    if (loadingThumbs.current.size >= MAX_LOADING_THUMBS) {
      const iter = loadingThumbs.current.values()
      for (let i = 0; i < 100; i++) loadingThumbs.current.delete(iter.next().value!)
    }
    loadingThumbs.current.add(pageUid)

    const file = filesRef.current.find((f) => f.id === fileId)
    if (!file) return

    try {
      const thumbnail = await generateThumbnail(file, pageNumber, resRef.current)
      setFiles((prev) => prev.map((f) => {
        if (f.id !== fileId) return f
        return { ...f, pages: f.pages.map((p) => p.uid === pageUid ? { ...p, thumbnail } : p) }
      }))
    } catch {
      loadingThumbs.current.delete(pageUid)
    }
  }, [])

  /* ── File handling ── */

  const handleFiles = useCallback(async (newFiles: File[]) => {
    setIsLoading(true)
    try {
      const pdfFiles: MergeFile[] = []
      for (const file of newFiles) {
        if (!file.name.toLowerCase().endsWith('.pdf') && !file.type.startsWith('image/')) continue
        try {
          if (file.type.startsWith('image/')) continue
          const pdfFile = await loadPDFFile(file)
          const thumbnail = await generateThumbnail(pdfFile, 1, 120)
          pdfFiles.push({
            ...pdfFile,
            thumbnail,
            pages: [],
            expanded: false,
            loadingPages: false,
          })
        } catch {
          useAppStore.getState().addToast({ type: 'error', message: `Failed to load ${file.name}` })
        }
      }
      setFiles((prev) => [...prev, ...pdfFiles])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const removeFile = (id: string) => {
    removePDFFromCache(id)
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const moveFile = (idx: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const newFiles = [...prev]
      const target = idx + dir
      if (target < 0 || target >= newFiles.length) return prev
      ;[newFiles[idx], newFiles[target]] = [newFiles[target], newFiles[idx]]
      return newFiles
    })
  }

  /* ── File-level drag & drop ── */

  const handleDragStart = (idx: number) => {
    setDragIdx(idx)
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null)
      setDragOverIdx(null)
      return
    }
    setFiles((prev) => {
      const newFiles = [...prev]
      const [moved] = newFiles.splice(dragIdx, 1)
      newFiles.splice(targetIdx, 0, moved)
      return newFiles
    })
    setDragIdx(null)
    setDragOverIdx(null)
  }

  /* ── Expand / collapse — pages created instantly, thumbnails lazy-loaded ── */

  const toggleExpand = useCallback((fileId: string) => {
    setFiles((prev) => prev.map((f) => {
      if (f.id !== fileId) return f
      if (f.expanded) return { ...f, expanded: false }
      if (f.pages.length > 0) return { ...f, expanded: true }
      // Create all page entries immediately with empty thumbnails — IO loads them lazily
      const pages: PageEntry[] = Array.from({ length: f.pageCount }, (_, i) => ({
        uid: makePageUid(),
        pageNumber: i + 1,
        thumbnail: '',
        excluded: false,
      }))
      return { ...f, expanded: true, loadingPages: false, pages }
    }))
  }, [])

  /* ── Resolution change — clears thumbnails so IO re-generates at new quality ── */

  const changeResolution = (newIdx: number) => {
    setResIdx(newIdx)
    loadingThumbs.current.clear()
    setFiles((prev) => prev.map((f) => ({
      ...f,
      pages: f.pages.map((p) => ({ ...p, thumbnail: '' })),
    })))
  }

  /* ── Page-level dnd-kit drag (ghost animation) ── */

  const handlePageDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
    // Measure the source element so the overlay matches its size
    const el = document.querySelector(`[data-uid="${event.active.id}"]`) as HTMLElement
    if (el) setActiveDragWidth(el.getBoundingClientRect().width)
    setSelectedPage(null)
  }

  const handlePageDragEnd = (event: DragEndEvent, fileId: string) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    setFiles((prev) => prev.map((f) => {
      if (f.id !== fileId) return f
      const oldIdx = f.pages.findIndex((p) => p.uid === active.id)
      const newIdx = f.pages.findIndex((p) => p.uid === over.id)
      if (oldIdx === -1 || newIdx === -1) return f
      return { ...f, pages: arrayMove(f.pages, oldIdx, newIdx) }
    }))
  }

  /* ── Page exclude/include ── */

  const togglePageExclude = (fileId: string, pageIdx: number) => {
    setFiles((prev) => prev.map((f) => {
      if (f.id !== fileId) return f
      const newPages = [...f.pages]
      newPages[pageIdx] = { ...newPages[pageIdx], excluded: !newPages[pageIdx].excluded }
      return { ...f, pages: newPages }
    }))
  }

  /* ── Right-click toggles exclude ── */

  const handlePageContextMenu = (e: React.MouseEvent, fileId: string, pageIdx: number) => {
    e.preventDefault()
    e.stopPropagation()
    togglePageExclude(fileId, pageIdx)
  }

  /* ── Page selection & copy/paste ── */

  const handlePageClick = (e: React.MouseEvent, fileId: string, pageIdx: number) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.stopPropagation()
    setSelectedPage((prev) =>
      prev?.fileId === fileId && prev.pageIdx === pageIdx ? null : { fileId, pageIdx }
    )
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPage(null)
        return
      }

      if (!selectedPage) return
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'c') {
        const file = files.find((f) => f.id === selectedPage.fileId)
        if (!file) return
        const page = file.pages[selectedPage.pageIdx]
        if (!page) return
        setCopiedPage({ fileId: selectedPage.fileId, page: { ...page } })
        setShowCopied(true)
        setTimeout(() => setShowCopied(false), 1500)
        e.preventDefault()
      }

      if (mod && e.key === 'v') {
        if (!copiedPage) return
        if (selectedPage.fileId !== copiedPage.fileId) return
        const pastedPage: PageEntry = {
          ...copiedPage.page,
          uid: makePageUid(),
          excluded: false,
          copiedFrom: copiedPage.page.copiedFrom ?? copiedPage.page.pageNumber,
        }
        setFiles((prev) => prev.map((f) => {
          if (f.id !== selectedPage.fileId) return f
          const newPages = [...f.pages]
          newPages.splice(selectedPage.pageIdx + 1, 0, pastedPage)
          return { ...f, pages: newPages }
        }))
        setSelectedPage({ fileId: selectedPage.fileId, pageIdx: selectedPage.pageIdx + 1 })
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPage, copiedPage, files])

  /* ── Merge ── */

  const handleMerge = useCallback(async () => {
    if (files.length < 1) return
    setIsMerging(true)
    setMergeError(null)
    setProgress(0)
    try {
      const mergeInputs = files
        .map((f) => {
          if (f.pages.length > 0) {
            const includedPages = f.pages.filter((p) => !p.excluded).map((p) => p.pageNumber)
            if (includedPages.length === 0) return null
            return { data: f.data, pages: includedPages }
          }
          return { data: f.data }
        })
        .filter((x): x is { data: Uint8Array; pages?: number[] } => x !== null)

      if (mergeInputs.length === 0) {
        setIsMerging(false)
        return
      }

      const result = await mergePDFs(mergeInputs, (current, total) => {
        setProgress(Math.round((current / total) * 100))
      })

      const blob = new Blob([result], { type: 'application/pdf' })

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: 'merged.pdf',
            types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
        } catch (e: any) {
          if (e?.name === 'AbortError') return   // user cancelled
          throw e
        }
      } else {
        downloadBlob(blob, 'merged.pdf')
      }
    } catch (err) {
      console.error('Merge failed:', err)
      setMergeError(err instanceof Error ? err.message : 'Merge failed — check that all PDFs are valid')
    } finally {
      setIsMerging(false)
      setProgress(0)
    }
  }, [files])

  /* ── Helper: get included page count ── */

  const getIncludedCount = (file: MergeFile): string => {
    if (file.pages.length === 0) {
      return `${file.pageCount} page${file.pageCount !== 1 ? 's' : ''}`
    }
    const included = file.pages.filter((p) => !p.excluded).length
    return `${included}/${file.pages.length} pages`
  }

  /* ── Render: empty state ── */

  if (files.length === 0) {
    return (
      <div className="h-full flex flex-col gap-4">
        <FileDropZone
          onFiles={handleFiles}
          accept="application/pdf"
          multiple
          label="Drop PDF files here"
          description="Add 2 or more PDFs to merge"
          className="h-full"
        />
        {isLoading && (
          <div className="text-center text-sm text-white/40">Loading files...</div>
        )}
      </div>
    )
  }

  /* ── Render: main view ── */

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-sm text-white/60">
          {files.length} file{files.length !== 1 ? 's' : ''} ·{' '}
          {formatFileSize(files.reduce((sum, f) => sum + f.size, 0))} total
        </span>

        {/* Memory meter */}
        <div className="flex flex-col gap-0.5" title={`Estimated memory: ${memoryMB.toFixed(1)} MB / ${MAX_MEMORY_MB} MB`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/40">
              {memoryMB < 1 ? `${(memoryMB * 1024).toFixed(0)} KB` : `${memoryMB.toFixed(0)} MB`}
            </span>
            <span className="text-[10px] text-white/25 ml-2">
              {(MAX_MEMORY_MB / 1024).toFixed(0)} GB
            </span>
          </div>
          <div className="w-28 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${memoryPct}%`, backgroundColor: memoryColor }}
            />
          </div>
        </div>

        <div className="flex-1" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={zoomCols >= MAX_COLS}
            className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20 disabled:pointer-events-none transition-colors"
            title="Zoom out (more columns)"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-[10px] text-white/30 min-w-[28px] text-center">{zoomCols}col</span>
          <button
            onClick={zoomIn}
            disabled={zoomCols <= MIN_COLS}
            className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20 disabled:pointer-events-none transition-colors"
            title="Zoom in (fewer columns)"
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
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'application/pdf'
            input.multiple = true
            input.onchange = (e) => {
              const target = e.target as HTMLInputElement
              if (target.files) handleFiles(Array.from(target.files))
            }
            input.click()
          }}
        >
          Add Files
        </Button>
        <Button
          onClick={handleMerge}
          disabled={files.length < 1 || isMerging}
          icon={<Download size={14} />}
        >
          {isMerging ? 'Merging...' : 'Merge & Download'}
        </Button>
      </div>

      {/* Progress bar */}
      {isMerging && (
        <ProgressBar value={progress} max={100} label="Merging PDFs..." />
      )}

      {/* Merge error */}
      {mergeError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-red-400">{mergeError}</span>
          <button
            onClick={() => setMergeError(null)}
            className="ml-auto text-xs text-white/40 hover:text-white/70"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* File list */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto space-y-1.5" onClick={(e) => { if (e.target === e.currentTarget) setSelectedPage(null) }}>
        {files.map((file, idx) => (
          <div
            key={file.id}
            draggable={!file.expanded}
            onDragStart={() => !file.expanded && handleDragStart(idx)}
            onDragOver={(e) => !file.expanded && handleDragOver(e, idx)}
            onDrop={(e) => !file.expanded && handleDrop(e, idx)}
            onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
            className={`
              rounded-lg border transition-all
              ${dragOverIdx === idx && !file.expanded ? 'border-[#F47B20]/40 bg-[#F47B20]/5' : 'border-white/[0.06] bg-white/[0.03]'}
              ${dragIdx === idx ? 'opacity-40' : ''}
              hover:border-white/[0.12]
            `}
          >
            {/* File row */}
            <div className="flex items-center gap-3 p-3">
              {/* Drag handle */}
              <div className={`text-white/20 hover:text-white/50 ${file.expanded ? 'opacity-30 pointer-events-none' : 'cursor-grab active:cursor-grabbing'}`}>
                <GripVertical size={16} />
              </div>

              {/* Expand toggle */}
              <button
                onClick={() => toggleExpand(file.id)}
                className="p-1 rounded text-white/30 hover:text-[#F47B20] transition-colors"
                title={file.expanded ? 'Collapse pages' : 'Expand pages'}
              >
                {file.expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {/* Order number */}
              <div className="w-6 h-6 rounded-md bg-[#F47B20]/15 text-[#F47B20] text-xs font-semibold flex items-center justify-center flex-shrink-0">
                {idx + 1}
              </div>

              {/* Thumbnail */}
              {file.thumbnail && (
                <img
                  src={file.thumbnail}
                  alt=""
                  className="h-14 w-auto rounded border border-white/[0.08] flex-shrink-0"
                />
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{file.name}</p>
                <p className="text-xs text-white/40">
                  {getIncludedCount(file)} · {formatFileSize(file.size)}
                </p>
              </div>

              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveFile(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${file.name} up`}
                  className="p-1 rounded text-white/20 hover:text-white/60 disabled:opacity-20 disabled:pointer-events-none"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  onClick={() => moveFile(idx, 1)}
                  disabled={idx === files.length - 1}
                  aria-label={`Move ${file.name} down`}
                  className="p-1 rounded text-white/20 hover:text-white/60 disabled:opacity-20 disabled:pointer-events-none"
                >
                  <ArrowDown size={12} />
                </button>
              </div>

              {/* Remove button */}
              <button
                onClick={() => removeFile(file.id)}
                aria-label={`Remove ${file.name}`}
                className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Expanded page grid with dnd-kit sortable */}
            {file.expanded && (
              <div className="px-3 pb-3 pt-0">
                <div className="border-t border-white/[0.06] pt-3">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handlePageDragStart}
                    onDragEnd={(event) => handlePageDragEnd(event, file.id)}
                  >
                    <SortableContext items={file.pages.map((p) => p.uid)} strategy={rectSortingStrategy}>
                      <div
                        className="grid gap-2"
                        style={{ gridTemplateColumns: `repeat(${zoomCols}, 1fr)` }}
                      >
                        {file.pages.map((page, pageIdx) => (
                          <SortablePageItem
                            key={page.uid}
                            page={page}
                            pageIdx={pageIdx}
                            fileId={file.id}
                            isSelected={selectedPage?.fileId === file.id && selectedPage.pageIdx === pageIdx}
                            isCopiedSource={showCopied && selectedPage?.fileId === file.id && selectedPage.pageIdx === pageIdx}
                            onContextMenu={(e) => handlePageContextMenu(e, file.id, pageIdx)}
                            onClick={(e) => handlePageClick(e, file.id, pageIdx)}
                            onToggleExclude={(e) => { e.stopPropagation(); togglePageExclude(file.id, pageIdx) }}
                            scrollRoot={scrollRef.current}
                            onThumbnailNeeded={() => loadPageThumbnail(file.id, page.uid, page.pageNumber)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                    <DragOverlay adjustScale={false}>
                      {activeDragId && (() => {
                        const dragPage = file.pages.find((p) => p.uid === activeDragId)
                        if (!dragPage) return null
                        return (
                          <div
                            className="rounded-lg border-2 border-[#F47B20] p-1.5 bg-[#00171F]/90 shadow-lg shadow-[#F47B20]/20"
                            style={activeDragWidth ? { width: activeDragWidth } : undefined}
                          >
                            {dragPage.thumbnail ? (
                              <img src={dragPage.thumbnail} className="w-full h-auto rounded object-contain" draggable={false} />
                            ) : (
                              <div className="w-full aspect-[8.5/11] rounded bg-white/[0.08]" />
                            )}
                          </div>
                        )
                      })()}
                    </DragOverlay>
                  </DndContext>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <p className="text-[10px] text-white/25 text-center flex-shrink-0">
        Drag files to reorder · Expand to manage pages · Right-click to exclude · Click + Ctrl/Cmd+C/V to copy-paste pages
      </p>

    </div>
  )
}
