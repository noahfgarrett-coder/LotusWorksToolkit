import type { ReactNode } from 'react'

interface ToolContainerProps {
  children: ReactNode
}

export function ToolContainer({ children }: ToolContainerProps) {
  return (
    <div className="flex-1 overflow-auto p-6 animate-fade-in">
      {children}
    </div>
  )
}
