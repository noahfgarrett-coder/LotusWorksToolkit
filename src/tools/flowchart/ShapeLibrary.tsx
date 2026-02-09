import { useState } from 'react'
import type { FlowchartStore } from './flowchartStore.ts'
import type { ShapeType } from './types.ts'
import { SHAPE_DEFS, type ShapeDef } from './shapes.ts'
import { ChevronDown, ChevronRight } from 'lucide-react'

// ── Category grouping ───────────────────────────────────────

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'basic', label: 'Basic' },
  { key: 'flowchart', label: 'Flowchart' },
  { key: 'misc', label: 'Miscellaneous' },
]

function groupByCategory(): Map<string, ShapeDef[]> {
  const map = new Map<string, ShapeDef[]>()
  for (const cat of CATEGORIES) {
    map.set(cat.key, SHAPE_DEFS.filter(d => d.category === cat.key))
  }
  return map
}

const grouped = groupByCategory()

// ── Component ───────────────────────────────────────────────

export function ShapeLibrary({ store }: { store: FlowchartStore }) {
  const { toolMode, setToolMode } = store
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCategory = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectShape = (type: ShapeType) => {
    const isActive = typeof toolMode === 'object' && 'place' in toolMode && toolMode.place === type
    if (isActive) {
      setToolMode('select')
    } else {
      setToolMode({ place: type })
    }
  }

  return (
    <div className="w-[180px] flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-dark-elevated overflow-y-auto">
      <div className="px-3 py-2 text-[10px] font-semibold text-white/30 uppercase tracking-wider">
        Shapes
      </div>

      {CATEGORIES.map(cat => {
        const shapes = grouped.get(cat.key) || []
        const isCollapsed = collapsed.has(cat.key)
        const Chevron = isCollapsed ? ChevronRight : ChevronDown

        return (
          <div key={cat.key}>
            <button
              onClick={() => toggleCategory(cat.key)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-white/50 hover:text-white/70 transition-colors"
            >
              <Chevron size={10} />
              {cat.label}
            </button>

            {!isCollapsed && (
              <div className="grid grid-cols-2 gap-1 px-2 pb-2">
                {shapes.map(def => {
                  const isActive = typeof toolMode === 'object' && 'place' in toolMode && toolMode.place === def.type
                  return (
                    <ShapeTile
                      key={def.type}
                      def={def}
                      active={isActive}
                      onClick={() => selectShape(def.type)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Shape tile with SVG preview ─────────────────────────────

function ShapeTile({
  def,
  active,
  onClick,
}: {
  def: ShapeDef
  active: boolean
  onClick: () => void
}) {
  // Render a small preview of the shape
  const previewW = 50
  const previewH = 35
  const scaleX = previewW / def.defaultWidth
  const scaleY = previewH / def.defaultHeight
  const scale = Math.min(scaleX, scaleY) * 0.8
  const offsetX = (previewW - def.defaultWidth * scale) / 2
  const offsetY = (previewH - def.defaultHeight * scale) / 2

  return (
    <button
      title={def.label}
      onClick={onClick}
      className={`
        flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg transition-colors
        ${active
          ? 'bg-[#F47B20]/15 ring-1 ring-[#F47B20]/30'
          : 'hover:bg-white/[0.04]'
        }
      `}
    >
      <svg width={previewW} height={previewH} className="flex-shrink-0">
        <g transform={`translate(${offsetX}, ${offsetY}) scale(${scale})`}>
          <path
            d={def.svgPath(def.defaultWidth, def.defaultHeight)}
            fill={active ? 'rgba(244,123,32,0.15)' : 'rgba(255,255,255,0.06)'}
            stroke={active ? 'rgba(244,123,32,0.6)' : 'rgba(255,255,255,0.2)'}
            strokeWidth={1.5 / scale}
          />
        </g>
      </svg>
      <span className={`text-[9px] leading-tight ${active ? 'text-[#F47B20]' : 'text-white/40'}`}>
        {def.label}
      </span>
    </button>
  )
}
