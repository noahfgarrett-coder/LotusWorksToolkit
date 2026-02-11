/**
 * DataTable — Virtual-scrolled data table with sorting, filtering,
 * conditional formatting, and column statistics.
 */

import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import type { SortingState, ColumnFiltersState } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { createPortal } from 'react-dom'
import {
  ArrowUp,
  ArrowDown,
  Search,
  X,
  Download,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  Filter,
  BarChart2,
} from 'lucide-react'
import type {
  Column,
  Row,
  ConditionalFormatRule,
  ConditionalFormatOperator,
  FilterGroup,
} from './types.ts'
import { exportToCSV } from './xlsxParser.ts'
import { filterRows } from './filterEngine.ts'
import { FilterBuilder } from './FilterBuilder.tsx'
import { downloadText } from '../../utils/download.ts'

// ── Types ───────────────────────────────────────

interface DataTableProps {
  columns: Column[]
  rows: Row[]
  name?: string
  conditionalFormats?: ConditionalFormatRule[]
  onConditionalFormatsChange?: (rules: ConditionalFormatRule[]) => void
}

// ── Helpers ─────────────────────────────────────

const columnHelper = createColumnHelper<Row>()

const TYPE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  string: Type,
  number: Hash,
  date: Calendar,
  boolean: ToggleLeft,
}

