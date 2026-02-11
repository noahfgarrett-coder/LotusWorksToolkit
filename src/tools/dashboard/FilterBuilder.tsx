/**
 * FilterBuilder — Visual AND/OR filter tree builder.
 * Self-contained: includes condition rows + nested group rendering.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Filter, X, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import type { Column, Row, FilterGroup, FilterCondition, FilterOperator } from './types.ts'
import { OPERATOR_LABELS, TYPE_OPERATORS } from './types.ts'
import {
  createEmptyFilterGroup,
  createFilterCondition,
  createNestedFilterGroup,
  countMatchingRows,
  getColumnUniqueValues,
} from './filterEngine.ts'

// ── Operator helpers ────────────────────────────

function getOperatorsForType(type: string): FilterOperator[] {
  return TYPE_OPERATORS[type] ?? TYPE_OPERATORS.string
}

const NO_VALUE_OPERATORS: FilterOperator[] = ['is_empty', 'is_not_empty']

// ── Props ───────────────────────────────────────

interface FilterBuilderProps {
  columns: Column[]
  rows: Row[]
  filter: FilterGroup | null
  onChange: (filter: FilterGroup | null) => void
  onClose?: () => void
}

// ── Recursive helpers ───────────────────────────

function updateConditionRecursive(
  group: FilterGroup,
  conditionId: string,
  updates: Partial<FilterCondition>,
): FilterGroup {
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.type === 'condition' && child.id === conditionId) {
        return { ...child, ...updates }
      }
      if (child.type === 'group') {
        return updateConditionRecursive(child as FilterGroup, conditionId, updates)
      }
      return child
    }),
  }
}

function updateGroupInTree(
  group: FilterGroup,
  groupId: string,
  updated: FilterGroup,
): FilterGroup {
  if (group.id === groupId) return updated
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.id === groupId) return updated
      if (child.type === 'group') {
        return updateGroupInTree(child as FilterGroup, groupId, updated)
      }
      return child
    }),
  }
}

// ── Condition Row ───────────────────────────────

interface ConditionRowProps {
  condition: FilterCondition
  columns: Column[]
  uniqueValues: Map<string, unknown[]>
  onChange: (updates: Partial<FilterCondition>) => void
  onRemove: () => void
}

function ConditionRow({ condition, columns, uniqueValues, onChange, onRemove }: ConditionRowProps) {
  const column = columns.find((c) => c.id === condition.column)
  const operators = getOperatorsForType(column?.type ?? 'string')
  const needsValue = !NO_VALUE_OPERATORS.includes(condition.operator)
  const columnValues = uniqueValues.get(condition.column) ?? []

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Column selector */}
      <select
        value={condition.column}
        onChange={(e) => onChange({ column: e.target.value })}
        className="px-2 py-1.5 text-sm bg-dark-surface border border-dark-border rounded-lg
          text-dark-text-primary focus:outline-none focus:border-[#F47B20]/50"
      >
        {columns.map((col) => (
          <option key={col.id} value={col.id}>
            {col.name}
          </option>
        ))}
      </select>

      {/* Operator selector */}
      <select
        value={condition.operator}
        onChange={(e) => onChange({ operator: e.target.value as FilterOperator })}
        className="px-2 py-1.5 text-sm bg-dark-surface border border-dark-border rounded-lg
          text-dark-text-primary focus:outline-none focus:border-[#F47B20]/50"
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>

      {/* Value input */}
      {needsValue && (
        <>
          <input
            type={column?.type === 'number' ? 'number' : column?.type === 'date' ? 'date' : 'text'}
            value={String(condition.value ?? '')}
            onChange={(e) => {
              const v = column?.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value
              onChange({ value: v })
            }}
            placeholder="Value..."
            className="flex-1 min-w-[100px] px-2 py-1.5 text-sm bg-dark-surface border border-dark-border rounded-lg
              text-dark-text-primary placeholder:text-dark-text-muted/50 focus:outline-none focus:border-[#F47B20]/50"
          />

          {/* Quick-pick from unique values (for string columns) */}
          {column?.type === 'string' && columnValues.length > 0 && columnValues.length <= 20 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onChange({ value: e.target.value })
              }}
              className="px-1 py-1.5 text-xs bg-dark-surface border border-dark-border rounded-lg
                text-dark-text-muted focus:outline-none"
              title="Quick pick"
            >
              <option value="">Pick...</option>
              {columnValues.map((v) => (
                <option key={String(v)} value={String(v)}>
                  {String(v).slice(0, 40)}
                </option>
              ))}
            </select>
          )}

        </>
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors"
        title="Remove condition"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ── Nested Group Row ────────────────────────────

interface FilterGroupRowProps {
  group: FilterGroup
  columns: Column[]
  uniqueValues: Map<string, unknown[]>
  onUpdate: (group: FilterGroup) => void
  onRemove: () => void
}

function FilterGroupRow({ group, columns, uniqueValues, onUpdate, onRemove }: FilterGroupRowProps) {
  const [expanded, setExpanded] = useState(true)

  const addCondition = () => {
    const defaultColumn = columns[0]?.id ?? ''
    const newCondition = createFilterCondition(defaultColumn, '=', '')
    onUpdate({ ...group, children: [...group.children, newCondition] })
  }

  const removeChild = (childId: string) => {
    onUpdate({ ...group, children: group.children.filter((c) => c.id !== childId) })
  }

  const updateCondition = (conditionId: string, updates: Partial<FilterCondition>) => {
    onUpdate(updateConditionRecursive(group, conditionId, updates))
  }

  const toggleLogic = () => {
    onUpdate({ ...group, logic: group.logic === 'AND' ? 'OR' : 'AND' })
  }

  return (
    <div className="border border-dark-border rounded-lg bg-white/[0.02]">
      {/* Group header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] rounded-t-lg">
        <button onClick={() => setExpanded(!expanded)} className="p-0.5">
          {expanded
            ? <ChevronDown size={16} className="text-dark-text-muted" />
            : <ChevronRight size={16} className="text-dark-text-muted" />
          }
        </button>
        <button
          onClick={toggleLogic}
          className="px-2 py-0.5 text-xs font-semibold rounded bg-[#F47B20]/20 text-[#F47B20]"
        >
          {group.logic}
        </button>
        <span className="text-xs text-dark-text-muted">
          {group.children.length} condition{group.children.length !== 1 ? 's' : ''}
        </span>
        <div className="flex-1" />
        <button onClick={onRemove} className="p-1 rounded hover:bg-red-500/20 text-red-400">
          <X size={14} />
        </button>
      </div>

      {/* Group content */}
      {expanded && (
        <div className="p-3 space-y-2">
          {group.children.map((child, index) => (
            <div key={child.id}>
              {index > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <span className="text-[10px] font-medium text-dark-text-muted uppercase">
                    {group.logic}
                  </span>
                  <div className="flex-1 border-t border-dark-border" />
                </div>
              )}
              {child.type === 'condition' ? (
                <ConditionRow
                  condition={child as FilterCondition}
                  columns={columns}
                  uniqueValues={uniqueValues}
                  onChange={(updates) => updateCondition(child.id, updates)}
                  onRemove={() => removeChild(child.id)}
                />
              ) : (
                <FilterGroupRow
                  group={child as FilterGroup}
                  columns={columns}
                  uniqueValues={uniqueValues}
                  onUpdate={(updated) => {
                    onUpdate({
                      ...group,
                      children: group.children.map((c) => (c.id === child.id ? updated : c)),
                    })
                  }}
                  onRemove={() => removeChild(child.id)}
                />
              )}
            </div>
          ))}
          <button
            onClick={addCondition}
            className="flex items-center gap-1 px-2 py-1 text-xs text-dark-text-muted
              hover:text-dark-text-primary transition-colors"
          >
            <Plus size={12} />
            Add Condition
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main FilterBuilder ──────────────────────────

export function FilterBuilder({ columns, rows, filter, onChange, onClose }: FilterBuilderProps) {
  const [localFilter, setLocalFilter] = useState<FilterGroup>(
    filter ?? createEmptyFilterGroup(),
  )

  // Sync with external filter when it changes
  useEffect(() => {
    setLocalFilter(filter ?? createEmptyFilterGroup())
  }, [filter])

  // Unique values per column (for quick-pick dropdowns)
  const uniqueValuesMap = useMemo(() => {
    const map = new Map<string, unknown[]>()
    for (const col of columns) {
      map.set(col.id, getColumnUniqueValues(rows, columns, col.id, 100))
    }
    return map
  }, [columns, rows])

  // Match count
  const matchingCount = useMemo(() => {
    if (localFilter.children.length === 0) return rows.length
    return countMatchingRows(rows, columns, localFilter)
  }, [localFilter, rows, columns])

  const addCondition = useCallback(() => {
    const defaultColumn = columns[0]?.id ?? ''
    const cond = createFilterCondition(defaultColumn, '=', '')
    setLocalFilter((prev) => ({ ...prev, children: [...prev.children, cond] }))
  }, [columns])

  const addNestedGroup = useCallback(() => {
    const group = createNestedFilterGroup('OR')
    setLocalFilter((prev) => ({ ...prev, children: [...prev.children, group] }))
  }, [])

  const setRootLogic = useCallback((logic: 'AND' | 'OR') => {
    setLocalFilter((prev) => ({ ...prev, logic }))
  }, [])

  const removeChild = useCallback((childId: string) => {
    setLocalFilter((prev) => ({
      ...prev,
      children: prev.children.filter((c) => c.id !== childId),
    }))
  }, [])

  const updateCondition = useCallback((conditionId: string, updates: Partial<FilterCondition>) => {
    setLocalFilter((prev) => updateConditionRecursive(prev, conditionId, updates))
  }, [])

  const applyFilter = useCallback(() => {
    if (localFilter.children.length === 0) {
      onChange(null)
    } else {
      onChange(localFilter)
    }
  }, [localFilter, onChange])

  const clearFilter = useCallback(() => {
    const empty = createEmptyFilterGroup()
    setLocalFilter(empty)
    onChange(null)
  }, [onChange])

  return (
    <div className="bg-dark-surface rounded-xl border border-dark-border shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-[#F47B20]" />
          <h3 className="font-semibold text-dark-text-primary">Filter Data</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.08]">
            <X size={18} className="text-dark-text-muted" />
          </button>
        )}
      </div>

      {/* Filter content */}
      <div className="p-4">
        {/* Root logic toggle */}
        {localFilter.children.length > 1 && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-dark-text-muted">Match</span>
            <div className="flex rounded-lg overflow-hidden border border-dark-border">
              <button
                onClick={() => setRootLogic('AND')}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  localFilter.logic === 'AND'
                    ? 'bg-[#F47B20] text-white'
                    : 'bg-dark-surface text-dark-text-muted hover:bg-white/[0.06]'
                }`}
              >
                ALL conditions
              </button>
              <button
                onClick={() => setRootLogic('OR')}
                className={`px-3 py-1 text-sm font-medium transition-colors ${
                  localFilter.logic === 'OR'
                    ? 'bg-[#F47B20] text-white'
                    : 'bg-dark-surface text-dark-text-muted hover:bg-white/[0.06]'
                }`}
              >
                ANY condition
              </button>
            </div>
          </div>
        )}

        {/* Conditions list */}
        <div className="space-y-2">
          {localFilter.children.length === 0 ? (
            <p className="text-sm text-dark-text-muted italic py-4 text-center">
              No filters applied. Add a condition to filter the data.
            </p>
          ) : (
            localFilter.children.map((child, index) => (
              <div key={child.id}>
                {index > 0 && (
                  <div className="flex items-center gap-2 py-1">
                    <span className="text-[10px] font-medium text-dark-text-muted uppercase">
                      {localFilter.logic}
                    </span>
                    <div className="flex-1 border-t border-dark-border" />
                  </div>
                )}
                {child.type === 'condition' ? (
                  <ConditionRow
                    condition={child as FilterCondition}
                    columns={columns}
                    uniqueValues={uniqueValuesMap}
                    onChange={(updates) => updateCondition(child.id, updates)}
                    onRemove={() => removeChild(child.id)}
                  />
                ) : (
                  <FilterGroupRow
                    group={child as FilterGroup}
                    columns={columns}
                    uniqueValues={uniqueValuesMap}
                    onUpdate={(updated) => {
                      setLocalFilter((prev) => updateGroupInTree(prev, child.id, updated))
                    }}
                    onRemove={() => removeChild(child.id)}
                  />
                )}
              </div>
            ))
          )}
        </div>

        {/* Add buttons */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={addCondition}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg
              bg-white/[0.06] hover:bg-white/[0.1] text-dark-text-primary transition-colors"
          >
            <Plus size={14} />
            Add Condition
          </button>
          <button
            onClick={addNestedGroup}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg
              text-dark-text-muted hover:text-dark-text-primary hover:bg-white/[0.06] transition-colors"
          >
            <Plus size={14} />
            Add Group
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border bg-white/[0.02]">
        <span className="text-sm text-dark-text-muted">
          {matchingCount.toLocaleString()} of {rows.length.toLocaleString()} rows match
        </span>
        <div className="flex gap-2">
          <button
            onClick={clearFilter}
            className="px-3 py-1.5 text-sm rounded-lg text-dark-text-muted
              hover:bg-white/[0.06] transition-colors"
          >
            Clear
          </button>
          <button
            onClick={applyFilter}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[#F47B20] hover:bg-[#F47B20]/90
              text-white transition-colors"
          >
            Apply Filter
          </button>
        </div>
      </div>
    </div>
  )
}
