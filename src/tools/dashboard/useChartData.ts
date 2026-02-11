/**
 * Chart data hooks — transform raw rows into chart-ready data structures.
 * Supports multi-series with individual aggregations.
 */

import { useMemo } from 'react'
import type { Row, Column, AggregationType, DataSeries, SeriesRenderType } from './types.ts'

// ── Types ───────────────────────────────────────

export interface ChartDataPoint {
  name: string
  [key: string]: string | number | null
}

export interface AggregatedData {
  data: ChartDataPoint[]
  keys: string[]
  total: number
}

export interface SeriesInfo {
  key: string
  label: string
  aggregation: AggregationType
  renderAs: SeriesRenderType
  color?: string
}

// ── Helpers ─────────────────────────────────────

function aggregate(values: number[], method: AggregationType): number {
  if (values.length === 0) return 0
  switch (method) {
    case 'sum': return values.reduce((a, b) => a + b, 0)
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length
    case 'count': return values.length
    case 'min': return Math.min(...values)
    case 'max': return Math.max(...values)
    case 'distinct': return new Set(values).size
    case 'none':
    default: return values[0] ?? 0
  }
}

function getNumericValue(row: Row, columnId: string): number {
  const value = row[columnId]
  if (value == null) return 0
  if (typeof value === 'number') return value
  const num = parseFloat(String(value).replace(/[,$%]/g, ''))
  return isNaN(num) ? 0 : num
}

function getStringValue(row: Row, columnId: string): string {
  const value = row[columnId]
  if (value == null) return '(empty)'
  return String(value)
}

function sortByName(data: ChartDataPoint[]): void {
  data.sort((a, b) => {
    const numA = parseFloat(a.name)
    const numB = parseFloat(b.name)
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB
    return a.name.localeCompare(b.name)
  })
}

// ── Hooks ───────────────────────────────────────

/** Bar/line/area chart data */
export function useChartData(
  rows: Row[],
  _columns: Column[],
  xAxisColumn: string,
  yAxisColumns: string[],
  aggregation: AggregationType = 'sum',
): AggregatedData {
  return useMemo(() => {
    if (!xAxisColumn || yAxisColumns.length === 0 || rows.length === 0) {
      return { data: [], keys: yAxisColumns, total: 0 }
    }

    const groups = new Map<string, Row[]>()
    for (const row of rows) {
      const key = getStringValue(row, xAxisColumn)
      const existing = groups.get(key) ?? []
      existing.push(row)
      groups.set(key, existing)
    }

    const data: ChartDataPoint[] = []
    let total = 0

    for (const [key, groupRows] of groups) {
      const point: ChartDataPoint = { name: key }
      for (const yCol of yAxisColumns) {
        const values = groupRows.map((r) => getNumericValue(r, yCol))
        const aggValue = aggregate(values, aggregation)
        point[yCol] = aggValue
        total += aggValue
      }
      data.push(point)
    }

    sortByName(data)
    return { data, keys: yAxisColumns, total }
  }, [rows, xAxisColumn, yAxisColumns, aggregation])
}

/** Multi-series chart data with individual aggregations (combo charts) */
export function useMultiSeriesChartData(
  rows: Row[],
  columns: Column[],
  xAxisColumn: string,
  series: DataSeries[],
): { data: ChartDataPoint[]; seriesInfo: SeriesInfo[]; total: number } {
  return useMemo(() => {
    if (!xAxisColumn || series.length === 0 || rows.length === 0) {
      return { data: [], seriesInfo: [], total: 0 }
    }

    const groups = new Map<string, Row[]>()
    for (const row of rows) {
      const key = getStringValue(row, xAxisColumn)
      const existing = groups.get(key) ?? []
      existing.push(row)
      groups.set(key, existing)
    }

    const seriesInfo: SeriesInfo[] = series.map((s) => {
      const col = columns.find(c => c.id === s.column)
      return {
        key: s.column,
        label: s.label ?? col?.name ?? s.column,
        aggregation: s.aggregation,
        renderAs: s.renderAs ?? 'bar',
        color: s.color,
      }
    })

    const data: ChartDataPoint[] = []
    let total = 0

    for (const [key, groupRows] of groups) {
      const point: ChartDataPoint = { name: key }
      for (const s of series) {
        const values = groupRows.map((r) => getNumericValue(r, s.column))
        const aggValue = aggregate(values, s.aggregation)
        point[s.column] = aggValue
        total += aggValue
      }
      data.push(point)
    }

    sortByName(data)
    return { data, seriesInfo, total }
  }, [rows, columns, xAxisColumn, series])
}

