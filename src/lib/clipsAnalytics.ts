/**
 * Events for getonapod.com/clips.
 *
 * The site runs no analytics vendor, so this is the lightweight helper the
 * brief asked for instead of a tag manager: each event is handed to whichever
 * collector is present on the window (`gtag`, `plausible`, or a `dataLayer`
 * array) and kept in a small in-page buffer so a future collector, or a person
 * with the console open, can read what happened before it arrived. Nothing is
 * sent anywhere by this module itself.
 */

export type ClipsEvent =
  | 'clips_view'
  | 'clips_cta_click'
  | 'clips_compare_drag'
  | 'clips_form_start'
  | 'clips_form_error'
  | 'clips_form_submit'
  | 'clips_book_call_click'

export type ClipsCtaLocation = 'nav' | 'hero' | 'pricing' | 'final'

export interface ClipsEventRecord {
  event: ClipsEvent
  props: Record<string, string>
  at: number
}

interface Collectors {
  gtag?: (command: 'event', name: string, params: Record<string, unknown>) => void
  plausible?: (name: string, options?: { props?: Record<string, string> }) => void
  dataLayer?: unknown[]
  __clipsEvents?: ClipsEventRecord[]
}

const BUFFER_LIMIT = 50

function collectors(): Collectors | null {
  if (typeof window === 'undefined') return null
  return window as unknown as Collectors
}

export function trackClips(event: ClipsEvent, props: Record<string, string> = {}): void {
  const target = collectors()
  if (!target) return
  const record: ClipsEventRecord = { event, props, at: Date.now() }

  const buffer = (target.__clipsEvents ??= [])
  buffer.push(record)
  if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT)

  try {
    if (typeof target.gtag === 'function') target.gtag('event', event, props)
    if (typeof target.plausible === 'function') target.plausible(event, { props })
    if (Array.isArray(target.dataLayer)) target.dataLayer.push({ event, ...props })
  } catch {
    // A collector that throws must never break the page.
  }
}

/** The attribution a lead carries: the UTM trio from the URL, plus where they came from and landed. */
export interface ClipsAttribution {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  referrer?: string
  landing_path?: string
}

const ATTRIBUTION_KEY = 'clips:attribution'

/**
 * Read attribution once per session. The UTMs are on the first URL the visitor
 * lands on; by the time they scroll to the form the hash has changed and a
 * reload may have dropped the query, so the first read is kept in
 * sessionStorage and later reads return it.
 */
export function readClipsAttribution(): ClipsAttribution {
  if (typeof window === 'undefined') return {}
  let stored: ClipsAttribution | null = null
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_KEY)
    stored = raw ? (JSON.parse(raw) as ClipsAttribution) : null
  } catch {
    stored = null
  }

  const params = new URLSearchParams(window.location.search)
  const fresh: ClipsAttribution = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
    const value = params.get(key)?.trim().slice(0, 120)
    if (value) fresh[key] = value
  }
  const referrer = document.referrer?.trim().slice(0, 500)
  if (referrer) fresh.referrer = referrer
  fresh.landing_path = `${window.location.pathname}${window.location.search}`.slice(0, 500)

  // A stored read wins unless this URL carries its own UTMs: a second campaign
  // link in the same tab is a new attribution, not a continuation.
  const merged = stored && !fresh.utm_source && !fresh.utm_medium && !fresh.utm_campaign
    ? { ...fresh, ...stored }
    : fresh
  try {
    window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(merged))
  } catch {
    // Private mode, or storage disabled: the in-memory value is still returned.
  }
  return merged
}
