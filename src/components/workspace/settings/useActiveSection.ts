import { useCallback, useEffect, useRef, useState } from 'react'

/** Marks a hash change the menu made itself, so the page does not scroll to it a second time. */
export const SECTION_NAV_STATE = { settingsSectionNav: true } as const

/*
 * How long a clicked section stays highlighted while the page scrolls to it.
 * A smooth scroll passes every section in between, and without the hold the
 * menu flickered through each of them on the way.
 */
const CLICK_HOLD_MS = 900

/**
 * Which settings section is in view, for the section menu to highlight.
 *
 * A section counts as in view once its top passes under the sticky header and
 * until it leaves the upper part of the screen; of those in view, the first
 * in page order wins. When none is (a tall section scrolled through its
 * middle), the last one seen stays highlighted rather than none.
 */
export function useActiveSection(ids: string[], enabled: boolean) {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null)
  const holdUntilRef = useRef(0)
  const idsKey = ids.join(',')

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return
    const visible = new Set<string>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id)
        else visible.delete(entry.target.id)
      }
      if (Date.now() < holdUntilRef.current) return
      const first = idsKey.split(',').find((id) => visible.has(id))
      if (first) setActiveId(first)
    }, { rootMargin: '-140px 0px -55% 0px' })
    for (const id of idsKey.split(',')) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [enabled, idsKey])

  // The first section until the observer says otherwise, and again whenever
  // the list changes under a highlight that no longer exists.
  useEffect(() => {
    setActiveId((current) => (current && idsKey.split(',').includes(current) ? current : idsKey.split(',')[0] || null))
  }, [idsKey])

  const selectSection = useCallback((id: string) => {
    holdUntilRef.current = Date.now() + CLICK_HOLD_MS
    setActiveId(id)
  }, [])

  return { activeId, selectSection }
}
