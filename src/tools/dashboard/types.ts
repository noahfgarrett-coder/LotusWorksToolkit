/**
 * Dashboard Tool — Unified Type Definitions
 * Merged from dashboard-creator's data, filter, chart, and dashboard types.
 */

// ────────────────────────────────────────────────
//  Data Types
// ────────────────────────────────────────────────

/** Column data types */
export type ColumnType = 'string' | 'number' | 'date' | 'boolean'

/** Column definition */
export interface Column {
  id: string
  name: string
  type: ColumnType
  isComputed: boolean
  formula?: string
  sourceIndex?: number
}

/** A single row of data */
export type Row = Record<string, unknown>

/** Data source (imported file) */
export interface DataSource {
  id: string
  name: string
  fileName: string
  columns: Column[]
  rows: Row[]
  rowCount: number
  createdAt: string
  fileHandleId?: string
}

/** Metadata for a data source (without full data) */
export interface DataSourceMeta {
  id: string
  name: string
  fileName: string
  columns: Column[]
  rowCount: number
  createdAt: string
  fileHandleId?: string
}

/** Virtual table configuration (transformation) */
export interface VirtualTableConfig {
  id: string
  name: string
  sourceId: string
  filters?: FilterGroup
  computedColumns: ComputedColumn[]
  selectedColumns: string[]
}

/** Computed column definition */
export interface ComputedColumn {
  name: string
  formula: string
}

/** Conditional formatting rule types */
export type ConditionalFormatType = 'colorScale' | 'valueRule'

export type ConditionalFormatOperator =
  | '>' | '<' | '>=' | '<=' | '=' | '!='
  | 'contains' | 'isEmpty' | 'isNotEmpty'

export interface ConditionalFormatRule {
  id: string
  columnId: string
  type: ConditionalFormatType
  operator?: ConditionalFormatOperator
  value?: string | number
  backgroundColor?: string
  textColor?: string
  minColor?: string
  maxColor?: string
}

// ────────────────────────────────────────────────
//  Filter Types
// ────────────────────────────────────────────────

/** Filter comparison operators */
export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'in'
  | 'not_in'

/** Single filter condition */
export interface FilterCondition {
  id: string
  type: 'condition'
  column: string
  operator: FilterOperator
  value: string | number | boolean | null
  values?: (string | number)[]
}

/** Group of filter conditions with AND/OR logic */
export interface FilterGroup {
  id: string
  type: 'group'
  logic: 'AND' | 'OR'
  children: (FilterCondition | FilterGroup)[]
}

/** Type guard for FilterCondition */
export function isFilterCondition(
  filter: FilterCondition | FilterGroup
): filter is FilterCondition {
  return filter.type === 'condition'
}

/** Type guard for FilterGroup */
export function isFilterGroup(
  filter: FilterCondition | FilterGroup
): filter is FilterGroup {
  return filter.type === 'group'
}

/** Filter preset (saved filter configuration) */
export interface FilterPreset {
  id: string
  name: string
  dataSourceId: string
  filter: FilterGroup
  createdAt: string
}

/** Operator labels for UI display */
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  '=': 'equals',
  '!=': 'does not equal',
  '>': 'greater than',
  '>=': 'greater than or equal',
  '<': 'less than',
  '<=': 'less than or equal',
  'contains': 'contains',
  'not_contains': 'does not contain',
  'starts_with': 'starts with',
  'ends_with': 'ends with',
  'is_empty': 'is empty',
  'is_not_empty': 'is not empty',
  'in': 'is one of',
  'not_in': 'is not one of',
}