/** Pie chart data */
export function usePieChartData(
  rows: Row[],
  _columns: Column[],
  labelColumn: string,
  valueColumn: string,
  aggregation: AggregationType = 'sum',
): { data: Array<{ name: string; value: number }>; total: number } {
  return useMemo(() => {
    if (!labelColumn || !valueColumn || rows.length === 0) {
      return { data: [], total: 0 }
    }

    const groups = new Map<string, number[]>()
    for (const row of rows) {
      const label = getStringValue(row, labelColumn)
      const value = getNumericValue(row, valueColumn)
      const existing = groups.get(label) ?? []
      existing.push(value)
      groups.set(label, existing)
    }

    const data: Array<{ name: string; value: number }> = []
    let total = 0

    for (const [label, values] of groups) {
      const aggValue = aggregate(values, aggregation)
      data.push({ name: label, value: aggValue })
      total += aggValue
    }

    data.sort((a, b) => b.value - a.value)
    return { data, total }
  }, [rows, labelColumn, valueColumn, aggregation])
}

/** Scatter chart data */
export function useScatterChartData(
  rows: Row[],
  _columns: Column[],
  xColumn: string,
  yColumn: string,
  categoryColumn?: string,
  sizeColumn?: string,
): { data: Array<{ x: number; y: number; category?: string; size?: number; name: string }>; categories: string[] } {
  return useMemo(() => {
    if (!xColumn || !yColumn || rows.length === 0) {
      return { data: [], categories: [] }
    }

    const categories = new Set<string>()
    const data = rows.map((row, idx) => {
      const category = categoryColumn ? getStringValue(row, categoryColumn) : undefined
      if (category) categories.add(category)

      return {
        x: getNumericValue(row, xColumn),
        y: getNumericValue(row, yColumn),
        category,
        size: sizeColumn ? getNumericValue(row, sizeColumn) : undefined,
        name: `Point ${idx + 1}`,
      }
    })

    return { data, categories: Array.from(categories) }
  }, [rows, xColumn, yColumn, categoryColumn, sizeColumn])
}

/** Heatmap data */
export function useHeatmapData(
  rows: Row[],
  _columns: Column[],
  xColumn: string,
  yColumn: string,
  valueColumn: string,
  aggregation: AggregationType = 'sum',
): { data: Array<{ x: string; y: string; value: number }>; xCategories: string[]; yCategories: string[]; min: number; max: number } {
  return useMemo(() => {
    if (!xColumn || !yColumn || !valueColumn || rows.length === 0) {
      return { data: [], xCategories: [], yCategories: [], min: 0, max: 0 }
    }

    const groups = new Map<string, number[]>()
    const xCats = new Set<string>()
    const yCats = new Set<string>()

    for (const row of rows) {
      const x = getStringValue(row, xColumn)
      const y = getStringValue(row, yColumn)
      const key = `${x}|${y}`
      xCats.add(x)
      yCats.add(y)

      const existing = groups.get(key) ?? []
      existing.push(getNumericValue(row, valueColumn))
      groups.set(key, existing)
    }

    const data: Array<{ x: string; y: string; value: number }> = []
    let min = Infinity
    let max = -Infinity

    for (const [key, values] of groups) {
      const [x, y] = key.split('|')
      const value = aggregate(values, aggregation)
      data.push({ x, y, value })
      min = Math.min(min, value)
      max = Math.max(max, value)
    }

    return {
      data,
      xCategories: Array.from(xCats).sort(),
      yCategories: Array.from(yCats).sort(),
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 0 : max,
    }
  }, [rows, xColumn, yColumn, valueColumn, aggregation])
}

/** KPI data */
export function useKPIData(
  rows: Row[],
  _columns: Column[],
  valueColumn: string,
  aggregation: AggregationType = 'sum',
  comparisonColumn?: string,
): { value: number; comparison?: number; change?: number; changePercent?: number } {
  return useMemo(() => {
    if (!valueColumn || rows.length === 0) {
      return { value: 0 }
    }

    const values = rows.map((r) => getNumericValue(r, valueColumn))
    const value = aggregate(values, aggregation)

    if (!comparisonColumn) {
      return { value }
    }

    const comparisonValues = rows.map((r) => getNumericValue(r, comparisonColumn))
    const comparison = aggregate(comparisonValues, aggregation)
    const change = value - comparison
    const changePercent = comparison !== 0 ? (change / comparison) * 100 : 0

    return { value, comparison, change, changePercent }
  }, [rows, valueColumn, aggregation, comparisonColumn])
}

// ── Utility Functions ───────────────────────────

/** Format a number for display with K/M/B suffixes */
export function formatNumber(
  value: number,
  options?: { decimals?: number; prefix?: string; suffix?: string; compact?: boolean },
): string {
  const { decimals = 0, prefix = '', suffix = '', compact = false } = options ?? {}

  let formatted: string

  if (compact) {
    if (Math.abs(value) >= 1_000_000_000) {
      formatted = (value / 1_000_000_000).toFixed(1) + 'B'
    } else if (Math.abs(value) >= 1_000_000) {
      formatted = (value / 1_000_000).toFixed(1) + 'M'
    } else if (Math.abs(value) >= 1_000) {
      formatted = (value / 1_000).toFixed(1) + 'K'
    } else {
      formatted = value.toFixed(decimals)
    }
  } else {
    formatted = value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  }

  return `${prefix}${formatted}${suffix}`
}

/** Get a color from a palette by index */
export function getColor(index: number, colors: string[]): string {
  return colors[index % colors.length]
}
