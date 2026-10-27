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
 *
 * The last sections are short and can never scroll up to the header, so at
 * the foot of the page the lowest section whose top is on screen wins
 * instead; otherwise Billing could be read but never highlighted.
 */
export function useActiveSection(ids: string[], enabled: boolean) {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null)
  const holdUntilRef = useRef(0)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const idsKey = ids.join(',')

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return
    const sectionIds = idsKey.split(',')
    const visible = new Set<string>()
    const recompute = () => {
      if (Date.now() < holdUntilRef.current) return
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      const onScreen = (id: string | null) => {
        const top = id ? document.getElementById(id)?.getBoundingClientRect().top : undefined
        return top !== undefined && top >= 0 && top < window.innerHeight * 0.8
      }
      // Several sections share the screen down there; one already chosen
      // (by a click or a link) keeps the highlight while it is still in view.
      if (atBottom && onScreen(activeIdRef.current)) return
      const next = atBottom
        ? [...sectionIds].reverse().find(onScreen)
        : sectionIds.find((id) => visible.has(id))
      if (next) setActiveId(next)
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id)
        else visible.delete(entry.target.id)
      }
      recompute()
    }, { rootMargin: '-140px 0px -55% 0px' })
    for (const id of sectionIds) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    window.addEventListener('scroll', recompute, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', recompute)
    }
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
