/**
 * WidgetPalette — Stepped wizard for adding new widgets.
 * Type selection → Data source → Column config → Add.
 */

import { useState, useCallback } from 'react'
import {
  BarChart3, TrendingUp, PieChart, Activity, Grid3X3,
  Layers, Hash, X, Circle, AlignLeft, Type, Minus, Table,
} from 'lucide-react'
import type { DashboardStore } from './dashboardStore.ts'
import type { ChartType, ChartConfig, AggregationType, FilterCondition, FilterGroup } from './types.ts'
import { DEFAULT_CHART_COLORS } from './types.ts'
import { TableDataSelector } from './TableDataSelector.tsx'

// ── Constants ───────────────────────────────────

const AGGREGATION_OPTIONS: Array<{ value: AggregationType; label: string }> = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'distinct', label: 'Distinct' },
]

interface WidgetTypeOption {
  type: ChartType
  variant?: string
  label: string
  icon: React.ReactNode
  description: string
  horizontal?: boolean
  stacked?: boolean
  donut?: boolean
}

const WIDGET_TYPES: WidgetTypeOption[] = [
  { type: 'bar', label: 'Bar Chart', icon: <BarChart3 className="w-6 h-6" />, description: 'Compare values across categories' },
  { type: 'bar', variant: 'horizontal', label: 'Horizontal Bar', icon: <AlignLeft className="w-6 h-6" />, description: 'Horizontal bars for long labels', horizontal: true },
  { type: 'bar', variant: 'stacked', label: 'Stacked Bar', icon: <Layers className="w-6 h-6" />, description: 'Stack multiple series', stacked: true },
  { type: 'line', label: 'Line Chart', icon: <TrendingUp className="w-6 h-6" />, description: 'Show trends over time' },
  { type: 'area', label: 'Area Chart', icon: <Activity className="w-6 h-6" />, description: 'Show cumulative totals' },
  { type: 'area', variant: 'stacked', label: 'Stacked Area', icon: <Layers className="w-6 h-6" />, description: 'Stacked area chart', stacked: true },
  { type: 'pie', label: 'Pie Chart', icon: <PieChart className="w-6 h-6" />, description: 'Show proportions of a whole' },
  { type: 'pie', variant: 'donut', label: 'Donut Chart', icon: <Circle className="w-6 h-6" />, description: 'Pie with center cutout', donut: true },
  { type: 'scatter', label: 'Scatter Plot', icon: <Grid3X3 className="w-6 h-6" />, description: 'Correlation between variables' },
  { type: 'heatmap', label: 'Heatmap', icon: <Layers className="w-6 h-6" />, description: 'Density across dimensions' },
  { type: 'treemap', label: 'Treemap', icon: <Grid3X3 className="w-6 h-6" />, description: 'Hierarchical data' },
  { type: 'kpi', label: 'KPI Card', icon: <Hash className="w-6 h-6" />, description: 'Display a key metric' },
  { type: 'text', label: 'Text Block', icon: <Type className="w-6 h-6" />, description: 'Titles, notes, descriptions' },
  { type: 'divider', label: 'Divider', icon: <Minus className="w-6 h-6" />, description: 'Separate sections' },
]

// ── Props ───────────────────────────────────────

interface WidgetPaletteProps {
  dashboardId: string
  store: DashboardStore
  onClose: () => void
}

// ── Component ───────────────────────────────────

