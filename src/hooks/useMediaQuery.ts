import { useEffect, useState } from 'react'

/** Null where matchMedia is missing or stubbed out. */
function mediaQuery(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query) ?? null
}

/**
 * Whether a media query matches now, following it as the window changes.
 * For layouts that render one arrangement or another rather than both with
 * one hidden by CSS, which would put every control on the page twice.
 * False where matchMedia is unavailable.
 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(() => mediaQuery(query)?.matches ?? false)
  useEffect(() => {
    const list = mediaQuery(query)
    if (!list || typeof list.addEventListener !== 'function') return
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}
