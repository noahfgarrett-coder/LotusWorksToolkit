import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { downloadBlob } from '@/utils/download.ts'
import {
  Plus, Trash2, RotateCcw, Download, GripVertical, X,
  BarChart3, TrendingUp, Layers, Hash, Target,
} from 'lucide-react'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  PieChart, Pie, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts'
import * as XLSX from 'xlsx'

// ── Types ──────────────────────────────────────────────

type Row = Record<string, unknown>
type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'kpi'
type AggType = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'none'

interface Widget {
  id: string
  type: ChartType
  title: string
  xColumn: string
  yColumn: string
  aggregation: AggType
}

interface LayoutItem {
  i: string; x: number; y: number; w: number; h: number
}

// ── Constants ──────────────────────────────────────────

const AutoGrid = WidthProvider(GridLayout)

const COLORS = [
  '#F47B20', '#0077B6', '#22c55e', '#eab308', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#6366f1',
]

const CHART_TYPES: { type: ChartType; icon: React.ComponentType<{ size?: number; className?: string }>; label: string }[] = [
  { type: 'bar', icon: BarChart3, label: 'Bar' },
  { type: 'line', icon: TrendingUp, label: 'Line' },
  { type: 'pie', icon: Target, label: 'Pie' },
  { type: 'area', icon: Layers, label: 'Area' },
  { type: 'kpi', icon: Hash, label: 'KPI' },
]

const DEFAULT_SIZES: Record<ChartType, { w: number; h: number }> = {
  bar: { w: 4, h: 4 }, line: { w: 4, h: 4 }, pie: { w: 3, h: 4 },
  area: { w: 4, h: 4 }, kpi: { w: 2, h: 2 },
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12, color: 'white' },
  labelStyle: { color: 'rgba(255,255,255,0.5)' },
}

const AGG_OPTIONS: { value: AggType; label: string }[] = [
  { value: 'sum', label: 'Sum' }, { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' }, { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' }, { value: 'none', label: 'None (raw)' },
]

function genId() { return Math.random().toString(36).substring(2, 11) }

// ── Data helpers ───────────────────────────────────────

async function parseDataFile(file: File): Promise<{ columns: string[]; rows: Row[] }> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const jsonData = XLSX.utils.sheet_to_json(ws) as Row[]
  if (jsonData.length === 0) return { columns: [], rows: [] }
  return { columns: Object.keys(jsonData[0]), rows: jsonData }
}

function detectNumeric(columns: string[], rows: Row[]): Set<string> {
  const numeric = new Set<string>()
  for (const col of columns) {
    const sample = rows.slice(0, 50).map(r => r[col])
    const numCount = sample.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v))).length
    if (numCount > sample.length * 0.6) numeric.add(col)
  }
  return numeric
}

function aggregateData(rows: Row[], xCol: string, yCol: string, agg: AggType): { name: string; value: number }[] {
  if (agg === 'none') {
    return rows.slice(0, 200).map(r => ({
      name: String(r[xCol] ?? ''),
      value: Number(r[yCol] ?? 0) || 0,
    }))
  }

  const groups = new Map<string, number[]>()
  for (const row of rows) {
    const key = String(row[xCol] ?? '')
    const val = Number(row[yCol] ?? 0)
    if (!groups.has(key)) groups.set(key, [])
    if (!isNaN(val)) groups.get(key)!.push(val)
  }

  return Array.from(groups.entries()).map(([name, vals]) => {
    let value: number
    switch (agg) {
      case 'sum': value = vals.reduce((a, b) => a + b, 0); break
      case 'avg': value = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; break
      case 'count': value = vals.length; break
      case 'min': value = vals.length ? Math.min(...vals) : 0; break
      case 'max': value = vals.length ? Math.max(...vals) : 0; break
      default: value = vals[0] ?? 0
    }
    return { name, value: Math.round(value * 100) / 100 }
  })
}

function calculateKPI(rows: Row[], yCol: string, agg: AggType): number {
  const values = rows.map(r => Number(r[yCol] ?? 0)).filter(v => !isNaN(v))
  if (values.length === 0) return 0
  switch (agg) {
    case 'sum': return values.reduce((a, b) => a + b, 0)
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length
    case 'count': return values.length
    case 'min': return Math.min(...values)
    case 'max': return Math.max(...values)
    default: return values[0]
  }
}

// ── Chart renderer ─────────────────────────────────────