/** Operators available for each column type */
export const TYPE_OPERATORS: Record<string, FilterOperator[]> = {
  string: ['=', '!=', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty', 'in', 'not_in'],
  number: ['=', '!=', '>', '>=', '<', '<=', 'is_empty', 'is_not_empty', 'in', 'not_in'],
  date: ['=', '!=', '>', '>=', '<', '<=', 'is_empty', 'is_not_empty'],
  boolean: ['=', '!=', 'is_empty', 'is_not_empty'],
}

// ────────────────────────────────────────────────
//  Chart Types
// ────────────────────────────────────────────────

/** Supported chart types */
export type ChartType =
  | 'bar'
  | 'line'
  | 'pie'
  | 'area'
  | 'scatter'
  | 'heatmap'
  | 'treemap'
  | 'kpi'
  | 'text'
  | 'divider'

/** Aggregation methods for data */
export type AggregationType = 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max' | 'distinct'

/** Legend position */
export type LegendPosition = 'top' | 'bottom' | 'left' | 'right' | 'none'

/** Value format options */
export type ValueFormat = 'number' | 'currency' | 'percent' | 'compact' | 'decimal1' | 'decimal2'

/** Label position for pie charts */
export type PieLabelPosition = 'inside' | 'outside' | 'none'

/** Series render type for combo charts */
export type SeriesRenderType = 'bar' | 'line' | 'area'

/** Axis configuration */
export interface AxisConfig {
  column: string
  label?: string
  showGrid?: boolean
  min?: number
  max?: number
  format?: string
}

/** Series configuration (for multi-series charts) */
export interface SeriesConfig {
  column: string
  name?: string
  color?: string
  aggregation: AggregationType
}

/** Individual data series configuration for multi-series charts */
export interface DataSeries {
  id: string
  column: string
  label?: string
  aggregation: AggregationType
  renderAs?: SeriesRenderType
  color?: string
  useSecondaryAxis?: boolean
}

/**
 * Flexible chart config for widget creation/editing.
 */
export interface ChartConfig {
  type: ChartType
  title?: string
  showTitle?: boolean

  // Data columns (legacy single-series support)
  xAxisColumn?: string
  yAxisColumns?: string[]
  labelColumn?: string
  valueColumn?: string
  categoryColumn?: string
  sizeColumn?: string

  // Multi-series support
  series?: DataSeries[]

  // Aggregation (legacy, used when series is not defined)
  aggregation?: AggregationType

  // Display options
  colors?: string[]
  showGrid?: boolean
  showLegend?: boolean
  legendPosition?: LegendPosition

  // Axis configuration
  xAxisLabel?: string
  yAxisLabel?: string
  xAxisTickRotation?: number
  yAxisMin?: number
  yAxisMax?: number
  valueFormat?: ValueFormat

  // Data labels
  showDataLabels?: boolean
  dataLabelPosition?: 'top' | 'center' | 'inside' | 'outside'

  // Reference lines
  showReferenceLine?: boolean
  referenceLineValue?: number
  referenceLineLabel?: string
  referenceLineColor?: string

  // Chart-specific options
  horizontal?: boolean
  stacked?: boolean
  smooth?: boolean
  showDots?: boolean
  fillArea?: boolean
  donut?: boolean
  innerRadius?: number
  showPercentage?: boolean
  showValues?: boolean
  showBubbles?: boolean
  colorScale?: 'blue' | 'green' | 'red' | 'purple' | 'orange'

  // Pie chart specific
  pieLabelPosition?: PieLabelPosition
  showPieLabels?: boolean
  showPieValues?: boolean
  startAngle?: number
  endAngle?: number
  explodeSlice?: number

  // KPI specific
  format?: ValueFormat
  prefix?: string
  suffix?: string
  showTrend?: boolean
  invertTrend?: boolean

  // Scatter specific
  showTrendLine?: boolean
  dotSize?: number

  // Drill-down support
  drillDownColumns?: string[]
}

/** Chart type labels for UI */
export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Bar Chart',
  line: 'Line Chart',
  pie: 'Pie Chart',
  area: 'Area Chart',
  scatter: 'Scatter Plot',
  heatmap: 'Heatmap',
  treemap: 'Treemap',
  kpi: 'KPI Card',
  text: 'Text Block',
  divider: 'Divider',
}

