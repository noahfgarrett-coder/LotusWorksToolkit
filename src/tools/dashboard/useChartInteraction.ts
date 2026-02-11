/**
 * useChartInteraction — Manages chart element interactions.
 * Edit mode: click elements to change colors/properties.
 * View mode: click elements to drill down into data.
 */

import { useState, useCallback } from 'react'
import type { FilterCondition, FilterGroup } from './types.ts'

// ── Types ───────────────────────────────────────

export interface ChartElementInfo {
  /** Index of the element in the data */
  index: number
  /** Display label */
  label: string
  /** Current color */
  color: string
  /** Series key (for multi-series) */
  seriesKey?: string
  /** Click position X */
  x: number
  /** Click position Y */
  y: number
}

export interface DrillDownInfo {
  column: string
  value: string
  label: string
  seriesKey?: string
}

export interface ChartInteractionState {
  selectedElement: ChartElementInfo | null
  drillDownInfo: DrillDownInfo | null
}

export interface ChartInteractionActions {
  handleElementClick: (
    elementInfo: Omit<ChartElementInfo, 'x' | 'y'>,
    event: React.MouseEvent,
    isEditMode: boolean,
    xColumnName?: string,
  ) => void
  selectElement: (element: ChartElementInfo | null) => void
  clearSelection: () => void
  setDrillDown: (info: DrillDownInfo | null) => void
  applyDrillDown: (currentFilter: FilterGroup | undefined) => FilterGroup
  dismissDrillDown: () => void
}

// ── Hook ────────────────────────────────────────

export function useChartInteraction(): [ChartInteractionState, ChartInteractionActions] {
  const [selectedElement, setSelectedElement] = useState<ChartElementInfo | null>(null)
  const [drillDownInfo, setDrillDownInfo] = useState<DrillDownInfo | null>(null)

  const handleElementClick = useCallback(
    (
      elementInfo: Omit<ChartElementInfo, 'x' | 'y'>,
      event: React.MouseEvent,
      isEditMode: boolean,
      xColumnName?: string,
    ) => {
      event.stopPropagation()

      if (isEditMode) {
        setSelectedElement({
          ...elementInfo,
          x: event.clientX,
          y: event.clientY,
        })
      } else if (xColumnName) {
        setDrillDownInfo({
          column: xColumnName,
          value: elementInfo.label,
          label: elementInfo.label,
          seriesKey: elementInfo.seriesKey,
        })
      }
    },
    [],
  )

  const selectElement = useCallback((element: ChartElementInfo | null) => {
    setSelectedElement(element)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedElement(null)
  }, [])

  const setDrillDown = useCallback((info: DrillDownInfo | null) => {
    setDrillDownInfo(info)
  }, [])

  const dismissDrillDown = useCallback(() => {
    setDrillDownInfo(null)
  }, [])

  const applyDrillDown = useCallback(
    (currentFilter: FilterGroup | undefined): FilterGroup => {
      if (!drillDownInfo) {
        return currentFilter ?? {
          id: crypto.randomUUID(),
          type: 'group',
          logic: 'AND',
          children: [],
        }
      }

      const newCondition: FilterCondition = {
        id: crypto.randomUUID(),
        type: 'condition',
        column: drillDownInfo.column,
        operator: '=',
        value: drillDownInfo.value,
      }

      if (currentFilter) {
        return {
          ...currentFilter,
          children: [...currentFilter.children, newCondition],
        }
      }

      return {
        id: crypto.randomUUID(),
        type: 'group',
        logic: 'AND',
        children: [newCondition],
      }
    },
    [drillDownInfo],
  )

  return [
    { selectedElement, drillDownInfo },
    {
      handleElementClick,
      selectElement,
      clearSelection,
      setDrillDown,
      applyDrillDown,
      dismissDrillDown,
    },
  ]
}

// ── Color update helpers ────────────────────────

/** Update a specific color in the colors array */
export function updateColorAtIndex(
  colors: string[],
  index: number,
  newColor: string,
): string[] {
  const newColors = [...colors]
  while (newColors.length <= index) {
    newColors.push('#cccccc')
  }
  newColors[index] = newColor
  return newColors
}

/** Update a color for a specific series key */
export function updateSeriesColor(
  colors: string[],
  seriesKeys: string[],
  targetKey: string,
  newColor: string,
): string[] {
  const index = seriesKeys.indexOf(targetKey)
  if (index === -1) return colors
  return updateColorAtIndex(colors, index, newColor)
}
