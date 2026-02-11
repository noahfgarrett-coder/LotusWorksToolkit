/**
 * BarChartWidget — Bar chart with combo chart support (bar+line+area).
 * Supports edit mode (click to change colors) and drill-down filtering.
 */

import { useState, memo } from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import { ChartWrapper } from './ChartWrapper.tsx'
import { ChartElementEditor, DrillDownToast } from './ChartElementEditor.tsx'
import type { ChartElementInfo, DrillDownInfo } from './ChartElementEditor.tsx'
import { DEFAULT_CHART_COLORS, DARK_CHART_STYLES } from './types.ts'
import type { ChartDataPoint, SeriesInfo } from './useChartData.ts'
import type { LegendPosition, FilterGroup } from './types.ts'
import { distributeColors, createDataHash } from './colorUtils.ts'

// ── Types ───────────────────────────────────────

interface BarChartWidgetProps {
  data: ChartDataPoint[]
  dataKeys: string[]
  seriesInfo?: SeriesInfo[]
  title?: string
  showTitle?: boolean
  colors?: string[]
  xAxisLabel?: string
  yAxisLabel?: string
  showGrid?: boolean
  showLegend?: boolean
  legendPosition?: LegendPosition
  stacked?: boolean
  horizontal?: boolean
  showValues?: boolean
  isEditMode?: boolean
  xAxisColumn?: string
  filter?: FilterGroup
  onColorsChange?: (colors: string[]) => void
  onDrillDown?: (filter: FilterGroup) => void
}

// ── Component ───────────────────────────────────

