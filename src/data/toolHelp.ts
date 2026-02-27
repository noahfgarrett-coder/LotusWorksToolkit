import type { ToolId } from '@/types'

interface HelpSection {
  heading: string
  items: string[]
}

interface ToolHelpContent {
  title: string
  intro: string
  sections: HelpSection[]
  tips?: string[]
}

export const toolHelp: Partial<Record<ToolId, ToolHelpContent>> = {
  'pdf-merge': {
    title: 'PDF Merge',
    intro: 'Combine multiple PDF files into a single document. Reorder files, select individual pages, and control the merge order.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drop or select multiple PDF files to load them',
          'Files appear in a list — this is the merge order',
          'Click "Add Files" to import more PDFs at any time',
        ],
      },
      {
        heading: 'Organizing Files & Pages',
        items: [
          'Drag and drop files to reorder them in the merge sequence',
          'Expand a file to see page thumbnails — drag pages to reorder within a file',
          'Hover a page thumbnail and click the eye icon to exclude it from the merge',
          'Click a page to select it, then Cmd/Ctrl+C to copy and Cmd/Ctrl+V to paste a duplicate',
          'Remove an entire file by clicking the trash icon',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Click "Merge & Download" to combine all included pages into one PDF',
          'The output follows your file and page order exactly',
        ],
      },
    ],
    tips: [
      'Deselect pages you don\'t need — only included pages make it into the merge',
      'Page position badges turn orange when a page has been reordered from its original position',
      'You can merge even a single file to remove excluded pages',
      'Use the zoom and resolution controls to adjust thumbnail quality',
    ],
  },

  'pdf-split': {
    title: 'PDF Split',
    intro: 'Split a PDF into multiple documents by selecting which pages belong to each output.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drop or select a PDF file to load it',
          'Document 1 is created automatically — click pages to assign them',
        ],
      },
      {
        heading: 'Working with Pages',
        items: [
          'Click a page to add it to the active document',
          'Click an assigned page again to remove it',
          'Click and drag across pages to "paint" multiple at once',
          'Hold Shift + Click to add a duplicate copy of a page',
          'Use the page range input to bulk-add pages (e.g., "1-50, 75-100")',
        ],
      },
      {
        heading: 'Managing Documents',
        items: [
          'Press Enter to create a new document at any time',
          'Click a document name to rename it',
          'Drag page chips in the sidebar to reorder pages within a document',
          'Click the unlock icon to switch which document is active',
          'Delete a document with the trash icon',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Single document exports as a PDF file',
          'Multiple documents export as a ZIP archive containing each PDF',
        ],
      },
    ],
    tips: [
      'Pages can belong to multiple documents at once',
      'Use zoom controls to fit more pages on screen for large PDFs',
      'Adjust thumbnail resolution if loading is slow on large files',
    ],
  },

  'pdf-annotate': {
    title: 'PDF Annotate',
    intro: 'Draw, highlight, and add shapes and text to PDF documents. All annotations are embedded into the exported PDF.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drop or select a PDF file to load it',
          'Choose a drawing tool from the toolbar at the top',
        ],
      },
      {
        heading: 'Drawing Tools',
        items: [
          'Pencil — freehand drawing with smooth curves',
          'Highlighter — semi-transparent wide strokes for highlighting text',
          'Line, Arrow — straight lines and directional arrows',
          'Rectangle, Circle — shape outlines for marking areas',
          'Cloud — click to place vertices, double-click to close the shape',
          'Text — click and drag to create a text box, then type',
          'Callout — text box with arrow pointers for commenting on specific areas',
          'Eraser — partial mode splits strokes precisely; object mode removes whole annotations',
          'Measure — click two points to measure distance (calibrate with a known length first)',
        ],
      },
      {
        heading: 'Editing Annotations',
        items: [
          'Click an annotation to select it — drag to move it',
          'Double-click a text annotation to edit its content',
          'Adjust color, stroke width, opacity, and font size in the toolbar',
          'Undo/Redo with Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z',
          'Delete/Backspace removes the selected annotation',
        ],
      },
      {
        heading: 'Navigation',
        items: [
          'Toggle the page sidebar to see thumbnails and jump between pages',
          'Zoom with Cmd/Ctrl + scroll wheel, or use the zoom controls',
          'Rotate pages 90 degrees clockwise or counterclockwise',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Click "Export" to save a new PDF with all annotations baked in',
          'Page rotations are preserved in the export',
        ],
      },
    ],
    tips: [
      'For callouts, click outside the box while selected to drag out arrow pointers',
      'The measure tool supports calibration — set a known real-world distance to scale all measurements',
      'Annotations are per-page and persist when navigating between pages',
      'The eraser in partial mode precisely splits pencil strokes at the eraser boundary',
    ],
  },

  'pdf-watermark': {
    title: 'PDF Watermark',
    intro: 'Add text or image watermarks to every page of a PDF document with live preview.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drop or select a PDF file to load it',
          'Choose between text watermark or image watermark',
        ],
      },
      {
        heading: 'Text Watermark',
        items: [
          'Type your watermark text (e.g., "CONFIDENTIAL", "DRAFT")',
          'Adjust font size (12-120px), color, opacity, and rotation angle',
        ],
      },
      {
        heading: 'Image Watermark',
        items: [
          'Upload a logo or image file (PNG, JPG)',
          'Adjust scale (5-100% of page width) and opacity',
        ],
      },
      {
        heading: 'Positioning',
        items: [
          'Choose a position preset: Center, Top Left, Top Right, Bottom Left, Bottom Right, or Tile',
          'Tile mode repeats the watermark across the entire page',
          'Drag the watermark on the preview to fine-tune placement',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Preview the watermark on the page before exporting',
          'Click "Apply & Download" to save a new PDF with the watermark on all pages',
        ],
      },
    ],
    tips: [
      'Use low opacity (20-30%) for subtle background watermarks',
      'Diagonal rotation (e.g., 45 degrees) is a common watermark style',
      'Custom drag offset resets when switching position presets',
    ],
  },

  'text-extract': {
    title: 'Text Extract',
    intro: 'Extract text and tables from PDF documents using embedded text or OCR, with region selection and multi-format export.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drop or select a PDF file to load it',
          'The tool auto-detects whether the PDF has embedded text or needs OCR',
        ],
      },
      {
        heading: 'Extraction Modes',
        items: [
          'Document mode — preserves spatial layout as plain text',
          'Table mode — detects and extracts tabular data with headers and columns',
          'OCR mode — scans the page as an image for scanned documents (10 languages supported)',
        ],
      },
      {
        heading: 'Region Selection',
        items: [
          'Toggle the Region tool, then draw rectangles to limit extraction to specific areas',
          'Add multiple regions per page',
          'Click the red X on a region to delete it',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Extract current page or extract all pages at once',
          'Copy text to clipboard with one click',
          'Export as PDF, Excel (.xlsx), Word (.docx), CSV, or plain text',
        ],
      },
    ],
    tips: [
      'Try embedded text first — it\'s faster and more accurate for digital PDFs',
      'OCR works best on clear, high-resolution scans',
      'Region selection is per-page — when extracting all, only pages with regions are processed',
      'In table mode, toggle "Tables only" to exclude surrounding paragraph text',
    ],
  },

  'image-resizer': {
    title: 'Image Resizer',
    intro: 'Resize images to custom dimensions with format conversion and quality control.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drop or select an image file (PNG, JPEG, WebP, GIF, or BMP)',
        ],
      },
      {
        heading: 'Resizing',
        items: [
          'Enter target width and/or height in pixels',
          'Lock aspect ratio (chain icon) to resize proportionally',
          'Use preset sizes: 50%, 25%, 1080p, 720p, or 480p',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Choose output format: PNG, JPEG, or WebP',
          'Adjust quality for JPEG/WebP compression (10-100%)',
          'Click "Resize" to process, then "Download" to save',
        ],
      },
    ],
    tips: [
      'Lock the aspect ratio to prevent image distortion',
      'Maximum supported dimensions are 8192 x 8192 pixels',
      'The output info shows file size savings as a percentage',
    ],
  },

  'image-bg-remove': {
    title: 'Background Remover',
    intro: 'Remove image backgrounds by selecting a color to make transparent.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drop or select an image file to load it',
          'Click anywhere on the image to pick the background color to remove',
        ],
      },
      {
        heading: 'Removing Background',
        items: [
          'Adjust the tolerance slider to control how similar colors are matched',
          'Lower tolerance = exact match only; higher = broader range of similar colors',
          'Click "Pick Color" to select a different background color',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Preview the result with a checkerboard pattern (transparent areas)',
          'Click "Remove Background," then "Download PNG" to save',
        ],
      },
    ],
    tips: [
      'Start with low tolerance and increase gradually for best results',
      'Works best on images with solid, uniform backgrounds',
      'Output is always PNG to preserve transparency',
    ],
  },

  'file-compressor': {
    title: 'File Compressor',
    intro: 'Compress images, PDFs, and SVGs to reduce file size. Batch process multiple files at once.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drop or select files to compress (images, PDFs, or SVGs)',
          'Add more files at any time with the "Add More" button',
        ],
      },
      {
        heading: 'Compression Settings',
        items: [
          'Quality slider (10-95%) — lower quality means smaller file size',
          'Max Width slider (640-4096px) — large images are downscaled',
          'PDFs are compressed by re-rendering pages as optimized JPEGs',
          'SVGs are compressed by stripping metadata and whitespace (always lossless)',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Each file shows original and compressed size with savings percentage',
          'Single file downloads directly; multiple files bundle into a ZIP',
        ],
      },
    ],
    tips: [
      'Quality 60-75% gives good results for most images',
      'SVG compression is lossless — no visual quality loss',
      'PDF compression converts text to images — use only when file size is critical',
    ],
  },

  'file-converter': {
    title: 'File Converter',
    intro: 'Convert between file formats: images, documents, spreadsheets, and more.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drop or select files to convert',
          'Each file shows available output formats as clickable buttons',
        ],
      },
      {
        heading: 'Supported Conversions',
        items: [
          'Images: JPG, PNG, WebP, BMP — convert between any combination',
          'Documents: Markdown to HTML, HTML to Markdown, DOCX',
          'Data: CSV to JSON, JSON to CSV, Excel conversions',
          'PDF to images (with render scale options: 1x, 1.5x, 2x, 3x)',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Select a target format and click "Convert"',
          '"Convert All" processes every file that has a selected format',
          'Multi-page PDFs converted to images are bundled into a ZIP',
          '"Download All" bundles all results into one ZIP',
        ],
      },
    ],
    tips: [
      'JPEG quality slider appears when converting to JPG',
      'You can re-convert by selecting a different output format after completion',
    ],
  },

  'form-creator': {
    title: 'Form Builder',
    intro: 'Design and export printable forms with a drag-and-drop canvas editor. Templates and auto-save included.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Start with a blank canvas or browse pre-built templates',
          'Add elements from the left palette: text fields, checkboxes, dropdowns, labels, lines, and more',
        ],
      },
      {
        heading: 'Building Forms',
        items: [
          'Click an element type in the palette, then click the canvas to place it',
          'Drag elements to reposition them',
          'Select an element to edit its properties in the right panel',
          'Resize elements by dragging their corner handles',
        ],
      },
      {
        heading: 'Keyboard Shortcuts',
        items: [
          'Cmd/Ctrl+Z — Undo',
          'Cmd/Ctrl+Shift+Z — Redo',
          'Cmd/Ctrl+A — Select all',
          'Cmd/Ctrl+D — Duplicate selected',
          'Cmd/Ctrl+C / V — Copy / Paste',
          'Delete or Backspace — Remove selected',
          'Arrow keys — Nudge (hold Shift for 10px steps)',
          'Cmd/Ctrl+S — Save',
          'Cmd/Ctrl+E — Export',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Fillable PDF — interactive form fields',
          'Static PDF — clean print layout',
          'Word Document (.docx)',
          'JSON — re-importable form definition',
        ],
      },
    ],
    tips: [
      'Forms auto-save every 2 seconds — you won\'t lose work',
      'Use Cmd/Ctrl + / - to zoom; Cmd/Ctrl+0 to reset',
      'Import/Export JSON to share form designs with others',
    ],
  },

  'org-chart': {
    title: 'Org Chart',
    intro: 'Create organization charts with hierarchical node management, templates, and multi-format export.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Click "Add Person" or choose a template to start',
          'Click a person card to select it and edit their details in the right panel',
        ],
      },
      {
        heading: 'Editing the Chart',
        items: [
          'Drag cards to rearrange the hierarchy',
          'Edit name, title, department, and photo for each person',
          'Use Cmd/Ctrl+Enter to quickly add a new person under the selected node',
        ],
      },
      {
        heading: 'Keyboard Shortcuts',
        items: [
          'Arrow keys — Navigate the tree (Up=parent, Down=child, Left/Right=sibling)',
          'Cmd/Ctrl+Enter — Add new person under selected',
          'Cmd/Ctrl+Z / Shift+Z — Undo / Redo',
          'Cmd/Ctrl+A — Select all',
          'Delete — Remove selected',
          'Cmd/Ctrl+E — Export',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'PNG — high-resolution image',
          'Copy as PNG — to clipboard',
          'SVG — scalable vector with embedded avatars',
          'JSON — re-importable',
          'CSV — spreadsheet-compatible',
        ],
      },
    ],
    tips: [
      'Arrow key navigation follows org hierarchy — fast for traversing large charts',
      'Use Cmd/Ctrl + / - to zoom; Cmd/Ctrl+0 to reset',
    ],
  },

  'dashboard': {
    title: 'Dashboard',
    intro: 'Build interactive data dashboards from CSV or Excel files with charts, tables, and metric cards.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Click "New Dashboard," then "Import Data" to load a CSV, XLSX, or JSON file',
          'Data appears in a table view for inspection',
        ],
      },
      {
        heading: 'Building Dashboards',
        items: [
          'Add widgets from the palette: bar, line, pie, area charts, tables, and metric cards',
          'Configure each widget with your data columns',
          'Drag and resize widgets on the grid layout',
          'Toggle between edit mode and view mode',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Export as PNG image or JSON (re-importable)',
          'Export the underlying data source as CSV',
        ],
      },
    ],
    tips: [
      'Make sure your CSV has headers in the first row',
      'Dashboards auto-save — your layout and widgets persist',
      'Create multiple dashboards, each with its own data source and widgets',
    ],
  },

  'flowchart': {
    title: 'Flow Chart',
    intro: 'Build flowchart diagrams with a shape library and canvas editor, or auto-generate from structured text.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drag shapes from the left panel onto the canvas, or use "Import from Text"',
          'Connect nodes by dragging from connection points',
        ],
      },
      {
        heading: 'Text Import Syntax',
        items: [
          'START — creates a start/end node',
          'Plain text line — creates a process step',
          'IF ... — creates a decision diamond',
          'THEN / YES — yes branch',
          'OR / NO / ELSE — no branch',
          'END — creates an end node',
          'Pre-built templates available in the import modal',
        ],
      },
      {
        heading: 'Editing',
        items: [
          'Click to select nodes, drag to reposition',
          'Edit text, shape type, and colors in the right properties panel',
          'Use "Fit to content" to auto-zoom the entire diagram',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'PNG — high-resolution image',
          'Copy as PNG — to clipboard',
          'SVG — scalable vector',
          'JSON — re-importable diagram',
        ],
      },
    ],
    tips: [
      'The text import is powerful for quickly creating flowcharts without manual placement',
      'Templates in the Import modal provide working examples of the syntax',
    ],
  },

  'qr-code': {
    title: 'QR Code',
    intro: 'Generate QR codes from text, URLs, emails, or WiFi credentials with customizable appearance.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Select an input type: Text, URL, Email, or WiFi',
          'Enter your content — the QR code generates in real time',
        ],
      },
      {
        heading: 'Input Types',
        items: [
          'Text — any free-form text',
          'URL — web address (auto-prefixed with https://)',
          'Email — generates a mailto: link',
          'WiFi — enter SSID, password, and encryption type for a scannable WiFi login code',
        ],
      },
      {
        heading: 'Customization',
        items: [
          'Adjust size (100-600px)',
          'Change foreground and background colors',
          'Set error correction level: L (7%), M (15%), Q (25%), H (30%)',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          '"Download PNG" — saves the QR code image',
          '"Copy" — copies the QR code to clipboard',
        ],
      },
    ],
    tips: [
      'WiFi QR codes are scannable by most phone cameras for instant network login',
      'Higher error correction makes codes resilient to damage but slightly denser',
      'Keep URLs short for cleaner, easier-to-scan codes',
    ],
  },

  'json-csv-viewer': {
    title: 'Data Viewer',
    intro: 'View and explore JSON, CSV, and TSV files with sortable tables and a collapsible tree view.',
    sections: [
      {
        heading: 'Getting Started',
        items: [
          'Drop or select a JSON, CSV, or TSV file to load it',
          'Tabular data shows as a sortable table; nested JSON shows as a collapsible tree',
        ],
      },
      {
        heading: 'Table View',
        items: [
          'Click column headers to sort (ascending, descending, or none)',
          'Use the search field to filter rows across all columns',
          'Numeric columns sort numerically; text sorts alphabetically',
        ],
      },
      {
        heading: 'Tree View',
        items: [
          'Available for nested JSON structures',
          'Click chevrons to expand/collapse levels',
          'Color-coded types: orange for keys, green for strings, blue for numbers',
        ],
      },
      {
        heading: 'Exporting',
        items: [
          'Export filtered/sorted data as CSV or JSON',
          '"Copy" copies data as formatted JSON to clipboard',
        ],
      },
    ],
    tips: [
      'Sorting and search interact — filter first, then sort the results',
      'Large files use virtualized scrolling for smooth performance',
      'CSV files should have headers in the first row for best results',
    ],
  },
}
