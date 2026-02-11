/**
 * TableDataSelector — Interactive table for selecting chart axes and filters.
 * Three selection modes: X-Axis (click column headers), Y-Axis (click column headers),
 * Filter (click cells to create filter conditions with operator confirmation).
 * Uses @tanstack/react-virtual for smooth scrolling across large datasets.
 */

import { useState, useMemo, useCallback, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  X, Check, Filter, ArrowRight, Pencil,
  Columns3, Rows3, MousePointerClick, ChevronDown,
} from 'lucide-react'
import type { Column, Row, FilterCondition, FilterGroup, FilterOperator } from './types.ts'
import { OPERATOR_LABELS } from './types.ts'

// ── Types ───────────────────────────────────────

interface TableDataSelectorProps {
  columns: Column[]
  rows: Row[]
  /** Currently selected X-axis column */
  xColumn?: string
  /** Currently selected Y-axis column */
  yColumn?: string
  /** Current filter conditions */
  filters?: FilterGroup
  /** Callback when X column is selected */
  onXColumnSelect?: (columnId: string) => void
  /** Callback when Y column is selected */
  onYColumnSelect?: (columnId: string) => void
  /** Callback when a filter condition is added */
  onAddFilter?: (condition: FilterCondition) => void
  /** Callback when a filter is removed */
  onRemoveFilter?: (filterId: string) => void
  /** Callback when a filter is updated */
  onUpdateFilter?: (filterId: string, updates: Partial<FilterCondition>) => void
  /** Close / apply handler */
  onClose: () => void
}

type SelectionMode = 'x-axis' | 'y-axis' | 'filter'

// ── Row limit options ───────────────────────────

type RowLimit = 'all' | '100' | '500' | '1000' | '5000'
const ROW_LIMIT_OPTIONS: Array<{ value: RowLimit; label: string }> = [
  { value: 'all', label: 'All rows' },
  { value: '100', label: '100 rows' },
  { value: '500', label: '500 rows' },
  { value: '1000', label: '1,000 rows' },
  { value: '5000', label: '5,000 rows' },
]

function resolveRowLimit(limit: RowLimit, total: number): number {
  if (limit === 'all') return total
  return Math.min(Number(limit), total)
}

// ── Operator subsets for the confirmation bar ───

const NUMERIC_OPERATORS: FilterOperator[] = ['=', '!=', '>', '<', '>=', '<=']
const STRING_OPERATORS: FilterOperator[] = ['=', '!=', 'contains', 'starts_with']

function getOperatorsForValue(
  value: string | number | boolean | null,
  colType: string,
): FilterOperator[] {
  if (colType === 'number' || typeof value === 'number') return NUMERIC_OPERATORS
  return STRING_OPERATORS
}

// ── Constants ───────────────────────────────────

const ROW_HEIGHT = 32
const OVERSCAN = 40
const COL_MIN_WIDTH = 90
const COL_MAX_WIDTH = 240
const COL_CHAR_WIDTH = 7.5 // approx px per char at text-xs
const SAMPLE_SIZE = 30 // rows to sample for width estimation

// ── Component ───────────────────────────────────

