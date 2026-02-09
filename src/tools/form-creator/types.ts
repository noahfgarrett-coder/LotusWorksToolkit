// ── Form Element Types ──────────────────────────────────────

export type FormElementType =
  | 'text-input'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'select'
  | 'date'
  | 'label'
  | 'heading'
  | 'signature'
  | 'image'
  | 'divider'

export interface FormElement {
  id: string
  type: FormElementType
  pageIndex: number            // 0-based page
  x: number                    // position on page (px at 96dpi)
  y: number
  width: number
  height: number
  label: string
  placeholder?: string
  required?: boolean
  options?: string[]            // radio / select
  imageDataUrl?: string | null  // image elements
  fontSize?: number             // default 14
  fontWeight?: 'normal' | 'bold'
  textAlign?: 'left' | 'center' | 'right'
  color?: string                // default '#000000'
}

// ── Form Document ───────────────────────────────────────────

export type PageSize = 'letter' | 'a4'

export interface FormDocument {
  id: string
  title: string
  pageSize: PageSize
  pageCount: number
  elements: FormElement[]
  createdAt: number
  updatedAt: number
}

// ── Page Dimensions ─────────────────────────────────────────
// px values at 96 DPI (screen), pt values at 72 DPI (PDF)

export interface PageDimensions {
  widthPx: number
  heightPx: number
  widthPt: number
  heightPt: number
}

export const PAGE_SIZES: Record<PageSize, PageDimensions> = {
  letter: { widthPx: 816, heightPx: 1056, widthPt: 612, heightPt: 792 },
  a4:     { widthPx: 794, heightPx: 1123, widthPt: 595, heightPt: 842 },
}

// ── Viewport ────────────────────────────────────────────────

export interface Viewport {
  panX: number
  panY: number
  zoom: number
}

export const DEFAULT_VIEWPORT: Viewport = { panX: 0, panY: 0, zoom: 1 }
export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 4

// ── Layout Constants ────────────────────────────────────────

export const PAGE_GAP = 40            // gap between pages (px)
export const PAGE_MARGIN = 48         // default content margin inside page
export const ALIGN_THRESHOLD = 6      // snap distance (px)
export const HANDLE_SIZE = 8          // resize handle size (px)
export const MIN_ELEMENT_SIZE = 20    // minimum element dimension (px)

// ── Default Element Sizes ───────────────────────────────────

export const ELEMENT_DEFAULTS: Record<FormElementType, { width: number; height: number; label: string }> = {
  'text-input': { width: 300, height: 50,  label: 'Text Field' },
  'textarea':   { width: 300, height: 100, label: 'Text Area' },
  'checkbox':   { width: 200, height: 30,  label: 'Checkbox' },
  'radio':      { width: 200, height: 90,  label: 'Radio Group' },
  'select':     { width: 250, height: 50,  label: 'Dropdown' },
  'date':       { width: 200, height: 50,  label: 'Date' },
  'label':      { width: 200, height: 30,  label: 'Label Text' },
  'heading':    { width: 400, height: 40,  label: 'Section Heading' },
  'signature':  { width: 250, height: 60,  label: 'Signature' },
  'image':      { width: 200, height: 150, label: 'Image' },
  'divider':    { width: 500, height: 4,   label: '' },
}

// ── Factory Functions ───────────────────────────────────────

export function genId(): string {
  return Math.random().toString(36).substring(2, 11)
}

export function createElement(
  type: FormElementType,
  pageIndex: number,
  overrides: Partial<FormElement> = {},
): FormElement {
  const defaults = ELEMENT_DEFAULTS[type]
  return {
    id: genId(),
    type,
    pageIndex,
    x: PAGE_MARGIN,
    y: PAGE_MARGIN,
    width: defaults.width,
    height: defaults.height,
    label: defaults.label,
    placeholder: type === 'text-input' || type === 'textarea' ? 'Enter text...' : undefined,
    required: false,
    options: type === 'radio' ? ['Option 1', 'Option 2', 'Option 3']
           : type === 'select' ? ['Option 1', 'Option 2', 'Option 3']
           : undefined,
    imageDataUrl: null,
    fontSize: type === 'heading' ? 20 : 14,
    fontWeight: type === 'heading' ? 'bold' : 'normal',
    textAlign: type === 'heading' ? 'center' : 'left',
    color: '#000000',
    ...overrides,
  }
}

export function createDocument(overrides: Partial<FormDocument> = {}): FormDocument {
  return {
    id: genId(),
    title: 'Untitled Form',
    pageSize: 'letter',
    pageCount: 1,
    elements: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

// ── Coordinate Helpers ──────────────────────────────────────

/** Convert screen px to 72-DPI PDF points. */
export function pxToPt(px: number): number {
  return px * 0.75 // 72/96
}

/** Page top-Y in canvas space (accounts for page gap). */
export function pageTopY(pageIndex: number, pageSize: PageSize): number {
  const dim = PAGE_SIZES[pageSize]
  return pageIndex * (dim.heightPx + PAGE_GAP)
}
