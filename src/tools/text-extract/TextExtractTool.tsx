import { useState, useCallback } from 'react'
import { FileDropZone } from '@/components/common/FileDropZone.tsx'
import { Button } from '@/components/common/Button.tsx'
import { ProgressBar } from '@/components/common/ProgressBar.tsx'
import { loadPDFFile, extractAllText, hasEmbeddedText } from '@/utils/pdf.ts'
import { downloadText } from '@/utils/download.ts'
import { formatFileSize } from '@/utils/fileReader.ts'
import type { PDFFile } from '@/types'
import { Download, Copy, FileText, AlertCircle, RotateCcw } from 'lucide-react'

export default function TextExtractTool() {
  const [pdfFile, setPdfFile] = useState<PDFFile | null>(null)
  const [extractedText, setExtractedText] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [hasText, setHasText] = useState<boolean | null>(null)
  const [copied, setCopied] = useState(false)

  const handleFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return

    setIsLoading(true)
    try {
      const pdf = await loadPDFFile(file)
      setPdfFile(pdf)
      setExtractedText('')
      setHasText(null)

      // Check if there's embedded text
      const detected = await hasEmbeddedText(pdf)
      setHasText(detected)

      if (detected) {
        // Auto-extract if text is present
        setIsExtracting(true)
        const text = await extractAllText(pdf, (current, total) => {
          setProgress(Math.round((current / total) * 100))
        })
        setExtractedText(text)
        setIsExtracting(false)
      }
    } catch (err) {
      console.error('Failed to load PDF:', err)
    } finally {
      setIsLoading(false)
      setProgress(0)
    }
  }, [])

  const handleExtract = useCallback(async () => {
    if (!pdfFile) return
    setIsExtracting(true)
    setProgress(0)
    try {
      const text = await extractAllText(pdfFile, (current, total) => {
        setProgress(Math.round((current / total) * 100))
      })
      setExtractedText(text)
    } catch (err) {
      console.error('Extraction failed:', err)
    } finally {
      setIsExtracting(false)
      setProgress(0)
    }
  }, [pdfFile])

  const handleCopy = () => {
    navigator.clipboard.writeText(extractedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadTxt = () => {
    if (!pdfFile || !extractedText) return
    const baseName = pdfFile.name.replace(/\.pdf$/i, '')
    downloadText(extractedText, `${baseName}-text.txt`)
  }

  if (!pdfFile) {
    return (
      <div className="h-full flex flex-col gap-4">
        <FileDropZone
          onFiles={handleFiles}
          accept="application/pdf"
          multiple={false}
          label="Drop a PDF file here"
          description="Extract embedded text from PDF"
          className="h-full"
        />
        {isLoading && (
          <div className="text-center text-sm text-white/40">Loading PDF...</div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-[#F47B20]" />
          <div>
            <p className="text-sm text-white">{pdfFile.name}</p>
            <p className="text-xs text-white/40">
              {pdfFile.pageCount} pages · {formatFileSize(pdfFile.size)}
            </p>
          </div>
        </div>
        <div className="flex-1" />

        {extractedText && (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<Copy size={12} />}
              onClick={handleCopy}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download size={12} />}
              onClick={handleDownloadTxt}
            >
              Download TXT
            </Button>
          </>
        )}

        {!extractedText && !isExtracting && (
          <Button size="sm" onClick={handleExtract}>
            Extract Text
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={12} />}
          onClick={() => {
            setPdfFile(null)
            setExtractedText('')
            setHasText(null)
          }}
        >
          New
        </Button>
      </div>

      {/* Progress */}
      {isExtracting && (
        <ProgressBar value={progress} max={100} label="Extracting text..." />
      )}

      {/* Warning if no embedded text */}
      {hasText === false && !extractedText && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle size={16} className="text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-400">
            This PDF appears to have little or no embedded text. It may be a scanned document.
            Try the <strong>OCR Extract</strong> tool for scanned PDFs.
          </p>
        </div>
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
            {isExtracting ? 'Extracting...' : 'Text will appear here'}
          </div>
        )}
      </div>

      {/* Stats */}
      {extractedText && (
        <div className="flex items-center gap-4 text-xs text-white/30 flex-shrink-0">
          <span>{extractedText.length.toLocaleString()} characters</span>
          <span>{extractedText.split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
          <span>{extractedText.split('\n').length.toLocaleString()} lines</span>
        </div>
      )}
    </div>
  )
}
