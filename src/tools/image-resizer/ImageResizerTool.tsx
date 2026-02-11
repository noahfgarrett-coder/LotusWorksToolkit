import { useState, useRef, useCallback } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { Slider } from '@/components/common/Slider.tsx'
import { readFileAsDataURL, formatFileSize } from '@/utils/fileReader.ts'
import { loadImage, resizeImage, canvasToBlob } from '@/utils/imageProcessing.ts'
import { downloadBlob } from '@/utils/download.ts'
import { Download, Link2, Link2Off, RotateCcw, Image as ImageIcon, X } from 'lucide-react'

type OutputFormat = 'image/png' | 'image/jpeg' | 'image/webp'

const formatOptions: { id: OutputFormat; label: string; ext: string }[] = [
  { id: 'image/png', label: 'PNG', ext: 'png' },
  { id: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { id: 'image/webp', label: 'WebP', ext: 'webp' },
]

export default function ImageResizerTool() {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [originalSize, setOriginalSize] = useState({ width: 0, height: 0 })
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [lockAspect, setLockAspect] = useState(true)
  const [quality, setQuality] = useState(92)
  const [format, setFormat] = useState<OutputFormat>('image/png')
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  const aspectRatio = originalSize.width / (originalSize.height || 1)

  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return

    setError(null)
    setImageFile(file)
    setOutputBlob(null)

    try {
      const dataUrl = await readFileAsDataURL(file)
      setImageSrc(dataUrl)

      const img = await loadImage(dataUrl)
      setOriginalSize({ width: img.naturalWidth, height: img.naturalHeight })
      setWidth(img.naturalWidth)
      setHeight(img.naturalHeight)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Failed to load image: ${msg}`)
      setImageFile(null)
    }
  }, [])

  const handleWidthChange = (newWidth: number) => {
    setWidth(newWidth)
    if (lockAspect) {
      setHeight(Math.round(newWidth / aspectRatio))
    }
  }

  const handleHeightChange = (newHeight: number) => {
    setHeight(newHeight)
    if (lockAspect) {
      setWidth(Math.round(newHeight * aspectRatio))
    }
  }

  const handleResize = useCallback(async () => {
    if (!imageSrc || width <= 0 || height <= 0) return

    setIsProcessing(true)
    setError(null)
    try {
      const img = await loadImage(imageSrc)
      const canvas = resizeImage(img, width, height)
      const blob = await canvasToBlob(canvas, format, quality / 100)
      setOutputBlob(blob)

      // Draw preview
      if (previewRef.current) {
        const ctx = previewRef.current.getContext('2d')!
        const previewScale = Math.min(400 / width, 300 / height, 1)
        previewRef.current.width = Math.round(width * previewScale)
        previewRef.current.height = Math.round(height * previewScale)
        ctx.drawImage(canvas, 0, 0, previewRef.current.width, previewRef.current.height)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Resize failed: ${msg}`)
    } finally {
      setIsProcessing(false)
    }
  }, [imageSrc, width, height, format, quality])

  const handleDownload = () => {
    if (!outputBlob || !imageFile) return
    const baseName = imageFile.name.replace(/\.[^.]+$/, '')
    const ext = formatOptions.find((f) => f.id === format)?.ext ?? 'png'
    downloadBlob(outputBlob, `${baseName}-${width}x${height}.${ext}`)
  }

  const handleReset = () => {
    setWidth(originalSize.width)
    setHeight(originalSize.height)
    setOutputBlob(null)
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

        {/* Dimensions */}
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-white/70 mb-1 block">Width</label>
              <input
                type="number"
                value={width}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
                min={1}
                max={8192}
                className="w-full px-3 py-2 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white focus:outline-none focus:border-[#F47B20]/40"
              />
            </div>
            <button
              onClick={() => setLockAspect(!lockAspect)}
              className={`p-2 rounded-lg mb-0.5 transition-colors ${
                lockAspect ? 'text-[#F47B20] bg-[#F47B20]/10' : 'text-white/30 hover:text-white/60'
              }`}
              title={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              aria-label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            >
              {lockAspect ? <Link2 size={16} /> : <Link2Off size={16} />}
            </button>
            <div className="flex-1">
              <label className="text-xs font-medium text-white/70 mb-1 block">Height</label>
              <input
                type="number"
                value={height}
                onChange={(e) => handleHeightChange(Number(e.target.value))}
                min={1}
                max={8192}
                className="w-full px-3 py-2 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white focus:outline-none focus:border-[#F47B20]/40"
              />
            </div>
          </div>

          {/* Preset sizes */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { label: '50%', w: Math.round(originalSize.width / 2) },
              { label: '25%', w: Math.round(originalSize.width / 4) },
              { label: '1080p', w: 1920 },
              { label: '720p', w: 1280 },
              { label: '480p', w: 854 },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => handleWidthChange(preset.w)}
                className="px-2 py-1 text-[10px] rounded bg-white/[0.06] text-white/50 hover:text-white hover:bg-white/[0.1] transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Format */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-white/70">Format</span>
          <div className="flex gap-1.5">
            {formatOptions.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                  format === f.id
                    ? 'bg-[#F47B20] text-white'
                    : 'bg-white/[0.06] text-white/50 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quality (for lossy formats) */}
        {format !== 'image/png' && (
          <Slider
            label="Quality"
            value={quality}
            min={10}
            max={100}
            step={5}
            suffix="%"
            onChange={(e) => setQuality(Number((e.target as HTMLInputElement).value))}
          />
        )}

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
          <Button onClick={handleResize} disabled={isProcessing} className="w-full">
            {isProcessing ? 'Resizing...' : 'Resize'}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleDownload}
              icon={<Download size={14} />}
              disabled={!outputBlob}
              className="flex-1"
            >
              Download
            </Button>
            <Button
              variant="ghost"
              onClick={handleReset}
              icon={<RotateCcw size={14} />}
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Output info */}
        {outputBlob && (
          <div className="p-3 rounded-lg bg-[#F47B20]/5 border border-[#F47B20]/20 space-y-1">
            <p className="text-xs text-white/40">Output</p>
            <p className="text-sm text-white">{width} x {height}px</p>
            <p className="text-xs text-white/40">{formatFileSize(outputBlob.size)}</p>
            {imageFile.size > outputBlob.size && (
              <p className="text-xs text-emerald-400">
                {Math.round((1 - outputBlob.size / imageFile.size) * 100)}% smaller
              </p>
            )}
          </div>
        )}

        {/* Load new image */}
        <button
          onClick={() => {
            setImageFile(null)
            setImageSrc(null)
            setOutputBlob(null)
          }}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Load different image
        </button>
      </div>

      {/* Right panel - Preview */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="flex flex-col items-center gap-4">
          {outputBlob ? (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <canvas ref={previewRef} className="max-w-full max-h-[60vh]" />
            </div>
          ) : imageSrc ? (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <img
                src={imageSrc}
                alt="Preview"
                className="max-w-full max-h-[60vh] object-contain"
              />
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
