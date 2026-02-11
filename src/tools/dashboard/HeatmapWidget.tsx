/**
 * HeatmapWidget — Heatmap visualization using CSS grid with color interpolation.
 */

import { useMemo } from 'react'
import { ChartWrapper } from './ChartWrapper.tsx'

// ── Types ───────────────────────────────────────

interface HeatmapCell {
  x: string
  y: string
  value: number
}

interface HeatmapWidgetProps {
  data: HeatmapCell[]
  title?: string
  showTitle?: boolean
  xLabels?: string[]
  yLabels?: string[]
  colorScale?: 'blue' | 'green' | 'red' | 'purple' | 'orange'
  showValues?: boolean
  minColor?: string
  maxColor?: string
}

// ── Color scales (dark-friendly) ────────────────

const COLOR_SCALES = {
  blue: { min: '#1e3a5f', max: '#3b82f6' },
  green: { min: '#14392a', max: '#22c55e' },
  red: { min: '#4c1420', max: '#ef4444' },
  purple: { min: '#2d1a4e', max: '#a855f7' },
  orange: { min: '#3d2008', max: '#f97316' },
}

function interpolateColor(color1: string, color2: string, ratio: number): string {
  const hex1 = color1.replace('#', '')
  const hex2 = color2.replace('#', '')

  const r1 = parseInt(hex1.substring(0, 2), 16)
  const g1 = parseInt(hex1.substring(2, 4), 16)
  const b1 = parseInt(hex1.substring(4, 6), 16)

  const r2 = parseInt(hex2.substring(0, 2), 16)
  const g2 = parseInt(hex2.substring(2, 4), 16)
  const b2 = parseInt(hex2.substring(4, 6), 16)

  const r = Math.round(r1 + (r2 - r1) * ratio)
  const g = Math.round(g1 + (g2 - g1) * ratio)
  const b = Math.round(b1 + (b2 - b1) * ratio)

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// ── Component ───────────────────────────────────

export function HeatmapWidget({
  data,
  title,
  showTitle = true,
  xLabels: providedXLabels,
  yLabels: providedYLabels,
  colorScale = 'blue',
  showValues = true,
  minColor,
  maxColor,
}: HeatmapWidgetProps) {
  const isEmpty = data.length === 0

  // Extract unique labels from data if not provided
  const { xLabels, yLabels, valueRange, cellMap } = useMemo(() => {
    const xSet = new Set<string>()
    const ySet = new Set<string>()
    let min = Infinity
    let max = -Infinity
    const map = new Map<string, number>()

    for (const cell of data) {
      xSet.add(cell.x)
      ySet.add(cell.y)
      min = Math.min(min, cell.value)
      max = Math.max(max, cell.value)
      map.set(`${cell.x}|${cell.y}`, cell.value)
    }

    return {
      xLabels: providedXLabels ?? Array.from(xSet),
      yLabels: providedYLabels ?? Array.from(ySet),
      valueRange: { min, max },
      cellMap: map,
    }
  }, [data, providedXLabels, providedYLabels])

  // Get color for a value
  const getColor = (value: number): string => {
    if (valueRange.max === valueRange.min) {
      return minColor ?? COLOR_SCALES[colorScale].max
    }
    const ratio = (value - valueRange.min) / (valueRange.max - valueRange.min)
    return interpolateColor(
      minColor ?? COLOR_SCALES[colorScale].min,
      maxColor ?? COLOR_SCALES[colorScale].max,
      ratio,
    )
  }

  return (
    <ChartWrapper title={title} showTitle={showTitle} isEmpty={isEmpty}>
      <div className="w-full h-full flex flex-col">
        {/* Main grid container */}
        <div className="flex-1 flex min-h-0">
          {/* Y-axis labels */}
          <div className="flex flex-col justify-around pr-2 text-xs text-dark-text-muted">
            {yLabels.map((label) => (
              <div key={label} className="truncate max-w-[80px]" title={label}>
                {label}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="flex-1 flex flex-col min-h-0">
            {yLabels.map((yLabel) => (
              <div key={yLabel} className="flex flex-1">
                {xLabels.map((xLabel) => {
                  const value = cellMap.get(`${xLabel}|${yLabel}`)
                  const hasValue = value !== undefined

                  return (
                    <div
                      key={`${xLabel}|${yLabel}`}
                      className="flex-1 flex items-center justify-center border border-dark-border/50 transition-opacity hover:opacity-80 cursor-pointer group relative"
                      style={{
                        backgroundColor: hasValue ? getColor(value) : 'transparent',
                      }}
                      title={hasValue ? `${xLabel}, ${yLabel}: ${value.toLocaleString()}` : ''}
                    >
                      {showValues && hasValue && (
                        <span
                          className="text-xs font-medium"
                          style={{
                            color:
                              (value - valueRange.min) / (valueRange.max - valueRange.min) > 0.5
                                ? '#fff'
                                : '#94a3b8',
                          }}
                        >
                          {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toLocaleString()}
                        </span>
                      )}
                      {/* Tooltip on hover */}
                      <div className="absolute hidden group-hover:block z-10 px-2 py-1 text-xs bg-dark-surface text-dark-text-primary rounded shadow-lg whitespace-nowrap -top-8 left-1/2 -translate-x-1/2 border border-dark-border">
                        {xLabel} x {yLabel}: {hasValue ? value.toLocaleString() : 'N/A'}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex pl-[88px] pt-2">
          {xLabels.map((label) => (
            <div
              key={label}
              className="flex-1 text-xs text-dark-text-muted text-center truncate"
              title={label}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Color legend */}
        <div className="flex items-center justify-center gap-2 mt-2 pt-2 border-t border-dark-border">
          <span className="text-xs text-dark-text-muted">
            {valueRange.min === Infinity ? 0 : valueRange.min.toLocaleString()}
          </span>
          <div
            className="w-24 h-3 rounded"
            style={{
              background: `linear-gradient(to right, ${minColor ?? COLOR_SCALES[colorScale].min}, ${maxColor ?? COLOR_SCALES[colorScale].max})`,
            }}
          />
          <span className="text-xs text-dark-text-muted">
            {valueRange.max === -Infinity ? 0 : valueRange.max.toLocaleString()}
          </span>
        </div>
      </div>
    </ChartWrapper>
  )
}
