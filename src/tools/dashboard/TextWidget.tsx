/**
 * TextWidget — Displays text content for dashboard titles, notes, and descriptions.
 */

interface TextWidgetProps {
  content: string
  title?: string
}

export function TextWidget({ content, title }: TextWidgetProps) {
  return (
    <div className="h-full flex flex-col">
      {title && (
        <h3 className="text-xs font-medium text-dark-text-secondary mb-2">
          {title}
        </h3>
      )}
      <div className="flex-1 flex items-center">
        <p className="text-dark-text-primary whitespace-pre-wrap leading-relaxed">
          {content}
        </p>
      </div>
    </div>
  )
}