function interpolateColor(color1: string, color2: string, ratio: number): string {
  const hex = (c: string) => parseInt(c, 16)
  const r1 = hex(color1.slice(1, 3)), g1 = hex(color1.slice(3, 5)), b1 = hex(color1.slice(5, 7))
  const r2 = hex(color2.slice(1, 3)), g2 = hex(color2.slice(3, 5)), b2 = hex(color2.slice(5, 7))
  const r = Math.round(r1 + (r2 - r1) * ratio)
  const g = Math.round(g1 + (g2 - g1) * ratio)
  const b = Math.round(b1 + (b2 - b1) * ratio)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function evaluateValueRule(rule: ConditionalFormatRule, value: unknown): boolean {
  const op = rule.operator as ConditionalFormatOperator | undefined
  if (!op) return false
  if (op === 'isEmpty') return value == null || String(value).trim() === ''
  if (op === 'isNotEmpty') return value != null && String(value).trim() !== ''
  if (value == null) return false
  if (op === 'contains') return String(value).toLowerCase().includes(String(rule.value ?? '').toLowerCase())

  const numValue = typeof value === 'number' ? value : parseFloat(String(value))
  const ruleValue = typeof rule.value === 'number' ? rule.value : parseFloat(String(rule.value ?? ''))

  if (isNaN(numValue) || isNaN(ruleValue)) {
    if (op === '=') return String(value) === String(rule.value)
    if (op === '!=') return String(value) !== String(rule.value)
    return false
  }

  switch (op) {
    case '>': return numValue > ruleValue
    case '<': return numValue < ruleValue
    case '>=': return numValue >= ruleValue
    case '<=': return numValue <= ruleValue
    case '=': return numValue === ruleValue
    case '!=': return numValue !== ruleValue
    default: return false
  }
}

// ── Column Stats ────────────────────────────────

interface ColumnStats {
  count: number
  nullCount: number
  uniqueCount: number
  sum?: number
  avg?: number
  min?: number
  max?: number
  median?: number
  mostCommon?: { value: string; count: number }
  minDate?: string
  maxDate?: string
  trueCount?: number
  falseCount?: number
}

function computeColumnStats(rows: Row[], col: Column): ColumnStats {
  let nullCount = 0
  const values: unknown[] = []

  for (const row of rows) {
    const val = row[col.id]
    if (val == null || (typeof val === 'string' && val.trim() === '')) {
      nullCount++
    } else {
      values.push(val)
    }
  }

  const uniqueCount = new Set(values.map(String)).size
  const stats: ColumnStats = { count: rows.length, nullCount, uniqueCount }

  if (col.type === 'number') {
    const nums = values
      .map((v) => (typeof v === 'number' ? v : parseFloat(String(v))))
      .filter((n) => !isNaN(n))
    if (nums.length > 0) {
      stats.sum = nums.reduce((a, b) => a + b, 0)
      stats.avg = stats.sum / nums.length
      stats.min = Math.min(...nums)
      stats.max = Math.max(...nums)
      const sorted = [...nums].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      stats.median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }
  }

  if (col.type === 'string') {
    const freq = new Map<string, number>()
    for (const v of values) {
      const s = String(v)
      freq.set(s, (freq.get(s) ?? 0) + 1)
    }
    let best: { value: string; count: number } | undefined
    for (const [value, count] of freq) {
      if (!best || count > best.count) best = { value, count }
    }
    stats.mostCommon = best
  }

  if (col.type === 'date') {
    const dates = values
      .map((v) => new Date(String(v)))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
    if (dates.length > 0) {
      stats.minDate = dates[0].toLocaleDateString()
      stats.maxDate = dates[dates.length - 1].toLocaleDateString()
    }
  }

  if (col.type === 'boolean') {
    stats.trueCount = values.filter((v) => v === true || v === 'true' || v === 1).length
    stats.falseCount = values.length - stats.trueCount
  }

  return stats
}

// ── Stats Popup ─────────────────────────────────

function StatRow({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-dark-text-muted">{label}</span>
      <span className={`font-mono text-dark-text-primary ${truncate ? 'truncate max-w-[120px]' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function ColumnStatsPopup({
  col,
  stats,
  position,
  onClose,
}: {
  col: Column
  stats: ColumnStats
  position: { x: number; y: number }
  onClose: () => void
}) {
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 260),
    top: Math.min(position.y, window.innerHeight - 300),
    zIndex: 9999,
  }

  const fmt = (n: number | undefined) => {
    if (n === undefined) return '\u2014'
    return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }

  return createPortal(
    <div
      ref={popupRef}
      style={style}
      className="w-56 bg-dark-surface rounded-lg shadow-xl border border-dark-border overflow-hidden"
    >
      <div className="px-3 py-2 bg-white/[0.04] border-b border-dark-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-dark-text-primary truncate">{col.name}</span>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-white/[0.08]">
            <X size={14} className="text-dark-text-muted" />
          </button>
        </div>
        <span className="text-xs text-dark-text-muted capitalize">{col.type}</span>
      </div>

      <div className="p-3 space-y-1.5 text-xs">
        <StatRow label="Count" value={stats.count.toLocaleString()} />
        <StatRow label="Null / Empty" value={stats.nullCount.toLocaleString()} />
        <StatRow label="Unique" value={stats.uniqueCount.toLocaleString()} />

        {col.type === 'number' && (
          <>
            <div className="border-t border-dark-border my-1.5" />
            <StatRow label="Sum" value={fmt(stats.sum)} />
            <StatRow label="Average" value={fmt(stats.avg)} />
            <StatRow label="Median" value={fmt(stats.median)} />
            <StatRow label="Min" value={fmt(stats.min)} />
            <StatRow label="Max" value={fmt(stats.max)} />
          </>
        )}

        {col.type === 'string' && stats.mostCommon && (
          <>
            <div className="border-t border-dark-border my-1.5" />
            <StatRow
              label="Most Common"
              value={`${stats.mostCommon.value} (${stats.mostCommon.count})`}
              truncate
            />
          </>
        )}

        {col.type === 'date' && (
          <>
            <div className="border-t border-dark-border my-1.5" />
            <StatRow label="Earliest" value={stats.minDate ?? '\u2014'} />
            <StatRow label="Latest" value={stats.maxDate ?? '\u2014'} />
          </>
        )}

        {col.type === 'boolean' && (
          <>
            <div className="border-t border-dark-border my-1.5" />
            <StatRow label="True" value={(stats.trueCount ?? 0).toLocaleString()} />
            <StatRow label="False" value={(stats.falseCount ?? 0).toLocaleString()} />
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ── Main Component ──────────────────────────────

export function DataTable({
  columns,
  rows,
  name = 'data',
  conditionalFormats = [],
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [advancedFilter, setAdvancedFilter] = useState<FilterGroup | null>(null)
  const [showFilterBuilder, setShowFilterBuilder] = useState(false)
  const [statsColumnId, setStatsColumnId] = useState<string | null>(null)
  const [statsPosition, setStatsPosition] = useState({ x: 0, y: 0 })

  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Apply advanced filter
  const filteredRows = useMemo(() => {
    if (!advancedFilter || advancedFilter.children.length === 0) return rows
    return filterRows(rows, columns, advancedFilter)
  }, [rows, columns, advancedFilter])

  // Compute min/max for color scale rules
  const colorScaleStats = useMemo(() => {
    const scaleRules = conditionalFormats.filter((r) => r.type === 'colorScale')
    if (scaleRules.length === 0) return new Map<string, { min: number; max: number }>()

    const stats = new Map<string, { min: number; max: number }>()
    const colIds = new Set(scaleRules.map((r) => r.columnId))

    for (const colId of colIds) {
      let min = Infinity
      let max = -Infinity
      for (const row of rows) {
        const val = row[colId]
        if (val == null) continue
        const num = typeof val === 'number' ? val : parseFloat(String(val))
        if (isNaN(num)) continue
        if (num < min) min = num
        if (num > max) max = num
      }
      if (min !== Infinity && max !== -Infinity) {
        stats.set(colId, { min, max })
      }
    }
    return stats
  }, [rows, conditionalFormats])

  // Cell style from conditional format rules
  const getCellStyle = useCallback(
    (columnId: string, value: unknown): React.CSSProperties | undefined => {
      if (conditionalFormats.length === 0) return undefined
      const rulesForCol = conditionalFormats.filter((r) => r.columnId === columnId)
      if (rulesForCol.length === 0) return undefined

      // Color scale first
      for (const rule of rulesForCol) {
        if (rule.type === 'colorScale') {
          const s = colorScaleStats.get(columnId)
          if (!s || s.min === s.max) continue
          const num = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
          if (isNaN(num)) continue
          const ratio = (num - s.min) / (s.max - s.min)
          const bg = interpolateColor(rule.minColor ?? '#22c55e', rule.maxColor ?? '#ef4444', ratio)
          const r = parseInt(bg.slice(1, 3), 16)
          const g = parseInt(bg.slice(3, 5), 16)
          const b = parseInt(bg.slice(5, 7), 16)
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
          return { backgroundColor: bg, color: luminance > 0.5 ? '#1f2937' : '#f9fafb' }
        }
      }

      // Value rules (first match wins)
      for (const rule of rulesForCol) {
        if (rule.type === 'valueRule' && evaluateValueRule(rule, value)) {
          return { backgroundColor: rule.backgroundColor, color: rule.textColor }
        }
      }

      return undefined
    },
    [conditionalFormats, colorScaleStats],
  )

  // Column stats popup
  const statsColumn = statsColumnId ? columns.find((c) => c.id === statsColumnId) : null
  const computedStats = useMemo(() => {
    if (!statsColumn) return null
    return computeColumnStats(filteredRows, statsColumn)
  }, [statsColumn, filteredRows])

  const handleStatsClick = useCallback(
    (colId: string, event: React.MouseEvent) => {
      event.stopPropagation()
      if (statsColumnId === colId) {
        setStatsColumnId(null)
      } else {
        setStatsColumnId(colId)
        setStatsPosition({ x: event.clientX, y: event.clientY + 8 })
      }
    },
    [statsColumnId],
  )

  // Table columns
  const tableColumns = useMemo(() => {
    return columns.map((col) => {
      const TypeIcon = TYPE_ICONS[col.type] ?? Type

      return columnHelper.accessor((row) => row[col.id], {
        id: col.id,
        header: ({ column }) => (
          <div
            className="flex items-center gap-2 cursor-pointer select-none group"
            onClick={() => column.toggleSorting()}
          >
            <TypeIcon size={14} className="text-dark-text-muted flex-shrink-0" />
            <span className="truncate">{col.name}</span>
            {column.getIsSorted() === 'asc' && <ArrowUp size={14} />}
            {column.getIsSorted() === 'desc' && <ArrowDown size={14} />}
            <button
              onClick={(e) => handleStatsClick(col.id, e)}
              className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100
                hover:bg-white/[0.1] transition-opacity"
              title="Column statistics"
            >
              <BarChart2 size={12} className="text-dark-text-muted" />
            </button>
          </div>
        ),
        cell: ({ getValue }) => {
          const value = getValue()
          if (value == null) return <span className="text-dark-text-muted">&mdash;</span>

          if (col.type === 'boolean') {
            return (
              <span className={value ? 'text-green-400' : 'text-red-400'}>
                {value ? 'Yes' : 'No'}
              </span>
            )
          }

          if (col.type === 'number') {
            const num = typeof value === 'number' ? value : parseFloat(String(value))
            return (
              <span className="font-mono tabular-nums">
                {isNaN(num) ? String(value) : num.toLocaleString()}
              </span>
            )
          }

          if (col.type === 'date') {
            try {
              const date = new Date(String(value))
              return <span className="font-mono tabular-nums">{date.toLocaleDateString()}</span>
            } catch {
              return <>{String(value)}</>
            }
          }

          return <span className="truncate">{String(value)}</span>
        },
        filterFn: 'includesString',
      })
    })
  }, [columns, handleStatsClick])

  // Table instance
  const table = useReactTable({
    data: filteredRows,
    columns: tableColumns,
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const displayedRowCount = table.getFilteredRowModel().rows.length
  const hasAdvancedFilter = advancedFilter !== null && advancedFilter.children.length > 0

  // Virtual scrolling
  const tableRows = table.getRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 36,
    overscan: 20,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()

  // Export filtered CSV
  const handleExport = useCallback(() => {
    const csvContent = exportToCSV(
      columns,
      table.getFilteredRowModel().rows.map((r) => r.original),
    )
    downloadText(csvContent, `${name}.csv`, 'text/csv')
  }, [columns, table, name])

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 p-3 border-b border-dark-border bg-dark-surface">
        <div className="flex items-center justify-between gap-3">
          {/* Global search */}
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-text-muted" />
            <input
              type="text"
              placeholder="Search all columns..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-sm bg-white/[0.04] border border-dark-border rounded-lg
                text-dark-text-primary placeholder:text-dark-text-muted/50
                focus:outline-none focus:border-[#F47B20]/50"
            />
            {globalFilter && (
              <button
                onClick={() => setGlobalFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-white/[0.08]"
              >
                <X size={14} className="text-dark-text-muted" />
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilterBuilder(!showFilterBuilder)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                hasAdvancedFilter
                  ? 'bg-[#F47B20]/20 text-[#F47B20]'
                  : 'bg-white/[0.06] text-dark-text-muted hover:bg-white/[0.1]'
              }`}
            >
              <Filter size={14} />
              Filter
              {hasAdvancedFilter && (
                <span className="ml-0.5 px-1.5 py-0.5 bg-[#F47B20]/30 rounded text-xs">
                  {advancedFilter.children.length}
                </span>
              )}
            </button>

            <span className="text-xs text-dark-text-muted">
              {displayedRowCount === rows.length
                ? `${rows.length.toLocaleString()} rows`
                : `${displayedRowCount.toLocaleString()} / ${rows.length.toLocaleString()}`}
            </span>

            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg
                text-dark-text-muted hover:text-dark-text-primary hover:bg-white/[0.06] transition-colors"
              title="Export filtered data as CSV"
            >
              <Download size={14} />
              Export
            </button>
          </div>
        </div>

        {/* Filter builder panel */}
        {showFilterBuilder && (
          <div className="mt-3">
            <FilterBuilder
              columns={columns}
              rows={rows}
              filter={advancedFilter}
              onChange={setAdvancedFilter}
              onClose={() => setShowFilterBuilder(false)}
            />
          </div>
        )}
      </div>

      {/* Table container */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        <table className="min-w-full">
          <thead className="sticky top-0 z-10 bg-dark-surface">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium
                      text-dark-text-muted border-b border-dark-border"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="text-center py-12 text-dark-text-muted"
                >
                  {globalFilter || columnFilters.length > 0 || hasAdvancedFilter
                    ? 'No matching rows found'
                    : 'No data'}
                </td>
              </tr>
            ) : (
              <>
                {virtualRows.length > 0 && virtualRows[0].start > 0 && (
                  <tr>
                    <td
                      style={{ height: `${virtualRows[0].start}px`, padding: 0, border: 'none' }}
                      colSpan={columns.length}
                    />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const row = tableRows[virtualRow.index]
                  return (
                    <tr
                      key={row.id}
                      className="hover:bg-white/[0.03] transition-colors"
                    >
                      {row.getVisibleCells().map((cell) => {
                        const cellStyle = getCellStyle(cell.column.id, cell.getValue())
                        return (
                          <td
                            key={cell.id}
                            className="px-3 py-1.5 text-sm text-dark-text-primary border-b border-dark-border/50 max-w-xs"
                            style={cellStyle}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
                {virtualRows.length > 0 &&
                  totalSize - virtualRows[virtualRows.length - 1].end > 0 && (
                    <tr>
                      <td
                        style={{
                          height: `${totalSize - virtualRows[virtualRows.length - 1].end}px`,
                          padding: 0,
                          border: 'none',
                        }}
                        colSpan={columns.length}
                      />
                    </tr>
                  )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-2 border-t border-dark-border bg-dark-surface text-xs text-dark-text-muted">
        <div className="flex items-center gap-4">
          <span>{columns.length} columns</span>
          <span className="flex items-center gap-1">
            <Hash size={12} />
            {columns.filter((c) => c.type === 'number').length} numeric
          </span>
          <span className="flex items-center gap-1">
            <Type size={12} />
            {columns.filter((c) => c.type === 'string').length} text
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {columns.filter((c) => c.type === 'date').length} date
          </span>
        </div>
      </div>

      {/* Column stats popup */}
      {statsColumn && computedStats && (
        <ColumnStatsPopup
          col={statsColumn}
          stats={computedStats}
          position={statsPosition}
          onClose={() => setStatsColumnId(null)}
        />
      )}
    </div>
  )
}
