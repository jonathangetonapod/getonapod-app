import { useEffect, useState } from 'react'

const WIDE_QUERY = '(min-width: 1280px)'
const PHONE_QUERY = '(max-width: 639px)'

/** Null where matchMedia is missing or stubbed out; treated as wide. */
function mediaQuery(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query) ?? null
}

function currentCount(): number {
  const wide = mediaQuery(WIDE_QUERY)
  if (!wide || wide.matches) return 7
  // Asked positively, so a stub that matches nothing reads as the middle tier.
  return mediaQuery(PHONE_QUERY)?.matches ? 4 : 5
}

/**
 * How many columns the mailbox table shows: 7 at xl and up, where every
 * figure has its own column; 5 below, where Sent today and Warmup fold into
 * the row; 4 on a phone, where Status folds in too. The table is fixed-layout
 * with no scroll container (its header sticks to the window), so on a phone
 * the Email column got only what the fixed columns left, which was nothing.
 * Full-width rows (details, group headers, messages) must span exactly this
 * many. A fixed colSpan of 7 below xl made the table invent two empty columns
 * and squeezed Email to a sliver.
 */
export const useMailboxColumnCount = (): number => {
  const [count, setCount] = useState(currentCount)
  useEffect(() => {
    const queries = [mediaQuery(WIDE_QUERY), mediaQuery(PHONE_QUERY)]
      .filter((query): query is MediaQueryList => Boolean(query) && typeof query.addEventListener === 'function')
    const onChange = () => setCount(currentCount())
    onChange()
    for (const query of queries) query.addEventListener('change', onChange)
    return () => {
      for (const query of queries) query.removeEventListener('change', onChange)
    }
  }, [])
  return count
}
