/**
 * KPICard — Key Performance Indicator card with optional trend and sparkline.
 */

import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { formatNumber } from './useChartData.ts'

// ── Types ───────────────────────────────────────

interface KPICardProps {
  title: string
  value: number
  previousValue?: number
  format?: 'number' | 'currency' | 'percent' | 'compact' | 'decimal1' | 'decimal2'
  prefix?: string
  suffix?: string
  trendData?: number[]
  trendColor?: string
  invertTrend?: boolean
  subtitle?: string
  icon?: React.ReactNode
}

// ── Component ───────────────────────────────────

export function KPICard({
  title,
  value,
  previousValue,
  format = 'number',
  prefix = '',
  suffix = '',
  trendData,
  trendColor,
  invertTrend = false,
  subtitle,
  icon,
}: KPICardProps) {
  // Calculate trend percentage
  const trend = useMemo(() => {
    if (previousValue === undefined || previousValue === 0) return null
    const change = ((value - previousValue) / Math.abs(previousValue)) * 100
    return {
      value: change,
      direction: change > 0 ? ('up' as const) : change < 0 ? ('down' as const) : ('neutral' as const),
    }
  }, [value, previousValue])

  // Format the value
  const formattedValue = useMemo(() => {
    let formatted: string
    switch (format) {
      case 'currency':
        formatted = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(value)
        break
      case 'percent':
        formatted = `${value.toFixed(1)}%`
        break
      case 'compact':
        formatted = formatNumber(value, { compact: true })
        break
      case 'decimal1':
        formatted = value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        break
      case 'decimal2':
        formatted = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        break
      default:
        formatted = value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    }
    return `${prefix}${formatted}${suffix}`
  }, [value, format, prefix, suffix])

  // Determine trend color
  const getTrendColorClass = () => {
    if (trendColor) return ''
    if (!trend) return 'text-dark-text-muted'

    const isPositive = invertTrend
      ? trend.direction === 'down'
      : trend.direction === 'up'
    const isNegative = invertTrend
      ? trend.direction === 'up'
      : trend.direction === 'down'

    if (isPositive) return 'text-emerald-400'
    if (isNegative) return 'text-red-400'
    return 'text-dark-text-muted'
  }

  // Prepare sparkline data
  const sparklineData = useMemo(() => {
    if (!trendData || trendData.length === 0) return null
    return trendData.map((val, idx) => ({ value: val, index: idx }))
  }, [trendData])

  const sparklineColor = useMemo(() => {
    if (trendColor) return trendColor
    if (!trend) return '#6b7280'

    const isPositive = invertTrend
      ? trend.direction === 'down'
      : trend.direction === 'up'

    return isPositive ? '#10b981' : trend.direction === 'neutral' ? '#6b7280' : '#ef4444'
  }, [trend, trendColor, invertTrend])

  // Unique gradient ID to avoid SVG clashes when multiple KPIs render
  const gradientId = `sparklineGradient-${title.replace(/\s/g, '-')}-${Math.floor(value)}`

  return (
    <div className="bg-dark-surface rounded-xl border border-dark-border p-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon && (
            <div className="p-2 rounded-lg bg-[#F47B20]/10 text-[#F47B20]">
              {icon}
            </div>
          )}
          <h3 className="text-sm font-medium text-dark-text-secondary">
            {title}
          </h3>
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 ${getTrendColorClass()}`}
            style={trendColor ? { color: trendColor } : undefined}
          >
            {trend.direction === 'up' && <TrendingUp className="w-4 h-4" />}
            {trend.direction === 'down' && <TrendingDown className="w-4 h-4" />}
            {trend.direction === 'neutral' && <Minus className="w-4 h-4" />}
            <span className="text-sm font-medium">
              {Math.abs(trend.value).toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Value */}
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-3xl font-bold text-dark-text-primary">
          {formattedValue}
        </p>
        {subtitle && (
          <p className="text-sm text-dark-text-muted mt-1">{subtitle}</p>
        )}
      </div>

      {/* Sparkline */}
      {sparklineData && (
        <div className="h-12 mt-2 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={sparklineColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={sparklineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke={sparklineColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Previous value comparison */}
      {previousValue !== undefined && (
        <p className="text-xs text-dark-text-muted mt-2">
          Previous: {prefix}{previousValue.toLocaleString()}{suffix}
        </p>
      )}
    </div>
  )
}
