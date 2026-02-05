interface ProgressBarProps {
  value: number
  max?: number
  label?: string
  showPercent?: boolean
  className?: string
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercent = true,
  className = '',
}: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={`space-y-1.5 ${className}`}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-xs text-white/60">{label}</span>}
          {showPercent && (
            <span className="text-xs text-white/40">{Math.round(percent)}%</span>
          )}
        </div>
      )}
      <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#F47B20] rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
