/**
 * DashboardCanvas — Responsive grid layout for dashboard widgets.
 * Uses react-grid-layout for drag/resize in edit mode.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import type { DashboardStore } from './dashboardStore.ts'
import type { LayoutItem, DashboardBackground } from './types.ts'
import { DEFAULT_GRID_CONFIG } from './types.ts'
import { WidgetRenderer } from './WidgetRenderer.tsx'

// ── Grid layout type shim ──────────────────────

interface GridLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

const ReactGridLayout = GridLayout as React.ComponentType<{
  className?: string
  layout?: GridLayoutItem[]
  cols?: number
  rowHeight?: number
  width: number
  margin?: [number, number]
  containerPadding?: [number, number]
  onLayoutChange?: (layout: GridLayoutItem[]) => void
  isDraggable?: boolean
  isResizable?: boolean
  draggableHandle?: string
  useCSSTransforms?: boolean
  compactType?: 'vertical' | 'horizontal' | null
  children?: React.ReactNode
}>

// ── Background CSS helpers ─────────────────────

function backgroundToCSS(bg: DashboardBackground): string {
  switch (bg.type) {
    case 'solid':
      return bg.color1
    case 'gradient': {
      const angle = bg.angle ?? 180
      const stops = [bg.color1, bg.color2, bg.color3].filter(Boolean).join(', ')
      switch (bg.gradientType) {
        case 'radial': return `radial-gradient(circle, ${stops})`
        case 'conic': return `conic-gradient(from ${angle}deg, ${stops})`
        default: return `linear-gradient(${angle}deg, ${stops})`
      }
    }
    case 'pattern': {
      const base = bg.color1
      const line = bg.color2 ?? 'rgba(255,255,255,0.06)'
      switch (bg.pattern) {
        case 'dots': return `radial-gradient(${line} 1px, ${base} 1px)`
        case 'grid': return `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, ${base} 1px)`
        case 'diagonal': return `repeating-linear-gradient(45deg, ${line}, ${line} 1px, ${base} 1px, ${base} 10px)`
        default: return base
      }
    }
    default:
      return 'transparent'
  }
}

function backgroundSizeCSS(bg: DashboardBackground): string | undefined {
  if (bg.type === 'pattern') {
    if (bg.pattern === 'dots') return '20px 20px'
    if (bg.pattern === 'grid') return '20px 20px'
  }
  return undefined
}

// ── Props ───────────────────────────────────────

interface DashboardCanvasProps {
  store: DashboardStore
  dashboardId: string
}

// ── Component ───────────────────────────────────

export function DashboardCanvas({ store, dashboardId }: DashboardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(1200)

  const {
    dashboards, widgets,
    updateLayouts, isEditMode,
    selectWidget, selectedWidgetId,
    dataSources,
  } = store

  const dashboard = dashboards.get(dashboardId)

  // Derive widgets from dashboard's widgetIds
  const dashboardWidgets = useMemo(() => {
    if (!dashboard) return []
    return dashboard.widgetIds
      .map((id) => widgets.get(id))
      .filter((w): w is NonNullable<typeof w> => w !== undefined)
  }, [dashboard, widgets])

  // Measure container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Determine current breakpoint and columns
  const { breakpoint, cols } = useMemo(() => {
    const { breakpoints, cols } = DEFAULT_GRID_CONFIG
    if (containerWidth >= breakpoints.lg) return { breakpoint: 'lg' as const, cols: cols.lg }
    if (containerWidth >= breakpoints.md) return { breakpoint: 'md' as const, cols: cols.md }
    return { breakpoint: 'sm' as const, cols: cols.sm }
  }, [containerWidth])

  // Handle layout changes
  const handleLayoutChange = useCallback(
    (newLayout: GridLayoutItem[]) => {
      if (isEditMode && dashboard) {
        const layoutItems: LayoutItem[] = newLayout.map((item) => ({
          i: item.i,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          minW: item.minW,
          minH: item.minH,
        }))
        const updatedLayouts = {
          ...dashboard.layouts,
          [breakpoint]: layoutItems,
        }
        updateLayouts(dashboardId, updatedLayouts)
      }
    },
    [dashboardId, isEditMode, updateLayouts, breakpoint, dashboard],
  )

  // Current layout for breakpoint
  const currentLayout = useMemo(() => {
    const layouts = dashboard?.layouts
    if (!layouts) return []
    return layouts[breakpoint] ?? []
  }, [dashboard, breakpoint])

  // Background styles
  const backgroundStyle = useMemo(() => {
    const bg = dashboard?.background
    if (!bg) return {}
    return {
      background: backgroundToCSS(bg),
      backgroundSize: backgroundSizeCSS(bg),
    }
  }, [dashboard?.background])

  if (!dashboard) {
    return (
      <div className="h-full flex items-center justify-center text-dark-text-muted">
        Dashboard not found
      </div>
    )
  }

  if (dashboardWidgets.length === 0) {
    return (
      <div
        ref={containerRef}
        className="h-full flex flex-col items-center justify-center text-dark-text-muted transition-all duration-300"
        style={backgroundStyle}
      >
        <div className="text-lg mb-2">No widgets yet</div>
        <p className="text-sm">
          {isEditMode
            ? 'Click "Add Widget" to create your first visualization'
            : 'Enable edit mode to add widgets to this dashboard'}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto p-4 transition-all duration-300"
      style={backgroundStyle}
    >
      <ReactGridLayout
        className="layout"
        layout={currentLayout}
        cols={cols}
        rowHeight={DEFAULT_GRID_CONFIG.rowHeight}
        width={containerWidth - 32}
        margin={DEFAULT_GRID_CONFIG.margin}
        containerPadding={DEFAULT_GRID_CONFIG.containerPadding}
        onLayoutChange={handleLayoutChange}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        draggableHandle=".widget-drag-handle"
        useCSSTransforms={true}
        compactType="vertical"
      >
        {dashboardWidgets.map((widget) => {
          const dataSource = widget.dataSourceId ? dataSources.get(widget.dataSourceId) : undefined

          return (
            <div
              key={widget.id}
              className={`bg-dark-surface rounded-xl border shadow-sm overflow-hidden transition-all ${
                selectedWidgetId === widget.id
                  ? 'border-[#F47B20] ring-2 ring-[#F47B20]/30'
                  : 'border-dark-border'
              } ${isEditMode ? 'cursor-move' : ''}`}
              onClick={() => isEditMode && selectWidget(widget.id)}
            >
              <WidgetRenderer
                widget={widget}
                dataSource={dataSource}
                isEditMode={isEditMode}
                isSelected={selectedWidgetId === widget.id}
                store={store}
              />
            </div>
          )
        })}
      </ReactGridLayout>
    </div>
  )
}

export { backgroundToCSS, backgroundSizeCSS }
