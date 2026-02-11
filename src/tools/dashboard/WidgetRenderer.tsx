/**
 * WidgetRenderer — Routes widget type → chart component.
 * Handles edit mode header, color undo/redo, drill-down, and configurator modal.
 */

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical, Settings, Trash2, RotateCcw, RotateCw } from 'lucide-react'
import type { DashboardStore } from './dashboardStore.ts'
import type { DataSource, Widget, ChartConfig, FilterGroup } from './types.ts'
import { filterRows } from './filterEngine.ts'
import {
  useChartData,
  useMultiSeriesChartData,
  usePieChartData,
  useScatterChartData,
  useHeatmapData,
  useKPIData,
} from './useChartData.ts'

// Chart components
import { BarChartWidget } from './BarChartWidget.tsx'
import { LineChartWidget } from './LineChartWidget.tsx'
import { AreaChartWidget } from './AreaChartWidget.tsx'
import { PieChartWidget } from './PieChartWidget.tsx'
import { ScatterChartWidget } from './ScatterChartWidget.tsx'
import { HeatmapWidget } from './HeatmapWidget.tsx'
import { TreemapWidget } from './TreemapWidget.tsx'
import { KPICard } from './KPICard.tsx'
import { TextWidget } from './TextWidget.tsx'
import { DividerWidget } from './DividerWidget.tsx'
import { ChartConfigurator } from './ChartConfigurator.tsx'

// ── Types ───────────────────────────────────────

interface WidgetRendererProps {
  widget: Widget
  dataSource?: DataSource
  isEditMode: boolean
  isSelected: boolean
  store: DashboardStore
}

// ── Component ───────────────────────────────────

