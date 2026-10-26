// Validation for stored Podcast Finder scans (public.workspace_finder_scans).
//
// A scan runs in the browser, so everything here arrives from the client. Each
// field is rebuilt from an allowlist with its own length cap rather than
// stored as sent: the results are shown back to every manager of the
// workspace, and a scan must not become a way to park arbitrary JSON.

import { HttpError } from './httpError.ts'

/** The finder scores at most 100 podcasts per scan. */
export const MAX_SCAN_RESULTS = 100
export const MAX_SCAN_QUERIES = 40
/** Scans kept per client; older ones are pruned when a new one is saved. */
export const SCANS_KEPT_PER_CLIENT = 25
/** Big enough for 100 trimmed results; every other action keeps the 16 KB cap. */
export const MAX_SCAN_SAVE_BYTES = 400_000

export interface StoredScanPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  last_posted_at: string | null
  language: string | null
  region: string | null
  podcast_email: string | null
  rss_feed: string | null
  podcast_categories: Array<{ category_id: string; category_name: string }>
  source: 'database' | 'podscan'
}

export interface StoredScanResult {
  podcast: StoredScanPodcast
  /** 0-100, or null when the podcast could not be scored. */
  score: number | null
  reasoning: string | null
  /** True when the score came from the keyword fallback, not the model. */
  estimated: boolean
}

export interface StoredScanFilters {
  language: string
  region: string
  activityDays: string
  guestsOnly: boolean
  minAudience: string
  maxAudience: string
  minEpisodes: string
  includeAiStrategy: boolean
  customKeywords: string[]
}

export interface StoredScanInput {
  queries: string[]
  filters: StoredScanFilters
  found_count: number
  credits_used: number
  results: StoredScanResult[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function count(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(0, Math.round(value)))
}

function httpUrl(value: unknown): string | null {
  const candidate = text(value, 2_000)
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function digits(value: unknown): string {
  return typeof value === 'string' && /^\d{0,9}$/u.test(value) ? value : ''
}

function option(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[A-Za-z0-9]{1,12}$/u.test(value) ? value : fallback
}

export function scanFilters(value: unknown): StoredScanFilters {
  const input = isRecord(value) ? value : {}
  return {
    language: option(input.language, 'en'),
    region: option(input.region, 'any'),
    activityDays: option(input.activityDays, '90'),
    guestsOnly: input.guestsOnly !== false,
    minAudience: digits(input.minAudience),
    maxAudience: digits(input.maxAudience),
    minEpisodes: digits(input.minEpisodes),
    includeAiStrategy: input.includeAiStrategy !== false,
    customKeywords: Array.isArray(input.customKeywords)
      ? input.customKeywords.map((keyword) => text(keyword, 300)).filter((keyword): keyword is string => Boolean(keyword)).slice(0, 20)
      : [],
  }
}

function scanPodcast(value: unknown): StoredScanPodcast | null {
  if (!isRecord(value)) return null
  const podcastId = text(value.podcast_id, 300)
  const podcastName = text(value.podcast_name, 500)
  if (!podcastId || !podcastName) return null
  const categories = Array.isArray(value.podcast_categories) ? value.podcast_categories : []
  const rating = typeof value.itunes_rating === 'number' && Number.isFinite(value.itunes_rating)
    ? Math.min(5, Math.max(0, value.itunes_rating))
    : null
  return {
    podcast_id: podcastId,
    podcast_name: podcastName,
    podcast_description: text(value.podcast_description, 600),
    podcast_image_url: httpUrl(value.podcast_image_url),
    podcast_url: httpUrl(value.podcast_url),
    publisher_name: text(value.publisher_name, 300),
    itunes_rating: rating,
    episode_count: count(value.episode_count, 1_000_000),
    audience_size: count(value.audience_size, 1_000_000_000),
    last_posted_at: text(value.last_posted_at, 40),
    language: text(value.language, 12),
    region: text(value.region, 12),
    podcast_email: text(value.podcast_email, 320),
    rss_feed: httpUrl(value.rss_feed),
    podcast_categories: categories.flatMap((category) => {
      if (!isRecord(category)) return []
      const id = text(category.category_id, 100)
      const name = text(category.category_name, 120)
      return id && name ? [{ category_id: id, category_name: name }] : []
    }).slice(0, 5),
    source: value.source === 'database' ? 'database' : 'podscan',
  }
}

function scanResult(value: unknown): StoredScanResult | null {
  if (!isRecord(value)) return null
  const podcast = scanPodcast(value.podcast)
  if (!podcast) return null
  return {
    podcast,
    score: value.score === null ? null : count(value.score, 100),
    reasoning: text(value.reasoning, 1_000),
    estimated: value.estimated === true,
  }
}

/** Rebuilds a scan from what the browser sent, or refuses it. */
export function scanInput(value: unknown): StoredScanInput {
  if (!isRecord(value)) throw new HttpError(400, 'INVALID_SCAN', 'The scan must be an object')
  if (!Array.isArray(value.results) || value.results.length > MAX_SCAN_RESULTS) {
    throw new HttpError(400, 'INVALID_SCAN', `A scan holds at most ${MAX_SCAN_RESULTS} results`)
  }
  if (!Array.isArray(value.queries) || value.queries.length > MAX_SCAN_QUERIES) {
    throw new HttpError(400, 'INVALID_SCAN', `A scan holds at most ${MAX_SCAN_QUERIES} queries`)
  }
  const results = value.results.map(scanResult)
  if (results.some((result) => result === null)) {
    throw new HttpError(400, 'INVALID_SCAN', 'Every scan result needs a podcast id and name')
  }
  return {
    queries: Array.from(new Set(value.queries
      .map((query) => text(query, 300))
      .filter((query): query is string => Boolean(query)))),
    filters: scanFilters(value.filters),
    found_count: count(value.found_count, 100_000) ?? 0,
    credits_used: count(value.credits_used, 1_000) ?? 0,
    results: results as StoredScanResult[],
  }
}