/** Chart recommendation */
export interface ChartRecommendation {
  type: ChartType
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export function getChartRecommendations(
  xColumnType: ColumnType | null,
  yColumnCount: number,
  yColumnType: ColumnType | null,
  hasSecondYColumn = false,
): ChartRecommendation[] {
  const recommendations: ChartRecommendation[] = []

  if (!xColumnType && !yColumnType) {
    return [{ type: 'bar', confidence: 'low', reason: 'Select data to get recommendations' }]
  }

  if (!xColumnType && yColumnType === 'number' && yColumnCount === 1) {
    recommendations.push({ type: 'kpi', confidence: 'high', reason: 'Single numeric value - perfect for a KPI card' })
  }

  if (xColumnType === 'string' && yColumnType === 'number') {
    recommendations.push({ type: 'bar', confidence: 'high', reason: 'Categorical data with numeric values' })
    recommendations.push({ type: 'pie', confidence: 'medium', reason: 'Show proportions of a whole' })
    recommendations.push({ type: 'treemap', confidence: 'medium', reason: 'Visualize hierarchical proportions' })
  }

  if (xColumnType === 'date' && yColumnType === 'number') {
    recommendations.push({ type: 'line', confidence: 'high', reason: 'Time series data - ideal for trends' })
    recommendations.push({ type: 'area', confidence: 'medium', reason: 'Show cumulative trends over time' })
  }

  if (xColumnType === 'number' && yColumnType === 'number') {
    recommendations.push({ type: 'scatter', confidence: 'high', reason: 'Two numeric columns - correlation analysis' })
    if (!hasSecondYColumn) {
      recommendations.push({ type: 'bar', confidence: 'medium', reason: 'Compare numeric values' })
    }
  }

  if (yColumnCount > 1) {
    recommendations.push({ type: 'line', confidence: 'high', reason: 'Multiple series - compare trends' })
    recommendations.push({ type: 'bar', confidence: 'medium', reason: 'Compare multiple metrics' })
  }

  if (recommendations.length === 0) {
    recommendations.push({ type: 'bar', confidence: 'low', reason: 'General purpose chart for most data' })
  }

  return recommendations
}

/** Generate a unique ID for series */
export function generateSeriesId(): string {
  return crypto.randomUUID()
}

/** Create a default series */
export function createDefaultSeries(column?: string): DataSeries {
  return {
    id: generateSeriesId(),
    column: column ?? '',
    aggregation: 'sum',
    renderAs: 'bar',
  }
}

/** Default colors for charts */
export const DEFAULT_CHART_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1',
]

/** Color palette presets */
export interface ColorPalette {
  id: string
  name: string
  colors: string[]
}

