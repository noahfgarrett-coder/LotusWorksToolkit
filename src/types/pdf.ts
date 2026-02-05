/** Represents a loaded PDF file in the toolkit */
export interface PDFFile {
  id: string
  name: string
  data: Uint8Array
  pageCount: number
  size: number
}

/** Represents a single page within a PDF file */
export interface PDFPage {
  id: string
  fileId: string
  fileName: string
  pageNumber: number       // 1-based page number in the source PDF
  thumbnail?: string       // data URL of the page thumbnail
}

/** Page range validation result */
export interface PageRangeValidation {
  valid: boolean
  error?: string
  pages: number[]          // 1-based page numbers
}
