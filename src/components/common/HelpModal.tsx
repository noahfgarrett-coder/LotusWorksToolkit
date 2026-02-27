import { Modal } from '@/components/common/Modal.tsx'
import { toolHelp } from '@/data/toolHelp.ts'
import { Lightbulb } from 'lucide-react'
import type { ToolId } from '@/types'

interface HelpModalProps {
  toolId: ToolId
  open: boolean
  onClose: () => void
}

export function HelpModal({ toolId, open, onClose }: HelpModalProps) {
  const content = toolHelp[toolId]

  if (!content) {
    return (
      <Modal open={open} onClose={onClose} title="Help" width="md">
        <p className="text-sm text-white/50">No help available for this tool yet.</p>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={content.title} width="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* Intro */}
        <p className="text-sm text-white/60 leading-relaxed">{content.intro}</p>

        {/* Sections */}
        {content.sections.map((section, sIdx) => (
          <div key={sIdx}>
            <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5">
              {section.heading}
            </h3>
            <ul className="space-y-1">
              {section.items.map((item, iIdx) => (
                <li key={iIdx} className="flex items-start gap-2 text-sm text-white/55 leading-relaxed">
                  <span className="text-[#F47B20] mt-1 flex-shrink-0">&bull;</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Tips */}
        {content.tips && content.tips.length > 0 && (
          <div className="rounded-lg bg-[#F47B20]/[0.06] border border-[#F47B20]/[0.12] p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb size={13} className="text-[#F47B20]" />
              <span className="text-xs font-semibold text-[#F47B20]">Tips</span>
            </div>
            <ul className="space-y-1">
              {content.tips.map((tip, tIdx) => (
                <li key={tIdx} className="flex items-start gap-2 text-[13px] text-white/50 leading-relaxed">
                  <span className="text-[#F47B20]/60 mt-0.5 flex-shrink-0">&bull;</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
