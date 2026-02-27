/**
 * DataImporter — Drag-and-drop file upload for CSV/Excel files.
 * Uses the shared FileDropZone component and File System Access API for persistent handles.
 */

import { useState, useCallback } from 'react'
import { FileText, Check, AlertCircle, X, Link } from 'lucide-react'
import { FileDropZone } from '../../components/common/FileDropZone.tsx'
import { parseFile, isFileSupported, SUPPORTED_EXTENSIONS } from './xlsxParser.ts'
import { isFileSystemAccessSupported, type UseFileHandleResult } from './useFileHandle.ts'
import type { DashboardStore } from './dashboardStore.ts'

// ── Types ───────────────────────────────────────

interface DataImporterProps {
  store: DashboardStore
  fileHandle: UseFileHandleResult
  onSuccess?: (dataSourceId: string) => void
  onCancel?: () => void
}

type ImportStatus = 'idle' | 'importing' | 'success' | 'error'

interface FileEntry {
  file: File
  status: ImportStatus
  error?: string
  dataSourceId?: string
  handle?: unknown // FileSystemFileHandle (not in standard types)
}

// ── Helpers ─────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Component ───────────────────────────────────

export function DataImporter({ store, fileHandle, onSuccess, onCancel }: DataImporterProps) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const fsaSupported = isFileSystemAccessSupported()

  // Handle files from FileDropZone
  const handleFiles = useCallback((dropped: File[]) => {
    const supported = dropped.filter(isFileSupported)
    if (supported.length === 0) return
    setFiles((prev) => [
      ...prev,
      ...supported.map((file) => ({ file, status: 'idle' as ImportStatus })),
    ])
  }, [])

  // File System Access API picker (persistent handle)
  const handlePickFile = useCallback(async () => {
    if (!fsaSupported) return
    const result = await fileHandle.openFilePicker()
    if (result && isFileSupported(result.file)) {
      setFiles((prev) => [
        ...prev,
        { file: result.file, status: 'idle' as ImportStatus, handle: result.handle },
      ])
    }
  }, [fsaSupported, fileHandle])

  // Remove a file from the list
  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Import all idle files
  const importFiles = useCallback(async () => {
    if (files.length === 0) return
    setIsProcessing(true)
    let lastSuccessId: string | undefined

    for (let i = 0; i < files.length; i++) {
      const entry = files[i]
      if (entry.status !== 'idle') continue

      // Mark importing
      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'importing' as ImportStatus } : f)),
      )

      try {
        const dataSource = await parseFile(entry.file)
        store.addDataSource(dataSource)
        lastSuccessId = dataSource.id

        // Store handle for auto-reconnect
        if (entry.handle) {
          try {
            await fileHandle.storeHandle(
              dataSource.id,
              entry.file,
              entry.handle as Parameters<typeof fileHandle.storeHandle>[2],
            )
          } catch {
            // Non-critical — handle storage failure doesn't block import
          }
        }

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'success' as ImportStatus, dataSourceId: dataSource.id } : f,
          ),
        )
      } catch (err) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: 'error' as ImportStatus, error: (err as Error).message }
              : f,
          ),
        )
      }
    }

    setIsProcessing(false)
    if (lastSuccessId) onSuccess?.(lastSuccessId)
  }, [files, store, fileHandle, onSuccess])

  const allDone = files.length > 0 && files.every((f) => f.status !== 'idle' && f.status !== 'importing')
  const hasIdleFiles = files.some((f) => f.status === 'idle')

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-dark-text-primary mb-4">Import Data</h2>

      {/* Drop zone */}
      <FileDropZone
        onFiles={handleFiles}
        accept={SUPPORTED_EXTENSIONS.join(',')}
        multiple
        label="Drop spreadsheet files here"
        description={`Supports ${SUPPORTED_EXTENSIONS.join(', ')}`}
      />

      {/* FSA picker button */}
      {fsaSupported && (
        <button
          onClick={handlePickFile}
          className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 text-sm
            bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg
            text-dark-text-muted transition-colors"
        >
          <Link size={14} />
          Pick file with auto-reconnect
        </button>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-xs font-medium text-dark-text-muted uppercase tracking-wider">
            Files to import
          </h3>

          {files.map((entry, index) => (
            <div
              key={`${entry.file.name}-${index}`}
              className="flex items-center gap-3 p-3 bg-dark-surface rounded-lg border border-dark-border"
            >
              {/* Status icon */}
              <div className="flex-shrink-0">
                {entry.status === 'idle' && <FileText size={18} className="text-dark-text-muted" />}
                {entry.status === 'importing' && (
                  <div className="w-[18px] h-[18px] border-2 border-[#F47B20] border-t-transparent rounded-full animate-spin" />
                )}
                {entry.status === 'success' && <Check size={18} className="text-green-400" />}
                {entry.status === 'error' && <AlertCircle size={18} className="text-red-400" />}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-dark-text-primary truncate">
                  {entry.file.name}
                </p>
                <p className="text-xs text-dark-text-muted">
                  {entry.error ?? formatFileSize(entry.file.size)}
                </p>
              </div>

              {/* Remove button */}
              {entry.status === 'idle' && (
                <button
                  onClick={() => removeFile(index)}
                  className="p-1 rounded hover:bg-white/[0.08] text-dark-text-muted"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg bg-white/[0.06] hover:bg-white/[0.1]
              text-dark-text-muted transition-colors"
          >
            Cancel
          </button>
        )}
        {hasIdleFiles && (
          <button
            onClick={importFiles}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[#F47B20] hover:bg-[#F47B20]/90
              text-white transition-colors disabled:opacity-50"
          >
            {isProcessing ? 'Importing...' : `Import ${files.filter((f) => f.status === 'idle').length} file(s)`}
          </button>
        )}
        {allDone && onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[#F47B20] hover:bg-[#F47B20]/90
              text-white transition-colors"
          >
            Done
          </button>
        )}
      </div>
    </div>
  )
}
