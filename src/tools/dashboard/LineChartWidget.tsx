/**
 * LineChartWidget — Line chart with combo chart support (line+bar+area).
 * Supports edit mode (click to change colors) and drill-down filtering.
 */

import { useState, memo } from 'react'
import { createPortal } from 'react-dom'
import {
  ComposedChart,
  Line,
  Bar,
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

// ── Types ───────────────────────────────────────

interface LineChartWidgetProps {
  data: ChartDataPoint[]
  dataKeys: string[]
  title?: string
  showTitle?: boolean
  colors?: string[]
  xAxisLabel?: string
  yAxisLabel?: string
  showGrid?: boolean
  showLegend?: boolean
  legendPosition?: LegendPosition
  showDots?: boolean
  smooth?: boolean
  fillArea?: boolean
  seriesInfo?: SeriesInfo[]
  isEditMode?: boolean
  xAxisColumn?: string
  filter?: FilterGroup
  onColorsChange?: (colors: string[]) => void
  onDrillDown?: (filter: FilterGroup) => void
}

// ── Component ───────────────────────────────────

export const LineChartWidget = memo(function LineChartWidget({
  data,
  dataKeys,
  title,
  showTitle = true,
  colors = DEFAULT_CHART_COLORS,
  xAxisLabel,
  yAxisLabel,
  showGrid = true,
  showLegend = true,
  legendPosition = 'bottom',
  showDots = true,
  smooth = false,
  fillArea = false,
  seriesInfo,
  isEditMode = false,
  xAxisColumn,
  filter,
  onColorsChange,
  onDrillDown,
}: LineChartWidgetProps) {
  const [selectedElement, setSelectedElement] = useState<ChartElementInfo | null>(null)
  const [drillDownInfo, setDrillDownInfo] = useState<DrillDownInfo | null>(null)

  const isEmpty = data.length === 0 || dataKeys.length === 0
  const isInteractive = isEditMode || !!(xAxisColumn && onDrillDown)

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

  // Series info lookup
  const getSeriesInfo = (key: string, index: number) => {
    const info = seriesInfo?.find((s) => s.key === key)
    return {
      renderAs: info?.renderAs ?? 'line',
      color: info?.color ?? colors[index % colors.length],
      label: info?.label ?? key,
    }
  }

  // Handle element click
  const handleElementClick = (
    dataEntry: ChartDataPoint,
    seriesKey: string,
    seriesIndex: number,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation()
    const value = dataEntry[seriesKey] as number
    const info = getSeriesInfo(seriesKey, seriesIndex)

    if (isEditMode) {
      setSelectedElement({
        type: 'dot',
        index: seriesIndex,
        seriesKey,
        currentColor: info.color,
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
      while (newColors.length <= selectedElement.index) newColors.push('#cccccc')
      newColors[selectedElement.index] = newColor
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

  // Render a series element
  const renderSeries = (key: string, index: number) => {
    const info = getSeriesInfo(key, index)
    const cursorStyle = isInteractive ? 'pointer' : 'default'
    const commonProps = { key, dataKey: key, name: info.label }

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
      case 'bar':
        return (
          <Bar
            {...commonProps}
            fill={info.color}
            radius={[4, 4, 0, 0]}
            style={{ cursor: cursorStyle }}
            onClick={isInteractive ? (handleChartClick as unknown as undefined) : undefined}
          >
            {data.map((_, dataIndex) => (
              <Cell key={`cell-${dataIndex}`} fill={info.color} />
            ))}
          </Bar>
        )
      case 'area':
        return (
          <Area
            {...commonProps}
            type={smooth ? 'monotone' : 'linear'}
            stroke={info.color}
            fill={info.color}
            fillOpacity={0.3}
            strokeWidth={2}
            style={{ cursor: cursorStyle }}
            onClick={isInteractive ? (handleChartClick as unknown as undefined) : undefined}
          />
        )
      case 'line':
      default:
        return (
          <Line
            {...commonProps}
            type={smooth ? 'monotone' : 'linear'}
            stroke={info.color}
            strokeWidth={2}
            dot={showDots ? { r: 4, cursor: cursorStyle } : false}
            activeDot={{
              r: 6,
              cursor: cursorStyle,
              onClick: isInteractive ? handleDotClick : undefined,
            } as Record<string, unknown>}
            fill={fillArea ? info.color : undefined}
            fillOpacity={fillArea ? 0.1 : undefined}
          />
        )
    }
  }

  return (
    <>
      <ChartWrapper title={title} showTitle={showTitle} isEmpty={isEmpty}>
        <ComposedChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={DARK_CHART_STYLES.gridColor} />}
          <XAxis
            dataKey="name"
            label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: -5 } : undefined}
            tick={{ fill: DARK_CHART_STYLES.axisColor }}
          />
          <YAxis
            label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined}
            tick={{ fill: DARK_CHART_STYLES.axisColor }}
          />
          <Tooltip contentStyle={DARK_CHART_STYLES.tooltip} />
          {showLegend && legendPosition !== 'none' && <Legend {...getLegendProps()} />}
          {dataKeys.map((key, index) => renderSeries(key, index))}
        </ComposedChart>
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
