/**
 * Trigger a browser download for a Blob or Uint8Array.
 */
export function downloadBlob(data: Blob | Uint8Array, filename: string, mimeType?: string) {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([data], { type: mimeType ?? 'application/octet-stream' })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Download a canvas element as an image file.
 */
export function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  type: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.92,
) {
  canvas.toBlob(
    (blob) => {
      if (blob) downloadBlob(blob, filename)
    },
    type,
    quality,
  )
}

/**
 * Download a string as a text file.
 */
export function downloadText(content: string, filename: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType })
  downloadBlob(blob, filename)
}
