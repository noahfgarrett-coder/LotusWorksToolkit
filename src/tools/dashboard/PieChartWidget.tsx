/**
 * PieChartWidget — Pie/Donut chart with color editing and drill-down support.
 */

import { useState, memo } from 'react'
import { createPortal } from 'react-dom'
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { ChartWrapper } from './ChartWrapper.tsx'
import { ChartElementEditor, DrillDownToast } from './ChartElementEditor.tsx'
import type { ChartElementInfo, DrillDownInfo } from './ChartElementEditor.tsx'
import { DEFAULT_CHART_COLORS, DARK_CHART_STYLES } from './types.ts'
import type { LegendPosition, FilterGroup } from './types.ts'
import { distributeColors, createDataHash } from './colorUtils.ts'

// ── Types ───────────────────────────────────────

interface PieDataEntry {
  name: string
  value: number
}

interface PieChartWidgetProps {
  data: PieDataEntry[]
  title?: string
  showTitle?: boolean
  colors?: string[]
  showLegend?: boolean
  legendPosition?: LegendPosition
  innerRadius?: number
  showPercentage?: boolean
  showLabels?: boolean
  isEditMode?: boolean
  labelColumn?: string
  filter?: FilterGroup
  onColorsChange?: (colors: string[]) => void
  onDrillDown?: (filter: FilterGroup) => void
  onSliceClick?: (sliceName: string, sliceValue: number) => void
}

// ── Component ───────────────────────────────────

export const PieChartWidget = memo(function PieChartWidget({
  data,
  title,
  showTitle = true,
  colors = DEFAULT_CHART_COLORS,
  showLegend = true,
  legendPosition = 'right',
  innerRadius = 0,
  showPercentage = true,
  showLabels = true,
  isEditMode = false,
  labelColumn,
  filter,
  onColorsChange,
  onDrillDown,
  onSliceClick,
}: PieChartWidgetProps) {
  const [selectedElement, setSelectedElement] = useState<ChartElementInfo | null>(null)
  const [drillDownInfo, setDrillDownInfo] = useState<DrillDownInfo | null>(null)

  const isEmpty = data.length === 0
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const isInteractive = isEditMode || !!onSliceClick || !!(labelColumn && onDrillDown)

  // Distribute colors across slices to avoid adjacent same colors
  const dataHash = createDataHash(data)
  const distributedColors = distributeColors(colors, data.length, dataHash)

  // Handle slice click
  const handleSliceClick = (entry: PieDataEntry, index: number, event: React.MouseEvent) => {
    event.stopPropagation()

    const displayedColor = distributedColors[index] ?? colors[index % colors.length]
    const paletteIndex = colors.indexOf(displayedColor)

    if (isEditMode) {
      setSelectedElement({
        type: 'slice',
        index,
        paletteIndex: paletteIndex >= 0 ? paletteIndex : index,
        currentColor: displayedColor,
        label: entry.name,
        value: entry.value,
        x: event.clientX,
        y: event.clientY,
      })
    } else if (onSliceClick) {
      onSliceClick(entry.name, entry.value)
    } else if (labelColumn && onDrillDown) {
      setDrillDownInfo({
        column: labelColumn,
        value: entry.name,
        label: entry.name,
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

  // Legend position → Recharts props
  const getLegendProps = () => {
    if (!showLegend || legendPosition === 'none') return undefined
    const props: Record<string, unknown> = {}
    switch (legendPosition) {
      case 'top': props.verticalAlign = 'top'; props.layout = 'horizontal'; break
      case 'bottom': props.verticalAlign = 'bottom'; props.layout = 'horizontal'; break
      case 'left': props.layout = 'vertical'; props.align = 'left'; props.verticalAlign = 'middle'; break
      case 'right': props.layout = 'vertical'; props.align = 'right'; props.verticalAlign = 'middle'; break
    }
    return props
  }

  // Custom label renderer
  const renderLabel = (props: {
    cx?: number
    cy?: number
    midAngle?: number
    innerRadius?: number
    outerRadius?: number
    percent?: number
    name?: string
  }) => {
    if (!showLabels) return null

    const { cx = 0, cy = 0, midAngle = 0, innerRadius: ir = 0, outerRadius: or = 0, percent = 0, name = '' } = props
    const RADIAN = Math.PI / 180
    const radius = ir + (or - ir) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    // Only show label if percentage is significant (>= 5%)
    if (percent < 0.05) return null

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight={500}
      >
        {showPercentage ? `${(percent * 100).toFixed(0)}%` : name}
      </text>
    )
  }

  return (
    <>
      <ChartWrapper title={title} showTitle={showTitle} isEmpty={isEmpty}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius="80%"
            dataKey="value"
            nameKey="name"
            labelLine={false}
            label={showLabels ? renderLabel : undefined}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={distributedColors[index]}
                stroke="transparent"
                style={{ cursor: isInteractive ? 'pointer' : 'default' }}
                onClick={
                  isInteractive
                    ? (e: React.MouseEvent) => handleSliceClick(entry, index, e)
                    : undefined
                }
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => {
              const num = typeof value === 'number' ? value : 0
              return [
                `${num.toLocaleString()} (${total > 0 ? ((num / total) * 100).toFixed(1) : 0}%)`,
                'Value',
              ]
            }}
            contentStyle={DARK_CHART_STYLES.tooltip}
          />
          {showLegend && legendPosition !== 'none' && (
            <Legend
              {...getLegendProps()}
              formatter={(value) => (
                <span className="text-sm text-dark-text-secondary">
                  {value}
                </span>
              )}
            />
          )}
        </PieChart>
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
