import { memo } from 'react'
import { useAppStore } from '@/stores/appStore.ts'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import type { Toast as ToastType } from '@/types/index.ts'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const styles = {
  success: 'border-emerald-500/30 bg-emerald-500/10',
  error: 'border-red-500/30 bg-red-500/10',
  info: 'border-blue-500/30 bg-blue-500/10',
  warning: 'border-amber-500/30 bg-amber-500/10',
}

const iconColors = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-blue-400',
  warning: 'text-amber-400',
}

const ToastItem = memo(function ToastItem({
  toast,
  onRemove,
}: {
  toast: ToastType
  onRemove: (id: string) => void
}) {
  const Icon = icons[toast.type]
  return (
    <div
      className={`
        flex items-start gap-3 px-4 py-3 rounded-lg border
        backdrop-blur-sm animate-slide-up
        ${styles[toast.type]}
      `}
    >
      <Icon size={18} className={`mt-0.5 flex-shrink-0 ${iconColors[toast.type]}`} />
      <p className="text-sm text-white flex-1">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-white/40 hover:text-white/70 transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  )
})

export function Toast() {
  const toasts = useAppStore((s) => s.toasts)
  const removeToast = useAppStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}
