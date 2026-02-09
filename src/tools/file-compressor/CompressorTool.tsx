import { useState, useCallback } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { Slider } from '@/components/common/Slider.tsx'
import { ProgressBar } from '@/components/common/ProgressBar.tsx'
import { formatFileSize } from '@/utils/fileReader.ts'
import { downloadBlob } from '@/utils/download.ts'
import {
  compressImage,
  compressPDF,
  compressSVG,
  getCompressibleType,
  getCompressedExtension,
  type CompressibleType,
} from '@/utils/compression.ts'
import JSZip from 'jszip'
import { Download, Trash2, Archive, Image as ImageIcon, FileText, FileCode, Check } from 'lucide-react'

interface CompressFile {
  id: string
  file: File
  originalSize: number
  compressedBlob?: Blob
  compressedSize?: number
  status: 'pending' | 'processing' | 'done' | 'error'
  fileType: CompressibleType
}

export default function CompressorTool() {
  const [files, setFiles] = useState<CompressFile[]>([])
  const [quality, setQuality] = useState(70)
  const [maxWidth, setMaxWidth] = useState(1920)
  const [isCompressing, setIsCompressing] = useState(false)
  const [progress, setProgress] = useState(0)

  const handleFiles = useCallback((newFiles: File[]) => {
    const entries: CompressFile[] = []
    for (const file of newFiles) {
      const fileType = getCompressibleType(file)
      if (!fileType) continue
      entries.push({
        id: Math.random().toString(36).substring(2, 11),
        file,
        originalSize: file.size,
        status: 'pending',
        fileType,
      })
    }
    setFiles((prev) => [...prev, ...entries])
  }, [])

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleCompress = useCallback(async () => {
    setIsCompressing(true)
    setProgress(0)

    const total = files.length
    const updated = [...files]

    for (let i = 0; i < updated.length; i++) {
      const entry = updated[i]
      if (entry.status === 'done') continue

      updated[i] = { ...entry, status: 'processing' }
      setFiles([...updated])

      try {
        let blob: Blob
        switch (entry.fileType) {
          case 'image':
            blob = await compressImage(entry.file, quality, maxWidth)
            break
          case 'pdf':
            blob = await compressPDF(entry.file, quality, maxWidth)
            break
          case 'svg':
            blob = await compressSVG(entry.file)
            break
        }

        updated[i] = {
          ...entry,
          status: 'done',
          compressedBlob: blob,
          compressedSize: blob.size,
        }
      } catch {
        updated[i] = { ...entry, status: 'error' }
      }

      setFiles([...updated])
      setProgress(Math.round(((i + 1) / total) * 100))
    }

    setIsCompressing(false)
  }, [files, quality, maxWidth])

  const handleDownloadAll = useCallback(async () => {
    const completedFiles = files.filter((f) => f.status === 'done' && f.compressedBlob)

    if (completedFiles.length === 1) {
      const f = completedFiles[0]
      const baseName = f.file.name.replace(/\.[^.]+$/, '')
      const ext = getCompressedExtension(f.fileType)
      downloadBlob(f.compressedBlob!, `${baseName}-compressed.${ext}`)
      return
    }

    // Bundle into ZIP
    const zip = new JSZip()
    for (const f of completedFiles) {
      const baseName = f.file.name.replace(/\.[^.]+$/, '')
      const ext = getCompressedExtension(f.fileType)
      zip.file(`${baseName}-compressed.${ext}`, f.compressedBlob!)
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(zipBlob, 'compressed-files.zip')
  }, [files])

  const totalOriginal = files.reduce((sum, f) => sum + f.originalSize, 0)
  const totalCompressed = files.reduce((sum, f) => sum + (f.compressedSize ?? 0), 0)
  const allDone = files.length > 0 && files.every((f) => f.status === 'done')
  const savings = totalOriginal > 0 ? Math.round((1 - totalCompressed / totalOriginal) * 100) : 0
  const hasNonSvgFiles = files.some((f) => f.fileType !== 'svg')

  if (files.length === 0) {
    return (
      <FileDropZone
        onFiles={handleFiles}
        accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,application/pdf,image/svg+xml,.svg,.pdf"
        multiple
        label="Drop files to compress"
        description="Images, PDFs, or SVGs"
        className="h-full"
      />
    )
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-sm text-white/60">
          {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
        <div className="flex-1" />

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*,application/pdf,.pdf,image/svg+xml,.svg'
            input.multiple = true
            input.onchange = (e) => {
              const target = e.target as HTMLInputElement
              if (target.files) handleFiles(Array.from(target.files))
            }
            input.click()
          }}
        >
          Add More
        </Button>

        {!isCompressing && !allDone && (
          <Button onClick={handleCompress} icon={<Archive size={14} />}>
            Compress All
          </Button>
        )}

        {allDone && (
          <Button onClick={handleDownloadAll} icon={<Download size={14} />}>
            Download {files.length > 1 ? 'ZIP' : ''}
          </Button>
        )}
      </div>

      {/* Settings (not relevant for SVG-only batches) */}
      {hasNonSvgFiles && (
        <div className="flex gap-6 flex-shrink-0">
          <div className="flex-1">
            <Slider
              label="Quality"
              value={quality}
              min={10}
              max={95}
              step={5}
              suffix="%"
              onChange={(e) => setQuality(Number((e.target as HTMLInputElement).value))}
            />
          </div>
          <div className="flex-1">
            <Slider
              label="Max Width"
              value={maxWidth}
              min={640}
              max={4096}
              step={128}
              suffix="px"
              onChange={(e) => setMaxWidth(Number((e.target as HTMLInputElement).value))}
            />
          </div>
        </div>
      )}

      {/* Progress */}
      {isCompressing && (
        <ProgressBar value={progress} max={100} label="Compressing..." />
      )}

      {/* Summary */}
      {allDone && (
        <div className="p-3 rounded-lg bg-[#F47B20]/5 border border-[#F47B20]/20 flex items-center gap-4">
          <div className="text-xs text-white/60">
            <span className="text-white">{formatFileSize(totalOriginal)}</span> → <span className="text-white">{formatFileSize(totalCompressed)}</span>
          </div>
          <span className="text-xs text-emerald-400 font-medium">{savings}% smaller</span>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {files.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-white/[0.06] bg-white/[0.03]"
          >
            {entry.fileType === 'pdf' ? (
              <FileText size={16} className="text-red-400/60 flex-shrink-0" />
            ) : entry.fileType === 'svg' ? (
              <FileCode size={16} className="text-blue-400/60 flex-shrink-0" />
            ) : (
              <ImageIcon size={16} className="text-white/30 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{entry.file.name}</p>
              <p className="text-xs text-white/40">
                {formatFileSize(entry.originalSize)}
                {entry.compressedSize !== undefined && (
                  <> → <span className="text-emerald-400">{formatFileSize(entry.compressedSize)}</span></>
                )}
              </p>
            </div>

            {entry.status === 'done' && (
              <Check size={14} className="text-emerald-400" />
            )}
            {entry.status === 'processing' && (
              <div className="w-4 h-4 border-2 border-[#F47B20] border-t-transparent rounded-full animate-spin" />
            )}
            {entry.status === 'error' && (
              <span className="text-xs text-red-400">Error</span>
            )}

            <button
              onClick={() => removeFile(entry.id)}
              aria-label={`Remove ${entry.file.name}`}
              className="p-1.5 rounded-md text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
