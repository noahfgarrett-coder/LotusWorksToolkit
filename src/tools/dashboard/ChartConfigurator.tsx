/**
 * ChartConfigurator — Full settings panel for widget configuration.
 * Multi-series, combo charts, smart recommendations, data filtering.
 */

import { useState, useMemo, useCallback } from 'react'
import { X, ChevronDown, ChevronRight, Plus, Trash2, Zap } from 'lucide-react'
import type {
  Column, Row, ChartType, ChartConfig, AggregationType,
  LegendPosition, ValueFormat, PieLabelPosition, DataSeries,
  SeriesRenderType, FilterGroup, FilterCondition, FilterOperator,
} from './types.ts'
import {
  DEFAULT_CHART_COLORS, COLOR_PALETTES,
  getChartRecommendations, createDefaultSeries,
  OPERATOR_LABELS, TYPE_OPERATORS,
} from './types.ts'
import {
  createEmptyFilterGroup, createFilterCondition,
  countMatchingRows, getColumnUniqueValues,
} from './filterEngine.ts'

// ── Constants ───────────────────────────────────

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'treemap', label: 'Treemap' },
  { value: 'kpi', label: 'KPI' },
]

const AGGREGATIONS: { value: AggregationType; label: string; description: string }[] = [
  { value: 'sum', label: 'Sum', description: 'Total of all values' },
  { value: 'avg', label: 'Average', description: 'Mean of values' },
  { value: 'count', label: 'Count', description: 'Number of records' },
  { value: 'min', label: 'Min', description: 'Smallest value' },
  { value: 'max', label: 'Max', description: 'Largest value' },
  { value: 'distinct', label: 'Distinct', description: 'Unique values' },
]

const LEGEND_POSITIONS: { value: LegendPosition; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'none', label: 'Hidden' },
]

const VALUE_FORMATS: { value: ValueFormat; label: string; example: string }[] = [
  { value: 'number', label: 'Number', example: '1,234' },
  { value: 'decimal1', label: '1 Decimal', example: '1,234.5' },
  { value: 'decimal2', label: '2 Decimals', example: '1,234.56' },
  { value: 'currency', label: 'Currency', example: '$1,234' },
  { value: 'percent', label: 'Percent', example: '12.3%' },
  { value: 'compact', label: 'Compact', example: '1.2K' },
]

const PIE_LABEL_POSITIONS: { value: PieLabelPosition; label: string }[] = [
  { value: 'outside', label: 'Outside' },
  { value: 'inside', label: 'Inside' },
  { value: 'none', label: 'None' },
]

const SERIES_RENDER_TYPES: { value: SeriesRenderType; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
]

// ── Collapsible Section ─────────────────────────

