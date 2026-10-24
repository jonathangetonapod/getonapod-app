import { useEffect, useState } from 'react'

import { countdownLabel } from '@/lib/clipsContent'

/** Whether to hold still. Read on use, and safe with no window and no matchMedia. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)')?.matches === true

/**
 * A 72-hour clock counting down from `startedAt`, re-rendered once a second.
 * Under reduced motion it stays at its starting value: a ticking number is
 * motion too.
 */
export function useClipsCountdown(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null || prefersReducedMotion()) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  if (startedAt === null || prefersReducedMotion()) return '72:00:00'
  return countdownLabel(startedAt, now)
}
