import { useEffect, useRef, useState } from 'react'

import { prefersReducedMotion } from '@/components/clips/clipsMotion'
import { CLIPS_NUMBERS, type BigNumber } from '@/lib/clipsContent'

const DURATION_MS = 1200

/** Each tile's current display value. Before the row is seen, every count sits at its start. */
const restingValues = (final: boolean) => CLIPS_NUMBERS.map((entry) => (final ? entry.value : entry.from))

/**
 * Five big numbers that count to their value the first time the row is 30%
 * in view. `$0` counts down from 750. Under reduced motion, or without
 * IntersectionObserver, they simply show their values.
 */
export const ClipsNumbers = () => {
  const ref = useRef<HTMLElement>(null)
  const [values, setValues] = useState<number[]>(() => restingValues(false))
  const [done, setDone] = useState(false)

  useEffect(() => {
    const row = ref.current
    if (!row) return
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setValues(restingValues(true))
      setDone(true)
      return
    }
    let frame = 0
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      const startedAt = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - startedAt) / DURATION_MS)
        const eased = 1 - Math.pow(1 - t, 3)
        setValues(CLIPS_NUMBERS.map((entry) => Math.round(entry.from + (entry.value - entry.from) * eased)))
        if (t < 1) frame = requestAnimationFrame(tick)
        else setDone(true)
      }
      frame = requestAnimationFrame(tick)
    }, { threshold: 0.3 })
    observer.observe(row)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <section ref={ref} className="clips-wrap clips-numbers" aria-label="The offer in numbers">
      {CLIPS_NUMBERS.map((entry, index) => (
        <NumberTile key={entry.label} entry={entry} shown={values[index]} done={done} />
      ))}
    </section>
  )
}

const NumberTile = ({ entry, shown, done }: { entry: BigNumber; shown: number; done: boolean }) => {
  const text = `${entry.prefix ?? ''}${shown}${entry.suffix ?? ''}`
  const finalText = `${entry.prefix ?? ''}${entry.value}${entry.suffix ?? ''}`
  return (
    <div className="clips-number">
      {/* A screen reader hears the final value, not the count. */}
      <div className={`clips-number-value${entry.lime ? ' clips-number-lime' : ''}`} aria-label={finalText} aria-live="off">
        <span aria-hidden={!done}>{text}</span>
      </div>
      <div className="clips-number-label">{entry.label}</div>
    </div>
  )
}
