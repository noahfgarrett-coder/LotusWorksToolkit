import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import { Button } from '@/components/common/Button.tsx'
import { Slider } from '@/components/common/Slider.tsx'
import { ColorPicker } from '@/components/common/ColorPicker.tsx'
import { Tabs } from '@/components/common/Tabs.tsx'
import { downloadCanvas } from '@/utils/download.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { Download, Copy, QrCode } from 'lucide-react'

type InputType = 'text' | 'url' | 'email' | 'wifi'

const inputTabs = [
  { id: 'text', label: 'Text' },
  { id: 'url', label: 'URL' },
  { id: 'email', label: 'Email' },
  { id: 'wifi', label: 'WiFi' },
]

const errorCorrectionLevels = [
  { id: 'L', label: 'L (7%)' },
  { id: 'M', label: 'M (15%)' },
  { id: 'Q', label: 'Q (25%)' },
  { id: 'H', label: 'H (30%)' },
]

export default function QrCodeTool() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [inputType, setInputType] = useState<InputType>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('https://')
  const [email, setEmail] = useState('')
  const [wifiSSID, setWifiSSID] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [wifiEncryption, setWifiEncryption] = useState<'WPA' | 'WEP' | 'nopass'>('WPA')

  const [size, setSize] = useState(300)
  const [fgColor, setFgColor] = useState('#FFFFFF')
  const [bgColor, setBgColor] = useState('#00171F')
  const [errorCorrection, setErrorCorrection] = useState<'L' | 'M' | 'Q' | 'H'>('M')

  const getQRData = useCallback(() => {
    switch (inputType) {
      case 'text': return text
      case 'url': return url
      case 'email': return `mailto:${email}`
      case 'wifi': return `WIFI:T:${wifiEncryption};S:${wifiSSID};P:${wifiPassword};;`
    }
  }, [inputType, text, url, email, wifiSSID, wifiPassword, wifiEncryption])

  const qrData = getQRData()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !qrData.trim()) return

    QRCode.toCanvas(canvas, qrData, {
      width: size,
      margin: 2,
      color: { dark: fgColor, light: bgColor },
      errorCorrectionLevel: errorCorrection,
    }).catch(() => {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    })
  }, [qrData, size, fgColor, bgColor, errorCorrection])

  const handleDownloadPNG = () => {
    if (!canvasRef.current) return
    downloadCanvas(canvasRef.current, 'qrcode.png', 'image/png')
  }

  const handleCopyToClipboard = async () => {
    if (!canvasRef.current) return
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvasRef.current!.toBlob((b) => {
          if (b) resolve(b)
          else reject(new Error('Failed to create image blob'))
        }, 'image/png')
      })
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {
      useAppStore.getState().addToast({ type: 'error', message: 'Failed to copy to clipboard' })
    }
  }

  return (
    <div className="h-full flex gap-6">
      {/* Left panel - Controls */}
      <div className="w-80 flex-shrink-0 space-y-5 overflow-y-auto pr-2">
        <Tabs tabs={inputTabs} activeTab={inputType} onChange={(t) => setInputType(t as InputType)} />

        <div className="space-y-3">
          {inputType === 'text' && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text..."
              rows={4}
              className="w-full px-3 py-2.5 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#F47B20]/40 resize-none"
            />
          )}
          {inputType === 'url' && (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2.5 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#F47B20]/40"
            />
          )}
          {inputType === 'email' && (
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              type="email"
              className="w-full px-3 py-2.5 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#F47B20]/40"
            />
          )}
          {inputType === 'wifi' && (
            <div className="space-y-2">
              <input
                value={wifiSSID}
                onChange={(e) => setWifiSSID(e.target.value)}
                placeholder="Network name (SSID)"
                className="w-full px-3 py-2.5 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#F47B20]/40"
              />
              <input
                value={wifiPassword}
                onChange={(e) => setWifiPassword(e.target.value)}
                placeholder="Password"
                type="password"
                className="w-full px-3 py-2.5 text-sm bg-dark-surface border border-white/[0.1] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#F47B20]/40"
              />
              <div className="flex gap-2">
                {(['WPA', 'WEP', 'nopass'] as const).map((enc) => (
                  <button
                    key={enc}
                    onClick={() => setWifiEncryption(enc)}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      wifiEncryption === enc
                        ? 'bg-[#F47B20] text-white'
                        : 'bg-white/[0.06] text-white/50 hover:text-white'
                    }`}
                  >
                    {enc === 'nopass' ? 'None' : enc}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <Slider
          label="Size"
          value={size}
          min={100}
          max={600}
          step={50}
          suffix="px"
          onChange={(e) => setSize(Number((e.target as HTMLInputElement).value))}
        />

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-white/70">Error Correction</span>
          <div className="flex gap-1.5">
            {errorCorrectionLevels.map((level) => (
              <button
                key={level.id}
                onClick={() => setErrorCorrection(level.id as 'L' | 'M' | 'Q' | 'H')}
                className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                  errorCorrection === level.id
                    ? 'bg-[#F47B20] text-white'
                    : 'bg-white/[0.06] text-white/50 hover:text-white'
                }`}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>

        <ColorPicker
          label="Foreground Color"
          value={fgColor}
          onChange={setFgColor}
          presets={['#FFFFFF', '#000000', '#F47B20', '#0077B6', '#22C55E', '#EF4444']}
        />
        <ColorPicker
          label="Background Color"
          value={bgColor}
          onChange={setBgColor}
          presets={['#00171F', '#003459', '#0A0A0F', '#FFFFFF', '#000000', '#12121A']}
        />

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleDownloadPNG}
            icon={<Download size={14} />}
            disabled={!qrData.trim()}
          >
            Download PNG
          </Button>
          <Button
            variant="secondary"
            onClick={handleCopyToClipboard}
            icon={<Copy size={14} />}
            disabled={!qrData.trim()}
          >
            Copy
          </Button>
        </div>
      </div>

      {/* Right panel - Preview */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          {qrData.trim() ? (
            <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <canvas ref={canvasRef} />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 text-white/30">
              <QrCode size={64} strokeWidth={1} />
              <p className="text-sm">Enter content to generate a QR code</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
