import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

/*
 * How one catalogue row reads on screen. The list row, the card and the
 * details dialog all show the same facts, so they all ask here rather than
 * each deciding what "verified" or "rating" means for itself.
 */

const DAY_MS = 24 * 60 * 60 * 1000
/** Past this, catalogue data is old enough that a booker should know. */
export const STALE_CATALOG_DAYS = 90

const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export function formatAudience(value: number | null): string | null {
  return typeof value === 'number' && value > 0 ? compactNumber.format(value) : null
}

export function categoryNames(podcast: WorkspacePodcastCatalogItem): string[] {
  if (!Array.isArray(podcast.podcast_categories)) return []
  return podcast.podcast_categories.flatMap((category) => {
    if (typeof category === 'string') return category.trim() ? [category.trim()] : []
    const name = category?.category_name
    return typeof name === 'string' && name.trim() ? [name.trim()] : []
  })
}

export type PodcastEmailState = 'verified' | 'public' | 'none'

export interface PodcastEmailStatus {
  state: PodcastEmailState
  email: string | null
  verifiedAt: string | null
}

/*
 * Three states, because the catalogue holds three. A direct contact is a paid
 * unlock somebody verified; the free address is whatever the show published,
 * unchecked. Stale or invalid direct contacts never reach this row, so they
 * fall through to the public address or to nothing.
 */
export function podcastEmailStatus(podcast: WorkspacePodcastCatalogItem): PodcastEmailStatus {
  if (podcast.direct_email) {
    return { state: 'verified', email: podcast.direct_email, verifiedAt: podcast.direct_verified_at }
  }
  if (podcast.free_podscan_email) {
    return { state: 'public', email: podcast.free_podscan_email, verifiedAt: null }
  }
  return { state: 'none', email: null, verifiedAt: null }
}

export interface PodcastRating {
  source: 'Apple' | 'Spotify'
  value: number
  label: string
}

function validRating(value: number | null): number | null {
  const rating = Number(value)
  return Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : null
}

/*
 * The rating a row shows always names where it came from. The list response
 * carries no rating counts, so "the busier platform" cannot be judged; Apple
 * is the one most shows have, and Spotify stands in when it is missing.
 */
export function podcastRating(podcast: WorkspacePodcastCatalogItem): PodcastRating | null {
  const apple = validRating(podcast.itunes_rating)
  if (apple !== null) return { source: 'Apple', value: apple, label: `Apple ${apple.toFixed(1)}` }
  const spotify = validRating(podcast.spotify_rating)
  if (spotify !== null) return { source: 'Spotify', value: spotify, label: `Spotify ${spotify.toFixed(1)}` }
  return null
}

function parsedDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "Feb 3, 2026", or null when there is no usable date. */
export function formatDay(value: string | null): string | null {
  const date = parsedDate(value)
  return date
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
    : null
}

/** "Feb 2026". */
export function formatMonth(value: string | null): string | null {
  const date = parsedDate(value)
  return date ? new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date) : null
}

/** "Today", "4 days ago", "3 wks ago", "8 mo ago", "2 yrs ago". */
export function formatRelativeAge(value: string | null, now: Date = new Date()): string | null {
  const date = parsedDate(value)
  if (!date) return null
  const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} wks ago`
  if (days < 365) return `${Math.floor(days / 30)} mo ago`
  const years = Math.floor(days / 365)
  return years === 1 ? '1 yr ago' : `${years} yrs ago`
}

export function isStaleCatalogDate(value: string | null, now: Date = new Date()): boolean {
  const date = parsedDate(value)
  return Boolean(date) && now.getTime() - date.getTime() > STALE_CATALOG_DAYS * DAY_MS
}

/*
 * There is no catalogue-wide refresh date, only one per show. The oldest on
 * the page is the honest summary: a newest-date would read fresh while most
 * of the rows on screen were months old.
 */
export function oldestCatalogUpdate(podcasts: WorkspacePodcastCatalogItem[]): string | null {
  let oldest: { value: string; time: number } | null = null
  for (const podcast of podcasts) {
    const date = parsedDate(podcast.catalog_updated_at)
    if (date && (!oldest || date.getTime() < oldest.time)) {
      oldest = { value: podcast.catalog_updated_at as string, time: date.getTime() }
    }
  }
  return oldest?.value ?? null
}

/** "Dallas Fontaine" reads as "Dallas" on a button; the toast keeps the full name. */
export function shortClientName(name: string): string {
  const first = name.trim().split(/\s+/u)[0] || name.trim()
  return first.length > 12 ? `${first.slice(0, 11)}…` : first
}

export function podcastInitials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P'
}
