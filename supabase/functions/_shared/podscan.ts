// The one HTTP client for the Podscan API. Every edge function that reads the
// podcast index goes through podscanFetch, so they all share the same key
// lookup, timeout, size cap, rate-limit handling and per-isolate concurrency
// cap — before this, five copies disagreed on each of those.

import { HttpError } from './httpError.ts'

export const PODSCAN_API_BASE = 'https://podscan.fm/api/v1'
export const PODSCAN_TIMEOUT_MS = 20_000
const MAX_RESPONSE_BYTES = 5_000_000
// Podscan answers 429 concurrency_limit_exceeded past a per-account limit
// (5 on Trial and Essential, 10-20 above), shared by every isolate and every
// key on the account. One isolate fanning a dashboard out 15 shows wide hit
// it. Three per isolate leaves room for the others; an overflow still gets
// Retry-After: 1 and one more try.
export const PODSCAN_MAX_CONCURRENT = 3
// A Retry-After longer than this is not worth holding an edge request for.
const MAX_RETRY_WAIT_MS = 5_000
const RETRY_BASE_MS = 1_000

const PODSCAN_ID_PATTERN = /^[a-zA-Z0-9_-]+$/u

export function isPodscanId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && PODSCAN_ID_PATTERN.test(value)
}

export function podscanApiKey(): string | null {
  return (Deno.env.get('PODSCAN_API_KEY') || Deno.env.get('PODSCAN_TOKEN'))?.trim() || null
}

export interface PodscanRateLimit {
  limit?: number
  remaining?: number
  retryAfterSeconds?: number
  concurrencyLimit?: number
}

export interface PodscanFetchResult<T = unknown> {
  data: T
  rateLimit: PodscanRateLimit
}

export class PodscanRateLimitError extends HttpError {
  readonly retryAfter: string | null
  readonly concurrencyLimit: string | null

  constructor(code: string, message: string, headers: Headers) {
    super(429, code, message)
    this.retryAfter = headers.get('Retry-After')
    this.concurrencyLimit = headers.get('X-Concurrency-Limit')
  }
}

/** The upstream status of a PODSCAN_UPSTREAM_<status> error, else null. */
export function podscanUpstreamStatus(error: unknown): number | null {
  if (!(error instanceof HttpError)) return null
  const match = /^PODSCAN_UPSTREAM_(\d{3})$/u.exec(error.code)
  return match ? Number(match[1]) : null
}

/**
 * Whether trying again could help. A refused key (401/403), a missing key, a
 * 404 or a spent daily quota will fail the same way for hours; a timeout, a
 * 5xx, a per-minute or concurrency limit or a dropped connection may not.
 */
export function isRetryablePodscanError(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false
  if (error instanceof PodscanRateLimitError) return error.code !== 'PODSCAN_DAILY_LIMIT'
  if (['PODSCAN_TIMEOUT', 'PODSCAN_UNAVAILABLE', 'PODSCAN_INVALID_RESPONSE'].includes(error.code)) return true
  const status = podscanUpstreamStatus(error)
  return status !== null && status >= 500
}

/** True when Podscan refused our key or account, or no key is configured. */
export function isPodscanAuthError(error: unknown): boolean {
  if (error instanceof HttpError && error.code === 'PODSCAN_NOT_CONFIGURED') return true
  const status = podscanUpstreamStatus(error)
  return status === 401 || status === 403
}

/** The podcast fields the legacy dashboard fetchers read. All optional. */
export interface PodscanPodcast {
  podcast_name?: string
  podcast_description?: string
  podcast_image_url?: string
  thumbnail?: string
  podcast_url?: string
  publisher_name?: string
  rating?: string | number
  episode_count?: number
  audience_size?: number
  last_posted_at?: string
  podcast_categories?: Array<{ category_id: string; category_name: string }>
  reach?: {
    itunes?: { itunes_rating_average?: string }
    audience_size?: number
    email?: string
  }
}

/** The iTunes rating as a number. Podscan sends it as a string ("4.8"). */
export function podscanRating(podcast: PodscanPodcast): number | null {
  const raw = podcast.reach?.itunes?.itunes_rating_average ?? podcast.rating
  const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''))
  return Number.isFinite(value) ? value : null
}

/** Podscan's demographics payload; only episodes_analyzed is read here. */
export interface PodscanDemographics extends Record<string, unknown> {
  episodes_analyzed?: number
}

/**
 * Drops the feeds Podscan itself marks as a copy of another show
 * (is_duplicate, with is_duplicate_of naming the original), so the same show
 * cannot reach a client's list twice or enter the catalog as two rows.
 */
export function withoutDuplicateShows<T>(podcasts: T[]): T[] {
  return podcasts.filter((podcast) =>
    !(podcast && typeof podcast === 'object' && (podcast as { is_duplicate?: unknown }).is_duplicate === true)
  )
}

/** Podscan wraps a single podcast as { podcast: {...} } on some endpoints. */
export function podscanPodcastPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  const nested = record.podcast
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : record
}

function headerNumber(headers: Headers, name: string): number | undefined {
  const rawValue = headers.get(name)
  if (rawValue === null || rawValue.trim() === '') return undefined
  const value = Number(rawValue)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

function transportError(error: unknown): HttpError {
  if (error instanceof HttpError) return error
  if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new HttpError(504, 'PODSCAN_TIMEOUT', 'Podscan did not respond in time')
  }
  return new HttpError(502, 'PODSCAN_UNAVAILABLE', 'Podscan could not be reached')
}

