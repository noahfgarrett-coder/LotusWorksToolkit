/**
 * Compression utilities for images, PDFs, and SVGs.
 * Used by the File Compressor tool.
 */

import { PDFDocument } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import { readFileAsDataURL } from '@/utils/fileReader.ts'
import { loadImage, resizeImage, canvasToBlob } from '@/utils/imageProcessing.ts'

// Centralized PDF.js worker setup (side-effect import)
import '@/utils/pdfWorkerSetup.ts'

// ── Type detection ──────────────────────────────────────────────

export type CompressibleType = 'image' | 'pdf' | 'svg'

/** Classify a file into a compressible type, or null if unsupported. */
export function getCompressibleType(file: File): CompressibleType | null {
  if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) return 'svg'
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return 'pdf'
  if (file.type.startsWith('image/')) return 'image'
  return null
}

/** Get the output file extension for a compressed file. */
export function getCompressedExtension(type: CompressibleType): string {
  switch (type) {
    case 'image': return 'jpg'
    case 'pdf': return 'pdf'
    case 'svg': return 'svg'
  }
}

// ── Image compression ───────────────────────────────────────────

/**
 * Compress a raster image by resizing and re-encoding as JPEG.
 * @param quality 10–95 (percentage)
 * @param maxWidth Maximum output width in pixels
 */
export async function compressImage(
  file: File,
  quality: number,
  maxWidth: number,
): Promise<Blob> {
  const dataUrl = await readFileAsDataURL(file)
  const img = await loadImage(dataUrl)

  let targetWidth = img.naturalWidth
  let targetHeight = img.naturalHeight
  if (targetWidth > maxWidth) {
    const scale = maxWidth / targetWidth
    targetWidth = maxWidth
    targetHeight = Math.round(img.naturalHeight * scale)
  }

  const canvas = resizeImage(img, targetWidth, targetHeight)
  return canvasToBlob(canvas, 'image/jpeg', quality / 100)
}

// ── PDF compression ─────────────────────────────────────────────

/**
 * Compress a PDF by rendering each page to a JPEG image and
 * re-creating the document as an image-based PDF.
 * @param quality 10–95 (percentage, controls JPEG quality per page)
 * @param maxWidth Maximum render width in pixels (capped at 2x native)
 */
export async function compressPDF(
  file: File,
  quality: number,
  maxWidth: number,
): Promise<Blob> {
  const buffer = await file.arrayBuffer()
  const data = new Uint8Array(buffer)
  const doc = await pdfjsLib.getDocument({ data: data.slice() }).promise

  try {
    const numPages = doc.numPages
    const newPdf = await PDFDocument.create()

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i)
      const baseViewport = page.getViewport({ scale: 1.0 })

      // Clamp render scale: respect maxWidth but cap at 2x to limit memory
      const scale = Math.min(maxWidth / baseViewport.width, 2.0)
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Failed to get canvas 2d context')

      await page.render({ canvasContext: ctx, viewport }).promise
      page.cleanup()

      // Canvas → JPEG → Uint8Array
      const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality / 100)
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer())

      // Release canvas memory
      canvas.width = 0
      canvas.height = 0

      // Embed into new PDF
      const embeddedImage = await newPdf.embedJpg(jpegBytes)
      const newPage = newPdf.addPage([embeddedImage.width, embeddedImage.height])
      newPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: embeddedImage.width,
        height: embeddedImage.height,
      })
    }

    const pdfBytes = await newPdf.save()
    return new Blob([pdfBytes], { type: 'application/pdf' })
  } finally {
    doc.destroy()
  }
}

// ── SVG compression ─────────────────────────────────────────────

/**
 * Compress an SVG by stripping metadata, comments, editor bloat,
 * and collapsing whitespace. Lossless — does not modify visual output.
 */
export async function compressSVG(file: File): Promise<Blob> {
  let svg = await file.text()

  // Remove XML declaration
  svg = svg.replace(/<\?xml[^?]*\?>\s*/gi, '')

  // Remove comments
  svg = svg.replace(/<!--[\s\S]*?-->/g, '')

  // Remove <metadata>...</metadata> blocks
  svg = svg.replace(/<metadata[\s\S]*?<\/metadata>/gi, '')

  // Remove Inkscape sodipodi elements
  svg = svg.replace(/<sodipodi:[^>]*\/>/gi, '')
  svg = svg.replace(/<sodipodi:[^>]*>[\s\S]*?<\/sodipodi:[^>]*>/gi, '')

  // Strip unused editor namespace declarations
  svg = svg.replace(/\s+xmlns:(sodipodi|inkscape|rdf|cc|dc)="[^"]*"/gi, '')

  // Collapse whitespace between tags (safe — only targets > ... < gaps)
  svg = svg.replace(/>\s+</g, '><')

  svg = svg.trim()

  return new Blob([svg], { type: 'image/svg+xml' })
}
