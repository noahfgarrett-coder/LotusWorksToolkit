/**
 * BackgroundEditor — Dashboard background customizer.
 * Templates tab: dark-friendly presets.
 * Custom tab: solid/gradient/pattern with live preview.
 */

import { useState, useMemo } from 'react'
import { X, Palette, Layers } from 'lucide-react'
import type { DashboardBackground, BackgroundTemplate } from './types.ts'
import { BACKGROUND_TEMPLATES } from './types.ts'
import { backgroundToCSS, backgroundSizeCSS } from './DashboardCanvas.tsx'

// ── Types ───────────────────────────────────────

interface BackgroundEditorProps {
  current?: DashboardBackground
  onApply: (bg: DashboardBackground | undefined) => void
  onClose: () => void
}

type TabId = 'templates' | 'custom'
type Category = 'all' | 'dark' | 'gradient' | 'vibrant' | 'pattern'

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'dark', label: 'Dark' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'vibrant', label: 'Vibrant' },
  { id: 'pattern', label: 'Pattern' },
]

// ── Component ───────────────────────────────────

export function BackgroundEditor({ current, onApply, onClose }: BackgroundEditorProps) {
  const [tab, setTab] = useState<TabId>('templates')
  const [category, setCategory] = useState<Category>('all')
  const [preview, setPreview] = useState<DashboardBackground | undefined>(current)

  // Custom editor state
  const [bgType, setBgType] = useState<DashboardBackground['type']>(current?.type ?? 'solid')
  const [color1, setColor1] = useState(current?.color1 ?? '#0f172a')
  const [color2, setColor2] = useState(current?.color2 ?? '#1e1b4b')
  const [color3, setColor3] = useState(current?.color3 ?? '')
  const [angle, setAngle] = useState(current?.angle ?? 180)
  const [gradientType, setGradientType] = useState<'linear' | 'radial' | 'conic'>(
    current?.gradientType ?? 'linear',
  )
  const [pattern, setPattern] = useState(current?.pattern ?? 'dots')

  // Filtered templates
  const filteredTemplates = useMemo(() => {
    if (category === 'all') return BACKGROUND_TEMPLATES
    return BACKGROUND_TEMPLATES.filter((t) => t.category === category)
  }, [category])

  // Build custom background from editor state
  const customBg: DashboardBackground = useMemo(() => {
    const bg: DashboardBackground = { type: bgType, color1 }
    if (bgType === 'gradient') {
      bg.color2 = color2
      if (color3) bg.color3 = color3
      bg.angle = angle
      bg.gradientType = gradientType
    }
    if (bgType === 'pattern') {
      bg.color2 = color2
      bg.pattern = pattern
    }
    return bg
  }, [bgType, color1, color2, color3, angle, gradientType, pattern])

  // Apply template to preview
  const selectTemplate = (t: BackgroundTemplate) => {
    setPreview(t.background)
    // Also update custom editor to match
    setBgType(t.background.type)
    setColor1(t.background.color1)
    setColor2(t.background.color2 ?? '#1e1b4b')
    setColor3(t.background.color3 ?? '')
    setAngle(t.background.angle ?? 180)
    setGradientType(t.background.gradientType ?? 'linear')
    if (t.background.pattern) setPattern(t.background.pattern)
  }

  // Update preview from custom editor
  const updateCustomPreview = () => {
    setPreview(customBg)
  }

  return (
    <div className="w-[620px] max-w-[95vw]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-dark-border">
        <h3 className="text-sm font-semibold text-dark-text-primary">Dashboard Background</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.08]">
          <X size={16} className="text-dark-text-muted" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-dark-border">
        <button
          onClick={() => setTab('templates')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors ${
            tab === 'templates'
              ? 'text-[#F47B20] border-b-2 border-[#F47B20]'
              : 'text-dark-text-muted hover:text-dark-text-primary'
          }`}
        >
          <Layers size={14} />
          Templates
        </button>
        <button
          onClick={() => setTab('custom')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-colors ${
            tab === 'custom'
              ? 'text-[#F47B20] border-b-2 border-[#F47B20]'
              : 'text-dark-text-muted hover:text-dark-text-primary'
          }`}
        >
          <Palette size={14} />
          Custom
        </button>
      </div>

      {/* Content */}
      <div className="flex min-h-[320px]">
        {/* Left panel */}
        <div className="flex-1 p-4 overflow-auto max-h-[400px]">
          {tab === 'templates' ? (
            <>
              {/* Category filter */}
              <div className="flex gap-1 mb-3 flex-wrap">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                      category === c.id
                        ? 'bg-[#F47B20]/20 text-[#F47B20]'
                        : 'bg-white/[0.04] text-dark-text-muted hover:bg-white/[0.08]'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {/* Template grid */}
              <div className="grid grid-cols-3 gap-2">
                {filteredTemplates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    className={`relative h-16 rounded-lg overflow-hidden border-2 transition-all ${
                      preview &&
                      preview.color1 === t.background.color1 &&
                      preview.type === t.background.type
                        ? 'border-[#F47B20]'
                        : 'border-transparent hover:border-white/[0.15]'
                    }`}
                    style={{
                      background: backgroundToCSS(t.background),
                      backgroundSize: backgroundSizeCSS(t.background),
                    }}
                    title={t.name}
                  >
                    <span className="absolute bottom-1 left-1.5 text-[9px] text-white/60 font-medium drop-shadow-md">
                      {t.name}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Custom editor */
            <div className="space-y-4">
              {/* Type selector */}
              <div>
                <label className="text-[10px] text-dark-text-muted uppercase tracking-wider mb-1.5 block">
                  Type
                </label>
                <div className="flex gap-1">
                  {(['solid', 'gradient', 'pattern'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setBgType(t); updateCustomPreview() }}
                      className={`flex-1 px-3 py-1.5 text-xs rounded-lg capitalize transition-colors ${
                        bgType === t
                          ? 'bg-[#F47B20]/20 text-[#F47B20]'
                          : 'bg-white/[0.04] text-dark-text-muted hover:bg-white/[0.08]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color 1 (always shown) */}
              <ColorInput label="Color 1" value={color1} onChange={(v) => { setColor1(v); setPreview(undefined) }} />

              {/* Color 2 (gradient + pattern) */}
              {bgType !== 'solid' && (
                <ColorInput label="Color 2" value={color2} onChange={(v) => { setColor2(v); setPreview(undefined) }} />
              )}

              {/* Gradient options */}
              {bgType === 'gradient' && (
                <>
                  <ColorInput label="Color 3 (optional)" value={color3} onChange={(v) => { setColor3(v); setPreview(undefined) }} />

                  <div>
                    <label className="text-[10px] text-dark-text-muted uppercase tracking-wider mb-1.5 block">
                      Gradient Type
                    </label>
                    <div className="flex gap-1">
                      {(['linear', 'radial', 'conic'] as const).map((gt) => (
                        <button
                          key={gt}
                          onClick={() => { setGradientType(gt); setPreview(undefined) }}
                          className={`flex-1 px-2 py-1.5 text-xs rounded-lg capitalize transition-colors ${
                            gradientType === gt
                              ? 'bg-[#F47B20]/20 text-[#F47B20]'
                              : 'bg-white/[0.04] text-dark-text-muted hover:bg-white/[0.08]'
                          }`}
                        >
                          {gt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {gradientType !== 'radial' && (
                    <div>
                      <label className="text-[10px] text-dark-text-muted uppercase tracking-wider mb-1.5 block">
                        Angle: {angle}&deg;
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        value={angle}
                        onChange={(e) => { setAngle(Number(e.target.value)); setPreview(undefined) }}
                        className="w-full accent-[#F47B20]"
                      />
                    </div>
                  )}
                </>
              )}

              {/* Pattern options */}
              {bgType === 'pattern' && (
                <div>
                  <label className="text-[10px] text-dark-text-muted uppercase tracking-wider mb-1.5 block">
                    Pattern
                  </label>
                  <div className="flex gap-1">
                    {(['dots', 'grid', 'diagonal'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => { setPattern(p); setPreview(undefined) }}
                        className={`flex-1 px-2 py-1.5 text-xs rounded-lg capitalize transition-colors ${
                          pattern === p
                            ? 'bg-[#F47B20]/20 text-[#F47B20]'
                            : 'bg-white/[0.04] text-dark-text-muted hover:bg-white/[0.08]'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Apply custom to preview */}
              <button
                onClick={() => setPreview(customBg)}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-white/[0.06] hover:bg-white/[0.1]
                  text-dark-text-primary transition-colors"
              >
                Preview Custom
              </button>
            </div>
          )}
        </div>

        {/* Right panel: live preview */}
        <div className="w-[200px] p-4 border-l border-dark-border flex flex-col">
          <span className="text-[10px] text-dark-text-muted uppercase tracking-wider mb-2">Preview</span>
          <div
            className="flex-1 rounded-lg border border-dark-border overflow-hidden"
            style={{
              background: preview ? backgroundToCSS(preview) : '#0a0a14',
              backgroundSize: preview ? backgroundSizeCSS(preview) : undefined,
            }}
          >
            {/* Mini widget placeholders */}
            <div className="p-3 h-full flex flex-col gap-2">
              <div className="h-8 rounded bg-white/[0.06] border border-white/[0.04]" />
              <div className="flex-1 flex gap-2">
                <div className="flex-1 rounded bg-white/[0.06] border border-white/[0.04]" />
                <div className="flex-1 rounded bg-white/[0.06] border border-white/[0.04]" />
              </div>
              <div className="h-6 rounded bg-white/[0.06] border border-white/[0.04]" />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-dark-border">
        <button
          onClick={() => onApply(undefined)}
          className="text-xs text-dark-text-muted hover:text-red-400 transition-colors"
        >
          Reset to Default
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-lg bg-white/[0.06] hover:bg-white/[0.1]
              text-dark-text-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(preview)}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-[#F47B20] hover:bg-[#F47B20]/90
              text-white transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Color Input ─────────────────────────────────

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="text-[10px] text-dark-text-muted uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-dark-border cursor-pointer bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-2 py-1.5 text-xs font-mono bg-white/[0.04] border border-dark-border rounded-lg
            text-dark-text-primary placeholder:text-dark-text-muted/50 focus:outline-none focus:border-[#F47B20]/50"
        />
      </div>
    </div>
  )
}