export function WidgetPalette({ dashboardId, store, onClose }: WidgetPaletteProps) {
  const [selectedWidget, setSelectedWidget] = useState<WidgetTypeOption | null>(null)
  const [selectedDataSource, setSelectedDataSource] = useState<string>('')
  const [title, setTitle] = useState('')
  const [xColumn, setXColumn] = useState('')
  const [yColumn, setYColumn] = useState('')
  const [aggregation, setAggregation] = useState<AggregationType>('sum')
  const [textContent, setTextContent] = useState('')
  const [showTableSelector, setShowTableSelector] = useState(false)
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([])

  const { addWidget, updateWidget, dataSources } = store
  const dataSourceList = Array.from(dataSources.values())
  const selectedSource = dataSources.get(selectedDataSource)
  const columns = selectedSource?.columns ?? []
  const selectedType = selectedWidget?.type ?? null
  const isLayoutWidget = selectedType === 'text' || selectedType === 'divider'

  const handleAddWidget = () => {
    if (!selectedWidget) return

    // Layout widgets don't need data
    if (isLayoutWidget) {
      const config: ChartConfig = {
        type: selectedWidget.type,
        title: title || (selectedType === 'text' ? 'Text Block' : 'Divider'),
        showTitle: selectedType !== 'divider',
        prefix: textContent || (selectedType === 'text' ? 'Enter your text here...' : ''),
      }
      addWidget(dashboardId, selectedWidget.type, config)
      onClose()
      return
    }

    if (!selectedDataSource) return

    const config: ChartConfig = {
      type: selectedWidget.type,
      title: title || `New ${selectedWidget.label}`,
      showTitle: true,
      xAxisColumn: xColumn || undefined,
      yAxisColumns: yColumn ? [yColumn] : undefined,
      labelColumn: xColumn || undefined,
      valueColumn: yColumn || undefined,
      aggregation,
      colors: DEFAULT_CHART_COLORS,
      showGrid: true,
      showLegend: true,
      legendPosition: 'bottom',
      horizontal: selectedWidget.horizontal,
      stacked: selectedWidget.stacked,
      donut: selectedWidget.donut,
      innerRadius: selectedWidget.donut ? 60 : undefined,
    }

    const widgetId = addWidget(dashboardId, selectedWidget.type, config, selectedDataSource)

    // Apply filter conditions from table selector
    if (widgetId && filterConditions.length > 0) {
      const filter: FilterGroup = {
        id: crypto.randomUUID(),
        type: 'group',
        logic: 'AND',
        children: filterConditions,
      }
      updateWidget(widgetId, { filter })
    }

    onClose()
  }

  // ── Table selector callbacks ───────────────────

  const handleAddFilterCondition = useCallback((condition: FilterCondition) => {
    setFilterConditions((prev) => [...prev, condition])
  }, [])

  const handleRemoveFilterCondition = useCallback((filterId: string) => {
    setFilterConditions((prev) => prev.filter((f) => f.id !== filterId))
  }, [])

  const handleUpdateFilterCondition = useCallback(
    (filterId: string, updates: Partial<FilterCondition>) => {
      setFilterConditions((prev) =>
        prev.map((f) => (f.id === filterId ? { ...f, ...updates } : f)),
      )
    },
    [],
  )

  const canAdd = selectedWidget && (
    isLayoutWidget ||
    (selectedDataSource && (selectedType === 'kpi' ? yColumn : xColumn && yColumn))
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-surface rounded-xl shadow-2xl border border-dark-border w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-dark-text-primary">Add Widget</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06]">
            <X className="w-5 h-5 text-dark-text-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Step 1: Widget type */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-dark-text-secondary mb-3">
                1. Choose Widget Type
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {WIDGET_TYPES.map((widget, index) => {
                  const key = `${widget.type}-${widget.variant ?? 'default'}-${index}`
                  const isSelected = selectedWidget?.type === widget.type
                    && selectedWidget?.variant === widget.variant
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedWidget(widget)}
                      className={`p-3 rounded-lg border-2 transition-all flex flex-col items-center text-center ${
                        isSelected
                          ? 'border-[#F47B20] bg-[#F47B20]/10'
                          : 'border-dark-border hover:border-white/[0.12]'
                      }`}
                    >
                      <div className={`mb-1 ${isSelected ? 'text-[#F47B20]' : 'text-dark-text-muted'}`}>
                        {widget.icon}
                      </div>
                      <span className="text-xs font-medium text-dark-text-secondary leading-tight">
                        {widget.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Steps 2 & 3 */}
            {selectedWidget && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Data / Content */}
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-dark-text-secondary">
                    {isLayoutWidget ? '2. Content' : '2. Select Data'}
                  </label>

                  <div className="p-4 bg-dark-bg rounded-lg space-y-4">
                    {isLayoutWidget ? (
                      <>
                        {selectedType === 'text' && (
                          <div>
                            <label className="block text-xs text-dark-text-muted mb-1">Text Content</label>
                            <textarea
                              value={textContent}
                              onChange={(e) => setTextContent(e.target.value)}
                              placeholder="Enter your text, title, or notes here..."
                              rows={4}
                              className="w-full px-3 py-2 text-sm bg-dark-surface border border-dark-border rounded-lg text-dark-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-[#F47B20]"
                            />
                          </div>
                        )}
                        {selectedType === 'divider' && (
                          <div className="text-center py-4">
                            <div className="w-full h-px bg-dark-border mb-3" />
                            <p className="text-sm text-dark-text-muted">A horizontal divider</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs text-dark-text-muted mb-1">Data Source</label>
                          {dataSourceList.length === 0 ? (
                            <p className="text-sm text-dark-text-muted">No data sources. Import data first.</p>
                          ) : (
                            <select
                              value={selectedDataSource}
                              onChange={(e) => { setSelectedDataSource(e.target.value); setXColumn(''); setYColumn('') }}
                              className="w-full px-3 py-2 text-sm bg-dark-surface border border-dark-border rounded-lg text-dark-text-primary focus:outline-none focus:ring-1 focus:ring-[#F47B20]"
                            >
                              <option value="">Select data source...</option>
                              {dataSourceList.map((ds) => (
                                <option key={ds.id} value={ds.id}>
                                  {ds.name} ({ds.rows.length.toLocaleString()} rows)
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {selectedDataSource && (
                          <>
                            {selectedType !== 'kpi' && (
                              <div>
                                <label className="block text-xs text-dark-text-muted mb-1">
                                  {['pie', 'treemap'].includes(selectedType!) ? 'Category Column' : 'X-Axis'}
                                </label>
                                <select
                                  value={xColumn}
                                  onChange={(e) => setXColumn(e.target.value)}
                                  className="w-full px-3 py-2 text-sm bg-dark-surface border border-dark-border rounded-lg text-dark-text-primary focus:outline-none focus:ring-1 focus:ring-[#F47B20]"
                                >
                                  <option value="">Select column...</option>
                                  {columns.map((col) => (
                                    <option key={col.id} value={col.id}>{col.name} ({col.type})</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div>
                              <label className="block text-xs text-dark-text-muted mb-1">
                                {selectedType === 'kpi' ? 'Metric Column' : ['pie', 'treemap'].includes(selectedType!) ? 'Value Column' : 'Y-Axis'}
                              </label>
                              <select
                                value={yColumn}
                                onChange={(e) => setYColumn(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-dark-surface border border-dark-border rounded-lg text-dark-text-primary focus:outline-none focus:ring-1 focus:ring-[#F47B20]"
                              >
                                <option value="">Select column...</option>
                                {columns.map((col) => (
                                  <option key={col.id} value={col.id}>{col.name} ({col.type})</option>
                                ))}
                              </select>
                            </div>

                            {/* Select from table */}
                            <div className="pt-3 border-t border-dark-border">
                              <button
                                type="button"
                                onClick={() => setShowTableSelector(true)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm
                                  text-[#F47B20] bg-[#F47B20]/[0.06] hover:bg-[#F47B20]/[0.12]
                                  rounded-lg border border-[#F47B20]/20 transition-colors"
                              >
                                <Table size={16} />
                                Select from Table View
                              </button>
                              <p className="text-[10px] text-dark-text-muted/60 mt-1.5 text-center">
                                Click columns and cells to pick axes &amp; add filters
                              </p>
                            </div>

                            {/* Filter count badge */}
                            {filterConditions.length > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-amber-400">
                                  {filterConditions.length} filter{filterConditions.length !== 1 ? 's' : ''} applied
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setFilterConditions([])}
                                  className="text-dark-text-muted hover:text-red-400 transition-colors"
                                >
                                  Clear all
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Right: Configuration */}
                <div className="space-y-4">
                  <label className="block text-sm font-medium text-dark-text-secondary">
                    {isLayoutWidget ? '3. Style' : '3. Configure'}
                  </label>

                  <div className="p-4 bg-dark-bg rounded-lg space-y-4">
                    {selectedType !== 'divider' && (
                      <div>
                        <label className="block text-xs text-dark-text-muted mb-1">Widget Title</label>
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder={`My ${selectedWidget.label}`}
                          className="w-full px-3 py-2 text-sm bg-dark-surface border border-dark-border rounded-lg text-dark-text-primary focus:outline-none focus:ring-1 focus:ring-[#F47B20]"
                        />
                      </div>
                    )}

                    {!isLayoutWidget && (
                      <div>
                        <label className="block text-xs text-dark-text-muted mb-2">Aggregation Method</label>
                        <div className="grid grid-cols-3 gap-2">
                          {AGGREGATION_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setAggregation(opt.value)}
                              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                                aggregation === opt.value
                                  ? 'border-[#F47B20] bg-[#F47B20]/10 text-[#F47B20]'
                                  : 'border-dark-border text-dark-text-muted hover:border-white/[0.12]'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-dark-border flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-dark-text-muted hover:text-dark-text-primary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleAddWidget}
            disabled={!canAdd}
            className="px-4 py-2 text-sm font-medium bg-[#F47B20] hover:bg-[#e06a10] text-white rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            Add Widget
          </button>
        </div>
      </div>

      {/* Table Data Selector Modal */}
      {showTableSelector && selectedSource && (
        <TableDataSelector
          columns={columns}
          rows={selectedSource.rows}
          xColumn={xColumn || undefined}
          yColumn={yColumn || undefined}
          filters={
            filterConditions.length > 0
              ? { id: 'temp-palette', type: 'group', logic: 'AND', children: filterConditions }
              : undefined
          }
          onXColumnSelect={setXColumn}
          onYColumnSelect={setYColumn}
          onAddFilter={handleAddFilterCondition}
          onRemoveFilter={handleRemoveFilterCondition}
          onUpdateFilter={handleUpdateFilterCondition}
          onClose={() => setShowTableSelector(false)}
        />
      )}
    </div>
  )
}
