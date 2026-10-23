import { useEffect, useState } from 'react'

const WIDE_QUERY = '(min-width: 1280px)'

/** Null where matchMedia is missing or stubbed out; treated as wide. */
function wideQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(WIDE_QUERY) ?? null
}

/**
 * How many columns the mailbox table shows: 7 at xl and up, 5 below, where
 * Sent today and Warmup fold into the row. Full-width rows (details, group
 * headers, messages) must span exactly this many. A fixed colSpan of 7 below
 * xl made the table invent two empty columns and squeezed Email to a sliver.
 */
export const useMailboxColumnCount = (): number => {
  const [wide, setWide] = useState(() => wideQuery()?.matches ?? true)
  useEffect(() => {
    const query = wideQuery()
    if (!query || typeof query.addEventListener !== 'function') return
    const onChange = () => setWide(query.matches)
    onChange()
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide ? 7 : 5
}
