import { useState } from 'react'
import { useAppStore } from '@/stores/appStore.ts'
import { tools } from '@/tools/registry.ts'
import { toolHelp } from '@/data/toolHelp.ts'
import { HelpModal } from '@/components/common/HelpModal.tsx'
import { HelpCircle } from 'lucide-react'

export function Header() {
  const activeTool = useAppStore((s) => s.activeTool)
  const toolDef = activeTool ? tools.find((t) => t.id === activeTool) : null
  const [helpOpen, setHelpOpen] = useState(false)

  const hasHelp = toolDef && toolHelp[toolDef.id]

  return (
    <header className="h-14 flex items-center px-6 border-b border-white/[0.06] bg-black/10">
      {toolDef ? (
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-display font-semibold text-white">
            {toolDef.label}
          </h1>
          <p className="text-xs text-white/50 -mt-0.5">{toolDef.description}</p>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-display font-semibold text-white">
            Welcome
          </h1>
          <p className="text-xs text-white/50 -mt-0.5">Select a tool from the sidebar</p>
        </div>
      )}

      {hasHelp && (
        <>
          <button
            onClick={() => setHelpOpen(true)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
            title="Help & instructions"
            aria-label="Help & instructions"
          >
            <HelpCircle size={16} />
          </button>
          <HelpModal
            toolId={toolDef!.id}
            open={helpOpen}
            onClose={() => setHelpOpen(false)}
          />
        </>
      )}
    </header>
  )
}
