import { useState, useRef, useCallback, useEffect } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { Slider } from '@/components/common/Slider.tsx'
import { readFileAsDataURL, formatFileSize } from '@/utils/fileReader.ts'
import { loadImage, resizeImage, canvasToBlob, removeBackgroundColor, getPixelColor } from '@/utils/imageProcessing.ts'
import { downloadBlob } from '@/utils/download.ts'
import { Download, Pipette, RotateCcw, Undo2, Image as ImageIcon, Eye, EyeOff, X } from 'lucide-react'

export default function BgRemoveTool() {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 })
  const [selectedColor, setSelectedColor] = useState<{ r: number; g: number; b: number } | null>(null)
  const [tolerance, setTolerance] = useState(30)
  const [isPickingColor, setIsPickingColor] = useState(false)
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)

  const sourceCanvasRef = useRef<HTMLCanvasElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const drawSourceImage = useCallback(async (src: string) => {
    const img = await loadImage(src)
    const canvas = sourceCanvasRef.current
    if (!canvas) return

    // Scale canvas to fit container while maintaining aspect ratio
    const maxW = 600
    const maxH = 500
    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1)
    canvas.width = img.naturalWidth * scale
    canvas.height = img.naturalHeight * scale

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  }, [])

  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return

    setError(null)
    setImageFile(file)
    setOutputBlob(null)
    setSelectedColor(null)

    try {
      const dataUrl = await readFileAsDataURL(file)
      setImageSrc(dataUrl)

      const img = await loadImage(dataUrl)
      setOriginalSize({ width: img.naturalWidth, height: img.naturalHeight })

      await drawSourceImage(dataUrl)
      setIsPickingColor(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Failed to load image: ${msg}`)
      setImageFile(null)
    }
  }, [drawSourceImage])

  // Redraw source when toggling original view
  useEffect(() => {
    if (imageSrc && showOriginal) {
      drawSourceImage(imageSrc)
    }
  }, [imageSrc, showOriginal, drawSourceImage])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPickingColor || !sourceCanvasRef.current) return

    const canvas = sourceCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width))
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height))

    const color = getPixelColor(canvas, x, y)
    setSelectedColor(color)
    setIsPickingColor(false)
  }, [isPickingColor])

  const handleRemove = useCallback(async () => {
    if (!imageSrc || !selectedColor) return

    setIsProcessing(true)
    setError(null)
    try {
      const img = await loadImage(imageSrc)
      // Work at full resolution
      const canvas = resizeImage(img, img.naturalWidth, img.naturalHeight)
      removeBackgroundColor(canvas, selectedColor, tolerance)

      const blob = await canvasToBlob(canvas, 'image/png', 1)
      setOutputBlob(blob)

      // Draw preview with checkerboard
      if (previewCanvasRef.current) {
        const previewCanvas = previewCanvasRef.current
        const maxW = 600
        const maxH = 500
        const scale = Math.min(maxW / canvas.width, maxH / canvas.height, 1)
        previewCanvas.width = canvas.width * scale
        previewCanvas.height = canvas.height * scale

        const ctx = previewCanvas.getContext('2d')!

        // Draw checkerboard pattern
        drawCheckerboard(ctx, previewCanvas.width, previewCanvas.height)

        // Draw result on top
        ctx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Background removal failed: ${msg}`)
    } finally {
      setIsProcessing(false)
    }
  }, [imageSrc, selectedColor, tolerance])

  const handleDownload = () => {
    if (!outputBlob || !imageFile) return
    const baseName = imageFile.name.replace(/\.[^.]+$/, '')
    downloadBlob(outputBlob, `${baseName}-nobg.png`)
  }

  const handleReset = () => {
    setSelectedColor(null)
    setOutputBlob(null)
    setTolerance(30)
    setIsPickingColor(true)
    if (imageSrc) {
      drawSourceImage(imageSrc)
    }
  }

  if (!imageFile) {
    return (
      <div className="h-full flex flex-col gap-4">
        <FileDropZone
          onFiles={handleFiles}
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          multiple={false}
          label="Drop an image here"
          description="PNG, JPEG, WebP, GIF, or BMP"
          className="h-full"
        />
        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400 flex-1">{error}</p>
            <button onClick={() => setError(null)} className="p-1 rounded text-red-400/60 hover:text-red-400 transition-colors" aria-label="Dismiss error">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex gap-6">
      {/* Left panel - Controls */}
      <div className="w-72 flex-shrink-0 space-y-5 overflow-y-auto pr-2">
        {/* Original info */}
        <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] space-y-1">
          <p className="text-xs text-white/40">Original</p>
          <p className="text-sm text-white">{originalSize.width} x {originalSize.height}px</p>
          <p className="text-xs text-white/40">{formatFileSize(imageFile.size)}</p>
        </div>

        {/* Selected color */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-white/70">Target Color</span>
          <div className="flex items-center gap-3">
            {selectedColor ? (
              <>
                <div
                  className="w-10 h-10 rounded-lg border-2 border-white/20"
                  style={{ backgroundColor: `rgb(${selectedColor.r}, ${selectedColor.g}, ${selectedColor.b})` }}
                />
                <div className="text-xs text-white/50 space-y-0.5">
                  <p>R: {selectedColor.r}</p>
                  <p>G: {selectedColor.g}</p>
                  <p>B: {selectedColor.b}</p>
                </div>
              </>
            ) : (
              <p className="text-xs text-white/40 italic">Click on the image to pick a color</p>
            )}
          </div>

          <Button
            variant={isPickingColor ? 'primary' : 'secondary'}
            onClick={() => {
              setIsPickingColor(!isPickingColor)
              if (!isPickingColor && imageSrc) {
                drawSourceImage(imageSrc)
              }
            }}
            icon={<Pipette size={14} />}
            className="w-full"
          >
            {isPickingColor ? 'Picking...' : 'Pick Color'}
          </Button>
        </div>

        {/* Tolerance */}
        <Slider
          label="Tolerance"
          value={tolerance}
          min={1}
          max={100}
          step={1}
          suffix="%"
          onChange={(e) => setTolerance(Number((e.target as HTMLInputElement).value))}
        />

        <p className="text-[10px] text-white/30 leading-relaxed">
          Lower tolerance removes only very similar colors. Higher tolerance removes a wider range.
        </p>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          {error && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-[11px] text-red-400 flex-1">{error}</p>
              <button onClick={() => setError(null)} className="p-0.5 rounded text-red-400/60 hover:text-red-400" aria-label="Dismiss error">
                <X size={12} />
              </button>
            </div>
          )}
          <Button
            onClick={handleRemove}
            disabled={isProcessing || !selectedColor}
            className="w-full"
          >
            {isProcessing ? 'Removing...' : 'Remove Background'}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleDownload}
              icon={<Download size={14} />}
              disabled={!outputBlob}
              className="flex-1"
            >
              Download PNG
            </Button>
            <Button
              variant="ghost"
              onClick={handleReset}
              icon={<Undo2 size={14} />}
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Output info */}
        {outputBlob && (
          <div className="p-3 rounded-lg bg-[#F47B20]/5 border border-[#F47B20]/20 space-y-1">
            <p className="text-xs text-white/40">Output (PNG)</p>
            <p className="text-sm text-white">{originalSize.width} x {originalSize.height}px</p>
            <p className="text-xs text-white/40">{formatFileSize(outputBlob.size)}</p>
          </div>
        )}

        {/* Toggle original/result */}
        {outputBlob && (
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className="flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            {showOriginal ? <EyeOff size={12} /> : <Eye size={12} />}
            {showOriginal ? 'Show result' : 'Show original'}
          </button>
        )}

        {/* Load new image */}
        <button
          onClick={() => {
            setImageFile(null)
            setImageSrc(null)
            setOutputBlob(null)
            setSelectedColor(null)
          }}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Load different image
        </button>
      </div>

      {/* Right panel - Preview */}
      <div className="flex-1 flex items-center justify-center overflow-hidden" ref={containerRef}>
        <div className="flex flex-col items-center gap-4">
          {outputBlob && !showOriginal ? (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <canvas ref={previewCanvasRef} className="max-w-full max-h-[60vh]" />
            </div>
          ) : imageSrc ? (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] relative">
              <canvas
                ref={sourceCanvasRef}
                onClick={handleCanvasClick}
                className={`max-w-full max-h-[60vh] ${isPickingColor ? 'cursor-crosshair' : ''}`}
              />
              {isPickingColor && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-[#F47B20]/90 text-white text-xs font-medium backdrop-blur-sm">
                  Click to select the background color
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/30">
              <ImageIcon size={64} strokeWidth={1} />
              <p className="text-sm">Image preview will appear here</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Draw a checkerboard pattern to show transparency */
function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const size = 8
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      const isLight = ((x / size) + (y / size)) % 2 === 0
      ctx.fillStyle = isLight ? '#2a2a2a' : '#1a1a1a'
      ctx.fillRect(x, y, size, size)
    }
  }
}
