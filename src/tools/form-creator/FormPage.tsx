import type { FormElement, PageSize } from './types.ts'
import { PAGE_SIZES } from './types.ts'
import { FormElementView, type HandlePosition } from './FormElementView.tsx'

interface FormPageProps {
  pageIndex: number
  pageSize: PageSize
  elements: FormElement[]
  selectedIds: Set<string>
  hoveredId: string | null
  onElementPointerDown: (e: React.PointerEvent, elementId: string) => void
  onResizeStart: (e: React.PointerEvent, elementId: string, handle: HandlePosition) => void
}

export function FormPage({
  pageIndex,
  pageSize,
  elements,
  selectedIds,
  hoveredId,
  onElementPointerDown,
  onResizeStart,
}: FormPageProps) {
  const dim = PAGE_SIZES[pageSize]

  return (
    <div
      data-page-index={pageIndex}
      className="relative bg-white shadow-lg flex-shrink-0"
      style={{
        width: dim.widthPx,
        height: dim.heightPx,
        borderRadius: 2,
      }}
    >
      {/* Page number */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] text-white/30 select-none">
        Page {pageIndex + 1}
      </div>

      {/* Elements */}
      {elements.map(el => (
        <FormElementView
          key={el.id}
          element={el}
          selected={selectedIds.has(el.id)}
          hovered={hoveredId === el.id}
          onPointerDown={(e) => onElementPointerDown(e, el.id)}
          onResizeStart={(e, handle) => onResizeStart(e, el.id, handle)}
        />
      ))}
    </div>
  )
}