function Section({
  title, children, defaultOpen = true, badge,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; badge?: React.ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-dark-border last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/[0.03]"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-dark-text-secondary">{title}</span>
          {badge}
        </div>
        {isOpen
          ? <ChevronDown className="w-4 h-4 text-dark-text-muted" />
          : <ChevronRight className="w-4 h-4 text-dark-text-muted" />}
      </button>
      {isOpen && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

// ── Select helper ───────────────────────────────

const selectClass = 'w-full px-3 py-2 text-sm bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary focus:outline-none focus:ring-1 focus:ring-[#F47B20]'
const inputClass = selectClass

// ── Props ───────────────────────────────────────

interface ChartConfiguratorProps {
  config: ChartConfig
  columns: Column[]
  rows?: Row[]
  filter?: FilterGroup | null
  onChange: (config: ChartConfig) => void
  onFilterChange?: (filter: FilterGroup | null) => void
  onClose?: () => void
}

// ── Component ───────────────────────────────────

export function ChartConfigurator({
  config, columns, rows = [], filter,
  onChange, onFilterChange, onClose,
}: ChartConfiguratorProps) {
  const numericColumns = columns.filter((c) => c.type === 'number')
  const [showRecommendations, setShowRecommendations] = useState(false)
  const [localFilter, setLocalFilter] = useState<FilterGroup>(
    filter ?? createEmptyFilterGroup(),
  )

  const updateConfig = (updates: Partial<ChartConfig>) => {
    onChange({ ...config, ...updates })
  }

  // ── Filter helpers ────────────────────────────

  const matchingRowCount = useMemo(() => {
    if (localFilter.children.length === 0) return rows.length
    return countMatchingRows(rows, columns, localFilter)
  }, [localFilter, rows, columns])

  const addFilterCondition = useCallback(() => {
    const defaultColumn = columns[0]?.id ?? ''
    const newCondition = createFilterCondition(defaultColumn, '=', '')
    setLocalFilter((prev) => ({ ...prev, children: [...prev.children, newCondition] }))
  }, [columns])

  const removeFilterCondition = useCallback((conditionId: string) => {
    setLocalFilter((prev) => ({ ...prev, children: prev.children.filter((c) => c.id !== conditionId) }))
  }, [])

  const updateFilterCondition = useCallback((conditionId: string, updates: Partial<FilterCondition>) => {
    setLocalFilter((prev) => ({
      ...prev,
      children: prev.children.map((c) => {
        if (c.id === conditionId && c.type === 'condition') return { ...c, ...updates } as FilterCondition
        return c
      }),
    }))
  }, [])

  const applyFilter = useCallback(() => {
    onFilterChange?.(localFilter.children.length === 0 ? null : localFilter)
  }, [localFilter, onFilterChange])

  const clearFilter = useCallback(() => {
    const empty = createEmptyFilterGroup()
    setLocalFilter(empty)
    onFilterChange?.(null)
  }, [onFilterChange])

  // ── Series management ─────────────────────────

  const currentSeries: DataSeries[] = useMemo(() => {
    if (config.series && config.series.length > 0) return config.series
    if (config.yAxisColumns && config.yAxisColumns.length > 0) {
      return config.yAxisColumns.map((col, i) => ({
        id: `legacy_${i}`,
        column: col,
        aggregation: config.aggregation ?? 'sum',
        renderAs: (config.type === 'line' ? 'line' : config.type === 'area' ? 'area' : 'bar') as SeriesRenderType,
      }))
    }
    return []
  }, [config.series, config.yAxisColumns, config.aggregation, config.type])

  const addSeries = () => {
    const newSeries = createDefaultSeries()
    newSeries.renderAs = (config.type === 'line' ? 'line' : config.type === 'area' ? 'area' : 'bar') as SeriesRenderType
    const updatedSeries = [...currentSeries, newSeries]
    updateConfig({ series: updatedSeries, yAxisColumns: updatedSeries.map(s => s.column).filter(Boolean) })
  }

  const removeSeries = (id: string) => {
    const updatedSeries = currentSeries.filter(s => s.id !== id)
    updateConfig({ series: updatedSeries, yAxisColumns: updatedSeries.map(s => s.column).filter(Boolean) })
  }

  const updateSeries = (id: string, updates: Partial<DataSeries>) => {
    const updatedSeries = currentSeries.map(s => s.id === id ? { ...s, ...updates } : s)
    updateConfig({
      series: updatedSeries,
      yAxisColumns: updatedSeries.map(s => s.column).filter(Boolean),
      aggregation: updatedSeries[0]?.aggregation ?? config.aggregation,
    })
  }

  // ── Recommendations ───────────────────────────

  const getColumnType = (colId: string | undefined) => {
    if (!colId) return null
    const col = columns.find(c => c.id === colId)
    return (col?.type ?? null) as 'string' | 'number' | 'date' | null
  }

  const recommendations = useMemo(() => {
    const xType = getColumnType(config.xAxisColumn)
    const yType = currentSeries.length > 0 ? getColumnType(currentSeries[0].column) : null
    return getChartRecommendations(xType, currentSeries.length, yType, currentSeries.length > 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.xAxisColumn, currentSeries, columns])

  // ── Feature flags ─────────────────────────────

  const needsXAxis = ['bar', 'line', 'area', 'scatter', 'heatmap'].includes(config.type)
  const needsYAxis = ['bar', 'line', 'area', 'scatter', 'heatmap'].includes(config.type)
  const supportsMultiSeries = ['bar', 'line', 'area'].includes(config.type)
  const supportsCombo = ['bar', 'line', 'area'].includes(config.type)
  const supportsStacked = ['bar', 'area'].includes(config.type)
  const supportsHorizontal = config.type === 'bar'
  const supportsLegend = !['kpi', 'heatmap'].includes(config.type)
  const supportsGrid = ['bar', 'line', 'area', 'scatter'].includes(config.type)
  const isPieChart = config.type === 'pie'
  const isKPI = config.type === 'kpi'
  const isScatter = config.type === 'scatter'

  // ── Render ────────────────────────────────────

  return (
    <div className="bg-dark-surface rounded-xl border border-dark-border shadow-xl w-[640px] max-h-[85vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
        <h3 className="font-semibold text-dark-text-primary">Chart Settings</h3>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors">
            <X className="w-5 h-5 text-dark-text-muted" />
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Recommendations */}
        {recommendations.length > 0 && recommendations[0].confidence !== 'low' && (
          <div className="px-4 py-3 bg-[#F47B20]/10 border-b border-[#F47B20]/20">
            <button
              onClick={() => setShowRecommendations(!showRecommendations)}
              className="flex items-center gap-2 text-sm font-medium text-[#F47B20] w-full"
            >
              <Zap className="w-4 h-4" />
              Recommended: {CHART_TYPES.find(t => t.value === recommendations[0].type)?.label}
              <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showRecommendations ? 'rotate-180' : ''}`} />
            </button>
            {showRecommendations && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {recommendations.slice(0, 3).map((rec) => (
                  <button
                    key={rec.type}
                    onClick={() => updateConfig({ type: rec.type })}
                    className={`text-left p-2 rounded-lg text-sm transition-colors ${
                      config.type === rec.type
                        ? 'bg-[#F47B20]/20 text-[#F47B20]'
                        : 'hover:bg-[#F47B20]/10 text-dark-text-secondary'
                    }`}
                  >
                    <span className="font-medium">{CHART_TYPES.find(t => t.value === rec.type)?.label}</span>
                    <span className="block text-xs opacity-75 mt-0.5">{rec.reason}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chart Type */}
        <div className="p-4 border-b border-dark-border">
          <label className="block text-sm font-medium text-dark-text-secondary mb-3">Chart Type</label>
          <div className="grid grid-cols-8 gap-2">
            {CHART_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => updateConfig({ type: type.value })}
                className={`p-2 rounded-lg border text-center transition-all ${
                  config.type === type.value
                    ? 'border-[#F47B20] bg-[#F47B20]/10 ring-1 ring-[#F47B20]'
                    : 'border-dark-border hover:border-white/[0.12]'
                }`}
                title={type.label}
              >
                <span className="block text-[10px] text-dark-text-secondary mt-1 leading-tight">{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <Section title="Title">
          <label className="flex items-center gap-2 text-sm text-dark-text-muted mb-2">
            <input
              type="checkbox"
              checked={config.showTitle !== false}
              onChange={(e) => updateConfig({ showTitle: e.target.checked })}
              className="rounded border-dark-border"
            />
            Show title
          </label>
          <input
            type="text"
            value={config.title ?? ''}
            onChange={(e) => updateConfig({ title: e.target.value })}
            placeholder="Chart title..."
            className={inputClass}
            disabled={config.showTitle === false}
          />
        </Section>

        {/* Data Configuration */}
        <Section title="Data" badge={
          supportsMultiSeries && currentSeries.length > 1 ? (
            <span className="text-xs bg-[#F47B20]/20 text-[#F47B20] px-2 py-0.5 rounded-full">
              {currentSeries.length} series
            </span>
          ) : null
        }>
          {/* X-Axis / Category */}
          {needsXAxis && (
            <div>
              <label className="block text-sm font-medium text-dark-text-muted mb-1">
                {config.type === 'scatter' ? 'X-Axis Column' : 'Category (X-Axis)'}
              </label>
              <select
                value={config.xAxisColumn ?? ''}
                onChange={(e) => updateConfig({ xAxisColumn: e.target.value })}
                className={selectClass}
              >
                <option value="">Select column...</option>
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>{col.name} ({col.type})</option>
                ))}
              </select>
            </div>
          )}

          {/* Multi-series */}
          {supportsMultiSeries && needsYAxis && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-dark-text-muted">Value Series</label>
                <button onClick={addSeries} className="flex items-center gap-1 text-xs text-[#F47B20]">
                  <Plus className="w-3 h-3" /> Add Series
                </button>
              </div>

              {currentSeries.length === 0 && (
                <button
                  onClick={addSeries}
                  className="w-full p-3 border-2 border-dashed border-dark-border rounded-lg text-sm text-dark-text-muted hover:border-[#F47B20]/40 hover:text-[#F47B20] transition-colors"
                >
                  <Plus className="w-4 h-4 mx-auto mb-1" /> Add a data series
                </button>
              )}

              {currentSeries.map((series, index) => (
                <div key={series.id} className="p-3 bg-dark-bg rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-dark-text-muted">Series {index + 1}</span>
                    {currentSeries.length > 1 && (
                      <button onClick={() => removeSeries(series.id)} className="p-1 text-red-400 hover:bg-red-500/10 rounded">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <select
                    value={series.column ?? ''}
                    onChange={(e) => updateSeries(series.id, { column: e.target.value })}
                    className={selectClass + ' text-sm'}
                  >
                    <option value="">Select column...</option>
                    <optgroup label="Numeric">
                      {numericColumns.map((col) => (
                        <option key={col.id} value={col.id}>{col.name}</option>
                      ))}
                    </optgroup>
                    {['count', 'distinct'].includes(series.aggregation) && (
                      <optgroup label="Other (for count/distinct)">
                        {columns.filter(c => c.type !== 'number').map((col) => (
                          <option key={col.id} value={col.id}>{col.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  <div className="flex gap-2">
                    <select
                      value={series.aggregation ?? 'sum'}
                      onChange={(e) => updateSeries(series.id, { aggregation: e.target.value as AggregationType })}
                      className={selectClass + ' flex-1 text-sm'}
                    >
                      {AGGREGATIONS.map((agg) => (
                        <option key={agg.value} value={agg.value}>{agg.label}</option>
                      ))}
                    </select>

                    {supportsCombo && currentSeries.length > 1 && (
                      <div className="flex border border-dark-border rounded-lg overflow-hidden">
                        {SERIES_RENDER_TYPES.map((rt) => (
                          <button
                            key={rt.value}
                            onClick={() => updateSeries(series.id, { renderAs: rt.value })}
                            className={`px-2 py-1 text-xs ${
                              series.renderAs === rt.value
                                ? 'bg-[#F47B20]/20 text-[#F47B20]'
                                : 'hover:bg-white/[0.03] text-dark-text-muted'
                            }`}
                            title={rt.label}
                          >
                            {rt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    value={series.label ?? ''}
                    onChange={(e) => updateSeries(series.id, { label: e.target.value })}
                    placeholder="Series label (optional)"
                    className={inputClass + ' text-sm'}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Single Y for non-multi-series */}
          {!supportsMultiSeries && needsYAxis && (
            <div>
              <label className="block text-sm font-medium text-dark-text-muted mb-1">Value Column</label>
              <select
                value={config.yAxisColumns?.[0] ?? ''}
                onChange={(e) => updateConfig({ yAxisColumns: [e.target.value] })}
                className={selectClass}
              >
                <option value="">Select column...</option>
                {numericColumns.map((col) => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Pie / Treemap */}
          {['pie', 'treemap'].includes(config.type) && (
            <>
              <div>
                <label className="block text-sm font-medium text-dark-text-muted mb-1">Category Column</label>
                <select value={config.xAxisColumn ?? ''} onChange={(e) => updateConfig({ xAxisColumn: e.target.value })} className={selectClass}>
                  <option value="">Select column...</option>
                  {columns.map((col) => <option key={col.id} value={col.id}>{col.name} ({col.type})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-text-muted mb-1">Value Column</label>
                <select value={config.yAxisColumns?.[0] ?? ''} onChange={(e) => updateConfig({ yAxisColumns: [e.target.value] })} className={selectClass}>
                  <option value="">Select column...</option>
                  {numericColumns.map((col) => <option key={col.id} value={col.id}>{col.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-text-muted mb-1">Aggregation</label>
                <select value={config.aggregation ?? 'sum'} onChange={(e) => updateConfig({ aggregation: e.target.value as AggregationType })} className={selectClass}>
                  {AGGREGATIONS.map((agg) => <option key={agg.value} value={agg.value}>{agg.label} - {agg.description}</option>)}
                </select>
              </div>
            </>
          )}

          {/* KPI */}
          {isKPI && (
            <>
              <div>
                <label className="block text-sm font-medium text-dark-text-muted mb-1">Metric Column</label>
                <select value={config.yAxisColumns?.[0] ?? ''} onChange={(e) => updateConfig({ yAxisColumns: [e.target.value] })} className={selectClass}>
                  <option value="">Select column...</option>
                  {numericColumns.map((col) => <option key={col.id} value={col.id}>{col.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-text-muted mb-1">Aggregation</label>
                <select value={config.aggregation ?? 'sum'} onChange={(e) => updateConfig({ aggregation: e.target.value as AggregationType })} className={selectClass}>
                  {AGGREGATIONS.map((agg) => <option key={agg.value} value={agg.value}>{agg.label}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Scatter extras */}
          {isScatter && (
            <>
              <div>
                <label className="block text-sm font-medium text-dark-text-muted mb-1">Size Column (optional)</label>
                <select value={config.sizeColumn ?? ''} onChange={(e) => updateConfig({ sizeColumn: e.target.value || undefined })} className={selectClass}>
                  <option value="">None</option>
                  {numericColumns.map((col) => <option key={col.id} value={col.id}>{col.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-text-muted mb-1">Color By (optional)</label>
                <select value={config.categoryColumn ?? ''} onChange={(e) => updateConfig({ categoryColumn: e.target.value || undefined })} className={selectClass}>
                  <option value="">None</option>
                  {columns.map((col) => <option key={col.id} value={col.id}>{col.name}</option>)}
                </select>
              </div>
            </>
          )}
        </Section>

        {/* Data Filter */}
        {rows.length > 0 && onFilterChange && (
          <Section title="Data Filter" defaultOpen={false} badge={
            localFilter.children.length > 0 ? (
              <span className="px-2 py-0.5 text-xs rounded-full bg-[#F47B20]/20 text-[#F47B20]">
                {localFilter.children.length}
              </span>
            ) : null
          }>
            <p className="text-xs text-dark-text-muted mb-3">Filter which data rows appear in this chart.</p>

            {localFilter.children.length > 1 && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-dark-text-muted">Match</span>
                <div className="flex rounded-lg overflow-hidden border border-dark-border">
                  {(['AND', 'OR'] as const).map((logic) => (
                    <button
                      key={logic}
                      onClick={() => setLocalFilter(prev => ({ ...prev, logic }))}
                      className={`px-3 py-1 text-xs font-medium ${
                        localFilter.logic === logic ? 'bg-[#F47B20] text-white' : 'bg-dark-bg text-dark-text-muted hover:bg-white/[0.03]'
                      }`}
                    >
                      {logic === 'AND' ? 'ALL' : 'ANY'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {localFilter.children.length === 0 ? (
                <p className="text-sm text-dark-text-muted italic text-center py-2">No filters. All {rows.length} rows included.</p>
              ) : (
                localFilter.children.map((child, index) => {
                  if (child.type !== 'condition') return null
                  const condition = child as FilterCondition
                  const col = columns.find(c => c.id === condition.column)
                  const colType = col?.type ?? 'string'
                  const operators = TYPE_OPERATORS[colType] ?? TYPE_OPERATORS.string
                  const uniqueVals = getColumnUniqueValues(rows, columns, condition.column, 50)

                  return (
                    <div key={condition.id}>
                      {index > 0 && (
                        <div className="flex items-center gap-2 py-1">
                          <span className="text-xs font-medium text-[#F47B20] uppercase">{localFilter.logic}</span>
                          <div className="flex-1 border-t border-dark-border" />
                        </div>
                      )}
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-dark-bg">
                        <div className="flex-1 space-y-2">
                          <select value={condition.column} onChange={(e) => updateFilterCondition(condition.id, { column: e.target.value, value: '' })} className={selectClass + ' text-sm'}>
                            <option value="">Select column...</option>
                            {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <select value={condition.operator} onChange={(e) => updateFilterCondition(condition.id, { operator: e.target.value as FilterOperator })} className={selectClass + ' text-sm'}>
                            {operators.map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
                          </select>
                          {condition.operator !== 'is_empty' && condition.operator !== 'is_not_empty' && (
                            uniqueVals.length > 0 && uniqueVals.length <= 20 ? (
                              <select value={String(condition.value ?? '')} onChange={(e) => updateFilterCondition(condition.id, { value: e.target.value })} className={selectClass + ' text-sm'}>
                                <option value="">Select value...</option>
                                {uniqueVals.map((v) => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
                              </select>
                            ) : (
                              <input type="text" value={String(condition.value ?? '')} onChange={(e) => updateFilterCondition(condition.id, { value: e.target.value })} placeholder="Value..." className={inputClass + ' text-sm'} />
                            )
                          )}
                        </div>
                        <button onClick={() => removeFilterCondition(condition.id)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded mt-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-border">
              <button onClick={addFilterCondition} className="flex items-center gap-1.5 text-sm text-[#F47B20]">
                <Plus className="w-4 h-4" /> Add Condition
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-dark-text-muted">
                  {matchingRowCount.toLocaleString()} / {rows.length.toLocaleString()} rows
                </span>
                {localFilter.children.length > 0 && (
                  <button onClick={clearFilter} className="text-xs text-red-400 hover:text-red-300">Clear</button>
                )}
                <button onClick={applyFilter} className="px-3 py-1 text-xs font-medium bg-[#F47B20] text-white rounded-lg">
                  Apply
                </button>
              </div>
            </div>
          </Section>
        )}

        {/* Display Options */}
        <Section title="Display" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-3">
            {supportsGrid && (
              <label className="flex items-center gap-2 text-sm text-dark-text-muted">
                <input type="checkbox" checked={config.showGrid !== false} onChange={(e) => updateConfig({ showGrid: e.target.checked })} className="rounded border-dark-border" />
                Show grid
              </label>
            )}
            {supportsLegend && (
              <label className="flex items-center gap-2 text-sm text-dark-text-muted">
                <input type="checkbox" checked={config.showLegend !== false} onChange={(e) => updateConfig({ showLegend: e.target.checked })} className="rounded border-dark-border" />
                Show legend
              </label>
            )}
            {supportsStacked && (
              <label className="flex items-center gap-2 text-sm text-dark-text-muted">
                <input type="checkbox" checked={!!config.stacked} onChange={(e) => updateConfig({ stacked: e.target.checked })} className="rounded border-dark-border" />
                Stacked
              </label>
            )}
            {supportsHorizontal && (
              <label className="flex items-center gap-2 text-sm text-dark-text-muted">
                <input type="checkbox" checked={!!config.horizontal} onChange={(e) => updateConfig({ horizontal: e.target.checked })} className="rounded border-dark-border" />
                Horizontal
              </label>
            )}
            {config.type === 'line' && (
              <>
                <label className="flex items-center gap-2 text-sm text-dark-text-muted">
                  <input type="checkbox" checked={config.smooth !== false} onChange={(e) => updateConfig({ smooth: e.target.checked })} className="rounded border-dark-border" />
                  Smooth curves
                </label>
                <label className="flex items-center gap-2 text-sm text-dark-text-muted">
                  <input type="checkbox" checked={config.showDots !== false} onChange={(e) => updateConfig({ showDots: e.target.checked })} className="rounded border-dark-border" />
                  Show dots
                </label>
              </>
            )}
          </div>

          {/* Legend position */}
          {supportsLegend && config.showLegend !== false && (
            <div>
              <label className="block text-sm font-medium text-dark-text-muted mb-1">Legend Position</label>
              <div className="flex gap-1">
                {LEGEND_POSITIONS.map((pos) => (
                  <button
                    key={pos.value}
                    onClick={() => updateConfig({ legendPosition: pos.value })}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      (config.legendPosition ?? 'bottom') === pos.value
                        ? 'border-[#F47B20] bg-[#F47B20]/10 text-[#F47B20]'
                        : 'border-dark-border text-dark-text-muted hover:border-white/[0.12]'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Pie-specific */}
        {isPieChart && (
          <Section title="Pie Options" defaultOpen={false}>
            <label className="flex items-center gap-2 text-sm text-dark-text-muted">
              <input type="checkbox" checked={!!config.donut} onChange={(e) => updateConfig({ donut: e.target.checked, innerRadius: e.target.checked ? 60 : 0 })} className="rounded border-dark-border" />
              Donut style
            </label>
            <label className="flex items-center gap-2 text-sm text-dark-text-muted">
              <input type="checkbox" checked={config.showPercentage !== false} onChange={(e) => updateConfig({ showPercentage: e.target.checked })} className="rounded border-dark-border" />
              Show percentages
            </label>
            <div>
              <label className="block text-sm font-medium text-dark-text-muted mb-1">Labels</label>
              <div className="flex gap-1">
                {PIE_LABEL_POSITIONS.map((pos) => (
                  <button
                    key={pos.value}
                    onClick={() => updateConfig({ pieLabelPosition: pos.value, showPieLabels: pos.value !== 'none' })}
                    className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                      (config.pieLabelPosition ?? 'inside') === pos.value
                        ? 'border-[#F47B20] bg-[#F47B20]/10 text-[#F47B20]'
                        : 'border-dark-border text-dark-text-muted'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* KPI-specific */}
        {isKPI && (
          <Section title="KPI Options" defaultOpen={false}>
            <div>
              <label className="block text-sm font-medium text-dark-text-muted mb-1">Number Format</label>
              <div className="grid grid-cols-3 gap-1">
                {VALUE_FORMATS.map((fmt) => (
                  <button
                    key={fmt.value}
                    onClick={() => updateConfig({ format: fmt.value })}
                    className={`px-2 py-1.5 text-xs rounded-lg border transition-all ${
                      (config.format ?? 'number') === fmt.value
                        ? 'border-[#F47B20] bg-[#F47B20]/10 text-[#F47B20]'
                        : 'border-dark-border text-dark-text-muted'
                    }`}
                  >
                    <div className="font-medium">{fmt.label}</div>
                    <div className="opacity-60">{fmt.example}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-dark-text-muted mb-1">Prefix</label>
                <input type="text" value={config.prefix ?? ''} onChange={(e) => updateConfig({ prefix: e.target.value })} placeholder="$" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs text-dark-text-muted mb-1">Suffix</label>
                <input type="text" value={config.suffix ?? ''} onChange={(e) => updateConfig({ suffix: e.target.value })} placeholder="%" className={inputClass} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-dark-text-muted">
              <input type="checkbox" checked={!!config.invertTrend} onChange={(e) => updateConfig({ invertTrend: e.target.checked })} className="rounded border-dark-border" />
              Invert trend (down = good)
            </label>
          </Section>
        )}

        {/* Color Palette */}
        <Section title="Colors" defaultOpen={false}>
          <div className="space-y-3">
            {COLOR_PALETTES.slice(0, 6).map((palette) => (
              <button
                key={palette.id}
                onClick={() => updateConfig({ colors: [...palette.colors] })}
                className={`w-full flex items-center gap-3 p-2 rounded-lg border transition-all ${
                  JSON.stringify(config.colors) === JSON.stringify(palette.colors)
                    ? 'border-[#F47B20] bg-[#F47B20]/10'
                    : 'border-dark-border hover:border-white/[0.12]'
                }`}
              >
                <div className="flex gap-1">
                  {palette.colors.slice(0, 6).map((color, i) => (
                    <div key={i} className="w-5 h-5 rounded" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <span className="text-xs text-dark-text-muted">{palette.name}</span>
              </button>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