// A plain counting semaphore: callers past the cap wait for a slot.
let active = 0
const waiting: Array<() => void> = []

async function acquireSlot(limit: number): Promise<void> {
  if (active < limit) {
    active += 1
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve))
}

function releaseSlot(): void {
  const next = waiting.shift()
  if (next) next()
  else active -= 1
}

export interface PodscanFetchOptions {
  params?: URLSearchParams
  timeoutMs?: number
  /** Extra tries for a retryable failure, with backoff. Default 0. */
  retries?: number
  /** Overrides for tests. */
  apiKey?: string | null
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  maxConcurrent?: number
}

async function fetchOnce(path: string, apiKey: string, options: PodscanFetchOptions): Promise<PodscanFetchResult> {
  const url = new URL(`${PODSCAN_API_BASE}${path}`)
  if (options.params) url.search = options.params.toString()
  const fetchImpl = options.fetchImpl ?? fetch

  // One signal covers the request and the body read, so a stalled index
  // cannot hold the request open.
  const signal = AbortSignal.timeout(options.timeoutMs ?? PODSCAN_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    throw transportError(error)
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw new HttpError(502, 'PODSCAN_RESPONSE_TOO_LARGE', 'Podscan returned an oversized response')
  }

  let raw: string
  try {
    raw = await response.text()
  } catch (error) {
    throw transportError(error)
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    throw new HttpError(502, 'PODSCAN_RESPONSE_TOO_LARGE', 'Podscan returned an oversized response')
  }

  if (!response.ok) {
    if (response.status === 429) {
      let upstreamCode = ''
      try {
        const payload = JSON.parse(raw) as { error?: unknown; code?: unknown }
        upstreamCode = typeof payload.code === 'string'
          ? payload.code
          : typeof payload.error === 'string' ? payload.error : ''
      } catch {
        // The status and headers still provide a safe retry path.
      }
      // Three kinds, told apart by `error`: concurrency_limit_exceeded,
      // per_minute_limit_exceeded and per_day_limit_exceeded. Only the last
      // is not worth retrying soon; the quota resets once a day.
      if (upstreamCode.includes('concurrency_limit_exceeded')) {
        throw new PodscanRateLimitError('PODSCAN_CONCURRENCY_LIMIT', 'Podscan concurrency limit reached', response.headers)
      }
      if (upstreamCode.includes('per_day_limit_exceeded')) {
        throw new PodscanRateLimitError('PODSCAN_DAILY_LIMIT', 'Podscan daily request limit reached', response.headers)
      }
      throw new PodscanRateLimitError('PODSCAN_RATE_LIMIT', 'Podscan rate limit reached', response.headers)
    }
    // A 403 means Podscan knew the key and refused it (a bad key is a 401), and
    // only the body says why: plan, quota or a block. Logged without the key.
    const upstreamDetail = raw
      .replaceAll(apiKey, '[redacted]')
      .replace(/\s+/gu, ' ')
      .slice(0, 200)
    // A 404 is an ordinary answer (no demographics for this show, say).
    if (response.status !== 404) {
      console.error(`[podscan] upstream ${response.status} on ${url.pathname}: ${upstreamDetail}`)
    }
    throw new HttpError(502, `PODSCAN_UPSTREAM_${response.status}`, `Podscan API error: ${response.status}`)
  }

  try {
    return {
      data: JSON.parse(raw),
      rateLimit: {
        limit: headerNumber(response.headers, 'X-RateLimit-Limit'),
        remaining: headerNumber(response.headers, 'X-RateLimit-Remaining'),
        retryAfterSeconds: headerNumber(response.headers, 'Retry-After'),
        concurrencyLimit: headerNumber(response.headers, 'X-Concurrency-Limit'),
      },
    }
  } catch {
    throw new HttpError(502, 'PODSCAN_INVALID_RESPONSE', 'Podscan returned an invalid response')
  }
}

/**
 * GET a Podscan API path (e.g. `/podcasts/search`). Throws an HttpError with a
 * PODSCAN_* code on every failure; nothing here swallows one, so a caller that
 * wants best-effort behaviour says so in its own catch.
 */
export async function podscanFetch<T = unknown>(
  path: string,
  options: PodscanFetchOptions = {},
): Promise<PodscanFetchResult<T>> {
  const apiKey = options.apiKey === undefined ? podscanApiKey() : options.apiKey
  if (!apiKey) throw new HttpError(500, 'PODSCAN_NOT_CONFIGURED', 'Podscan is not configured')
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const retries = Math.max(0, options.retries ?? 0)

  for (let attempt = 0; ; attempt += 1) {
    let failure: unknown
    await acquireSlot(options.maxConcurrent ?? PODSCAN_MAX_CONCURRENT)
    try {
      return await fetchOnce(path, apiKey, options) as PodscanFetchResult<T>
    } catch (error) {
      failure = error
    } finally {
      // Given back before any backoff, so a waiting caller can go first.
      releaseSlot()
    }
    if (attempt >= retries || !isRetryablePodscanError(failure)) throw failure
    const retryAfterMs = failure instanceof PodscanRateLimitError && failure.retryAfter
      ? (Number(failure.retryAfter) || 0) * 1_000
      : 0
    await sleep(Math.min(MAX_RETRY_WAIT_MS, Math.max(retryAfterMs, RETRY_BASE_MS * 2 ** attempt)))
  }
}
