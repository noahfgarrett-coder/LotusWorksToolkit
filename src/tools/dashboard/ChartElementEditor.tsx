/**
 * ChartElementEditor — Popup for editing individual chart element colors.
 * DrillDownToast — Notification for applying a drill-down filter.
 */

import { useState, useEffect, useRef } from 'react'
import { X, Droplet } from 'lucide-react'
import { COLOR_PALETTES } from './types.ts'

// ── Types ───────────────────────────────────────

export interface ChartElementInfo {
  /** Type of element (bar, slice, line, etc.) */
  type: 'bar' | 'slice' | 'dot' | 'area' | 'cell'
  /** Index in the data array */
  index: number
  /** Index in the color palette to change (may differ from data index for distributed colors) */
  paletteIndex?: number
  /** Series key (for multi-series charts) */
  seriesKey?: string
  /** Current color of the element */
  currentColor: string
  /** Display name/label of the element */
  label: string
  /** Value of the element */
  value: number | string
  /** Position for the popup */
  x: number
  y: number
}

export interface DrillDownInfo {
  /** The column that was clicked */
  column: string
  /** The value to filter on */
  value: string | number
  /** Display name for the filter */
  label: string
  /** Series key if applicable */
  seriesKey?: string
}

// ── ChartElementEditor ─────────────────────────

interface ChartElementEditorProps {
  element: ChartElementInfo
  onColorChange: (color: string) => void
  onClose: () => void
}

export function ChartElementEditor({
  element,
  onColorChange,
  onClose,
}: ChartElementEditorProps) {
  const [customColor, setCustomColor] = useState(element.currentColor)
  const popupRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  // Position the popup near the clicked element but keep it in viewport
  const getPosition = () => {
    const padding = 16
    const popupWidth = 280
    const popupHeight = 320

    let left = element.x
    let top = element.y + 10

    if (left + popupWidth > window.innerWidth - padding) {
      left = window.innerWidth - popupWidth - padding
    }
    if (left < padding) left = padding

    if (top + popupHeight > window.innerHeight - padding) {
      top = element.y - popupHeight - 10
    }
    if (top < padding) top = padding

    return { left, top }
  }

  const position = getPosition()
  const quickColors = COLOR_PALETTES[0].colors.slice(0, 10)

  return (
    <div
      ref={popupRef}
      className="fixed z-[9999] bg-dark-surface rounded-lg shadow-xl border border-dark-border w-[280px] overflow-hidden"
      style={{ left: position.left, top: position.top }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bg">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded"
            style={{ backgroundColor: element.currentColor }}
          />
          <span className="font-medium text-sm text-dark-text-primary truncate max-w-[180px]">
            {element.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/[0.06] rounded text-dark-text-muted"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Value display */}
        <div className="text-center py-2 bg-dark-bg rounded">
          <span className="text-2xl font-bold text-dark-text-primary">
            {typeof element.value === 'number' ? element.value.toLocaleString() : element.value}
          </span>
        </div>

        {/* Quick color selection */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Droplet className="w-4 h-4 text-dark-text-muted" />
            <span className="text-sm font-medium text-dark-text-secondary">
              Change Color
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {quickColors.map((color) => (
              <button
                key={color}
                onClick={() => onColorChange(color)}
                className={`w-10 h-10 rounded-lg border-2 transition-all hover:scale-110 ${
                  color === element.currentColor
                    ? 'border-[#F47B20] ring-2 ring-[#F47B20]/30'
                    : 'border-transparent hover:border-dark-border'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>

        {/* Custom color picker */}
        <div>
          <label className="text-sm text-dark-text-muted mb-1 block">
            Custom Color
          </label>
          <div className="flex gap-2">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="w-12 h-10 rounded cursor-pointer border border-dark-border"
            />
            <input
              type="text"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-dark-border rounded bg-dark-bg text-dark-text-primary"
              placeholder="#000000"
            />
            <button
              onClick={() => onColorChange(customColor)}
              className="px-3 py-2 bg-[#F47B20] hover:bg-[#e06a10] text-white rounded text-sm font-medium transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── DrillDownToast ──────────────────────────────

interface DrillDownToastProps {
  info: DrillDownInfo
  onApply: () => void
  onDismiss: () => void
}

export function DrillDownToast({ info, onApply, onDismiss }: DrillDownToastProps) {
  const toastRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timeout = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timeout)
  }, [onDismiss])

  return (
    <div
      ref={toastRef}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-dark-surface text-dark-text-primary px-4 py-3 rounded-lg shadow-xl border border-dark-border flex items-center gap-4 animate-slide-up"
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          Filter by: {info.label} = &quot;{info.value}&quot;
        </span>
        <span className="text-xs text-dark-text-muted">
          Click Apply to add this filter
        </span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onApply}
          className="px-3 py-1.5 bg-[#F47B20] hover:bg-[#e06a10] text-white rounded text-sm font-medium transition-colors"
        >
          Apply
        </button>
        <button
          onClick={onDismiss}
          className="px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] rounded text-sm transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
