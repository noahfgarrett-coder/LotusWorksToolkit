import { memo } from 'react'

interface Tab {
  id: string
  label: string
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (tabId: string) => void
  className?: string
}

export const Tabs = memo(function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  return (
    <div className={`flex gap-1 p-1 bg-white/[0.04] rounded-lg ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`
            px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150
            ${activeTab === tab.id
              ? 'bg-[#F47B20] text-white shadow-sm'
              : 'text-white/50 hover:text-white hover:bg-white/[0.06]'
            }
          `}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
})
