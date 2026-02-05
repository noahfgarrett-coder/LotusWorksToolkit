/**
 * Load an image file into an HTMLImageElement.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Resize an image on a canvas and return the canvas.
 */
export function resizeImage(
  img: HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

/**
 * Convert a canvas to a Blob of the specified type.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = 'image/png',
  quality: number = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Canvas toBlob failed'))
      },
      type,
      quality,
    )
  })
}

/**
 * Remove a background color from an image by setting matching pixels to transparent.
 * Uses Euclidean distance in RGB space with a tolerance threshold.
 */
export function removeBackgroundColor(
  canvas: HTMLCanvasElement,
  targetColor: { r: number; g: number; b: number },
  tolerance: number,
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  const maxDist = tolerance * 4.41 // normalize 0-100 to 0-441 (max RGB distance)

  for (let i = 0; i < data.length; i += 4) {
    const dr = data[i] - targetColor.r
    const dg = data[i + 1] - targetColor.g
    const db = data[i + 2] - targetColor.b
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)

    if (dist <= maxDist) {
      data[i + 3] = 0 // set alpha to 0
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/**
 * Get the color at a specific pixel from a canvas.
 */
export function getPixelColor(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): { r: number; g: number; b: number } {
  const ctx = canvas.getContext('2d')!
  const pixel = ctx.getImageData(x, y, 1, 1).data
  return { r: pixel[0], g: pixel[1], b: pixel[2] }
}