export function WidgetRenderer({
  widget,
  dataSource,
  isEditMode,
  isSelected: _isSelected,
  store,
}: WidgetRendererProps) {
  const [showConfigurator, setShowConfigurator] = useState(false)
  const [colorHistory, setColorHistory] = useState<string[][]>([])
  const [colorFuture, setColorFuture] = useState<string[][]>([])

  const { deleteWidget, updateWidget } = store

  // Apply widget filter to data
  const filteredRows = useMemo(() => {
    if (!dataSource) return []
    return filterRows(dataSource.rows, dataSource.columns, widget.filter ?? null)
  }, [dataSource, widget.filter])

  const config = widget.config as ChartConfig
  const columns = dataSource?.columns ?? []

  // Multi-series vs legacy
  const hasMultiSeries = (config.series?.length ?? 0) > 0

  const multiSeriesData = useMultiSeriesChartData(
    filteredRows,
    columns,
    config.xAxisColumn ?? '',
    config.series ?? [],
  )

  const chartData = useChartData(
    filteredRows,
    columns,
    config.xAxisColumn ?? '',
    config.yAxisColumns ?? [],
    config.aggregation ?? 'sum',
  )

  // Build series info for legacy single-aggregation mode
  const legacySeriesInfo = useMemo(() => {
    if (hasMultiSeries) return []
    return (config.yAxisColumns ?? []).map((colId) => {
      const col = columns.find(c => c.id === colId)
      return {
        key: colId,
        label: col?.name ?? colId,
        aggregation: config.aggregation ?? ('sum' as const),
        renderAs: 'bar' as const,
      }
    })
  }, [hasMultiSeries, config.yAxisColumns, config.aggregation, columns])

  const effectiveChartData = hasMultiSeries
    ? { data: multiSeriesData.data, keys: multiSeriesData.seriesInfo.map(s => s.key), total: multiSeriesData.total }
    : chartData

  const effectiveSeriesInfo = hasMultiSeries ? multiSeriesData.seriesInfo : legacySeriesInfo

  const pieData = usePieChartData(
    filteredRows, columns,
    config.labelColumn ?? config.xAxisColumn ?? '',
    config.valueColumn ?? config.yAxisColumns?.[0] ?? '',
    config.aggregation ?? 'sum',
  )

  const scatterData = useScatterChartData(
    filteredRows, columns,
    config.xAxisColumn ?? '',
    config.yAxisColumns?.[0] ?? '',
    config.categoryColumn,
    config.sizeColumn,
  )

  const heatmapData = useHeatmapData(
    filteredRows, columns,
    config.xAxisColumn ?? '',
    config.yAxisColumns?.[0] ?? '',
    config.valueColumn ?? '',
    config.aggregation ?? 'sum',
  )

  const kpiData = useKPIData(
    filteredRows, columns,
    config.valueColumn ?? config.yAxisColumns?.[0] ?? '',
    config.aggregation ?? 'sum',
  )

  const isLayoutWidget = widget.type === 'text' || widget.type === 'divider'

  // No data source and not a layout widget
  if (!dataSource && !isLayoutWidget) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-dark-text-muted p-4 gap-3">
        <p className="text-sm">Data source not found</p>
        {isEditMode && (
          <button
            onClick={() => deleteWidget(widget.id)}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            Delete Widget
          </button>
        )}
      </div>
    )
  }

  // ── Color change handlers ─────────────────────

  const handleColorsChange = (newColors: string[]) => {
    const currentColors = config.colors ?? []
    setColorHistory(prev => [...prev.slice(-19), currentColors])
    setColorFuture([])
    updateWidget(widget.id, { config: { ...config, colors: newColors } })
  }

  const handleUndo = () => {
    if (colorHistory.length === 0) return
    const previousColors = colorHistory[colorHistory.length - 1]
    const currentColors = config.colors ?? []
    setColorHistory(prev => prev.slice(0, -1))
    setColorFuture(prev => [...prev, currentColors])
    updateWidget(widget.id, { config: { ...config, colors: previousColors } })
  }

  const handleRedo = () => {
    if (colorFuture.length === 0) return
    const nextColors = colorFuture[colorFuture.length - 1]
    const currentColors = config.colors ?? []
    setColorFuture(prev => prev.slice(0, -1))
    setColorHistory(prev => [...prev, currentColors])
    updateWidget(widget.id, { config: { ...config, colors: nextColors } })
  }

  // ── Drill-down handler ────────────────────────

  const handleDrillDown = (newFilter: FilterGroup) => {
    updateWidget(widget.id, { filter: newFilter })
  }

  // ── Chart render ──────────────────────────────

  const renderChart = () => {
    const commonProps = {
      title: widget.title,
      showTitle: config.showTitle !== false,
      colors: config.colors,
      showGrid: config.showGrid !== false,
      showLegend: config.showLegend !== false,
      legendPosition: config.legendPosition ?? ('bottom' as const),
      xAxisLabel: config.xAxisLabel,
      yAxisLabel: config.yAxisLabel,
    }

    const interactiveProps = {
      isEditMode,
      filter: widget.filter,
      onColorsChange: handleColorsChange,
      onDrillDown: handleDrillDown,
    }

    switch (widget.type) {
      case 'bar':
        return (
          <BarChartWidget
            {...commonProps}
            {...interactiveProps}
            data={effectiveChartData.data}
            dataKeys={effectiveChartData.keys}
            seriesInfo={effectiveSeriesInfo}
            stacked={config.stacked}
            horizontal={config.horizontal}
            showValues={config.showValues}
            xAxisColumn={config.xAxisColumn}
          />
        )
      case 'line':
        return (
          <LineChartWidget
            {...commonProps}
            {...interactiveProps}
            data={effectiveChartData.data}
            dataKeys={effectiveChartData.keys}
            seriesInfo={effectiveSeriesInfo}
            smooth={config.smooth !== false}
            showDots={config.showDots !== false}
            fillArea={config.fillArea}
            xAxisColumn={config.xAxisColumn}
          />
        )
      case 'area':
        return (
          <AreaChartWidget
            {...commonProps}
            data={effectiveChartData.data}
            dataKeys={effectiveChartData.keys}
            seriesInfo={effectiveSeriesInfo}
            stacked={config.stacked}
            smooth={config.smooth !== false}
          />
        )
      case 'pie':
        return (
          <PieChartWidget
            {...interactiveProps}
            title={widget.title}
            showTitle={config.showTitle !== false}
            data={pieData.data}
            colors={config.colors}
            showLegend={config.showLegend !== false}
            legendPosition={config.legendPosition ?? 'right'}
            innerRadius={config.donut ? 60 : config.innerRadius ?? 0}
            showPercentage={config.showPercentage !== false}
            showLabels
            labelColumn={config.labelColumn ?? config.xAxisColumn}
          />
        )
      case 'scatter': {
        const scatterSeries = config.categoryColumn
          ? scatterData.categories.map((cat) => ({
              name: cat,
              data: scatterData.data
                .filter((d) => d.category === cat)
                .map((d) => ({ x: d.x, y: d.y, z: d.size, name: d.name })),
            }))
          : [{
              name: 'Data',
              data: scatterData.data.map((d) => ({ x: d.x, y: d.y, z: d.size, name: d.name })),
            }]
        return (
          <ScatterChartWidget
            {...commonProps}
            series={scatterSeries}
            showBubbles={!!config.sizeColumn}
          />
        )
      }
      case 'heatmap':
        return (
          <HeatmapWidget
            title={widget.title}
            showTitle={config.showTitle !== false}
            data={heatmapData.data}
            xLabels={heatmapData.xCategories}
            yLabels={heatmapData.yCategories}
            colorScale={config.colorScale ?? 'blue'}
            showValues={config.showValues !== false}
          />
        )
      case 'treemap':
        return (
          <TreemapWidget
            title={widget.title}
            showTitle={config.showTitle !== false}
            data={pieData.data.map((d) => ({ name: d.name, value: d.value }))}
            colors={config.colors}
            showLabels
          />
        )
      case 'kpi':
        return (
          <KPICard
            title={widget.title}
            value={kpiData.value}
            previousValue={kpiData.comparison}
            format={config.format ?? 'number'}
            prefix={config.prefix}
            suffix={config.suffix}
            invertTrend={config.invertTrend}
          />
        )
      case 'text':
        return (
          <TextWidget
            content={config.prefix ?? 'Enter text here...'}
            title={config.showTitle ? widget.title : undefined}
          />
        )
      case 'divider':
        return <DividerWidget />
      default:
        return (
          <div className="h-full flex items-center justify-center text-dark-text-muted">
            Unknown widget type: {widget.type}
          </div>
        )
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Edit mode header */}
      {isEditMode && (
        <div className="widget-drag-handle flex items-center justify-between px-3 py-2 bg-dark-bg border-b border-dark-border cursor-move">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-dark-text-muted" />
            <span className="text-sm font-medium text-dark-text-secondary truncate">
              {widget.title}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); handleUndo() }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={colorHistory.length === 0}
              className={`p-1.5 rounded ${colorHistory.length > 0 ? 'hover:bg-white/[0.06] text-dark-text-muted' : 'text-white/20 cursor-not-allowed'}`}
              title="Undo color change"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleRedo() }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={colorFuture.length === 0}
              className={`p-1.5 rounded ${colorFuture.length > 0 ? 'hover:bg-white/[0.06] text-dark-text-muted' : 'text-white/20 cursor-not-allowed'}`}
              title="Redo color change"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowConfigurator(true) }}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded hover:bg-white/[0.06] text-dark-text-muted"
              title="Configure widget"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deleteWidget(widget.id) }}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded hover:bg-red-500/10 text-red-400"
              title="Delete widget"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Chart content */}
      <div className="flex-1 p-3 min-h-0">{renderChart()}</div>

      {/* Configurator modal */}
      {showConfigurator && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowConfigurator(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] overflow-y-auto"
          >
            <ChartConfigurator
              config={config}
              columns={columns}
              rows={dataSource?.rows ?? []}
              filter={widget.filter}
              onChange={(newConfig) => {
                updateWidget(widget.id, {
                  config: newConfig,
                  type: newConfig.type,
                  title: newConfig.title ?? widget.title,
                })
              }}
              onFilterChange={(newFilter) => {
                updateWidget(widget.id, { filter: newFilter ?? undefined })
              }}
              onClose={() => setShowConfigurator(false)}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
