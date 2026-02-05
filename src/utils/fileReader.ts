/**
 * Read a File object as a Uint8Array.
 */
export async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Read a File as a data URL (base64 encoded).
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Read a File as text.
 */
export async function readFileAsText(file: File): Promise<string> {
  return file.text()
}

/**
 * Get a human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, i)
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

/**
 * Check if a file matches expected extensions.
 */
export function hasExtension(file: File, extensions: string[]): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return extensions.includes(ext)
}
