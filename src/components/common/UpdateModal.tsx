import { useMemo } from 'react'
import { marked } from 'marked'
import { Download, ExternalLink, X } from 'lucide-react'
import { Modal } from '@/components/common/Modal.tsx'
import { Button } from '@/components/common/Button.tsx'
import type { UpdateInfo } from '@/utils/updateChecker.ts'

interface UpdateModalProps {
  open: boolean
  onClose: () => void
  info: UpdateInfo
}

export function UpdateModal({ open, onClose, info }: UpdateModalProps) {
  const renderedNotes = useMemo(() => {
    if (!info.releaseNotes) return ''
    return marked.parse(info.releaseNotes, { async: false }) as string
  }, [info.releaseNotes])

  function handleDownload() {
    if (info.downloadUrl) {
      window.open(info.downloadUrl, '_blank', 'noopener')
    }
  }

  function handleViewOnGitHub() {
    window.open(
      `https://github.com/noahfgarrett-coder/LotusWorksToolkit/releases/tag/v${info.version}`,
      '_blank',
      'noopener',
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Update Available" width="md">
      <div className="space-y-4">
        {/* Version badges */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white/10 text-white/60">
            v{__APP_VERSION__}
          </span>
          <span className="text-white/30">&rarr;</span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#F47B20]/20 text-[#F47B20]">
            v{info.version}
          </span>
        </div>

        {/* Release notes */}
        {renderedNotes && (
          <div
            className="prose prose-invert prose-sm max-h-60 overflow-y-auto rounded-lg bg-white/[0.03] border border-white/[0.06] p-4 text-sm text-white/70 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_a]:text-[#F47B20] [&_ul]:pl-4 [&_ol]:pl-4"
            dangerouslySetInnerHTML={{ __html: renderedNotes }}
          />
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={14} />}>
            Skip this version
          </Button>
          {info.downloadUrl ? (
            <Button variant="primary" size="sm" onClick={handleDownload} icon={<Download size={14} />}>
              Download
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={handleViewOnGitHub} icon={<ExternalLink size={14} />}>
              View on GitHub
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
