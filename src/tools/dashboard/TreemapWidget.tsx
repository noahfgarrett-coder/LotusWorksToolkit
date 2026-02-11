/**
 * TreemapWidget — Treemap visualization using Recharts.
 */

import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import { DEFAULT_CHART_COLORS, DARK_CHART_STYLES } from './types.ts'

// ── Types ───────────────────────────────────────

interface TreemapDataItem {
  name: string
  value: number
  children?: TreemapDataItem[]
  [key: string]: unknown
}

interface TreemapWidgetProps {
  data: TreemapDataItem[]
  title?: string
  showTitle?: boolean
  colors?: string[]
  showLabels?: boolean
  aspectRatio?: number
}

// ── Custom cell renderer ────────────────────────

interface CustomContentProps {
  x: number
  y: number
  width: number
  height: number
  index: number
  name: string
  value: number
  colors: string[]
  showLabels: boolean
  depth: number
}

function CustomContent({
  x,
  y,
  width,
  height,
  index,
  name,
  value,
  colors,
  showLabels,
  depth,
}: CustomContentProps) {
  // Only render leaf nodes (depth === 1)
  if (depth !== 1) return null

  const color = colors[index % colors.length]
  const showText = showLabels && width > 50 && height > 30
  const showValue = showLabels && width > 60 && height > 45

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.85}
        stroke={DARK_CHART_STYLES.gridColor}
        strokeWidth={2}
        rx={4}
        className="transition-all hover:fill-opacity-100 cursor-pointer"
      />
      {showText && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - (showValue ? 8 : 0)}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#fff"
            fontSize={Math.min(14, width / 8)}
            fontWeight="500"
            className="pointer-events-none"
          >
            {name.length > 15 ? `${name.slice(0, 12)}...` : name}
          </text>
          {showValue && (
            <text
              x={x + width / 2}
              y={y + height / 2 + 12}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#fff"
              fontSize={Math.min(12, width / 10)}
              fillOpacity={0.9}
              className="pointer-events-none"
            >
              {value >= 1_000_000
                ? `${(value / 1_000_000).toFixed(1)}M`
                : value >= 1_000
                  ? `${(value / 1_000).toFixed(1)}K`
                  : value.toLocaleString()}
            </text>
          )}
        </>
      )}
    </g>
  )
}

// ── Component ───────────────────────────────────

export function TreemapWidget({
  data,
  title,
  showTitle = true,
  colors = DEFAULT_CHART_COLORS,
  showLabels = true,
  aspectRatio = 4 / 3,
}: TreemapWidgetProps) {
  const isEmpty = data.length === 0

  if (isEmpty) {
    return (
      <div className="w-full h-full flex flex-col">
        {showTitle && title && (
          <h3 className="text-sm font-medium text-dark-text-primary mb-2">
            {title}
          </h3>
        )}
        <div className="flex-1 flex items-center justify-center text-dark-text-muted">
          No data available
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      {showTitle && title && (
        <h3 className="text-sm font-medium text-dark-text-primary mb-2">
          {title}
        </h3>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="value"
            aspectRatio={aspectRatio}
            stroke={DARK_CHART_STYLES.gridColor}
            content={
              <CustomContent
                x={0}
                y={0}
                width={0}
                height={0}
                index={0}
                name=""
                value={0}
                colors={colors}
                showLabels={showLabels}
                depth={0}
              />
            }
          >
            <Tooltip contentStyle={DARK_CHART_STYLES.tooltip} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {/* Legend — show top items */}
      <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-dark-border">
        {data.slice(0, 6).map((item, index) => (
          <div key={item.name} className="flex items-center gap-1 text-xs">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            <span className="text-dark-text-secondary truncate max-w-[100px]">
              {item.name}
            </span>
          </div>
        ))}
        {data.length > 6 && (
          <span className="text-xs text-dark-text-muted">+{data.length - 6} more</span>
        )}
      </div>
    </div>
  )
}