export const BarChartWidget = memo(function BarChartWidget({
  data,
  dataKeys,
  seriesInfo,
  title,
  showTitle = true,
  colors = DEFAULT_CHART_COLORS,
  xAxisLabel,
  yAxisLabel,
  showGrid = true,
  showLegend = true,
  legendPosition = 'bottom',
  stacked = false,
  horizontal = false,
  showValues = false,
  isEditMode = false,
  xAxisColumn,
  filter,
  onColorsChange,
  onDrillDown,
}: BarChartWidgetProps) {
  const [selectedElement, setSelectedElement] = useState<ChartElementInfo | null>(null)
  const [drillDownInfo, setDrillDownInfo] = useState<DrillDownInfo | null>(null)

  const isEmpty = data.length === 0 || dataKeys.length === 0

  // Legend position → Recharts props
  const getLegendProps = () => {
    if (!showLegend || legendPosition === 'none') return undefined
    const props: Record<string, unknown> = {}
    switch (legendPosition) {
      case 'top': props.verticalAlign = 'top'; break
      case 'bottom': props.verticalAlign = 'bottom'; break
      case 'left': props.layout = 'vertical'; props.align = 'left'; props.verticalAlign = 'middle'; break
      case 'right': props.layout = 'vertical'; props.align = 'right'; props.verticalAlign = 'middle'; break
    }
    return props
  }

  // Get series info for a key, or create default
  const getSeriesInfo = (key: string): SeriesInfo => {
    if (seriesInfo) {
      const info = seriesInfo.find(s => s.key === key)
      if (info) return info
    }
    return { key, label: key, aggregation: 'sum', renderAs: 'bar' }
  }

  // For single-series: distribute colors across bars. Multi-series: each series gets its own color.
  const isSingleSeries = dataKeys.length === 1
  const dataHash = createDataHash(data)
  const distributedBarColors = isSingleSeries
    ? distributeColors(colors, data.length, dataHash)
    : []

  // Handle element click
  const handleElementClick = (
    dataEntry: ChartDataPoint,
    seriesKey: string,
    seriesIndex: number,
    event: React.MouseEvent,
    dataIndex?: number,
  ) => {
    event.stopPropagation()
    const value = dataEntry[seriesKey] as number
    const info = getSeriesInfo(seriesKey)

    let displayedColor: string
    let paletteIndex: number

    if (isSingleSeries && dataIndex !== undefined) {
      displayedColor = distributedBarColors[dataIndex]
      paletteIndex = colors.indexOf(displayedColor)
      if (paletteIndex === -1) paletteIndex = 0
    } else {
      displayedColor = info.color ?? colors[seriesIndex % colors.length]
      paletteIndex = seriesIndex
    }

    if (isEditMode) {
      setSelectedElement({
        type: 'bar',
        index: seriesIndex,
        paletteIndex,
        seriesKey,
        currentColor: displayedColor,
        label: `${dataEntry.name} - ${info.label}`,
        value,
        x: event.clientX,
        y: event.clientY,
      })
    } else if (xAxisColumn && onDrillDown) {
      setDrillDownInfo({
        column: xAxisColumn,
        value: dataEntry.name,
        label: String(dataEntry.name),
        seriesKey,
      })
    }
  }

  // Color change from editor
  const handleColorChange = (newColor: string) => {
    if (selectedElement && onColorsChange) {
      const newColors = [...colors]
      const colorIndex = selectedElement.paletteIndex ?? selectedElement.index
      while (newColors.length <= colorIndex) newColors.push('#cccccc')
      newColors[colorIndex] = newColor
      onColorsChange(newColors)
    }
    setSelectedElement(null)
  }

  // Apply drill-down filter
  const applyDrillDown = () => {
    if (drillDownInfo && onDrillDown) {
      const newCondition = {
        id: crypto.randomUUID(),
        type: 'condition' as const,
        column: drillDownInfo.column,
        operator: '=' as const,
        value: drillDownInfo.value,
      }
      const newFilter: FilterGroup = filter
        ? { ...filter, children: [...filter.children, newCondition] }
        : { id: crypto.randomUUID(), type: 'group', logic: 'AND', children: [newCondition] }
      onDrillDown(newFilter)
    }
    setDrillDownInfo(null)
  }

  // Render a series element based on renderAs type
  const renderSeries = (key: string, index: number) => {
    const info = getSeriesInfo(key)
    const color = info.color ?? colors[index % colors.length]
    const isInteractive = isEditMode || (xAxisColumn && onDrillDown)
    const cursorStyle = isInteractive ? 'pointer' : 'default'

    const commonProps = { key, dataKey: key, name: info.label, fill: color, stroke: color }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleChartClick = (chartData: any, _idx: number, e: React.MouseEvent) => {
      if (isInteractive && chartData && chartData.name !== undefined) {
        handleElementClick(chartData as ChartDataPoint, key, index, e)
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleDotClick = (dotData: any, e: React.MouseEvent) => {
      if (isInteractive) {
        const dataIndex = dotData?.index ?? dotData?.payload?.index
        if (dataIndex !== undefined && data[dataIndex]) {
          handleElementClick(data[dataIndex], key, index, e)
        }
      }
    }

    switch (info.renderAs) {
      case 'line':
        return (
          <Line
            {...commonProps}
            type="monotone"
            strokeWidth={2}
            dot={{ r: 4, cursor: cursorStyle }}
            activeDot={{
              r: 6,
              cursor: cursorStyle,
              onClick: isInteractive ? handleDotClick : undefined,
            } as Record<string, unknown>}
          />
        )
      case 'area':
        return (
          <Area
            {...commonProps}
            type="monotone"
            fillOpacity={0.3}
            strokeWidth={2}
            style={{ cursor: cursorStyle }}
            onClick={isInteractive ? (handleChartClick as unknown as undefined) : undefined}
          />
        )
      case 'bar':
      default: {
        const handleCellClick = (dataIndex: number, e: React.MouseEvent) => {
          if (isInteractive && data[dataIndex]) {
            handleElementClick(data[dataIndex], key, index, e, dataIndex)
          }
        }
        return (
          <Bar
            {...commonProps}
            stackId={stacked ? 'stack' : undefined}
            radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            label={showValues ? { position: horizontal ? 'right' : 'top', fontSize: 10 } : undefined}
            style={{ cursor: cursorStyle }}
          >
            {data.map((_, dataIndex) => (
              <Cell
                key={`cell-${dataIndex}`}
                fill={isSingleSeries ? distributedBarColors[dataIndex] : color}
                style={{ cursor: cursorStyle }}
                onClick={isInteractive ? (e: React.MouseEvent) => handleCellClick(dataIndex, e) : undefined}
              />
            ))}
          </Bar>
        )
      }
    }
  }

  const chartLayout = horizontal ? 'vertical' : 'horizontal'
  const margin = { top: 5, right: 30, left: 20, bottom: 5 }

  const Chart = (
    <ComposedChart data={data} layout={chartLayout} margin={margin}>
      {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={DARK_CHART_STYLES.gridColor} />}
      {horizontal ? (
        <>
          <XAxis type="number" label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: -5 } : undefined} tick={{ fill: DARK_CHART_STYLES.axisColor }} />
          <YAxis dataKey="name" type="category" width={80} label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined} tick={{ fill: DARK_CHART_STYLES.axisColor }} />
        </>
      ) : (
        <>
          <XAxis dataKey="name" label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: -5 } : undefined} tick={{ fill: DARK_CHART_STYLES.axisColor }} />
          <YAxis label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined} tick={{ fill: DARK_CHART_STYLES.axisColor }} />
        </>
      )}
      <Tooltip contentStyle={DARK_CHART_STYLES.tooltip} />
      {showLegend && legendPosition !== 'none' && <Legend {...getLegendProps()} />}
      {dataKeys.map((key, index) => renderSeries(key, index))}
    </ComposedChart>
  )

  return (
    <>
      <ChartWrapper title={title} showTitle={showTitle} isEmpty={isEmpty}>
        {Chart}
      </ChartWrapper>

      {selectedElement &&
        createPortal(
          <ChartElementEditor
            element={selectedElement}
            onColorChange={handleColorChange}
            onClose={() => setSelectedElement(null)}
          />,
          document.body,
        )}

      {drillDownInfo &&
        createPortal(
          <DrillDownToast
            info={drillDownInfo}
            onApply={applyDrillDown}
            onDismiss={() => setDrillDownInfo(null)}
          />,
          document.body,
        )}
    </>
  )
})
