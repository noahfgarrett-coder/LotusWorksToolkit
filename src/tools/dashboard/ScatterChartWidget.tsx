/**
 * ScatterChartWidget — Scatter/bubble chart visualization.
 */

import { memo } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ZAxis,
} from 'recharts'
import { ChartWrapper } from './ChartWrapper.tsx'
import { DEFAULT_CHART_COLORS, DARK_CHART_STYLES } from './types.ts'
import type { LegendPosition } from './types.ts'

// ── Types ───────────────────────────────────────

interface ScatterDataPoint {
  x: number
  y: number
  z?: number
  name?: string
  [key: string]: unknown
}

interface ScatterSeries {
  name: string
  data: ScatterDataPoint[]
  color?: string
}

interface ScatterChartWidgetProps {
  series: ScatterSeries[]
  title?: string
  showTitle?: boolean
  colors?: string[]
  xAxisLabel?: string
  yAxisLabel?: string
  showGrid?: boolean
  showLegend?: boolean
  legendPosition?: LegendPosition
  showBubbles?: boolean
}

// ── Component ───────────────────────────────────

export const ScatterChartWidget = memo(function ScatterChartWidget({
  series,
  title,
  showTitle = true,
  colors = DEFAULT_CHART_COLORS,
  xAxisLabel,
  yAxisLabel,
  showGrid = true,
  showLegend = true,
  legendPosition = 'bottom',
  showBubbles = false,
}: ScatterChartWidgetProps) {
  const isEmpty = series.length === 0 || series.every((s) => s.data.length === 0)

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

  // Calculate z-axis range for bubble chart
  const getZAxisRange = (): [number, number] => {
    if (!showBubbles) return [50, 50]

    let minZ = Infinity
    let maxZ = -Infinity
    for (const s of series) {
      for (const point of s.data) {
        if (point.z !== undefined) {
          minZ = Math.min(minZ, point.z)
          maxZ = Math.max(maxZ, point.z)
        }
      }
    }

    if (minZ === Infinity || maxZ === -Infinity) return [50, 50]
    return [minZ === maxZ ? 50 : 20, minZ === maxZ ? 50 : 400]
  }

  return (
    <ChartWrapper title={title} showTitle={showTitle} isEmpty={isEmpty}>
      <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={DARK_CHART_STYLES.gridColor} />}
        <XAxis
          type="number"
          dataKey="x"
          name="x"
          label={xAxisLabel ? { value: xAxisLabel, position: 'insideBottom', offset: -5 } : undefined}
          tick={{ fill: DARK_CHART_STYLES.axisColor }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="y"
          label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined}
          tick={{ fill: DARK_CHART_STYLES.axisColor }}
        />
        {showBubbles && (
          <ZAxis
            type="number"
            dataKey="z"
            range={getZAxisRange()}
            name="size"
          />
        )}
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          contentStyle={DARK_CHART_STYLES.tooltip}
          formatter={(value, name) => {
            const num = typeof value === 'number' ? value : 0
            return [num.toLocaleString(), String(name)]
          }}
        />
        {showLegend && legendPosition !== 'none' && <Legend {...getLegendProps()} />}
        {series.map((s, index) => (
          <Scatter
            key={s.name}
            name={s.name}
            data={s.data}
            fill={s.color ?? colors[index % colors.length]}
            fillOpacity={0.7}
          />
        ))}
      </ScatterChart>
    </ChartWrapper>
  )
})
