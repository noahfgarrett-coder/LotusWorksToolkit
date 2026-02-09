import { useMemo, useRef, useCallback } from 'react'
import type { FormStore } from './formStore.ts'
import type { FormElement } from './types.ts'
import { ColorPicker } from '@/components/common/ColorPicker.tsx'
import { Slider } from '@/components/common/Slider.tsx'
import { readFileAsDataURL } from '@/utils/fileReader.ts'
import { loadImage, resizeImage } from '@/utils/imageProcessing.ts'
import { Trash2, Copy, Image as ImageIcon, X, Plus } from 'lucide-react'

const MAX_IMAGE_SIZE = 800

// ── Component ───────────────────────────────────────────────

export function PropertiesPanel({ store }: { store: FormStore }) {
  const { doc, selectedId, selectedIds, updateElement, removeSelectedElements, duplicateSelected } = store

  const selectedElement = useMemo(
    () => doc.elements.find(el => el.id === selectedId) ?? null,
    [doc.elements, selectedId],
  )

  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedElement) return

    try {
      const dataUrl = await readFileAsDataURL(file)
      const img = await loadImage(dataUrl)

      const scale = Math.min(MAX_IMAGE_SIZE / img.width, MAX_IMAGE_SIZE / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const resized = resizeImage(img, w, h)
      // Use PNG to preserve transparency; fall back to JPEG for large opaque images
      const pngDataUrl = resized.toDataURL('image/png')
      // If PNG is very large (>500KB), check if image has transparency — if not, use JPEG
      let finalDataUrl = pngDataUrl
      if (pngDataUrl.length > 500_000) {
        const ctx = resized.getContext('2d')
        const data = ctx?.getImageData(0, 0, resized.width, resized.height).data
        let hasAlpha = false
        if (data) {
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 250) { hasAlpha = true; break }
          }
        }
        if (!hasAlpha) finalDataUrl = resized.toDataURL('image/jpeg', 0.7)
      }
      updateElement(selectedElement.id, { imageDataUrl: finalDataUrl })
    } catch {
      // Silently fail on bad images
    }

    e.target.value = ''
  }, [selectedElement, updateElement])

  if (!selectedElement) {
    return (
      <div className="w-[260px] flex-shrink-0 border-l border-white/[0.06] bg-dark-elevated p-4">
        <p className="text-[10px] text-white/25 text-center mt-8">
          Select an element to edit its properties
        </p>
      </div>
    )
  }

  const multiCount = selectedIds.size
  const el = selectedElement

  const update = (updates: Partial<FormElement>) => {
    updateElement(el.id, updates)
  }

  return (
    <div className="w-[260px] flex-shrink-0 border-l border-white/[0.06] bg-dark-elevated overflow-y-auto">
      <div className="px-3 py-2 text-[10px] font-semibold text-white/30 uppercase tracking-wider border-b border-white/[0.06] flex items-center justify-between">
        <span>Properties</span>
        {multiCount > 1 && (
          <span className="text-[9px] text-[#3B82F6] bg-[#3B82F6]/10 px-1.5 py-0.5 rounded-full">
            {multiCount} selected
          </span>
        )}
      </div>

      <div className="p-3 space-y-4">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-[#F47B20] font-semibold">{el.type}</span>
          <span className="text-[10px] text-white/20">Page {el.pageIndex + 1}</span>
        </div>

        {/* Position */}
        <PropSection label="Position">
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="X" value={Math.round(el.x)} onChange={v => update({ x: v })} />
            <NumberInput label="Y" value={Math.round(el.y)} onChange={v => update({ y: v })} />
          </div>
        </PropSection>

        {/* Size */}
        <PropSection label="Size">
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="W" value={Math.round(el.width)} onChange={v => update({ width: Math.max(20, v) })} />
            <NumberInput label="H" value={Math.round(el.height)} onChange={v => update({ height: Math.max(20, v) })} />
          </div>
        </PropSection>

        {/* Label / Content */}
        {el.type !== 'divider' && el.type !== 'image' && (
          <PropSection label="Label">
            <input
              type="text"
              value={el.label}
              onChange={e => update({ label: e.target.value })}
              className="w-full px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white focus:outline-none focus:border-[#F47B20]/40"
            />
          </PropSection>
        )}

        {/* Placeholder */}
        {(el.type === 'text-input' || el.type === 'textarea') && (
          <PropSection label="Placeholder">
            <input
              type="text"
              value={el.placeholder ?? ''}
              onChange={e => update({ placeholder: e.target.value })}
              className="w-full px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white placeholder:text-white/20 focus:outline-none focus:border-[#F47B20]/40"
              placeholder="Placeholder text..."
            />
          </PropSection>
        )}

        {/* Required toggle */}
        {['text-input', 'textarea', 'checkbox', 'radio', 'select', 'date'].includes(el.type) && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Required</span>
            <button
              onClick={() => update({ required: !el.required })}
              className={`w-8 h-[18px] rounded-full transition-colors relative ${el.required ? 'bg-[#F47B20]' : 'bg-white/[0.1]'}`}
            >
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all ${el.required ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>
        )}

        {/* Options editor (radio / select) */}
        {(el.type === 'radio' || el.type === 'select') && (
          <PropSection label="Options">
            <div className="space-y-1">
              {(el.options ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="text"
                    value={opt}
                    onChange={e => {
                      const newOpts = [...(el.options ?? [])]
                      newOpts[i] = e.target.value
                      update({ options: newOpts })
                    }}
                    className="flex-1 px-2 py-1 text-xs bg-dark-surface border border-white/[0.06] rounded text-white/70 focus:outline-none focus:border-[#F47B20]/30"
                  />
                  <button
                    onClick={() => {
                      const newOpts = (el.options ?? []).filter((_, j) => j !== i)
                      update({ options: newOpts })
                    }}
                    className="p-0.5 text-white/20 hover:text-red-400"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => update({ options: [...(el.options ?? []), `Option ${(el.options?.length ?? 0) + 1}`] })}
                className="flex items-center gap-1 text-[10px] text-[#F47B20]/60 hover:text-[#F47B20]"
              >
                <Plus size={10} /> Add option
              </button>
            </div>
          </PropSection>
        )}

        {/* Image upload */}
        {el.type === 'image' && (
          <PropSection label="Image">
            {el.imageDataUrl ? (
              <div className="space-y-2">
                <img src={el.imageDataUrl} alt="Uploaded" className="w-full rounded border border-white/[0.06]" />
                <div className="flex gap-2">
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="flex-1 text-[10px] text-center py-1 bg-white/[0.04] hover:bg-white/[0.08] rounded text-white/60 transition-colors"
                  >
                    Replace
                  </button>
                  <button
                    onClick={() => update({ imageDataUrl: null })}
                    className="flex-1 text-[10px] text-center py-1 bg-red-500/[0.04] hover:bg-red-500/[0.08] rounded text-red-400/60 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => imageInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-3 py-4 border-2 border-dashed border-white/[0.08] rounded-lg text-white/40 hover:border-[#F47B20]/30 hover:text-[#F47B20]/60 transition-colors"
              >
                <ImageIcon size={14} />
                <span className="text-xs">Upload Image</span>
              </button>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </PropSection>
        )}

        {/* Font Size */}
        {el.type !== 'divider' && el.type !== 'image' && (
          <PropSection label="Font Size">
            <Slider
              min={8}
              max={48}
              step={1}
              value={el.fontSize ?? 14}
              onChange={e => update({ fontSize: Number((e.target as HTMLInputElement).value) })}
              suffix="px"
            />
          </PropSection>
        )}

        {/* Font Weight */}
        {el.type !== 'divider' && el.type !== 'image' && (
          <PropSection label="Font Weight">
            <div className="flex gap-1">
              {(['normal', 'bold'] as const).map(w => (
                <button
                  key={w}
                  onClick={() => update({ fontWeight: w })}
                  className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                    el.fontWeight === w
                      ? 'bg-[#F47B20]/20 text-[#F47B20] border border-[#F47B20]/30'
                      : 'bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.08]'
                  }`}
                >
                  {w === 'bold' ? <strong>{w}</strong> : w}
                </button>
              ))}
            </div>
          </PropSection>
        )}

        {/* Text Align */}
        {el.type !== 'divider' && el.type !== 'image' && el.type !== 'checkbox' && (
          <PropSection label="Alignment">
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => update({ textAlign: a })}
                  className={`flex-1 py-1 text-[10px] rounded transition-colors ${
                    (el.textAlign ?? 'left') === a
                      ? 'bg-[#F47B20]/20 text-[#F47B20] border border-[#F47B20]/30'
                      : 'bg-white/[0.04] text-white/40 border border-white/[0.06] hover:bg-white/[0.08]'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </PropSection>
        )}

        {/* Color */}
        {el.type !== 'divider' && el.type !== 'image' && (
          <PropSection label="Text Color">
            <ColorPicker
              value={el.color ?? '#000000'}
              onChange={color => update({ color })}
              presets={['#000000', '#333333', '#666666', '#EF4444', '#3B82F6', '#22C55E', '#F47B20', '#8B5CF6']}
            />
          </PropSection>
        )}

        {/* Actions */}
        <div className="pt-2 border-t border-white/[0.06] space-y-2">
          <button
            onClick={duplicateSelected}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors"
          >
            <Copy size={13} />
            Duplicate
          </button>
          <button
            onClick={removeSelectedElements}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400/70 hover:text-red-400 bg-red-500/[0.04] hover:bg-red-500/[0.08] rounded-lg transition-colors"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared helpers ──────────────────────────────────────────

function PropSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">{label}</span>
      {children}
    </div>
  )
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[9px] text-white/30 w-3">{label}</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 px-1.5 py-1 text-xs bg-dark-surface border border-white/[0.1] rounded text-white tabular-nums focus:outline-none focus:border-[#F47B20]/40 w-0"
      />
    </div>
  )
}
