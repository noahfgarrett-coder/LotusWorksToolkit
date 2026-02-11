/**
 * ChartWrapper — Base wrapper for all Recharts-based chart components.
 * Handles title, empty state, and ResponsiveContainer sizing.
 */

import type { ReactElement } from 'react'
import { ResponsiveContainer } from 'recharts'

interface ChartWrapperProps {
  title?: string
  showTitle?: boolean
  children: ReactElement
  isEmpty?: boolean
  emptyMessage?: string
}

export function ChartWrapper({
  title,
  showTitle = true,
  children,
  isEmpty = false,
  emptyMessage = 'No data to display',
}: ChartWrapperProps) {
  return (
    <div className="h-full flex flex-col">
      {showTitle && title && (
        <h3 className="text-sm font-semibold text-dark-text-primary mb-2 px-1">
          {title}
        </h3>
      )}
      <div className="flex-1 min-h-0">
        {isEmpty ? (
          <div className="h-full flex items-center justify-center text-dark-text-muted text-sm">
            {emptyMessage}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