export const COLOR_PALETTES: ColorPalette[] = [
  { id: 'default', name: 'Default', colors: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#6366f1'] },
  { id: 'vibrant', name: 'Vibrant', colors: ['#e11d48', '#7c3aed', '#0891b2', '#65a30d', '#ea580c', '#db2777', '#4f46e5', '#0d9488', '#ca8a04', '#dc2626'] },
  { id: 'pastel', name: 'Pastel', colors: ['#93c5fd', '#86efac', '#fde047', '#fca5a5', '#c4b5fd', '#a5f3fc', '#fdba74', '#f9a8d4', '#99f6e4', '#a5b4fc'] },
  { id: 'earth', name: 'Earth Tones', colors: ['#78716c', '#a16207', '#065f46', '#7c2d12', '#44403c', '#854d0e', '#047857', '#9a3412', '#57534e', '#a16207'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0284c7', '#0891b2', '#0d9488', '#059669', '#16a34a', '#0369a1', '#0e7490', '#0f766e', '#047857', '#15803d'] },
  { id: 'sunset', name: 'Sunset', colors: ['#dc2626', '#ea580c', '#f59e0b', '#eab308', '#facc15', '#ef4444', '#f97316', '#fbbf24', '#fde047', '#fef08a'] },
  { id: 'berry', name: 'Berry', colors: ['#be185d', '#9333ea', '#7c3aed', '#6366f1', '#8b5cf6', '#a855f7', '#c026d3', '#d946ef', '#e879f9', '#f0abfc'] },
  { id: 'monochrome-blue', name: 'Blue Shades', colors: ['#1e3a8a', '#1e40af', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff'] },
  { id: 'monochrome-green', name: 'Green Shades', colors: ['#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7', '#f0fdf4'] },
  { id: 'corporate', name: 'Corporate', colors: ['#1e40af', '#374151', '#0f766e', '#7c3aed', '#0369a1', '#4b5563', '#115e59', '#5b21b6', '#075985', '#6b7280'] },
]

/** Sequential color palettes */
export const SEQUENTIAL_PALETTES = {
  blues: ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'],
  greens: ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#14532d'],
  reds: ['#fef2f2', '#fecaca', '#f87171', '#dc2626', '#7f1d1d'],
  purples: ['#faf5ff', '#e9d5ff', '#c084fc', '#9333ea', '#581c87'],
}

/** Diverging color palettes */
export const DIVERGING_PALETTES = {
  redBlue: ['#dc2626', '#fca5a5', '#f5f5f5', '#93c5fd', '#2563eb'],
  greenRed: ['#16a34a', '#86efac', '#f5f5f5', '#fca5a5', '#dc2626'],
}

// ────────────────────────────────────────────────
//  Dashboard Types
// ────────────────────────────────────────────────

/** Background type options */
export type BackgroundType = 'solid' | 'gradient' | 'pattern'

/** Dashboard background configuration */
export interface DashboardBackground {
  type: BackgroundType
  color1: string
  color2?: string
  color3?: string
  angle?: number
  gradientType?: 'linear' | 'radial' | 'conic'
  pattern?: string
  opacity?: number
}

/** Background template */
export interface BackgroundTemplate {
  id: string
  name: string
  category: 'dark' | 'gradient' | 'vibrant' | 'pattern'
  background: DashboardBackground
  preview: string
}

/** Dark-only background templates (toolkit palette) */
export const BACKGROUND_TEMPLATES: BackgroundTemplate[] = [
  // Dark solids
  { id: 'dark-slate', name: 'Dark Slate', category: 'dark', background: { type: 'solid', color1: '#0f172a' }, preview: '#0f172a' },
  { id: 'charcoal', name: 'Charcoal', category: 'dark', background: { type: 'solid', color1: '#18181b' }, preview: '#18181b' },
  { id: 'midnight', name: 'Midnight', category: 'dark', background: { type: 'solid', color1: '#020617' }, preview: '#020617' },
  { id: 'dark-purple', name: 'Dark Purple', category: 'dark', background: { type: 'solid', color1: '#1e1b4b' }, preview: '#1e1b4b' },
  { id: 'deep-navy', name: 'Deep Navy', category: 'dark', background: { type: 'solid', color1: '#00171F' }, preview: '#00171F' },
  { id: 'dark-base', name: 'Dark Base', category: 'dark', background: { type: 'solid', color1: '#0A0A0F' }, preview: '#0A0A0F' },

  // Dark gradients
  { id: 'radial-blue', name: 'Radial Blue', category: 'gradient', background: { type: 'gradient', color1: '#1e3a8a', color2: '#0f172a', gradientType: 'radial' }, preview: 'radial-gradient(circle, #1e3a8a, #0f172a)' },
  { id: 'radial-purple', name: 'Radial Purple', category: 'gradient', background: { type: 'gradient', color1: '#7c3aed', color2: '#1e1b4b', gradientType: 'radial' }, preview: 'radial-gradient(circle, #7c3aed, #1e1b4b)' },
  { id: 'cosmic', name: 'Cosmic', category: 'gradient', background: { type: 'gradient', color1: '#1e1b4b', color2: '#4c1d95', color3: '#be185d', angle: 135, gradientType: 'linear' }, preview: 'linear-gradient(135deg, #1e1b4b, #4c1d95, #be185d)' },
  { id: 'ocean-dark', name: 'Ocean Dark', category: 'gradient', background: { type: 'gradient', color1: '#0c4a6e', color2: '#0f172a', angle: 180, gradientType: 'linear' }, preview: 'linear-gradient(180deg, #0c4a6e, #0f172a)' },
  { id: 'lotus-gradient', name: 'Lotus', category: 'gradient', background: { type: 'gradient', color1: '#00171F', color2: '#003459', angle: 180, gradientType: 'linear' }, preview: 'linear-gradient(180deg, #00171F, #003459)' },

  // Vibrant darks
  { id: 'neon-glow', name: 'Neon Glow', category: 'vibrant', background: { type: 'gradient', color1: '#312e81', color2: '#581c87', color3: '#1e1b4b', angle: 45, gradientType: 'linear' }, preview: 'linear-gradient(45deg, #312e81, #581c87, #1e1b4b)' },
  { id: 'fire-dark', name: 'Fire Dark', category: 'vibrant', background: { type: 'gradient', color1: '#451a03', color2: '#7c2d12', color3: '#0f172a', angle: 180, gradientType: 'linear' }, preview: 'linear-gradient(180deg, #451a03, #7c2d12, #0f172a)' },
  { id: 'aurora-dark', name: 'Aurora', category: 'vibrant', background: { type: 'gradient', color1: '#064e3b', color2: '#0c4a6e', color3: '#0f172a', angle: 135, gradientType: 'linear' }, preview: 'linear-gradient(135deg, #064e3b, #0c4a6e, #0f172a)' },

  // Dark patterns
  { id: 'dark-dots', name: 'Dark Dots', category: 'pattern', background: { type: 'pattern', color1: '#0f172a', color2: '#1e293b', pattern: 'dots' }, preview: 'radial-gradient(#1e293b 1px, #0f172a 1px)' },
  { id: 'dark-grid', name: 'Dark Grid', category: 'pattern', background: { type: 'pattern', color1: '#0f172a', color2: '#1e293b', pattern: 'grid' }, preview: 'linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, #0f172a 1px)' },
  { id: 'dark-diagonal', name: 'Dark Diagonal', category: 'pattern', background: { type: 'pattern', color1: '#0f172a', color2: '#1e293b', pattern: 'diagonal' }, preview: 'repeating-linear-gradient(45deg, #1e293b, #1e293b 1px, #0f172a 1px, #0f172a 10px)' },
]

/** Dashboard widget layout item (react-grid-layout compatible) */
export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  static?: boolean
}

/** Responsive layouts for different breakpoints */
export interface ResponsiveLayouts {
  lg: LayoutItem[]
  md: LayoutItem[]
  sm: LayoutItem[]
}

/** Dashboard widget */
export interface Widget {
  id: string
  type: ChartType
  dataSourceId?: string
  title: string
  config: ChartConfig
  filter?: FilterGroup
  backgroundColor?: string
  createdAt: string
  updatedAt: string
}

/** Dashboard definition */
export interface Dashboard {
  id: string
  name: string
  description?: string
  layouts: ResponsiveLayouts
  widgetIds: string[]
  globalFilter?: FilterGroup
  autoRefresh?: number
  background?: DashboardBackground
  createdAt: string
  updatedAt: string
}

/** Dashboard export format */
export interface DashboardExport {
  version: 1
  dashboard: Dashboard
  widgets: Widget[]
  dataSourcesMeta: {
    id: string
    name: string
    fileName: string
    columns: { id: string; name: string; type: string }[]
    rowCount: number
  }[]
  exportedAt: string
}

/** Grid configuration */
export interface GridConfig {
  breakpoints: { lg: number; md: number; sm: number }
  cols: { lg: number; md: number; sm: number }
  rowHeight: number
  margin: [number, number]
  containerPadding: [number, number]
}

/** Default grid configuration */
export const DEFAULT_GRID_CONFIG: GridConfig = {
  breakpoints: { lg: 1200, md: 996, sm: 768 },
  cols: { lg: 12, md: 10, sm: 6 },
  rowHeight: 60,
  margin: [16, 16],
  containerPadding: [16, 16],
}

/** Default widget sizes by chart type */
export const DEFAULT_WIDGET_SIZES: Record<string, { w: number; h: number; minW: number; minH: number }> = {
  bar: { w: 4, h: 3, minW: 2, minH: 2 },
  line: { w: 4, h: 3, minW: 2, minH: 2 },
  area: { w: 4, h: 3, minW: 2, minH: 2 },
  pie: { w: 3, h: 3, minW: 2, minH: 2 },
  scatter: { w: 4, h: 3, minW: 2, minH: 2 },
  heatmap: { w: 4, h: 4, minW: 3, minH: 3 },
  treemap: { w: 4, h: 3, minW: 2, minH: 2 },
  kpi: { w: 2, h: 2, minW: 2, minH: 2 },
  text: { w: 4, h: 2, minW: 2, minH: 1 },
  divider: { w: 12, h: 1, minW: 2, minH: 1 },
}

// ────────────────────────────────────────────────
//  Dark Chart Style Constants
// ────────────────────────────────────────────────

/** Dark theme chart styles matching toolkit palette */
export const DARK_CHART_STYLES = {
  background: 'transparent',
  gridColor: 'rgba(255, 255, 255, 0.06)',
  axisColor: 'rgba(255, 255, 255, 0.30)',
  textColor: 'rgba(255, 255, 255, 0.75)',
  textMuted: 'rgba(255, 255, 255, 0.50)',
  tooltipBg: 'rgba(26, 26, 36, 0.90)',
  tooltipBorder: 'rgba(255, 255, 255, 0.06)',
  tooltipText: '#FFFFFF',
  selectionGlow: 'rgba(244, 123, 32, 0.4)',
  animationDuration: 300,
  /** Convenience: Recharts Tooltip contentStyle */
  tooltip: {
    backgroundColor: 'rgba(26, 26, 36, 0.90)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '8px',
    color: '#FFFFFF',
    backdropFilter: 'blur(8px)',
  },
} as const
