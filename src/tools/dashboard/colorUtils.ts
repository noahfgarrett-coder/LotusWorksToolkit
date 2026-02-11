/**
 * Color utilities for distributing palette colors across chart elements
 */

/**
 * Seeded shuffle using Fisher-Yates algorithm.
 * Returns a new shuffled array without modifying the original.
 */
function seededShuffle<T>(array: T[], seed: string): T[] {
  const result = [...array]

  let seedHash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    seedHash = ((seedHash << 5) - seedHash) + char
    seedHash = seedHash & seedHash
  }

  const random = () => {
    seedHash = (seedHash * 1103515245 + 12345) & 0x7fffffff
    return seedHash / 0x7fffffff
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}

/**
 * Distributes colors across elements, ensuring:
 * 1. All colors in the palette are used before any repeat
 * 2. Adjacent elements never have the same color
 *
 * Uses a seeded shuffle for consistent results across re-renders.
 */
export function distributeColors(colors: string[], count: number, seed?: string): string[] {
  if (colors.length === 0) return Array(count).fill('#cccccc') as string[]
  if (colors.length === 1) return Array(count).fill(colors[0]) as string[]
  if (count === 0) return []

  const effectiveSeed = seed ?? 'default'
  const result: string[] = []

  let shuffled = seededShuffle(colors, effectiveSeed)
  let shuffleIndex = 0
  let cycleCount = 0

  for (let i = 0; i < count; i++) {
    if (shuffleIndex >= shuffled.length) {
      cycleCount++
      shuffled = seededShuffle(colors, `${effectiveSeed}-cycle-${cycleCount}`)
      shuffleIndex = 0

      if (result.length > 0 && shuffled[0] === result[result.length - 1]) {
        shuffled.push(shuffled.shift()!)
      }
    }

    result.push(shuffled[shuffleIndex])
    shuffleIndex++
  }

  return result
}

/**
 * Creates a hash from data for consistent color distribution
 */
export function createDataHash(data: { name?: string | number }[]): string {
  return data.map(d => d.name ?? '').join('|')
}
