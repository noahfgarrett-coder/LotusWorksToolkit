import { useState, useCallback, useMemo } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { readFileAsText } from '@/utils/fileReader.ts'
import { downloadText } from '@/utils/download.ts'
import { Download, Search, ArrowUpDown, ArrowUp, ArrowDown, Copy, ChevronRight, ChevronDown, X } from 'lucide-react'

type SortDir = 'asc' | 'desc' | null
type ViewMode = 'table' | 'tree'

interface SortState {
  column: string
  direction: SortDir
}

export default function JsonCsvViewerTool() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawData, setRawData] = useState<string>('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState<SortState>({ column: '', direction: null })
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [jsonTree, setJsonTree] = useState<unknown>(null)
  const [isNested, setIsNested] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const parseCSV = useCallback((text: string) => {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return { columns: [] as string[], rows: [] as Record<string, string>[] }

    // Parse header
    const headers = parseCSVLine(lines[0])

    // Parse rows
    const dataRows = lines.slice(1).map((line) => {
      const values = parseCSVLine(line)
      const row: Record<string, string> = {}
      headers.forEach((h, i) => {
        row[h] = values[i] ?? ''
      })
      return row
    })

    return { columns: headers, rows: dataRows }
  }, [])

  const parseJSON = useCallback((text: string) => {
    const parsed = JSON.parse(text)

    // If it's an array of objects, treat as tabular
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      const allKeys = new Set<string>()
      parsed.forEach((item) => {
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach((k) => allKeys.add(k))
        }
      })
      const cols = Array.from(allKeys)

      // Check if any values are nested objects/arrays
      const hasNested = parsed.some((item) =>
        Object.values(item).some((v) => typeof v === 'object' && v !== null),
      )

      return { columns: cols, rows: parsed, isNested: hasNested, tree: parsed }
    }

    // Otherwise it's a non-tabular JSON - show as tree
    return { columns: [], rows: [], isNested: true, tree: parsed }
  }, [])

  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return

    setLoadError(null)

    let text: string
    try {
      text = await readFileAsText(file)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setLoadError(`Failed to read file: ${msg}`)
      return
    }

    setRawData(text)
    setFileName(file.name)
    setSearchQuery('')
    setSort({ column: '', direction: null })

    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'csv' || ext === 'tsv') {
      const result = parseCSV(text)
      setColumns(result.columns)
      setRows(result.rows)
      setJsonTree(null)
      setIsNested(false)
      setViewMode('table')
    } else {
      try {
        const result = parseJSON(text)
        setColumns(result.columns)
        setRows(result.rows)
        setJsonTree(result.tree)
        setIsNested(result.isNested)
        setViewMode(result.columns.length > 0 ? 'table' : 'tree')
      } catch {
        setColumns([])
        setRows([])
        setJsonTree(null)
        setIsNested(false)
        setLoadError('Invalid JSON — could not parse the file')
      }
    }
  }, [parseCSV, parseJSON])

  // Filter rows by search query
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows
    const q = searchQuery.toLowerCase()
    return rows.filter((row) =>
      Object.values(row).some((v) =>
        String(v ?? '').toLowerCase().includes(q),
      ),
    )
  }, [rows, searchQuery])

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sort.column || !sort.direction) return filteredRows
    return [...filteredRows].sort((a, b) => {
      const aVal = String(a[sort.column] ?? '')
      const bVal = String(b[sort.column] ?? '')
      // Try numeric comparison
      const aNum = Number(aVal)
      const bNum = Number(bVal)
      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sort.direction === 'asc' ? aNum - bNum : bNum - aNum
      }
      return sort.direction === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    })
  }, [filteredRows, sort])

  const handleSort = (column: string) => {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: 'asc' }
      if (prev.direction === 'asc') return { column, direction: 'desc' }
      return { column: '', direction: null }
    })
  }

  const handleExportCSV = () => {
    if (rows.length === 0) return
    const header = columns.join(',')
    const csvRows = sortedRows.map((row) =>
      columns.map((col) => {
        const val = String(row[col] ?? '')
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val
      }).join(','),
    )
    downloadText([header, ...csvRows].join('\n'), `${fileName?.replace(/\.[^.]+$/, '')}-export.csv`, 'text/csv')
  }

  const handleExportJSON = () => {
    const data = sortedRows.length > 0 ? sortedRows : jsonTree
    downloadText(
      JSON.stringify(data, null, 2),
      `${fileName?.replace(/\.[^.]+$/, '')}-export.json`,
      'application/json',
    )
  }

  const handleCopyToClipboard = async () => {
    const data = sortedRows.length > 0 ? sortedRows : jsonTree
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    } catch {
      // Clipboard API may not be available
    }
  }

  if (!fileName) {
    return (
      <div className="h-full flex flex-col gap-4">
        <FileDropZone
          onFiles={handleFiles}
          accept=".json,.csv,.tsv"
          multiple={false}
          label="Drop a JSON or CSV file"
          description="JSON, CSV, or TSV"
          className="h-full"
        />
        {loadError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400 flex-1">{loadError}</p>
            <button onClick={() => setLoadError(null)} className="p-1 rounded text-red-400/60 hover:text-red-400 transition-colors" aria-label="Dismiss error">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all columns..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-[#F47B20]/40"
          />
        </div>

        {/* Row count */}
        <span className="text-xs text-white/40">
          {filteredRows.length} / {rows.length} rows
        </span>

        {/* View mode toggle (only for nested JSON) */}
        {isNested && columns.length > 0 && (
          <div className="flex gap-1">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-[#F47B20] text-white'
                  : 'bg-white/[0.06] text-white/50 hover:text-white'
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                viewMode === 'tree'
                  ? 'bg-[#F47B20] text-white'
                  : 'bg-white/[0.06] text-white/50 hover:text-white'
              }`}
            >
              Tree
            </button>
          </div>
        )}

        {/* Export buttons */}
        <Button variant="secondary" size="sm" onClick={handleExportCSV} icon={<Download size={12} />} disabled={rows.length === 0}>
          CSV
        </Button>
        <Button variant="secondary" size="sm" onClick={handleExportJSON} icon={<Download size={12} />}>
          JSON
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCopyToClipboard} icon={<Copy size={12} />}>
          Copy
        </Button>

        {/* Load new file */}
        <button
          onClick={() => {
            setFileName(null)
            setRawData('')
            setRows([])
            setColumns([])
            setJsonTree(null)
          }}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          New file
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden rounded-lg border border-white/[0.06]">
        {viewMode === 'table' && columns.length > 0 ? (
          <div className="h-full overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-white/[0.06] backdrop-blur-sm">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider w-12">
                    #
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col}
                      onClick={() => handleSort(col)}
                      className="px-3 py-2 text-left text-[10px] font-semibold text-white/40 uppercase tracking-wider cursor-pointer hover:text-white/70 select-none whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        {col}
                        {sort.column === col ? (
                          sort.direction === 'asc' ? <ArrowUp size={10} className="text-[#F47B20]" /> : <ArrowDown size={10} className="text-[#F47B20]" />
                        ) : (
                          <ArrowUpDown size={10} className="opacity-30" />
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {sortedRows.map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.03] transition-colors">
                    <td className="px-3 py-1.5 text-xs text-white/20">{i + 1}</td>
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-1.5 text-white/80 whitespace-nowrap max-w-[300px] truncate">
                        {renderCellValue(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedRows.length === 0 && (
              <div className="flex items-center justify-center py-12 text-white/30 text-sm">
                {searchQuery ? 'No matching rows' : 'No data'}
              </div>
            )}
          </div>
        ) : viewMode === 'tree' && jsonTree ? (
          <div className="h-full overflow-auto p-4 font-mono text-sm">
            <JsonTreeNode value={jsonTree} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-white/30 text-sm">
            No tabular data found
          </div>
        )}
      </div>
    </div>
  )
}

function renderCellValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Parse a single CSV line respecting quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }
  result.push(current.trim())
  return result
}

/** Recursive JSON tree viewer */
function JsonTreeNode({ value, keyName, depth = 0 }: { value: unknown; keyName?: string; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (value === null) {
    return (
      <div className="flex gap-1" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && <span className="text-[#F47B20]">"{keyName}":</span>}
        <span className="text-white/40 italic">null</span>
      </div>
    )
  }

  if (typeof value === 'boolean') {
    return (
      <div className="flex gap-1" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && <span className="text-[#F47B20]">"{keyName}":</span>}
        <span className="text-purple-400">{String(value)}</span>
      </div>
    )
  }

  if (typeof value === 'number') {
    return (
      <div className="flex gap-1" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && <span className="text-[#F47B20]">"{keyName}":</span>}
        <span className="text-blue-400">{value}</span>
      </div>
    )
  }

  if (typeof value === 'string') {
    return (
      <div className="flex gap-1" style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && <span className="text-[#F47B20]">"{keyName}":</span>}
        <span className="text-emerald-400">"{value}"</span>
      </div>
    )
  }

  if (Array.isArray(value)) {
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 hover:text-white transition-colors text-white/70"
          aria-label={expanded ? `Collapse array ${keyName ?? ''}` : `Expand array ${keyName ?? ''}`}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {keyName !== undefined && <span className="text-[#F47B20]">"{keyName}":</span>}
          <span className="text-white/40">[{value.length}]</span>
        </button>
        {expanded && (
          <div>
            {value.map((item, i) => (
              <JsonTreeNode key={i} value={item} keyName={String(i)} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 hover:text-white transition-colors text-white/70"
          aria-label={expanded ? `Collapse object ${keyName ?? ''}` : `Expand object ${keyName ?? ''}`}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {keyName !== undefined && <span className="text-[#F47B20]">"{keyName}":</span>}
          <span className="text-white/40">{`{${entries.length}}`}</span>
        </button>
        {expanded && (
          <div>
            {entries.map(([k, v]) => (
              <JsonTreeNode key={k} value={v} keyName={k} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return null
}
