import type { FormDocument, FormElement } from './types.ts'
import { PAGE_SIZES, pxToPt } from './types.ts'
import { downloadBlob, downloadText } from '@/utils/download.ts'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, PageBreak } from 'docx'

// ══════════════════════════════════════════════════════════════
//  Fillable PDF Export (pdf-lib form API)
// ══════════════════════════════════════════════════════════════

export async function exportFillablePDF(doc: FormDocument) {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const form = pdfDoc.getForm()

  const pageDim = PAGE_SIZES[doc.pageSize]
  const pageWidthPt = pageDim.widthPt
  const pageHeightPt = pageDim.heightPt

  // Create pages
  const pages = Array.from({ length: doc.pageCount }, () =>
    pdfDoc.addPage([pageWidthPt, pageHeightPt]),
  )

  // Sort elements by page, then top-to-bottom
  const sorted = [...doc.elements].sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex
    return a.y - b.y
  })

  // Track unique field names to avoid collisions
  const usedNames = new Set<string>()
  function uniqueName(base: string): string {
    let name = base.replace(/[^a-zA-Z0-9_]/g, '_')
    if (!name) name = 'field'
    let candidate = name
    let i = 1
    while (usedNames.has(candidate)) {
      candidate = `${name}_${i++}`
    }
    usedNames.add(candidate)
    return candidate
  }

  for (const el of sorted) {
    const page = pages[el.pageIndex]
    if (!page) continue

    const x = pxToPt(el.x)
    const y = pageHeightPt - pxToPt(el.y) - pxToPt(el.height) // PDF Y-axis is bottom-up
    const w = pxToPt(el.width)
    const h = pxToPt(el.height)
    const fs = pxToPt(el.fontSize ?? 14)

    switch (el.type) {
      case 'heading': {
        const f = el.fontWeight === 'bold' ? boldFont : font
        page.drawText(el.label, {
          x,
          y: y + h - fs,
          size: fs,
          font: f,
          color: hexToRgb(el.color ?? '#000000'),
        })
        break
      }

      case 'label': {
        page.drawText(el.label, {
          x,
          y: y + h - fs,
          size: fs,
          font,
          color: hexToRgb(el.color ?? '#000000'),
        })
        break
      }

      case 'text-input': {
        // Draw label
        page.drawText(el.label + (el.required ? ' *' : ''), {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        // Create text field
        const tf = form.createTextField(uniqueName(el.label))
        tf.setFontSize(10)
        tf.addToPage(page, { x, y, width: w, height: h - 14, borderWidth: 0.5 })
        break
      }

      case 'textarea': {
        page.drawText(el.label + (el.required ? ' *' : ''), {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        const tf = form.createTextField(uniqueName(el.label))
        tf.enableMultiline()
        tf.setFontSize(10)
        tf.addToPage(page, { x, y, width: w, height: h - 14, borderWidth: 0.5 })
        break
      }

      case 'checkbox': {
        const cb = form.createCheckBox(uniqueName(el.label))
        cb.addToPage(page, { x, y: y + (h - 12) / 2, width: 12, height: 12 })
        page.drawText(el.label, {
          x: x + 18, y: y + (h - 8) / 2, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        break
      }

      case 'radio': {
        page.drawText(el.label + (el.required ? ' *' : ''), {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        const rg = form.createRadioGroup(uniqueName(el.label))
        const opts = el.options ?? []
        const optH = opts.length > 0 ? (h - 14) / opts.length : 16
        for (let i = 0; i < opts.length; i++) {
          const oy = y + h - 14 - (i + 1) * optH + (optH - 10) / 2
          rg.addOptionToPage(opts[i], page, { x, y: oy, width: 10, height: 10 })
          page.drawText(opts[i], {
            x: x + 16, y: oy + 1, size: 8, font, color: rgb(0.4, 0.4, 0.4),
          })
        }
        break
      }

      case 'select': {
        page.drawText(el.label + (el.required ? ' *' : ''), {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        const dd = form.createDropdown(uniqueName(el.label))
        dd.setOptions(el.options ?? [])
        dd.setFontSize(10)
        dd.addToPage(page, { x, y, width: w, height: h - 14, borderWidth: 0.5 })
        break
      }

      case 'date': {
        page.drawText(el.label + (el.required ? ' *' : ''), {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        const tf = form.createTextField(uniqueName(el.label + '_date'))
        tf.setFontSize(10)
        tf.addToPage(page, { x, y, width: w, height: h - 14, borderWidth: 0.5 })
        break
      }

      case 'signature': {
        page.drawText(el.label, {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        page.drawLine({
          start: { x, y: y + 4 },
          end: { x: x + w, y: y + 4 },
          thickness: 0.5,
          color: rgb(0.4, 0.4, 0.4),
        })
        break
      }

      case 'image': {
        if (el.imageDataUrl) {
          try {
            const isJpeg = el.imageDataUrl.startsWith('data:image/jpeg')
            const base64 = el.imageDataUrl.split(',')[1]
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
            const img = isJpeg
              ? await pdfDoc.embedJpg(bytes)
              : await pdfDoc.embedPng(bytes)
            const scaled = img.scaleToFit(w, h)
            page.drawImage(img, {
              x: x + (w - scaled.width) / 2,
              y: y + (h - scaled.height) / 2,
              width: scaled.width,
              height: scaled.height,
            })
          } catch {
            // Skip broken images
          }
        }
        break
      }

      case 'divider': {
        page.drawLine({
          start: { x, y: y + h / 2 },
          end: { x: x + w, y: y + h / 2 },
          thickness: 0.5,
          color: rgb(0.6, 0.6, 0.6),
        })
        break
      }
    }
  }

  const pdfBytes = await pdfDoc.save()
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const filename = `${doc.title.replace(/\s+/g, '-').toLowerCase()}.pdf`
  downloadBlob(blob, filename)
}

// ══════════════════════════════════════════════════════════════
//  Static PDF Export (non-fillable, cleaner look)
// ══════════════════════════════════════════════════════════════

export async function exportStaticPDF(doc: FormDocument) {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const pageDim = PAGE_SIZES[doc.pageSize]
  const pageWidthPt = pageDim.widthPt
  const pageHeightPt = pageDim.heightPt

  const pages = Array.from({ length: doc.pageCount }, () =>
    pdfDoc.addPage([pageWidthPt, pageHeightPt]),
  )

  const sorted = [...doc.elements].sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex
    return a.y - b.y
  })

  for (const el of sorted) {
    const page = pages[el.pageIndex]
    if (!page) continue

    const x = pxToPt(el.x)
    const y = pageHeightPt - pxToPt(el.y) - pxToPt(el.height)
    const w = pxToPt(el.width)
    const h = pxToPt(el.height)
    const fs = pxToPt(el.fontSize ?? 14)

    switch (el.type) {
      case 'heading':
      case 'label': {
        const f = el.fontWeight === 'bold' ? boldFont : font
        page.drawText(el.label, {
          x, y: y + h - fs, size: fs, font: f,
          color: hexToRgb(el.color ?? '#000000'),
        })
        break
      }

      case 'text-input':
      case 'date': {
        page.drawText(el.label + (el.required ? ' *' : '') + (el.type === 'date' ? ' (Date)' : ''), {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        page.drawLine({
          start: { x, y: y + 4 },
          end: { x: x + w, y: y + 4 },
          thickness: 0.5, color: rgb(0.6, 0.6, 0.6),
        })
        break
      }

      case 'textarea': {
        page.drawText(el.label + (el.required ? ' *' : ''), {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        page.drawRectangle({
          x, y, width: w, height: h - 14,
          borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5,
        })
        break
      }

      case 'checkbox': {
        page.drawRectangle({
          x, y: y + (h - 12) / 2, width: 12, height: 12,
          borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.5,
        })
        page.drawText(el.label, {
          x: x + 18, y: y + (h - 8) / 2, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        break
      }

      case 'radio': {
        page.drawText(el.label + (el.required ? ' *' : ''), {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        const opts = el.options ?? []
        const optH = opts.length > 0 ? (h - 14) / opts.length : 16
        for (let i = 0; i < opts.length; i++) {
          const oy = y + h - 14 - (i + 1) * optH + (optH - 10) / 2
          page.drawCircle({
            x: x + 5, y: oy + 5, size: 5,
            borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.5,
          })
          page.drawText(opts[i], {
            x: x + 16, y: oy + 1, size: 8, font, color: rgb(0.4, 0.4, 0.4),
          })
        }
        break
      }

      case 'select': {
        page.drawText(el.label + (el.required ? ' *' : ''), {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        page.drawRectangle({
          x, y, width: w, height: h - 14,
          borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5,
        })
        break
      }

      case 'signature': {
        page.drawText(el.label, {
          x, y: y + h - 10, size: 8, font, color: rgb(0.3, 0.3, 0.3),
        })
        page.drawLine({
          start: { x, y: y + 4 },
          end: { x: x + w, y: y + 4 },
          thickness: 0.5, color: rgb(0.4, 0.4, 0.4),
        })
        break
      }

      case 'image': {
        if (el.imageDataUrl) {
          try {
            const isJpeg = el.imageDataUrl.startsWith('data:image/jpeg')
            const base64 = el.imageDataUrl.split(',')[1]
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
            const img = isJpeg
              ? await pdfDoc.embedJpg(bytes)
              : await pdfDoc.embedPng(bytes)
            const scaled = img.scaleToFit(w, h)
            page.drawImage(img, {
              x: x + (w - scaled.width) / 2,
              y: y + (h - scaled.height) / 2,
              width: scaled.width,
              height: scaled.height,
            })
          } catch { /* skip */ }
        }
        break
      }

      case 'divider': {
        page.drawLine({
          start: { x, y: y + h / 2 },
          end: { x: x + w, y: y + h / 2 },
          thickness: 0.5, color: rgb(0.6, 0.6, 0.6),
        })
        break
      }
    }
  }

  const pdfBytes = await pdfDoc.save()
  const blob = new Blob([pdfBytes], { type: 'application/pdf' })
  const filename = `${doc.title.replace(/\s+/g, '-').toLowerCase()}-static.pdf`
  downloadBlob(blob, filename)
}

// ══════════════════════════════════════════════════════════════
//  Word Document Export (docx)
// ══════════════════════════════════════════════════════════════

export async function exportWordDoc(doc: FormDocument) {
  const children: Paragraph[] = []

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: doc.title, bold: true, size: 32 })],
    }),
    new Paragraph({ children: [] }), // spacer
  )

  // Sort elements by page, then Y
  const sorted = [...doc.elements].sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex
    return a.y - b.y
  })

  let currentPage = 0

  for (const el of sorted) {
    // Page break between pages
    if (el.pageIndex > currentPage) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
      currentPage = el.pageIndex
    }

    switch (el.type) {
      case 'heading':
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({
            text: el.label,
            bold: el.fontWeight === 'bold',
            size: (el.fontSize ?? 20) * 2,
          })],
        }))
        break

      case 'label':
        children.push(new Paragraph({
          children: [new TextRun({
            text: el.label,
            size: (el.fontSize ?? 14) * 2,
          })],
        }))
        break

      case 'text-input':
      case 'date':
        children.push(new Paragraph({
          children: [
            new TextRun({ text: el.label + (el.required ? ' *' : '') + ': ', bold: true, size: 20 }),
            new TextRun({ text: '________________________', size: 20, color: '999999' }),
          ],
        }))
        break

      case 'textarea':
        children.push(new Paragraph({
          children: [
            new TextRun({ text: el.label + (el.required ? ' *' : '') + ':', bold: true, size: 20 }),
          ],
        }))
        children.push(new Paragraph({
          children: [new TextRun({ text: ' ', size: 20 })],
          spacing: { after: 200 },
        }))
        break

      case 'checkbox':
        children.push(new Paragraph({
          children: [
            new TextRun({ text: '[ ] ', font: 'Courier New', size: 20 }),
            new TextRun({ text: el.label, size: 20 }),
          ],
        }))
        break

      case 'radio':
        children.push(new Paragraph({
          children: [new TextRun({ text: el.label + (el.required ? ' *' : ''), bold: true, size: 20 })],
        }))
        for (const opt of el.options ?? []) {
          children.push(new Paragraph({
            children: [
              new TextRun({ text: '  ( ) ', font: 'Courier New', size: 20 }),
              new TextRun({ text: opt, size: 20 }),
            ],
          }))
        }
        break

      case 'select':
        children.push(new Paragraph({
          children: [
            new TextRun({ text: el.label + (el.required ? ' *' : '') + ': ', bold: true, size: 20 }),
            new TextRun({ text: `[${(el.options ?? []).join(' / ')}]`, size: 20, color: '666666' }),
          ],
        }))
        break

      case 'signature':
        children.push(new Paragraph({ children: [] }))
        children.push(new Paragraph({
          children: [
            new TextRun({ text: '________________________', size: 20 }),
          ],
        }))
        children.push(new Paragraph({
          children: [new TextRun({ text: el.label, size: 16, color: '666666' })],
        }))
        break

      case 'image':
        if (el.imageDataUrl) {
          try {
            const base64 = el.imageDataUrl.split(',')[1]
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
            children.push(new Paragraph({
              children: [new ImageRun({
                data: bytes,
                transformation: { width: el.width, height: el.height },
                type: 'jpg',
              })],
            }))
          } catch { /* skip */ }
        }
        break

      case 'divider':
        children.push(new Paragraph({
          children: [new TextRun({ text: '─'.repeat(80), size: 12, color: '999999' })],
        }))
        break
    }
  }

  const wordDoc = new Document({
    sections: [{
      children,
    }],
  })

  const blob = await Packer.toBlob(wordDoc)
  const filename = `${doc.title.replace(/\s+/g, '-').toLowerCase()}.docx`
  downloadBlob(blob, filename)
}

// ══════════════════════════════════════════════════════════════
//  JSON Export / Import
// ══════════════════════════════════════════════════════════════

export function exportJSON(doc: FormDocument) {
  const json = JSON.stringify(doc, null, 2)
  downloadText(json, `${doc.title.replace(/\s+/g, '-').toLowerCase()}.json`, 'application/json')
}

export function importJSON(jsonStr: string): FormDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('Invalid JSON file')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid form document: not an object')
  }

  const obj = parsed as Record<string, unknown>

  if (!obj.title || typeof obj.title !== 'string') {
    throw new Error('Invalid form document: missing title')
  }

  if (!Array.isArray(obj.elements)) {
    throw new Error('Invalid form document: missing elements array')
  }

  // Validate each element has minimum required fields
  for (const el of obj.elements) {
    if (!el || typeof el !== 'object') throw new Error('Invalid element in form')
    const e = el as Record<string, unknown>
    if (typeof e.id !== 'string') throw new Error('Element missing id')
    if (typeof e.type !== 'string') throw new Error('Element missing type')
    if (typeof e.x !== 'number' || typeof e.y !== 'number') throw new Error('Element missing position')
  }

  return {
    id: (obj.id as string) || crypto.randomUUID(),
    title: obj.title as string,
    pageSize: (obj.pageSize === 'a4' ? 'a4' : 'letter'),
    pageCount: typeof obj.pageCount === 'number' ? Math.max(1, obj.pageCount) : 1,
    elements: obj.elements as FormElement[],
    createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : Date.now(),
    updatedAt: Date.now(),
  }
}

// ── Helpers ─────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return rgb(r || 0, g || 0, b || 0)
}
