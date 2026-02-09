import { useMemo, useRef, useCallback } from 'react'
import type { OrgChartStore } from './orgChartStore.ts'
import type { OrgNode } from './types.ts'
import { DEPARTMENT_COLORS } from './types.ts'
import { ColorPicker } from '@/components/common/ColorPicker.tsx'
import { readFileAsDataURL } from '@/utils/fileReader.ts'
import { loadImage, resizeImage } from '@/utils/imageProcessing.ts'
import { UserPlus, Trash2, Camera, X } from 'lucide-react'

const MAX_AVATAR_SIZE = 128

// ── Department color presets for the ColorPicker ─────────────

const DEPT_COLOR_PRESETS = Object.values(DEPARTMENT_COLORS)

// ── Component ───────────────────────────────────────────────

export function PropertiesPanel({ store }: { store: OrgChartStore }) {
  const { nodes, selectedNodeId, selectedNodeIds, updateNode, addNode, removeNode } = store

  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  )

  // Build list of valid "reports to" targets (excludes self + descendants)
  const reportsToOptions = useMemo(() => {
    if (!selectedNode) return []

    // Gather all descendant IDs to exclude
    const descendants = new Set<string>()
    const collectDescendants = (id: string) => {
      for (const n of nodes) {
        if (n.reportsTo === id && !descendants.has(n.id)) {
          descendants.add(n.id)
          collectDescendants(n.id)
        }
      }
    }
    collectDescendants(selectedNode.id)

    return nodes.filter(n =>
      n.id !== selectedNode.id && !descendants.has(n.id),
    )
  }, [nodes, selectedNode])

  // All hooks must be called before any early return (Rules of Hooks)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedNode) return

    try {
      const dataUrl = await readFileAsDataURL(file)
      const img = await loadImage(dataUrl)

      // Resize to max 128px keeping aspect ratio
      const scale = Math.min(MAX_AVATAR_SIZE / img.width, MAX_AVATAR_SIZE / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const resized = resizeImage(img, w, h)

      // Convert to JPEG data URL for compact storage
      const jpegDataUrl = resized.toDataURL('image/jpeg', 0.85)
      updateNode(selectedNode.id, { imageDataUrl: jpegDataUrl })
    } catch {
      // Silently fail on bad images
    }

    e.target.value = ''
  }, [selectedNode, updateNode])

  if (!selectedNode) {
    return (
      <div className="w-[260px] flex-shrink-0 border-l border-white/[0.06] bg-dark-elevated p-4">
        <p className="text-[10px] text-white/25 text-center mt-8">
          Select a person to edit their details
        </p>
      </div>
    )
  }

  const multiSelectCount = selectedNodeIds.size

  const isRoot = !selectedNode.reportsTo

  const update = (updates: Partial<OrgNode>) => {
    updateNode(selectedNode.id, updates)
  }

  const handleDepartmentChange = (dept: string) => {
    const updates: Partial<OrgNode> = { department: dept }
    // Auto-suggest department color if it matches a preset
    const deptColor = DEPARTMENT_COLORS[dept]
    if (deptColor) {
      updates.nodeColor = deptColor
    }
    update(updates)
  }

  return (
    <div className="w-[260px] flex-shrink-0 border-l border-white/[0.06] bg-dark-elevated overflow-y-auto">
      <div className="px-3 py-2 text-[10px] font-semibold text-white/30 uppercase tracking-wider border-b border-white/[0.06] flex items-center justify-between">
        <span>Person Details</span>
        {multiSelectCount > 1 && (
          <span className="text-[9px] text-[#3B82F6] bg-[#3B82F6]/10 px-1.5 py-0.5 rounded-full">
            {multiSelectCount} selected
          </span>
        )}
      </div>

      <div className="p-3 space-y-4">
        {/* Avatar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            {selectedNode.imageDataUrl ? (
              <img
                src={selectedNode.imageDataUrl}
                alt={selectedNode.name}
                className="w-14 h-14 rounded-full object-cover border border-white/[0.08]"
              />
            ) : (
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center border border-white/[0.08]"
                style={{ backgroundColor: selectedNode.nodeColor + '25' }}
              >
                <span
                  className="text-lg font-semibold"
                  style={{ color: selectedNode.nodeColor }}
                >
                  {getInitials(selectedNode.name)}
                </span>
              </div>
            )}
            {/* Upload overlay */}
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 hover:bg-black/50 transition-colors group"
              title="Upload photo"
            >
              <Camera size={16} className="text-white/0 group-hover:text-white/80 transition-colors" />
            </button>
            {/* Remove button */}
            {selectedNode.imageDataUrl && (
              <button
                onClick={() => update({ imageDataUrl: null })}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-dark-surface border border-white/[0.1] flex items-center justify-center hover:bg-red-500/20 transition-colors"
                title="Remove photo"
              >
                <X size={10} className="text-white/50" />
              </button>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{selectedNode.name}</p>
            <p className="text-[10px] text-white/40 truncate">{selectedNode.title || 'No title'}</p>
            <button
              onClick={() => avatarInputRef.current?.click()}
              className="text-[10px] text-[#F47B20]/60 hover:text-[#F47B20] transition-colors mt-0.5"
            >
              {selectedNode.imageDataUrl ? 'Change photo' : 'Upload photo'}
            </button>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            className="hidden"
          />
        </div>

        {/* Name */}
        <PropSection label="Name">
          <input
            type="text"
            value={selectedNode.name}
            onChange={e => update({ name: e.target.value })}
            className="w-full px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white focus:outline-none focus:border-[#F47B20]/40"
          />
        </PropSection>

        {/* Title */}
        <PropSection label="Title">
          <input
            type="text"
            value={selectedNode.title}
            onChange={e => update({ title: e.target.value })}
            placeholder="e.g. VP of Engineering"
            className="w-full px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white placeholder:text-white/20 focus:outline-none focus:border-[#F47B20]/40"
          />
        </PropSection>

        {/* Department */}
        <PropSection label="Department">
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: selectedNode.nodeColor }}
            />
            <input
              type="text"
              value={selectedNode.department}
              onChange={e => handleDepartmentChange(e.target.value)}
              placeholder="e.g. Engineering"
              list="dept-suggestions"
              className="flex-1 px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white placeholder:text-white/20 focus:outline-none focus:border-[#F47B20]/40"
            />
            <datalist id="dept-suggestions">
              {Object.keys(DEPARTMENT_COLORS).map(d => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>
        </PropSection>

        {/* Email */}
        <PropSection label="Email">
          <input
            type="email"
            value={selectedNode.email}
            onChange={e => update({ email: e.target.value })}
            placeholder="name@company.com"
            className="w-full px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white placeholder:text-white/20 focus:outline-none focus:border-[#F47B20]/40"
          />
        </PropSection>

        {/* Phone */}
        <PropSection label="Phone">
          <input
            type="tel"
            value={selectedNode.phone}
            onChange={e => update({ phone: e.target.value })}
            placeholder="+1 (555) 000-0000"
            className="w-full px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white placeholder:text-white/20 focus:outline-none focus:border-[#F47B20]/40"
          />
        </PropSection>

        {/* Location */}
        <PropSection label="Location">
          <input
            type="text"
            value={selectedNode.location}
            onChange={e => update({ location: e.target.value })}
            placeholder="e.g. San Francisco, CA"
            className="w-full px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white placeholder:text-white/20 focus:outline-none focus:border-[#F47B20]/40"
          />
        </PropSection>

        {/* Node Color */}
        <PropSection label="Card Color">
          <ColorPicker
            value={selectedNode.nodeColor}
            onChange={color => update({ nodeColor: color })}
            presets={DEPT_COLOR_PRESETS}
          />
        </PropSection>

        {/* Reports To */}
        {!isRoot && (
          <PropSection label="Reports To">
            <select
              value={selectedNode.reportsTo}
              onChange={e => store.reparentNode(selectedNode.id, e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded text-white focus:outline-none focus:border-[#F47B20]/40"
            >
              {reportsToOptions.map(n => (
                <option key={n.id} value={n.id}>
                  {n.name}{n.title ? ` — ${n.title}` : ''}
                </option>
              ))}
            </select>
          </PropSection>
        )}

        {/* Actions */}
        <div className="pt-2 border-t border-white/[0.06] space-y-2">
          <button
            onClick={() => addNode(selectedNode.id)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] rounded-lg transition-colors"
          >
            <UserPlus size={13} />
            Add Direct Report
          </button>

          {!isRoot && (
            <button
              onClick={() => removeNode(selectedNode.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400/70 hover:text-red-400 bg-red-500/[0.04] hover:bg-red-500/[0.08] rounded-lg transition-colors"
            >
              <Trash2 size={13} />
              Delete Person
            </button>
          )}
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
