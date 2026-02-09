import type { NavigationCategory, ToolDefinition } from '@/types/index.ts'

export const tools: ToolDefinition[] = [
  // Documents
  { id: 'pdf-merge', label: 'PDF Merge', description: 'Combine multiple PDFs into one', category: 'documents', icon: 'Combine' },
  { id: 'pdf-split', label: 'PDF Split', description: 'Extract pages from a PDF', category: 'documents', icon: 'Scissors' },
  { id: 'pdf-annotate', label: 'PDF Annotate', description: 'Draw, highlight, and annotate PDFs', category: 'documents', icon: 'PenTool' },
  { id: 'pdf-watermark', label: 'PDF Watermark', description: 'Add text or image watermarks', category: 'documents', icon: 'Stamp' },
  { id: 'text-extract', label: 'Text Extract', description: 'Extract text and tables from PDFs — embedded text or OCR', category: 'documents', icon: 'FileText' },

  // Images
  { id: 'image-resizer', label: 'Image Resizer', description: 'Resize and compress images', category: 'images', icon: 'Maximize2' },
  { id: 'image-bg-remove', label: 'Background Remover', description: 'Remove image backgrounds by color', category: 'images', icon: 'Eraser' },

  // Files
  { id: 'file-compressor', label: 'File Compressor', description: 'Compress images, PDFs, and create ZIPs', category: 'files', icon: 'Archive' },
  { id: 'file-converter', label: 'File Converter', description: 'Convert between file formats', category: 'files', icon: 'ArrowRightLeft' },

  // Creators
  { id: 'form-creator', label: 'Form Creator', description: 'Design and export printable forms', category: 'creators', icon: 'ClipboardList' },
  { id: 'org-chart', label: 'Org Chart', description: 'Create organization charts', category: 'creators', icon: 'Network' },
  { id: 'dashboard', label: 'Dashboard', description: 'Build data dashboards from CSV/Excel', category: 'creators', icon: 'LayoutDashboard' },
  { id: 'flowchart', label: 'Flow Chart', description: 'Auto-generate flowcharts from text', category: 'creators', icon: 'GitBranch' },

  // Utilities
  { id: 'qr-code', label: 'QR Code', description: 'Generate QR codes from text or URLs', category: 'utilities', icon: 'QrCode' },
  { id: 'json-csv-viewer', label: 'Data Viewer', description: 'View and explore JSON/CSV files', category: 'utilities', icon: 'Table' },
]

export const categories: NavigationCategory[] = [
  {
    id: 'documents',
    label: 'Documents',
    icon: 'FileText',
    tools: tools.filter((t) => t.category === 'documents'),
  },
  {
    id: 'images',
    label: 'Images',
    icon: 'Image',
    tools: tools.filter((t) => t.category === 'images'),
  },
  {
    id: 'files',
    label: 'Files',
    icon: 'FolderCog',
    tools: tools.filter((t) => t.category === 'files'),
  },
  {
    id: 'creators',
    label: 'Creators',
    icon: 'Sparkles',
    tools: tools.filter((t) => t.category === 'creators'),
  },
  {
    id: 'utilities',
    label: 'Utilities',
    icon: 'Wrench',
    tools: tools.filter((t) => t.category === 'utilities'),
  },
]
