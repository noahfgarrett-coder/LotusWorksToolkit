export type ToolId =
  | 'pdf-merge'
  | 'pdf-split'
  | 'pdf-annotate'
  | 'pdf-watermark'
  | 'text-extract'
  | 'ocr-extract'
  | 'image-resizer'
  | 'image-bg-remove'
  | 'file-compressor'
  | 'file-converter'
  | 'form-creator'
  | 'org-chart'
  | 'dashboard'
  | 'flowchart'
  | 'qr-code'
  | 'json-csv-viewer'

export type ToolCategory = 'documents' | 'images' | 'files' | 'creators' | 'utilities'

export interface ToolDefinition {
  id: ToolId
  label: string
  description: string
  category: ToolCategory
  icon: string
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  duration?: number
}

export interface NavigationCategory {
  id: ToolCategory
  label: string
  icon: string
  tools: ToolDefinition[]
}
