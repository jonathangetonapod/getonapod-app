/**
 * The markup scripts/prerender-marketing.mjs put in #root for this page.
 *
 * Marketing pages arrive with their content already in the HTML. The app does
 * not hydrate it: createRoot renders over it. For a lazily loaded page that
 * first render is the Suspense fallback, which would swap the finished page for
 * a spinner until the chunk arrives. Instead the fallback shows this markup,
 * which is identical, so the page stays put until the real one replaces it.
 *
 * Captured once, when this module is first evaluated. That happens while
 * App.tsx is imported, before createRoot clears #root.
 */
interface PrerenderedSnapshot {
  path: string
  html: string
}

const normalizePath = (path: string) => (path.length > 1 ? path.replace(/\/+$/u, '') : path)

const capture = (): PrerenderedSnapshot | null => {
  if (typeof document === 'undefined') return null
  const root = document.getElementById('root')
  const path = root?.getAttribute('data-prerendered')
  if (!root || !path || !root.innerHTML.trim()) return null
  return { path: normalizePath(path), html: root.innerHTML }
}

let snapshot = capture()

/** The prerendered markup if it is for the page now showing, otherwise null. */
export const prerenderedMarkupFor = (pathname: string): string | null =>
  snapshot && snapshot.path === normalizePath(pathname) ? snapshot.html : null

/** Once the real page has replaced it, the snapshot must never resurface. */
export const releasePrerenderedMarkup = () => {
  snapshot = null
}

/** Test seam: re-read #root as if the page had just loaded. */
export const recapturePrerenderedMarkup = () => {
  snapshot = capture()
}
