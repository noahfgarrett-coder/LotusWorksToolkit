import { useState, useCallback, useRef } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { ProgressBar } from '@/components/common/ProgressBar.tsx'
import { loadPDFFile, renderPageToCanvas } from '@/utils/pdf.ts'
import { readFileAsDataURL } from '@/utils/fileReader.ts'
import { loadImage } from '@/utils/imageProcessing.ts'
import { downloadText } from '@/utils/download.ts'
import { formatFileSize } from '@/utils/fileReader.ts'
import type { PDFFile } from '@/types'
import Tesseract from 'tesseract.js'
import { Download, Copy, ScanText, RotateCcw, Globe } from 'lucide-react'

const LANGUAGES = [
  { id: 'eng', label: 'English' },
  { id: 'spa', label: 'Spanish' },
  { id: 'fra', label: 'French' },
  { id: 'deu', label: 'German' },
  { id: 'ita', label: 'Italian' },
  { id: 'por', label: 'Portuguese' },
  { id: 'jpn', label: 'Japanese' },
  { id: 'chi_sim', label: 'Chinese (Simplified)' },
  { id: 'kor', label: 'Korean' },
  { id: 'ara', label: 'Arabic' },
]

type InputType = 'pdf' | 'image'

export default function OcrExtractTool() {
  const [inputType, setInputType] = useState<InputType | null>(null)
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [extractedText, setExtractedText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [language, setLanguage] = useState('eng')
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return

    setExtractedText('')

    if (file.type === 'application/pdf') {
      setInputType('pdf')
      const pdf = await loadPDFFile(file)
      setPdfFile(pdf)
      setImageFile(null)
    } else if (file.type.startsWith('image/')) {
      setInputType('image')
      setImageFile(file)
      setPdfFile(null)
    }
  }, [])

  const handleOCR = useCallback(async () => {
    setIsProcessing(true)
    setProgress(0)
    setProgressMsg('Initializing OCR engine...')
    setExtractedText('')

    try {
      if (inputType === 'image' && imageFile) {
        // OCR single image
        const dataUrl = await readFileAsDataURL(imageFile)
        const result = await Tesseract.recognize(dataUrl, language, {
          logger: (m: { status: string; progress?: number }) => {
            if (m.status === 'recognizing text') {
              setProgress(Math.round((m.progress ?? 0) * 100))
              setProgressMsg('Recognizing text...')
            } else {
              setProgressMsg(m.status)
            }
          },
        })
        setExtractedText(result.data.text)
      } else if (inputType === 'pdf' && pdfFile) {
        // OCR each page of PDF
        const allText: string[] = []
        const canvas = canvasRef.current || document.createElement('canvas')

        for (let i = 1; i <= pdfFile.pageCount; i++) {
          setProgressMsg(`Processing page ${i} of ${pdfFile.pageCount}...`)

          // Render page to canvas at high DPI for OCR
          await renderPageToCanvas(pdfFile, i, canvas, 2.0)

          // Convert canvas to image data
          const dataUrl = canvas.toDataURL('image/png')

          const result = await Tesseract.recognize(dataUrl, language, {
            logger: (m: { status: string; progress?: number }) => {
              if (m.status === 'recognizing text') {
                const pageProgress = ((i - 1) / pdfFile.pageCount) + ((m.progress ?? 0) / pdfFile.pageCount)
                setProgress(Math.round(pageProgress * 100))
              }
            },
          })

          if (result.data.text.trim()) {
            allText.push(`--- Page ${i} ---\n${result.data.text}`)
          }
        }

        setExtractedText(allText.join('\n\n'))
      }
    } catch (err) {
      console.error('OCR failed:', err)
      setExtractedText('OCR failed. Please try again.')
    } finally {
      setIsProcessing(false)
      setProgress(0)
      setProgressMsg('')
    }
  }, [inputType, imageFile, pdfFile, language])

  const handleCopy = () => {
    navigator.clipboard.writeText(extractedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    const name = pdfFile?.name || imageFile?.name || 'ocr-result'
    const baseName = name.replace(/\.[^.]+$/, '')
    downloadText(extractedText, `${baseName}-ocr.txt`)
  }

  if (!inputType) {
    return (
      <div className="h-full flex flex-col gap-4">
        <FileDropZone
          onFiles={handleFiles}
          accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp"
          multiple={false}
          label="Drop a PDF or image here"
          description="Uses OCR to extract text from scanned documents"
          className="h-full"
        />
        <div className="flex items-center gap-2 text-xs text-white/25 justify-center">
          <Globe size={12} />
          <span>Requires internet on first use to download OCR engine</span>
        </div>
      </div>
    )
  }

  const fileName = pdfFile?.name || imageFile?.name || ''
  const fileSize = pdfFile?.size || imageFile?.size || 0

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Hidden canvas for PDF rendering */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ScanText size={16} className="text-[#F47B20]" />
          <div>
            <p className="text-sm text-white truncate max-w-[200px]">{fileName}</p>
            <p className="text-xs text-white/40">
              {pdfFile ? `${pdfFile.pageCount} pages · ` : ''}
              {formatFileSize(fileSize)}
            </p>
          </div>
        </div>

        {/* Language picker */}
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={isProcessing}
          className="px-2 py-1.5 text-xs bg-dark-surface border border-white/[0.1] rounded-md text-white focus:outline-none focus:border-[#F47B20]/40"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.id} value={lang.id}>
              {lang.label}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {extractedText && (
          <>
            <Button variant="secondary" size="sm" icon={<Copy size={12} />} onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button variant="secondary" size="sm" icon={<Download size={12} />} onClick={handleDownload}>
              Download TXT
            </Button>
          </>
        )}

        {!isProcessing && (
          <Button size="sm" onClick={handleOCR}>
            {extractedText ? 'Re-run OCR' : 'Run OCR'}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={12} />}
          onClick={() => {
            setInputType(null)
            setPdfFile(null)
            setImageFile(null)
            setExtractedText('')
          }}
        >
          New
        </Button>
      </div>

      {/* Progress */}
      {isProcessing && (
        <ProgressBar value={progress} max={100} label={progressMsg} />
      )}

      {/* Text output */}
      <div className="flex-1 overflow-hidden rounded-lg border border-white/[0.06]">
        {extractedText ? (
          <div className="h-full overflow-auto p-4">
            <pre className="text-sm text-white/80 whitespace-pre-wrap font-mono leading-relaxed">
              {extractedText}
            </pre>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-white/30 text-sm">
            {isProcessing ? 'Processing...' : 'Click "Run OCR" to extract text'}
          </div>
        )}
      </div>

      {/* Stats */}
      {extractedText && (
        <div className="flex items-center gap-4 text-xs text-white/30 flex-shrink-0">
          <span>{extractedText.length.toLocaleString()} characters</span>
          <span>{extractedText.split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
        </div>
      )}
    </div>
  )
}
