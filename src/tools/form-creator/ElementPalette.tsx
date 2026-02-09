import type { FormElementType } from './types.ts'
import {
  Type, AlignLeft, CheckSquare, Circle, ChevronDown,
  Calendar, PenTool, Image as ImageIcon, Minus, Heading, Tag,
} from 'lucide-react'

// ── Element type catalog ─────────────────────────────────────

const ELEMENT_TYPES: { type: FormElementType; label: string; icon: typeof Type; description: string }[] = [
  { type: 'heading',    label: 'Heading',    icon: Heading,      description: 'Section heading' },
  { type: 'label',      label: 'Label',      icon: Tag,          description: 'Text label' },
  { type: 'text-input', label: 'Text Field', icon: Type,         description: 'Single-line input' },
  { type: 'textarea',   label: 'Text Area',  icon: AlignLeft,    description: 'Multi-line input' },
  { type: 'checkbox',   label: 'Checkbox',   icon: CheckSquare,  description: 'Yes/No toggle' },
  { type: 'radio',      label: 'Radio Group',icon: Circle,       description: 'Multiple choice' },
  { type: 'select',     label: 'Dropdown',   icon: ChevronDown,  description: 'Select list' },
  { type: 'date',       label: 'Date',       icon: Calendar,     description: 'Date field' },
  { type: 'signature',  label: 'Signature',  icon: PenTool,      description: 'Signature line' },
  { type: 'image',      label: 'Image',      icon: ImageIcon,    description: 'Upload image/logo' },
  { type: 'divider',    label: 'Divider',    icon: Minus,        description: 'Horizontal rule' },
]

// ── Component ────────────────────────────────────────────────

interface ElementPaletteProps {
  onAddElement: (type: FormElementType) => void
}

export function ElementPalette({ onAddElement }: ElementPaletteProps) {
  return (
    <div className="w-[220px] flex-shrink-0 border-r border-white/[0.06] bg-dark-elevated overflow-y-auto">
      <div className="px-3 py-2 text-[10px] font-semibold text-white/30 uppercase tracking-wider border-b border-white/[0.06]">
        Elements
      </div>

      <div className="p-2 space-y-0.5">
        {ELEMENT_TYPES.map(({ type, label, icon: Icon, description }) => (
          <button
            key={type}
            onClick={() => onAddElement(type)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-white/[0.04] transition-colors group"
          >
            <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0 group-hover:bg-[#F47B20]/10 transition-colors">
              <Icon size={13} className="text-white/30 group-hover:text-[#F47B20] transition-colors" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-white/70 group-hover:text-white transition-colors">{label}</p>
              <p className="text-[9px] text-white/25">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
