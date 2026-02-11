import { useState, useEffect, useRef, useCallback } from 'react'

const MIN_INTERVAL_MS = 4_000
const MAX_INTERVAL_MS = 10_000
const MAX_VISIBLE = 3

interface Star {
  id: number
  x: number       // starting vw
  y: number       // starting vh
  angle: number   // degrees — direction of travel
  travel: number  // px distance along that angle
  duration: number
  length: number  // trail length px
}

let nextId = 0

export function ShootingStars() {
  const [stars, setStars] = useState<Star[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const spawn = useCallback(() => {
    const goLeft = Math.random() > 0.5

    // Start near top, biased to the side they'll travel from
    const x = goLeft ? 40 + Math.random() * 55 : 5 + Math.random() * 55
    const y = Math.random() * 40

    // Shallow angle: 5–25° below horizontal
    const tilt = 5 + Math.random() * 20
    const angle = goLeft ? 180 + tilt : -tilt  // left = 180°+tilt, right = -tilt

    const travel = 400 + Math.random() * 600   // 400–1000px
    const duration = 300 + Math.random() * 300  // 300–600ms — fast
    const length = 120 + Math.random() * 100    // 120–220px trail

    const star: Star = { id: nextId++, x, y, angle, travel, duration, length }

    setStars(prev => {
      const next = [...prev, star]
      return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next
    })

    setTimeout(() => {
      setStars(prev => prev.filter(s => s.id !== star.id))
    }, duration + 50)
  }, [])

  useEffect(() => {
    const schedule = () => {
      const delay = MIN_INTERVAL_MS + Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS)
      timerRef.current = setTimeout(() => {
        spawn()
        schedule()
      }, delay)
    }

    timerRef.current = setTimeout(() => {
      spawn()
      schedule()
    }, 2000)

    return () => { clearTimeout(timerRef.current) }
  }, [spawn])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {stars.map(s => (
        <div
          key={s.id}
          className="shooting-star"
          style={{
            left: `${s.x}vw`,
            top: `${s.y}vh`,
            '--angle': `${s.angle}deg`,
            '--travel': `${s.travel}px`,
            '--duration': `${s.duration}ms`,
            '--length': `${s.length}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
