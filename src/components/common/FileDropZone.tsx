import { useState, useCallback, useRef, memo, type DragEvent } from 'react'
import { Upload } from 'lucide-react'

interface FileDropZoneProps {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  label?: string
  description?: string
  maxSizeMB?: number
  className?: string
}

export const FileDropZone = memo(function FileDropZone({
  onFiles,
  accept,
  multiple = true,
  label = 'Drop files here',
  description = 'or click to browse',
  maxSizeMB = 50,
  className = '',
}: FileDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const files = Array.from(fileList).filter(
        (f) => f.size <= maxSizeMB * 1024 * 1024,
      )
      if (files.length > 0) onFiles(files)
    },
    [onFiles, maxSizeMB],
  )

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`
        relative flex flex-col items-center justify-center
        border-2 border-dashed rounded-xl py-12 px-6
        cursor-pointer transition-all duration-200
        ${isDragOver
          ? 'border-[#F47B20] bg-[#F47B20]/10'
          : 'border-white/[0.12] bg-white/[0.02] hover:border-white/[0.2] hover:bg-white/[0.04]'
        }
        ${className}
      `}
    >
      <div
        className={`
          w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors
          ${isDragOver ? 'bg-[#F47B20]/20 text-[#F47B20]' : 'bg-white/[0.06] text-white/30'}
        `}
      >
        <Upload size={22} />
      </div>
      <p className="text-sm font-medium text-white mb-1">{label}</p>
      <p className="text-xs text-white/40">{description}</p>
      {maxSizeMB && (
        <p className="text-[10px] text-white/25 mt-2">Max {maxSizeMB}MB per file</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />
    </div>
  )
})
