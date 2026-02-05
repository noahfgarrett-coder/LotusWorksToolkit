import { useAppStore } from '@/stores/appStore.ts'
import { categories } from '@/tools/registry.ts'
import type { ToolId } from '@/types/index.ts'
import {
  FileText, Image, FolderCog, Sparkles, Wrench,
  Combine, Scissors, PenTool, Stamp, ScanText,
  Maximize2, Eraser, Archive, ArrowRightLeft,
  ClipboardList, Network, LayoutDashboard, GitBranch,
  QrCode, Table, ChevronDown, PanelLeftClose, PanelLeft,
  Home,
} from 'lucide-react'

const iconMap: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  FileText, Image, FolderCog, Sparkles, Wrench,
  Combine, Scissors, PenTool, Stamp, ScanText,
  Maximize2, Eraser, Archive, ArrowRightLeft,
  ClipboardList, Network, LayoutDashboard, GitBranch,
  QrCode, Table,
}

function getIcon(name: string, size = 18, className = '') {
  const Icon = iconMap[name]
  return Icon ? <Icon size={size} className={className} /> : null
}

export function Sidebar() {
  const {
    activeTool, sidebarExpanded, sidebarCategories,
    setActiveTool, goHome, toggleSidebar, toggleCategory,
  } = useAppStore()

  return (
    <aside
      className={`glass-sidebar relative flex flex-col h-full transition-all duration-300 ease-out ${
        sidebarExpanded ? 'w-60' : 'w-14'
      }`}
    >
      {/* Logo / collapse toggle */}
      <div className="flex items-center h-14 px-3 border-b border-white/[0.06]">
        {sidebarExpanded && (
          <span className="text-sm font-display font-semibold text-[#F47B20] tracking-wide truncate flex-1">
            LotusWorks Toolkit
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors ml-auto"
          title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarExpanded ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
        </button>
      </div>

      {/* Tool categories */}
      <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-1">
        {/* Home Menu button */}
        <button
          onClick={goHome}
          title={sidebarExpanded ? undefined : 'Home Menu'}
          className={`
            w-full flex items-center gap-2.5 rounded-md transition-all duration-150 mb-1
            ${sidebarExpanded ? 'px-2.5 py-2' : 'px-0 py-2 justify-center'}
            ${!activeTool
              ? 'bg-[#F47B20]/15 text-[#F47B20]'
              : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
            }
            relative
          `}
        >
          {!activeTool && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#F47B20] rounded-r-full" />
          )}
          <Home size={16} />
          {sidebarExpanded && (
            <span className="text-sm truncate">Home Menu</span>
          )}
        </button>

        <div className="divider-gradient my-1" />

        {categories.map((cat) => {
          const isExpanded = sidebarCategories[cat.id] ?? true

          return (
            <div key={cat.id}>
              {/* Category header */}
              <button
                onClick={() => sidebarExpanded && toggleCategory(cat.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-white/50 hover:text-white/70 transition-colors ${
                  sidebarExpanded ? '' : 'justify-center'
                }`}
              >
                {getIcon(cat.icon, 14, 'text-[#F47B20]')}
                {sidebarExpanded && (
                  <>
                    <span className="text-[11px] font-semibold uppercase tracking-wider flex-1 text-left">
                      {cat.label}
                    </span>
                    <ChevronDown
                      size={12}
                      className={`transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
                    />
                  </>
                )}
              </button>

              {/* Tools list */}
              {(sidebarExpanded ? isExpanded : true) && (
                <div className={`${sidebarExpanded ? 'mt-0.5 space-y-0.5' : 'mt-1 space-y-1'}`}>
                  {cat.tools.map((tool) => {
                    const isActive = activeTool === tool.id

                    return (
                      <button
                        key={tool.id}
                        onClick={() => setActiveTool(tool.id as ToolId)}
                        title={sidebarExpanded ? undefined : tool.label}
                        className={`
                          w-full flex items-center gap-2.5 rounded-md transition-all duration-150
                          ${sidebarExpanded ? 'px-2.5 py-2' : 'px-0 py-2 justify-center'}
                          ${isActive
                            ? 'bg-[#F47B20]/15 text-[#F47B20]'
                            : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                          }
                          relative
                        `}
                      >
                        {/* Active indicator bar */}
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#F47B20] rounded-r-full" />
                        )}
                        {getIcon(tool.icon, 16)}
                        {sidebarExpanded && (
                          <span className="text-sm truncate">{tool.label}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      {sidebarExpanded && (
        <div className="px-3 py-3 border-t border-white/[0.06]">
          <p className="text-[10px] text-white/30 text-center">
            LotusWorks Toolkit v1.0
          </p>
        </div>
      )}
    </aside>
  )
}
