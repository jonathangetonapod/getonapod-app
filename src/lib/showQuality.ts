/*
 * Signals for whether a show is worth a client's first look. Used to order
 * the client's top matches; nothing here hides a show, because the operator
 * curated the list and a demoted show is still one click away.
 */

/** Same window the Podcast Finder defaults to ("active in the last 90 days"). */
export const ACTIVE_WINDOW_DAYS = 90

const DAY_MS = 86_400_000

export interface ShowQualityFields {
  podcast_name: string
  publisher_name?: string | null
  audience_size?: number | null
  last_posted_at?: string | null
}

/** True when the show has posted within the window; null when it has no date. */
export function isRecentlyActive(lastPostedAt: string | null | undefined, now = Date.now()): boolean | null {
  if (!lastPostedAt) return null
  const time = Date.parse(lastPostedAt)
  if (Number.isNaN(time)) return null
  return now - time <= ACTIVE_WINDOW_DAYS * DAY_MS
}

const COMPANY_SUFFIX = /[\s,]+(ltd|limited|inc|incorporated|llc|plc|gmbh|corp|corporation|co|group|holdings|s\.?a)\.?$/iu
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim()

/*
 * A company's own feed rather than a show with a host who books guests: the
 * publisher is a registered company and the show is named after it
 * ("Infosys" by "Infosys Ltd."), or the feed says it is a network roll-up
 * ("Heavybit Podcast Network Master Feed"). Deliberately narrow; a company
 * that publishes a real interview show under its own title is left alone.
 */
export function isCorporateFeed(podcast: ShowQualityFields): boolean {
  const name = normalized(podcast.podcast_name || '')
  if (/\b(master|network) feed\b/u.test(name)) return true
  const publisher = podcast.publisher_name?.trim() || ''
  if (!publisher || !COMPANY_SUFFIX.test(publisher)) return false
  const company = normalized(publisher.replace(COMPANY_SUFFIX, ''))
  return Boolean(company) && (name === company || name === `${company} podcast`)
}

/**
 * Higher is a better first look: active and independent first, then audience
 * on a log scale (so 12,000 listeners clearly beats 100, without one
 * 1.5M-listener show swamping relevance). 0 to about 9.
 */
export function showQualityScore(podcast: ShowQualityFields, now = Date.now()): number {
  const active = isRecentlyActive(podcast.last_posted_at, now)
  const activity = active === true ? 3 : active === null ? 1 : 0
  const independence = isCorporateFeed(podcast) ? 0 : 2
  const audience = Math.min(4, Math.log10(Math.max(1, podcast.audience_size || 0)) - 1)
  return activity + independence + Math.max(0, audience)
}
