import { useState, useCallback, useRef, useEffect } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { Slider } from '@/components/common/Slider.tsx'
import { loadPDFFile, renderPageToCanvas } from '@/utils/pdf.ts'
import { downloadBlob } from '@/utils/download.ts'
import { formatFileSize } from '@/utils/fileReader.ts'
import type { PDFFile } from '@/types'
import { PDFDocument, rgb, degrees } from 'pdf-lib'
import { Download, RotateCcw, Type, Image as ImageIcon, Move } from 'lucide-react'

type WatermarkType = 'text' | 'image'
type Position = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tile'

const POSITIONS: { id: Position; label: string }[] = [
  { id: 'center', label: 'Center' },
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-right', label: 'Bottom Right' },
  { id: 'tile', label: 'Tile' },
]

export default function WatermarkTool() {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null)
  const [watermarkType, setWatermarkType] = useState<WatermarkType>('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [fontSize, setFontSize] = useState(48)
  const [opacity, setOpacity] = useState(30)
  const [rotation, setRotation] = useState(-45)
  const [position, setPosition] = useState<Position>('center')
  const [color, setColor] = useState('#888888')
  const [isProcessing, setIsProcessing] = useState(false)
  const [previewPage, setPreviewPage] = useState(1)

  // Custom position offset (relative to preset position, in normalized 0-1 coords)
  const [customOffset, setCustomOffset] = useState<{ x: number; y: number } | null>(null)

  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const pdf = await loadPDFFile(file)
    setPdfFile(pdf)
    setPreviewPage(1)
    setCustomOffset(null)
  }, [])

  // Get watermark position in canvas coordinates
  const getWatermarkPos = useCallback((w: number, h: number): { x: number; y: number } => {
    const basePos = getPositionCoords(position, w, h, fontSize)
    if (customOffset && position !== 'tile') {
      return {
        x: basePos.x + customOffset.x * w,
        y: basePos.y + customOffset.y * h,
      }
    }
    return basePos
  }, [position, fontSize, customOffset])

  // Render PDF page (only when page/file changes)
  useEffect(() => {
    if (!pdfFile || !previewCanvasRef.current) return

    const renderPdf = async () => {
      const canvas = previewCanvasRef.current!
      await renderPageToCanvas(pdfFile, previewPage, canvas, 1.0)

      // Size overlay to match
      const overlay = overlayCanvasRef.current
      if (overlay && (overlay.width !== canvas.width || overlay.height !== canvas.height)) {
        overlay.width = canvas.width
        overlay.height = canvas.height
      }
    }

    renderPdf()
  }, [pdfFile, previewPage])

  // Draw watermark overlay (separate from PDF rendering to avoid flashing on drag)
  useEffect(() => {
    const overlay = overlayCanvasRef.current
    const pdfCanvas = previewCanvasRef.current
    if (!overlay || !pdfCanvas || !pdfFile) return

    // Ensure overlay is sized
    if (overlay.width !== pdfCanvas.width || overlay.height !== pdfCanvas.height) {
      overlay.width = pdfCanvas.width
      overlay.height = pdfCanvas.height
    }

    const ctx = overlay.getContext('2d')!
    ctx.clearRect(0, 0, overlay.width, overlay.height)

    if (watermarkType === 'text' && text.trim()) {
      drawTextWatermark(ctx, overlay.width, overlay.height)
    }
  }, [pdfFile, previewPage, text, fontSize, opacity, rotation, position, color, watermarkType, customOffset])

  const drawTextWatermark = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.globalAlpha = opacity / 100
    ctx.fillStyle = color
    ctx.font = `${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (position === 'tile') {
      const spacing = fontSize * 4
      for (let y = -h; y < h * 2; y += spacing) {
        for (let x = -w; x < w * 2; x += spacing) {
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate((rotation * Math.PI) / 180)
          ctx.fillText(text, 0, 0)
          ctx.restore()
        }
      }
    } else {
      const pos = getWatermarkPos(w, h)
      const margin = fontSize * 2
      const maxWidth = w - margin * 2
      const lines = wrapTextToWidth(text, maxWidth, (t) => ctx.measureText(t).width)
      const lineHeight = fontSize * 1.3
      const totalHeight = lines.length * lineHeight

      ctx.save()
      ctx.translate(pos.x, pos.y)
      ctx.rotate((rotation * Math.PI) / 180)
      const startY = -totalHeight / 2 + lineHeight / 2
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 0, startY + i * lineHeight)
      }
      ctx.restore()
    }
  }

  // Drag handling for non-tile watermarks
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (position === 'tile') return
    const overlay = overlayCanvasRef.current
    if (!overlay) return

    const rect = overlay.getBoundingClientRect()
    const scaleX = overlay.width / rect.width
    const scaleY = overlay.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    isDraggingRef.current = true
    const currentPos = getWatermarkPos(overlay.width, overlay.height)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: currentPos.x,
      offsetY: currentPos.y,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [position, getWatermarkPos])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !dragStartRef.current) return
    const overlay = overlayCanvasRef.current
    if (!overlay) return

    const rect = overlay.getBoundingClientRect()
    const scaleX = overlay.width / rect.width
    const scaleY = overlay.height / rect.height

    const dx = (e.clientX - dragStartRef.current.x) * scaleX
    const dy = (e.clientY - dragStartRef.current.y) * scaleY

    const newX = dragStartRef.current.offsetX + dx
    const newY = dragStartRef.current.offsetY + dy

    // Calculate offset from base position
    const basePos = getPositionCoords(position, overlay.width, overlay.height, fontSize)
    setCustomOffset({
      x: (newX - basePos.x) / overlay.width,
      y: (newY - basePos.y) / overlay.height,
    })
  }, [position, fontSize])

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false
    dragStartRef.current = null
  }, [])

  const handleApply = useCallback(async () => {
    if (!pdfFile || !text.trim()) return

    setIsProcessing(true)
    try {
      const doc = await PDFDocument.load(pdfFile.data)
      const pages = doc.getPages()

      const r = parseInt(color.slice(1, 3), 16) / 255
      const g = parseInt(color.slice(3, 5), 16) / 255
      const b = parseInt(color.slice(5, 7), 16) / 255

      for (const page of pages) {
        const { width, height } = page.getSize()

        if (position === 'tile') {
          const spacing = fontSize * 4
          for (let y = 0; y < height; y += spacing) {
            for (let x = 0; x < width; x += spacing) {
              page.drawText(text, {
                x,
                y,
                size: fontSize,
                color: rgb(r, g, b),
                opacity: opacity / 100,
                rotate: degrees(rotation),
              })
            }
          }
        } else {
          // Get canvas-style position, then convert to PDF coordinates
          const canvasPos = getWatermarkPos(width, height)
          const margin = fontSize * 2
          const maxWidth = width - margin * 2
          const measureFn = (t: string) => t.length * fontSize * 0.5
          const lines = wrapTextToWidth(text, maxWidth, measureFn)
          const lineHeight = fontSize * 1.3
          const totalHeight = lines.length * lineHeight

          // Convert canvas Y (top-down) to PDF Y (bottom-up)
          // In canvas: pos.y is from top. In PDF: y is from bottom
          const pdfCenterY = height - canvasPos.y

          // Draw each line centered around the position
          const startY = pdfCenterY + totalHeight / 2 - lineHeight / 2
          for (let i = 0; i < lines.length; i++) {
            const lineWidth = measureFn(lines[i])
            page.drawText(lines[i], {
              x: canvasPos.x - lineWidth / 2,
              y: startY - i * lineHeight,
              size: fontSize,
              color: rgb(r, g, b),
              opacity: opacity / 100,
              rotate: degrees(rotation),
            })
          }
        }
      }

      const pdfBytes = await doc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const baseName = pdfFile.name.replace(/\.pdf$/i, '')

      let saved = false
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: `${baseName}-watermarked.pdf`,
            types: [{ description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          saved = true
        } catch (e: any) {
          if (e?.name === 'AbortError') {
            setIsProcessing(false)
            return
          }
        }
      }
      if (!saved) downloadBlob(blob, `${baseName}-watermarked.pdf`)
    } catch (err) {
      console.error('Watermark failed:', err)
    } finally {
      setIsProcessing(false)
    }
  }, [pdfFile, text, fontSize, opacity, rotation, position, color, customOffset, getWatermarkPos])

  // Reset custom offset when position preset changes
  const handlePositionChange = (newPosition: Position) => {
    setPosition(newPosition)
    setCustomOffset(null)
  }

  if (!pdfFile) {
    return (
      <FileDropZone
        onFiles={handleFiles}
        accept="application/pdf"
        multiple={false}
        label="Drop a PDF file here"
        description="Add text watermarks to your PDF"
        className="h-full"
      />
    )
  }

  return (
    <div className="h-full flex gap-6">
      {/* Left panel - Controls */}
      <div className="w-72 flex-shrink-0 space-y-5 overflow-y-auto pr-2">
        {/* File info */}
        <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] space-y-1">
          <p className="text-sm text-white truncate">{pdfFile.name}</p>
          <p className="text-xs text-white/40">
            {pdfFile.pageCount} pages · {formatFileSize(pdfFile.size)}
          </p>
        </div>

        {/* Watermark type */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-white/70">Type</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setWatermarkType('text')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors ${
                watermarkType === 'text'
                  ? 'bg-[#F47B20] text-white'
                  : 'bg-white/[0.06] text-white/50 hover:text-white'
              }`}
            >
              <Type size={12} /> Text
            </button>
            <button
              onClick={() => setWatermarkType('image')}
              disabled
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md bg-white/[0.06] text-white/20 cursor-not-allowed"
              title="Coming soon"
            >
              <ImageIcon size={12} /> Image
            </button>
          </div>
        </div>

        {/* Text input */}
        {watermarkType === 'text' && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/70 block">Text</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Watermark text"
              className="w-full px-3 py-2 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white focus:outline-none focus:border-[#F47B20]/40"
            />
          </div>
        )}

        {/* Font size */}
        <Slider
          label="Font Size"
          value={fontSize}
          min={12}
          max={120}
          step={2}
          suffix="px"
          onChange={(e) => setFontSize(Number((e.target as HTMLInputElement).value))}
        />

        {/* Opacity */}
        <Slider
          label="Opacity"
          value={opacity}
          min={5}
          max={100}
          step={5}
          suffix="%"
          onChange={(e) => setOpacity(Number((e.target as HTMLInputElement).value))}
        />

        {/* Rotation */}
        <Slider
          label="Rotation"
          value={rotation}
          min={-180}
          max={180}
          step={5}
          suffix="°"
          onChange={(e) => setRotation(Number((e.target as HTMLInputElement).value))}
        />

        {/* Color */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/70 block">Color</label>
          <div className="flex items-center gap-2">
            <label
              className="w-8 h-8 rounded-lg border border-white/[0.12] cursor-pointer flex-shrink-0"
              style={{ backgroundColor: color }}
            >
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="opacity-0 w-0 h-0"
              />
            </label>
            <input
              type="text"
              value={color}
              onChange={(e) => {
                if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setColor(e.target.value)
              }}
              className="flex-1 px-2 py-1 text-xs bg-dark-surface border border-white/[0.1] rounded-md text-white focus:outline-none focus:border-[#F47B20]/40"
            />
          </div>
        </div>

        {/* Position */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-white/70">Position</span>
          <div className="grid grid-cols-2 gap-1.5">
            {POSITIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => handlePositionChange(p.id)}
                className={`px-2 py-1.5 text-[10px] rounded-md transition-colors ${
                  position === p.id
                    ? 'bg-[#F47B20] text-white'
                    : 'bg-white/[0.06] text-white/50 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {position !== 'tile' && (
            <p className="text-[10px] text-white/30 flex items-center gap-1 mt-1">
              <Move size={10} /> Drag watermark to reposition
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          <Button onClick={handleApply} disabled={isProcessing || !text.trim()} className="w-full">
            {isProcessing ? 'Applying...' : 'Apply & Download'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setPdfFile(null)
              setCustomOffset(null)
            }}
            icon={<RotateCcw size={14} />}
            className="w-full"
          >
            Load Different PDF
          </Button>
        </div>
      </div>

      {/* Right panel - Preview */}
      <div className="flex-1 flex flex-col items-center gap-3 overflow-hidden">
        {/* Page navigation */}
        {pdfFile.pageCount > 1 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setPreviewPage(Math.max(1, previewPage - 1))}
              disabled={previewPage === 1}
              className="px-2 py-1 text-xs text-white/40 hover:text-white disabled:opacity-30"
            >
              Prev
            </button>
            <span className="text-xs text-white/50">
              Page {previewPage} / {pdfFile.pageCount}
            </span>
            <button
              onClick={() => setPreviewPage(Math.min(pdfFile.pageCount, previewPage + 1))}
              disabled={previewPage === pdfFile.pageCount}
              className="px-2 py-1 text-xs text-white/40 hover:text-white disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}

        {/* Preview canvas */}
        <div className="relative p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
          <canvas ref={previewCanvasRef} className="max-w-full max-h-[60vh]" />
          <canvas
            ref={overlayCanvasRef}
            className={`absolute top-4 left-4 max-w-full max-h-[60vh] ${
              position === 'tile' ? 'pointer-events-none' : 'cursor-move'
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
      </div>
    </div>
  )
}

function getPositionCoords(
  position: Position,
  width: number,
  height: number,
  fontSize: number,
): { x: number; y: number } {
  const margin = fontSize
  switch (position) {
    case 'center':
      return { x: width / 2, y: height / 2 }
    case 'top-left':
      return { x: margin + fontSize, y: margin + fontSize }
    case 'top-right':
      return { x: width - margin - fontSize, y: margin + fontSize }
    case 'bottom-left':
      return { x: margin + fontSize, y: height - margin - fontSize }
    case 'bottom-right':
      return { x: width - margin - fontSize, y: height - margin - fontSize }
    default:
      return { x: width / 2, y: height / 2 }
  }
}

/** Wrap text to fit within maxWidth. Returns array of lines. */
function wrapTextToWidth(
  text: string,
  maxWidth: number,
  measureFn: (t: string) => number,
): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (measureFn(testLine) <= maxWidth || !currentLine) {
      currentLine = testLine
    } else {
      lines.push(currentLine)
      currentLine = word
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines.length ? lines : [text]
}
