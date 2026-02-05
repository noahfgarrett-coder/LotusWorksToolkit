import { useState, useCallback } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { readFileAsDataURL, formatFileSize } from '@/utils/fileReader.ts'
import { loadImage, resizeImage, canvasToBlob } from '@/utils/imageProcessing.ts'
import { downloadBlob } from '@/utils/download.ts'
import { PDFDocument } from 'pdf-lib'
import { Download, RotateCcw, Check, X, FileIcon } from 'lucide-react'

// ── Output format definitions ────────────────────────────

interface OutputFormat {
  ext: string
  label: string
  mime: string
}

const IMAGE_OUTPUTS: OutputFormat[] = [
  { ext: 'png', label: 'PNG', mime: 'image/png' },
  { ext: 'jpg', label: 'JPEG', mime: 'image/jpeg' },
  { ext: 'webp', label: 'WebP', mime: 'image/webp' },
  { ext: 'pdf', label: 'PDF', mime: 'application/pdf' },
]

const TEXT_OUTPUTS: OutputFormat[] = [
  { ext: 'pdf', label: 'PDF', mime: 'application/pdf' },
]

// ── Detect available output formats from file type ───────

function getInputCategory(file: File): 'image' | 'text' | 'unknown' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type === 'text/plain' || file.type === 'text/markdown'
    || file.name.endsWith('.txt') || file.name.endsWith('.md')) return 'text'
  return 'unknown'
}

function getOutputFormats(file: File): OutputFormat[] {
  const cat = getInputCategory(file)
  if (cat === 'image') {
    const currentExt = getExtFromMime(file.type)
    return IMAGE_OUTPUTS.filter((f) => f.ext !== currentExt)
  }
  if (cat === 'text') return TEXT_OUTPUTS
  return []
}

function getExtFromMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/bmp') return 'bmp'
  return ''
}

function getFileTypeLabel(file: File): string {
  return file.name.split('.').pop()?.toUpperCase() || 'FILE'
}

// ── Conversion logic ─────────────────────────────────────

async function convertFile(file: File, output: OutputFormat): Promise<{ blob: Blob; name: string }> {
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const cat = getInputCategory(file)

  if (cat === 'image' && output.ext !== 'pdf') {
    const dataUrl = await readFileAsDataURL(file)
    const img = await loadImage(dataUrl)
    const canvas = resizeImage(img, img.naturalWidth, img.naturalHeight)
    const blob = await canvasToBlob(canvas, output.mime, 0.92)
    return { blob, name: `${baseName}.${output.ext}` }
  }

  if (cat === 'image' && output.ext === 'pdf') {
    const dataUrl = await readFileAsDataURL(file)
    const img = await loadImage(dataUrl)
    const pdfDoc = await PDFDocument.create()
    const arrayBuffer = await file.arrayBuffer()

    let embeddedImage
    if (file.type === 'image/png') {
      embeddedImage = await pdfDoc.embedPng(arrayBuffer)
    } else if (file.type === 'image/jpeg') {
      embeddedImage = await pdfDoc.embedJpg(arrayBuffer)
    } else {
      const canvas = resizeImage(img, img.naturalWidth, img.naturalHeight)
      const pngBlob = await canvasToBlob(canvas, 'image/png', 1)
      const pngBuffer = await pngBlob.arrayBuffer()
      embeddedImage = await pdfDoc.embedPng(pngBuffer)
    }

    const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height])
    page.drawImage(embeddedImage, {
      x: 0, y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    })

    const pdfBytes = await pdfDoc.save()
    return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), name: `${baseName}.pdf` }
  }

  if (cat === 'text' && output.ext === 'pdf') {
    const text = await file.text()
    const pdfDoc = await PDFDocument.create()
    const lines = text.split('\n')
    const fontSize = 11
    const lineHeight = fontSize * 1.4
    const margin = 50
    const pageHeight = 842
    const pageWidth = 595
    const usableHeight = pageHeight - margin * 2
    const linesPerPage = Math.floor(usableHeight / lineHeight)

    for (let i = 0; i < lines.length; i += linesPerPage) {
      const pageLines = lines.slice(i, i + linesPerPage)
      const page = pdfDoc.addPage([pageWidth, pageHeight])
      let y = pageHeight - margin
      for (const line of pageLines) {
        page.drawText(line.substring(0, 100), { x: margin, y, size: fontSize })
        y -= lineHeight
      }
    }

    const pdfBytes = await pdfDoc.save()
    return { blob: new Blob([pdfBytes], { type: 'application/pdf' }), name: `${baseName}.pdf` }
  }

  throw new Error('Unsupported conversion')
}

// ── Per-file state ───────────────────────────────────────

interface FileEntry {
  id: string
  file: File
  typeLabel: string
  formats: OutputFormat[]
  selectedFormat: OutputFormat | null
  status: 'idle' | 'converting' | 'done' | 'error'
  result: { blob: Blob; name: string } | null
  error: string | null
}

// ── Component ────────────────────────────────────────────

