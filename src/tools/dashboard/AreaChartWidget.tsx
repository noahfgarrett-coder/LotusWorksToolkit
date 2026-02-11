/**
 * AreaChartWidget — Area chart with combo chart support (area+bar+line).
 * Read-only visualization (no edit/drill-down interactions).
 */

import { memo } from 'react'
import {
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { ChartWrapper } from './ChartWrapper.tsx'
import { DEFAULT_CHART_COLORS, DARK_CHART_STYLES } from './types.ts'
import type { ChartDataPoint, SeriesInfo } from './useChartData.ts'
import type { LegendPosition } from './types.ts'

// ── Types ───────────────────────────────────────

interface AreaChartWidgetProps {
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
  stacked?: boolean
  smooth?: boolean
  seriesInfo?: SeriesInfo[]
}

// ── Component ───────────────────────────────────

export const AreaChartWidget = memo(function AreaChartWidget({
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
  stacked = false,
  smooth = true,
  seriesInfo,
}: AreaChartWidgetProps) {
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

  // Series info lookup
  const getSeriesInfo = (key: string, index: number) => {
    const info = seriesInfo?.find((s) => s.key === key)
    return {
      renderAs: info?.renderAs ?? 'area',
      color: info?.color ?? colors[index % colors.length],
      label: info?.label ?? key,
    }
  }

  // Render a series element
  const renderSeries = (key: string, index: number) => {
    const info = getSeriesInfo(key, index)
    const commonProps = { key, dataKey: key, name: info.label }

    switch (info.renderAs) {
      case 'bar':
        return (
          <Bar
            {...commonProps}
            fill={info.color}
            stackId={stacked ? 'stack' : undefined}
            radius={[4, 4, 0, 0]}
          />
        )
      case 'line':
        return (
          <Line
            {...commonProps}
            type={smooth ? 'monotone' : 'linear'}
            stroke={info.color}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        )
      case 'area':
      default:
        return (
          <Area
            {...commonProps}
            type={smooth ? 'monotone' : 'linear'}
            stackId={stacked ? 'stack' : undefined}
            stroke={info.color}
            fill={info.color}
            fillOpacity={0.6}
            strokeWidth={2}
          />
        )
    }
  }

  return (
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
  )
})