function ChartWidget({ widget, rows }: { widget: Widget; rows: Row[] }) {
  const data = useMemo(() => aggregateData(rows, widget.xColumn, widget.yColumn, widget.aggregation), [rows, widget])

  if (widget.type === 'kpi') {
    const value = calculateKPI(rows, widget.yColumn, widget.aggregation)
    return (
      <div className="h-full flex flex-col items-center justify-center px-4">
        <p className="text-3xl font-bold text-[#F47B20]">
          {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-white/40 mt-1">{widget.aggregation} of {widget.yColumn}</p>
      </div>
    )
  }

  if (widget.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            outerRadius="75%" innerRadius="30%" paddingAngle={2} stroke="none"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
            fontSize={9} fill={COLORS[0]}
          >
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  const axisProps = {
    stroke: 'rgba(255,255,255,0.12)',
    tick: { fill: 'rgba(255,255,255,0.35)', fontSize: 10 },
    tickLine: false,
    axisLine: false,
  }

  if (widget.type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Bar dataKey="value" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  if (widget.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2} dot={{ fill: COLORS[0], r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (widget.type === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} />
          <Tooltip {...TOOLTIP_STYLE} />
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2} fill="url(#areaGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return null
}

// ── Component ──────────────────────────────────────────

export default function DashboardTool() {
  const [fileName, setFileName] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [numericCols, setNumericCols] = useState<Set<string>>(new Set())
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [layout, setLayout] = useState<LayoutItem[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // New widget form state
  const [newType, setNewType] = useState<ChartType>('bar')
  const [newXCol, setNewXCol] = useState('')
  const [newYCol, setNewYCol] = useState('')
  const [newAgg, setNewAgg] = useState<AggType>('sum')
  const [newTitle, setNewTitle] = useState('')

  // Inject react-grid-layout dark theme overrides
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      .react-grid-placeholder { background: rgba(244,123,32,0.08) !important; border: 1px dashed rgba(244,123,32,0.3) !important; border-radius: 12px; }
      .react-resizable-handle::after { border-right-color: rgba(255,255,255,0.15) !important; border-bottom-color: rgba(255,255,255,0.15) !important; }
    `
    document.head.appendChild(style)
    return () => { document.head.removeChild(style) }
  }, [])

  // ── Data import ──────────────────────────────────────

  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setIsLoading(true)
    try {
      const { columns: cols, rows: r } = await parseDataFile(file)
      setColumns(cols)
      setRows(r)
      setFileName(file.name)
      setNumericCols(detectNumeric(cols, r))
      setWidgets([])
      setLayout([])
    } catch (err) {
      console.error('Failed to parse file:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── Widget management ────────────────────────────────

  const openAddModal = useCallback(() => {
    const categoryCols = columns.filter(c => !numericCols.has(c))
    const numCols = columns.filter(c => numericCols.has(c))
    setNewType('bar')
    setNewXCol(categoryCols[0] || columns[0] || '')
    setNewYCol(numCols[0] || columns[0] || '')
    setNewAgg('sum')
    setNewTitle('')
    setShowAddModal(true)
  }, [columns, numericCols])

  const handleAddWidget = useCallback(() => {
    if (!newYCol) return
    const id = genId()
    const title = newTitle || `${newType.charAt(0).toUpperCase() + newType.slice(1)} — ${newYCol}`
    const widget: Widget = { id, type: newType, title, xColumn: newXCol, yColumn: newYCol, aggregation: newAgg }
    setWidgets(prev => [...prev, widget])

    const size = DEFAULT_SIZES[newType]
    setLayout(prev => [...prev, { i: id, x: (prev.length * 4) % 12, y: Infinity, w: size.w, h: size.h }])
    setShowAddModal(false)
  }, [newType, newXCol, newYCol, newAgg, newTitle])

  const removeWidget = useCallback((id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id))
    setLayout(prev => prev.filter(l => l.i !== id))
  }, [])

  const handleLayoutChange = useCallback((newLayout: LayoutItem[]) => {
    setLayout(newLayout)
  }, [])

  // ── Export ───────────────────────────────────────────

  const handleExportPNG = useCallback(async () => {
    if (!gridRef.current) return
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(gridRef.current, {
        backgroundColor: '#0a0a14',
        scale: 2,
      })
      canvas.toBlob(blob => { if (blob) downloadBlob(blob, 'dashboard.png') })
    } catch {
      // Fallback: simple canvas approach
      const el = gridRef.current!
      const canvas = document.createElement('canvas')
      canvas.width = el.scrollWidth * 2
      canvas.height = el.scrollHeight * 2
      const ctx = canvas.getContext('2d')!
      ctx.scale(2, 2)
      ctx.fillStyle = '#0a0a14'
      ctx.fillRect(0, 0, el.scrollWidth, el.scrollHeight)
      ctx.fillStyle = '#ffffff'
      ctx.font = '16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Use browser screenshot to export', el.scrollWidth / 2, el.scrollHeight / 2)
      canvas.toBlob(blob => { if (blob) downloadBlob(blob, 'dashboard.png') })
    }
  }, [])

  // ── Reset ────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setColumns([])
    setRows([])
    setFileName('')
    setWidgets([])
    setLayout([])
    setNumericCols(new Set())
  }, [])

  // ── Render ───────────────────────────────────────────

  if (columns.length === 0) {
    return (
      <div className="h-full flex flex-col gap-4">
        <FileDropZone
          onFiles={handleFiles}
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple={false}
          label="Drop a CSV or Excel file"
          description="Import data to create charts and dashboards"
          className="h-full"
        />
        {isLoading && (
          <div className="text-center text-sm text-white/40">Loading data...</div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* ── Toolbar ─────────────────────────────── */}
      <div className="flex items-center gap-3 px-1 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-white/60 truncate max-w-[200px]">{fileName}</span>
          <span className="text-[10px] text-white/25">{rows.length.toLocaleString()} rows · {columns.length} cols</span>
        </div>
        <div className="flex-1" />
        <Button size="sm" onClick={openAddModal} icon={<Plus size={12} />}>
          Add Widget
        </Button>
        <Button variant="ghost" size="sm" onClick={handleReset} icon={<RotateCcw size={12} />}>
          New Data
        </Button>
      </div>

      {/* ── Dashboard Grid ──────────────────────── */}
      <div ref={gridRef} className="flex-1 overflow-auto">
        {widgets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white/20 gap-3">
            <BarChart3 size={32} />
            <p className="text-sm">No widgets yet</p>
            <Button size="sm" onClick={openAddModal} icon={<Plus size={12} />}>
              Add Your First Widget
            </Button>
          </div>
        ) : (
          <AutoGrid
            layout={layout}
            cols={12}
            rowHeight={80}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".drag-handle"
            margin={[12, 12]}
            compactType="vertical"
            useCSSTransforms
          >
            {widgets.map(w => (
              <div key={w.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden flex flex-col">
                {/* Widget header */}
                <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 border-b border-white/[0.04]">
                  <div className="drag-handle cursor-grab active:cursor-grabbing p-0.5 text-white/20 hover:text-white/40">
                    <GripVertical size={12} />
                  </div>
                  <span className="text-[11px] text-white/70 font-medium flex-1 truncate">{w.title}</span>
                  <button onClick={() => removeWidget(w.id)} className="p-0.5 text-white/15 hover:text-red-400 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
                {/* Chart content */}
                <div className="flex-1 p-2 min-h-0">
                  <ChartWidget widget={w} rows={rows} />
                </div>
              </div>
            ))}
          </AutoGrid>
        )}
      </div>

      {/* ── Add Widget Modal ────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="bg-[#12121a] border border-white/[0.1] rounded-xl p-5 w-[380px] space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-white">Add Widget</h3>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-white/30 hover:text-white">
                <X size={14} />
              </button>
            </div>

            {/* Chart type */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">Type</span>
              <div className="grid grid-cols-5 gap-1.5">
                {CHART_TYPES.map(t => (
                  <button
                    key={t.type}
                    onClick={() => setNewType(t.type)}
                    className={`p-2 rounded-lg text-center transition-colors ${
                      newType === t.type ? 'bg-[#F47B20] text-white' : 'bg-white/[0.05] text-white/40 hover:text-white'
                    }`}
                  >
                    <t.icon size={16} className="mx-auto mb-0.5" />
                    <span className="text-[9px]">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* X Column (not for KPI) */}
            {newType !== 'kpi' && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-white/50 uppercase tracking-wider">
                  {newType === 'pie' ? 'Category Column' : 'X Axis'}
                </span>
                <select
                  value={newXCol}
                  onChange={e => setNewXCol(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white"
                >
                  {columns.map(c => (
                    <option key={c} value={c}>{c} {numericCols.has(c) ? '(#)' : '(A)'}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Y Column */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">
                {newType === 'kpi' ? 'Metric Column' : newType === 'pie' ? 'Value Column' : 'Y Axis'}
              </span>
              <select
                value={newYCol}
                onChange={e => setNewYCol(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white"
              >
                {columns.filter(c => numericCols.has(c)).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                {columns.filter(c => !numericCols.has(c)).length === columns.length && (
                  columns.map(c => <option key={c} value={c}>{c}</option>)
                )}
              </select>
            </div>

            {/* Aggregation */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">Aggregation</span>
              <select
                value={newAgg}
                onChange={e => setNewAgg(e.target.value as AggType)}
                className="w-full px-3 py-2 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white"
              >
                {AGG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-white/50 uppercase tracking-wider">Title (optional)</span>
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Auto-generated if empty"
                className="w-full px-3 py-2 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white placeholder:text-white/20 focus:outline-none focus:border-[#F47B20]/40"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleAddWidget} className="flex-1">Add Widget</Button>
              <Button variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
