import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

/*
 * How one catalogue row reads on screen. The list row, the card and the
 * details dialog all show the same facts, so they all ask here rather than
 * each deciding what "verified" or "rating" means for itself.
 */

const DAY_MS = 24 * 60 * 60 * 1000

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

export type PodcastEmailState = 'verified' | 'deliverable' | 'catch_all' | 'public' | 'none'

export interface PodcastEmailStatus {
  state: PodcastEmailState
  email: string | null
  verifiedAt: string | null
}

/*
 * A direct contact is a paid unlock somebody verified. The free address is
 * whatever the show published, read by its mailbox check: deliverable (the
 * mailbox accepts mail), catch-all (the domain accepts everything, so the
 * inbox cannot be confirmed), or public (unknown or not checked yet). Invalid
 * addresses never reach this row, so a show with only those has no email.
 */
export function podcastEmailStatus(podcast: WorkspacePodcastCatalogItem): PodcastEmailStatus {
  if (podcast.direct_email) {
    return { state: 'verified', email: podcast.direct_email, verifiedAt: podcast.direct_verified_at }
  }
  if (podcast.free_podscan_email) {
    const state = podcast.email_verification === 'ok'
      ? 'deliverable'
      : podcast.email_verification === 'catch_all' ? 'catch_all' : 'public'
    return { state, email: podcast.free_podscan_email, verifiedAt: null }
  }
  return { state: 'none', email: null, verifiedAt: null }
}

export interface PodcastRating {
  source: 'Apple' | 'Spotify'
  value: number
  label: string
  /** Both platforms, for a tooltip: "Apple Podcasts 4.4 · Spotify 4.9". */
  detail: string
}

function validRating(value: number | null): number | null {
  const rating = Number(value)
  return Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : null
}

/*
 * The rating a row shows always names where it came from. Apple is the
 * platform with more coverage (about nine in ten active shows against eight
 * for Spotify), so it leads; Spotify stands in only when Apple has nothing,
 * and the detail names both.
 */
export function podcastRating(podcast: WorkspacePodcastCatalogItem): PodcastRating | null {
  const apple = validRating(podcast.itunes_rating)
  const spotify = validRating(podcast.spotify_rating)
  const detail = [
    apple !== null ? `Apple Podcasts ${apple.toFixed(1)}` : 'No Apple Podcasts rating',
    spotify !== null ? `Spotify ${spotify.toFixed(1)}` : 'No Spotify rating',
  ].join(' · ')
  if (apple !== null) return { source: 'Apple', value: apple, label: `Apple ${apple.toFixed(1)}`, detail }
  if (spotify !== null) return { source: 'Spotify', value: spotify, label: `Spotify ${spotify.toFixed(1)}`, detail }
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

function displayName(type: 'language' | 'region', code: string | null): string | null {
  const value = (code || '').trim()
  if (!value) return null
  try {
    const name = new Intl.DisplayNames(['en'], { type }).of(type === 'region' ? value.toUpperCase() : value.toLowerCase())
    return name && name.toLowerCase() !== value.toLowerCase() ? name : value.toUpperCase()
  } catch {
    // An unknown or malformed code still reads as itself.
    return value.toUpperCase()
  }
}

/** "en" reads as "English"; the catalogue stores codes. */
export function languageName(code: string | null): string | null {
  return displayName('language', code)
}

/** "us" reads as "United States". */
export function regionName(code: string | null): string | null {
  return displayName('region', code)
}

/** "show@acme.fm" reads as "acme.fm" where only the domain fits. */
export function emailDomain(email: string | null): string | null {
  const at = (email || '').lastIndexOf('@')
  return at > 0 ? (email as string).slice(at + 1) : null
}

/** "Dallas Fontaine" reads as "Dallas" on a button; the toast keeps the full name. */
export function shortClientName(name: string): string {
  const first = name.trim().split(/\s+/u)[0] || name.trim()
  return first.length > 12 ? `${first.slice(0, 11)}…` : first
}

/*
 * Show artwork is full-size cover art (often 3000px, 1 to 5 MB) hotlinked from
 * the show's host, shown at 40 to 56px. A page of 24 was ~27 MB of images and
 * the avatar waited for each whole file, so most rows sat on initials. The
 * thumbnail comes from wsrv.nl, a free resizing proxy cached on Cloudflare:
 * a ~10 KB WebP at twice the display size. It also serves the few http://
 * covers, which an https page would otherwise block.
 */
const ARTWORK_PROXY = 'https://wsrv.nl/'

export function podcastArtworkThumbnail(url: string | null | undefined, displaySize: number): string | null {
  const source = (url || '').trim()
  if (!/^https?:\/\//iu.test(source)) return null
  const size = String(Math.round(displaySize * 2))
  const params = new URLSearchParams({ url: source, w: size, h: size, fit: 'cover', output: 'webp', q: '80' })
  return `${ARTWORK_PROXY}?${params.toString()}`
}

/** The original cover, when the proxy cannot serve it; only https can load on an https page. */
export function podcastArtworkOriginal(url: string | null | undefined): string | null {
  const source = (url || '').trim()
  return /^https:\/\//iu.test(source) ? source : null
}

export function podcastInitials(name: string): string {
  return name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P'
}
