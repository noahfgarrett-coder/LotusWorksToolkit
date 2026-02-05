import { useAppStore } from '@/stores/appStore.ts'
import { tools } from '@/tools/registry.ts'

export function Header() {
  const activeTool = useAppStore((s) => s.activeTool)
  const toolDef = activeTool ? tools.find((t) => t.id === activeTool) : null

  return (
    <header className="h-14 flex items-center px-6 border-b border-white/[0.06] bg-black/10">
      {toolDef ? (
        <div>
          <h1 className="text-base font-display font-semibold text-white">
            {toolDef.label}
          </h1>
          <p className="text-xs text-white/50 -mt-0.5">{toolDef.description}</p>
        </div>
      ) : (
        <div>
          <h1 className="text-base font-display font-semibold text-white">
            Welcome
          </h1>
          <p className="text-xs text-white/50 -mt-0.5">Select a tool from the sidebar</p>
        </div>
      )}
    </header>
  )
}