export default function ConverterTool() {
  const [entries, setEntries] = useState<FileEntry[]>([])

  const handleFiles = useCallback((files: File[]) => {
    const newEntries: FileEntry[] = files.map((file) => ({
      id: Math.random().toString(36).substring(2, 11),
      file,
      typeLabel: getFileTypeLabel(file),
      formats: getOutputFormats(file),
      selectedFormat: null,
      status: 'idle' as const,
      result: null,
      error: null,
    }))
    setEntries((prev) => [...prev, ...newEntries])
  }, [])

  const updateEntry = useCallback((id: string, updates: Partial<FileEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)))
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const handleConvert = useCallback(async (entry: FileEntry) => {
    if (!entry.selectedFormat) return
    updateEntry(entry.id, { status: 'converting', error: null })
    try {
      const result = await convertFile(entry.file, entry.selectedFormat)
      updateEntry(entry.id, { status: 'done', result })
    } catch (err) {
      updateEntry(entry.id, { status: 'error', error: (err as Error).message })
    }
  }, [updateEntry])

  const handleConvertAll = useCallback(async () => {
    const eligible = entries.filter((e) => e.selectedFormat && e.status !== 'done')
    for (const entry of eligible) {
      updateEntry(entry.id, { status: 'converting', error: null })
      try {
        const result = await convertFile(entry.file, entry.selectedFormat!)
        updateEntry(entry.id, { status: 'done', result })
      } catch (err) {
        updateEntry(entry.id, { status: 'error', error: (err as Error).message })
      }
    }
  }, [entries, updateEntry])

  const handleDownload = useCallback((entry: FileEntry) => {
    if (entry.result) downloadBlob(entry.result.blob, entry.result.name)
  }, [])

  const handleDownloadAll = useCallback(() => {
    entries
      .filter((e) => e.status === 'done' && e.result)
      .forEach((e) => downloadBlob(e.result!.blob, e.result!.name))
  }, [entries])

  const eligibleCount = entries.filter((e) => e.selectedFormat && e.status !== 'done').length
  const doneCount = entries.filter((e) => e.status === 'done').length

  // ── Empty state: central drop zone ─────────────────────

  if (entries.length === 0) {
    return (
      <FileDropZone
        onFiles={handleFiles}
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,.txt,.md"
        multiple
        label="Drop files to convert"
        description="Images (PNG, JPEG, WebP, GIF, BMP) or text files (TXT, MD)"
        className="h-full"
      />
    )
  }

  // ── File list view ─────────────────────────────────────

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-white/50">
          {entries.length} file{entries.length !== 1 ? 's' : ''}
          {doneCount > 0 && <span className="text-[#F47B20]"> · {doneCount} converted</span>}
        </span>
        <div className="flex-1" />

        {eligibleCount > 0 && (
          <Button onClick={handleConvertAll} size="sm">
            Convert{eligibleCount > 1 ? ` All (${eligibleCount})` : ''}
          </Button>
        )}

        {doneCount > 1 && (
          <Button onClick={handleDownloadAll} variant="secondary" size="sm" icon={<Download size={12} />}>
            Download All
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={12} />}
          onClick={() => setEntries([])}
        >
          Clear
        </Button>
      </div>

      {/* File entries */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`p-4 rounded-xl border transition-colors ${
              entry.status === 'done'
                ? 'border-[#F47B20]/20 bg-[#F47B20]/[0.04]'
                : entry.status === 'error'
                  ? 'border-red-500/20 bg-red-500/[0.04]'
                  : 'border-white/[0.06] bg-white/[0.03]'
            }`}
          >
            {/* File header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                <FileIcon size={14} className="text-white/40" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{entry.file.name}</p>
                <p className="text-[10px] text-white/30">
                  {entry.typeLabel} · {formatFileSize(entry.file.size)}
                </p>
              </div>

              {entry.status === 'converting' && (
                <div className="w-4 h-4 border-2 border-[#F47B20] border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              {entry.status === 'done' && entry.result && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Download size={12} />}
                  onClick={() => handleDownload(entry)}
                >
                  {entry.result.name.split('.').pop()?.toUpperCase()}
                </Button>
              )}

              <button
                onClick={() => removeEntry(entry.id)}
                className="p-1 text-white/20 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* Output format selector */}
            {entry.formats.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-white/30 uppercase tracking-wider mr-1">Convert to:</span>
                {entry.formats.map((fmt) => {
                  const isSelected = entry.selectedFormat?.ext === fmt.ext
                  const isDone = entry.status === 'done' && isSelected

                  return (
                    <button
                      key={fmt.ext}
                      onClick={() => {
                        if (entry.status === 'done') {
                          updateEntry(entry.id, { selectedFormat: fmt, status: 'idle', result: null })
                        } else {
                          updateEntry(entry.id, { selectedFormat: fmt })
                        }
                      }}
                      className={`
                        px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                        ${isDone
                          ? 'bg-[#F47B20] text-white'
                          : isSelected
                            ? 'bg-[#F47B20]/20 text-[#F47B20] border border-[#F47B20]/30'
                            : 'bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.1] border border-transparent'
                        }
                      `}
                    >
                      {isDone && <Check size={10} className="inline mr-1 -mt-0.5" />}
                      {fmt.label}
                    </button>
                  )
                })}

                {entry.selectedFormat && entry.status === 'idle' && (
                  <Button size="sm" onClick={() => handleConvert(entry)} className="ml-auto">
                    Convert
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-white/25">
                Unsupported file type — no conversions available
              </p>
            )}

            {entry.status === 'error' && entry.error && (
              <p className="text-[10px] text-red-400 mt-2">{entry.error}</p>
            )}
          </div>
        ))}
      </div>

      {/* Add more files */}
      <FileDropZone
        onFiles={handleFiles}
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,.txt,.md"
        multiple
        label="Drop more files"
        description="Add more files to convert"
        maxSizeMB={50}
        className="py-4 flex-shrink-0"
      />
    </div>
  )
}