export function TableDataSelector({
  columns,
  rows,
  xColumn,
  yColumn,
  filters,
  onXColumnSelect,
  onYColumnSelect,
  onAddFilter,
  onRemoveFilter,
  onUpdateFilter,
  onClose,
}: TableDataSelectorProps) {
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('x-axis')
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{ col: string; row: number } | null>(null)
  const [pendingFilter, setPendingFilter] = useState<{
    column: string
    value: string | number | boolean | null
    columnName: string
    columnType: string
  } | null>(null)
  const [editingFilter, setEditingFilter] = useState<string | null>(null)
  const [rowLimit, setRowLimit] = useState<RowLimit>('all')

  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Displayed rows based on limit
  const displayRowCount = resolveRowLimit(rowLimit, rows.length)
  const displayRows = useMemo(
    () => (displayRowCount === rows.length ? rows : rows.slice(0, displayRowCount)),
    [rows, displayRowCount],
  )

  // Compute smart column widths by sampling data
  const columnWidths = useMemo(() => {
    const widths = new Map<string, number>()
    for (const col of columns) {
      // Start with header name length (+ padding for type badge and axis badge)
      let maxLen = col.name.length + 4

      // Sample rows for content length
      const sampleCount = Math.min(SAMPLE_SIZE, displayRows.length)
      for (let i = 0; i < sampleCount; i++) {
        const val = displayRows[i][col.id]
        if (val !== null && val !== undefined) {
          const strLen = typeof val === 'number'
            ? val.toLocaleString().length
            : String(val).length
          if (strLen > maxLen) maxLen = strLen
        }
      }

      const estimatedWidth = Math.round(maxLen * COL_CHAR_WIDTH) + 32 // 32px for padding
      widths.set(col.id, Math.max(COL_MIN_WIDTH, Math.min(COL_MAX_WIDTH, estimatedWidth)))
    }
    return widths
  }, [columns, displayRows])

  // Virtual scrolling
  const rowVirtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  })

  // Get all filter conditions from the filter group
  const filterConditions = useMemo(() => {
    if (!filters) return []
    return filters.children.filter((c): c is FilterCondition => c.type === 'condition')
  }, [filters])

  const getColumnName = useCallback(
    (columnId: string) => columns.find((c) => c.id === columnId)?.name ?? columnId,
    [columns],
  )

  // ── Column click (axis selection) ──────────────

  const handleColumnClick = useCallback(
    (columnId: string) => {
      if (selectionMode === 'x-axis' && onXColumnSelect) {
        onXColumnSelect(columnId)
        setSelectionMode('y-axis')
      } else if (selectionMode === 'y-axis' && onYColumnSelect) {
        onYColumnSelect(columnId)
      }
    },
    [selectionMode, onXColumnSelect, onYColumnSelect],
  )

  // ── Cell click (filter creation) ───────────────

  const handleCellClick = useCallback(
    (columnId: string, value: unknown) => {
      if (selectionMode !== 'filter') return
      const col = columns.find((c) => c.id === columnId)
      if (!col) return

      const filterValue: string | number | boolean | null =
        value === null || value === undefined
          ? null
          : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
            ? value
            : String(value)

      setPendingFilter({
        column: columnId,
        value: filterValue,
        columnName: col.name,
        columnType: col.type,
      })
    },
    [selectionMode, columns],
  )

  // ── Confirm pending filter with operator ───────

  const confirmFilter = useCallback(
    (operator: FilterOperator) => {
      if (!pendingFilter || !onAddFilter) return
      const condition: FilterCondition = {
        id: crypto.randomUUID(),
        type: 'condition',
        column: pendingFilter.column,
        operator,
        value: pendingFilter.value,
      }
      onAddFilter(condition)
      setPendingFilter(null)
    },
    [pendingFilter, onAddFilter],
  )

  // ── Visual highlights ──────────────────────────

  const getColumnHighlight = useCallback(
    (columnId: string) => {
      if (columnId === xColumn) return 'bg-blue-500/15 border-b-2 border-b-blue-400'
      if (columnId === yColumn) return 'bg-emerald-500/15 border-b-2 border-b-emerald-400'
      if (hoveredColumn === columnId && selectionMode !== 'filter') {
        return selectionMode === 'x-axis' ? 'bg-blue-500/8' : 'bg-emerald-500/8'
      }
      return ''
    },
    [xColumn, yColumn, hoveredColumn, selectionMode],
  )

  const getCellHighlight = useCallback(
    (columnId: string, rowIndex: number, value: unknown) => {
      if (filters) {
        const hasFilter = filters.children.some(
          (c): c is FilterCondition =>
            c.type === 'condition' && c.column === columnId && c.value === value,
        )
        if (hasFilter) return 'bg-amber-500/15 ring-1 ring-inset ring-amber-500/40'
      }

      if (
        selectionMode === 'filter' &&
        hoveredCell?.col === columnId &&
        hoveredCell?.row === rowIndex
      ) {
        return 'bg-amber-500/10 cursor-pointer'
      }

      return ''
    },
    [filters, selectionMode, hoveredCell],
  )

  // ── Mode instructions ──────────────────────────

  const modeInstruction: Record<SelectionMode, string> = {
    'x-axis':
      'Click a column header to select it as the X-axis (category). Any type works with Count aggregation.',
    'y-axis':
      'Click a column header to select it as the Y-axis (value). Any type works with Count aggregation.',
    filter: 'Click any cell to create a filter condition using that value.',
  }

  // ── Operators for the edit panel ───────────────

  const editOperators: FilterOperator[] = [
    '=', '!=', '>', '<', '>=', '<=', 'contains', 'starts_with',
  ]

  // ── Virtual row items ──────────────────────────

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalHeight = rowVirtualizer.getTotalSize()

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#12121a] border border-white/[0.1] rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* ── Header ──────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-dark-text-primary">
              Select Data from Table
            </h2>
            <p className="text-sm text-dark-text-muted">
              {rows.length.toLocaleString()} rows &middot; {columns.length} columns
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Row limit dropdown */}
            <div className="relative">
              <select
                value={rowLimit}
                onChange={(e) => setRowLimit(e.target.value as RowLimit)}
                className="appearance-none pl-3 pr-7 py-1.5 text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg text-dark-text-muted focus:outline-none focus:border-[#F47B20]/50 cursor-pointer"
              >
                {ROW_LIMIT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value === 'all'
                      ? `All rows (${rows.length.toLocaleString()})`
                      : opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-text-muted/50 pointer-events-none"
              />
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <X size={20} className="text-dark-text-muted" />
            </button>
          </div>
        </div>

        {/* ── Mode selector ───────────────────────── */}
        <div className="px-6 py-3 bg-white/[0.02] border-b border-white/[0.06] flex-shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-xs text-dark-text-muted uppercase tracking-wide">Mode</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectionMode('x-axis')}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-all flex items-center gap-1.5 ${
                  selectionMode === 'x-axis'
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                    : 'border-white/[0.08] text-dark-text-muted hover:border-white/[0.15]'
                }`}
              >
                <Columns3 size={14} />
                X-Axis
                {xColumn && <Check size={12} className="text-blue-400" />}
              </button>

              <button
                onClick={() => setSelectionMode('y-axis')}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-all flex items-center gap-1.5 ${
                  selectionMode === 'y-axis'
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/[0.08] text-dark-text-muted hover:border-white/[0.15]'
                }`}
              >
                <Rows3 size={14} />
                Y-Axis
                {yColumn && <Check size={12} className="text-emerald-400" />}
              </button>

              <button
                onClick={() => setSelectionMode('filter')}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-all flex items-center gap-1.5 ${
                  selectionMode === 'filter'
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                    : 'border-white/[0.08] text-dark-text-muted hover:border-white/[0.15]'
                }`}
              >
                <Filter size={14} />
                Add Filter
                {filterConditions.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 rounded-full">
                    {filterConditions.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Selection status badges */}
          <div className="flex items-center gap-4 mt-2">
            {xColumn && (
              <span className="flex items-center gap-1.5 text-xs text-blue-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
                X: {getColumnName(xColumn)}
              </span>
            )}
            {yColumn && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                Y: {getColumnName(yColumn)}
              </span>
            )}
          </div>
        </div>

        {/* ── Active filters panel ────────────────── */}
        {filterConditions.length > 0 && (
          <div className="px-6 py-3 bg-amber-500/[0.05] border-b border-amber-500/20 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-amber-300">
                Active Filters ({filterConditions.length})
              </span>
              {onRemoveFilter && (
                <button
                  onClick={() => filterConditions.forEach((f) => onRemoveFilter(f.id))}
                  className="text-[10px] text-amber-400/70 hover:text-amber-300 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {filterConditions.map((filter) => (
                <div
                  key={filter.id}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${
                    editingFilter === filter.id
                      ? 'bg-amber-500/20 ring-1 ring-amber-500/50'
                      : 'bg-amber-500/10'
                  }`}
                >
                  <span className="font-medium text-amber-200">
                    {getColumnName(filter.column)}
                  </span>
                  <span className="text-amber-400/70">
                    {OPERATOR_LABELS[filter.operator]}
                  </span>
                  <span className="text-amber-200 font-mono">
                    &quot;{String(filter.value)}&quot;
                  </span>
                  {onUpdateFilter && (
                    <button
                      onClick={() =>
                        setEditingFilter(editingFilter === filter.id ? null : filter.id)
                      }
                      className="p-0.5 rounded hover:bg-amber-500/20 text-amber-400/70 transition-colors"
                      title="Edit operator"
                    >
                      <Pencil size={10} />
                    </button>
                  )}
                  {onRemoveFilter && (
                    <button
                      onClick={() => onRemoveFilter(filter.id)}
                      className="p-0.5 rounded hover:bg-red-500/20 text-red-400/70 transition-colors"
                      title="Remove"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Edit operator inline panel */}
            {editingFilter && onUpdateFilter && (() => {
              const filter = filterConditions.find((f) => f.id === editingFilter)
              if (!filter) return null
              return (
                <div className="mt-3 p-3 bg-white/[0.03] rounded-lg border border-amber-500/20">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-dark-text-muted uppercase tracking-wide">Operator:</span>
                    {editOperators.map((op) => (
                      <button
                        key={op}
                        onClick={() => {
                          onUpdateFilter(filter.id, { operator: op })
                          setEditingFilter(null)
                        }}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          filter.operator === op
                            ? 'bg-amber-500 text-white'
                            : 'bg-white/[0.06] text-dark-text-muted hover:bg-white/[0.1]'
                        }`}
                      >
                        {OPERATOR_LABELS[op]}
                      </button>
                    ))}
                    <button
                      onClick={() => setEditingFilter(null)}
                      className="ml-auto text-[10px] text-dark-text-muted hover:text-dark-text-primary transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Instruction bar ─────────────────────── */}
        <div className="px-6 py-2 bg-white/[0.02] border-b border-white/[0.04] flex-shrink-0">
          <p className="text-xs text-dark-text-muted flex items-center gap-1.5">
            <MousePointerClick size={12} className="text-dark-text-muted/60" />
            {modeInstruction[selectionMode]}
          </p>
        </div>

        {/* ── Virtualized table ───────────────────── */}
        <div ref={tableContainerRef} className="flex-1 overflow-auto min-h-0">
          <table className="text-xs border-collapse" style={{ tableLayout: 'auto' }}>
            <colgroup>
              <col style={{ width: 48, minWidth: 48 }} />
              {columns.map((col) => (
                <col
                  key={col.id}
                  style={{ width: columnWidths.get(col.id), minWidth: COL_MIN_WIDTH, maxWidth: COL_MAX_WIDTH }}
                />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#161622]">
                <th
                  className="px-2 py-2 text-left text-[10px] font-medium text-dark-text-muted border-b border-r border-white/[0.06]"
                >
                  #
                </th>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    onClick={() => selectionMode !== 'filter' && handleColumnClick(col.id)}
                    onMouseEnter={() => setHoveredColumn(col.id)}
                    onMouseLeave={() => setHoveredColumn(null)}
                    className={`px-3 py-1.5 text-left border-b border-r border-white/[0.06] transition-colors whitespace-nowrap ${
                      selectionMode !== 'filter' ? 'cursor-pointer hover:bg-white/[0.04]' : ''
                    } ${getColumnHighlight(col.id)}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-dark-text-primary leading-tight">{col.name}</div>
                        <div className="text-[9px] text-dark-text-muted/40 uppercase tracking-wider font-normal leading-tight">{col.type}</div>
                      </div>
                      {col.id === xColumn && (
                        <span className="ml-auto px-1 py-0.5 text-[9px] font-bold bg-blue-500 text-white rounded flex-shrink-0">
                          X
                        </span>
                      )}
                      {col.id === yColumn && (
                        <span className="ml-auto px-1 py-0.5 text-[9px] font-bold bg-emerald-500 text-white rounded flex-shrink-0">
                          Y
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Top spacer */}
              {virtualRows.length > 0 && virtualRows[0].start > 0 && (
                <tr>
                  <td
                    style={{ height: virtualRows[0].start, padding: 0, border: 'none' }}
                    colSpan={columns.length + 1}
                  />
                </tr>
              )}

              {/* Virtual rows */}
              {virtualRows.map((virtualRow) => {
                const rowIndex = virtualRow.index
                const row = displayRows[rowIndex]
                return (
                  <tr
                    key={rowIndex}
                    className="hover:bg-white/[0.02] transition-colors"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <td className="px-2 py-1 text-[10px] text-dark-text-muted/50 border-b border-r border-white/[0.04] tabular-nums text-right">
                      {rowIndex + 1}
                    </td>
                    {columns.map((col) => {
                      const value = row[col.id]
                      const colWidth = columnWidths.get(col.id) ?? COL_MIN_WIDTH
                      return (
                        <td
                          key={col.id}
                          onClick={() => handleCellClick(col.id, value)}
                          onMouseEnter={() =>
                            selectionMode === 'filter' &&
                            setHoveredCell({ col: col.id, row: rowIndex })
                          }
                          onMouseLeave={() => setHoveredCell(null)}
                          className={`px-3 py-1 border-b border-r border-white/[0.04] text-dark-text-secondary transition-colors ${getCellHighlight(
                            col.id,
                            rowIndex,
                            value,
                          )}`}
                          style={{ maxWidth: colWidth }}
                        >
                          <div className="overflow-hidden text-ellipsis whitespace-nowrap" title={value != null ? String(value) : undefined}>
                            {value === null || value === undefined ? (
                              <span className="text-dark-text-muted/30 italic">null</span>
                            ) : typeof value === 'number' ? (
                              <span className="font-mono tabular-nums">
                                {value.toLocaleString()}
                              </span>
                            ) : typeof value === 'boolean' ? (
                              <span className={value ? 'text-emerald-400' : 'text-red-400'}>
                                {value ? 'true' : 'false'}
                              </span>
                            ) : (
                              String(value)
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* Bottom spacer */}
              {virtualRows.length > 0 &&
                totalHeight - virtualRows[virtualRows.length - 1].end > 0 && (
                  <tr>
                    <td
                      style={{
                        height: totalHeight - virtualRows[virtualRows.length - 1].end,
                        padding: 0,
                        border: 'none',
                      }}
                      colSpan={columns.length + 1}
                    />
                  </tr>
                )}
            </tbody>
          </table>
        </div>

        {/* ── Row count indicator ─────────────────── */}
        {displayRowCount < rows.length && (
          <div className="px-6 py-1.5 text-[10px] text-dark-text-muted/50 text-center bg-white/[0.02] border-t border-white/[0.04] flex-shrink-0">
            Showing {displayRowCount.toLocaleString()} of {rows.length.toLocaleString()} rows
          </div>
        )}

        {/* ── Pending filter confirmation bar ──────── */}
        {pendingFilter && (
          <div className="px-6 py-3 bg-amber-500/[0.08] border-t border-amber-500/20 flex-shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="text-amber-300 flex-shrink-0">Create filter:</span>
                <span className="font-medium text-dark-text-primary truncate">
                  {pendingFilter.columnName}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => confirmFilter('=')}
                  className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium"
                >
                  = &quot;{String(pendingFilter.value).slice(0, 20)}&quot;
                </button>

                {getOperatorsForValue(pendingFilter.value, pendingFilter.columnType)
                  .filter((op) => op !== '=')
                  .slice(0, 4)
                  .map((op) => (
                    <button
                      key={op}
                      onClick={() => confirmFilter(op)}
                      className="px-2.5 py-1.5 text-xs bg-white/[0.06] hover:bg-white/[0.1] text-dark-text-muted rounded-lg transition-colors"
                    >
                      {OPERATOR_LABELS[op]}
                    </button>
                  ))}

                <button
                  onClick={() => setPendingFilter(null)}
                  className="p-1.5 rounded-lg hover:bg-amber-500/20 text-amber-400/70 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ──────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] bg-white/[0.02] flex-shrink-0">
          <div className="text-sm">
            {xColumn && yColumn ? (
              <span className="flex items-center gap-2 text-emerald-400">
                <Check size={16} />
                Both axes selected — ready to go
              </span>
            ) : (
              <span className="text-dark-text-muted">
                {!xColumn && !yColumn
                  ? 'Select X and Y columns to continue'
                  : !yColumn
                    ? 'Now select a Y-axis column'
                    : 'Select an X-axis column'}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-dark-text-muted hover:text-dark-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              disabled={!xColumn || !yColumn}
              className="px-4 py-2 text-sm font-medium bg-[#F47B20] hover:bg-[#e06a10] text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-30 disabled:pointer-events-none"
            >
              Apply Selection
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
