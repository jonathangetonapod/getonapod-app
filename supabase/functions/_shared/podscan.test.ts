import { HttpError } from './httpError.ts'
import {
  isPodscanAuthError,
  isPodscanId,
  isRetryablePodscanError,
  PodscanRateLimitError,
  podscanFetch,
  podscanPodcastPayload,
  podscanRating,
  withoutDuplicateShows,
} from './podscan.ts'

function assertEquals(actual: unknown, expected: unknown, note = ''): void {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) throw new Error(`${note} expected ${right}, received ${left}`)
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

const KEY = 'test-podscan-key'
const noWait = () => Promise.resolve()

/** A fetch that answers from a list, recording each URL it was asked for. */
function scriptedFetch(responses: Array<() => Response>) {
  const urls: string[] = []
  const impl = ((input: URL | Request | string) => {
    urls.push(String(input))
    const next = responses.shift()
    if (!next) throw new Error('unexpected extra request')
    return Promise.resolve(next())
  }) as typeof fetch
  return { impl, urls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

Deno.test('accepts bare podcast ids only', () => {
  assertEquals(isPodscanId('pd_k42yajryg3n5p8ow'), true)
  assertEquals(isPodscanId('../podcasts/search'), false)
  assertEquals(isPodscanId('pd_1?x=1'), false)
  assertEquals(isPodscanId(''), false)
  assertEquals(isPodscanId(42), false)
})

Deno.test('unwraps a { podcast } envelope and passes a bare podcast through', () => {
  assertEquals(podscanPodcastPayload({ podcast: { podcast_id: 'a' } }), { podcast_id: 'a' })
  assertEquals(podscanPodcastPayload({ podcast_id: 'b' }), { podcast_id: 'b' })
  assertEquals(podscanPodcastPayload(null), {})
  assertEquals(podscanPodcastPayload([1]), {})
})

Deno.test('drops only the feeds Podscan marks as duplicates', () => {
  const shows = [
    { podcast_id: 'a', is_duplicate: false },
    { podcast_id: 'b', is_duplicate: true, is_duplicate_of: 'a' },
    { podcast_id: 'c' },
  ]
  assertEquals(withoutDuplicateShows(shows).map((show) => show.podcast_id), ['a', 'c'])
})

Deno.test('reads the iTunes rating as a number whichever shape it arrives in', () => {
  assertEquals(podscanRating({ reach: { itunes: { itunes_rating_average: '4.8' } } }), 4.8)
  assertEquals(podscanRating({ rating: 4.5 }), 4.5)
  assertEquals(podscanRating({ rating: '' }), null)
  assertEquals(podscanRating({}), null)
})

Deno.test('sends the key and params and returns data with rate-limit headers', async () => {
  const { impl, urls } = scriptedFetch([
    json({ podcasts: [] }, 200, { 'X-RateLimit-Limit': '1000', 'X-RateLimit-Remaining': '998' }),
  ])
  const result = await podscanFetch('/podcasts/search', {
    apiKey: KEY,
    fetchImpl: impl,
    params: new URLSearchParams({ query: 'founders' }),
  })
  assertEquals(urls, ['https://podscan.fm/api/v1/podcasts/search?query=founders'])
  assertEquals(result.data, { podcasts: [] })
  assertEquals(result.rateLimit.limit, 1000)
  assertEquals(result.rateLimit.remaining, 998)
})

Deno.test('a missing key fails as not configured, which counts as refused', async () => {
  const error = await rejection(podscanFetch('/podcasts/x', { apiKey: null }))
  assertEquals(error instanceof HttpError && error.code, 'PODSCAN_NOT_CONFIGURED')
  assertEquals(isPodscanAuthError(error), true)
  assertEquals(isRetryablePodscanError(error), false)
})

Deno.test('a 403 is refused, not retried, even with retries allowed', async () => {
  const { impl, urls } = scriptedFetch([json({ error: 'plan does not include API' }, 403)])
  const error = await rejection(podscanFetch('/podcasts/x', { apiKey: KEY, fetchImpl: impl, retries: 2, sleep: noWait }))
  assertEquals(error instanceof HttpError && error.code, 'PODSCAN_UPSTREAM_403')
  assertEquals(isPodscanAuthError(error), true)
  assertEquals(urls.length, 1)
})

Deno.test('a concurrency 429 is told apart from a rate limit and retried', async () => {
  const { impl, urls } = scriptedFetch([
    json({ error: 'concurrency_limit_exceeded' }, 429, { 'Retry-After': '1', 'X-Concurrency-Limit': '5' }),
    json({ podcast: { podcast_id: 'a' } }),
  ])
  const waits: number[] = []
  const result = await podscanFetch('/podcasts/a', {
    apiKey: KEY,
    fetchImpl: impl,
    retries: 1,
    sleep: (ms) => {
      waits.push(ms)
      return Promise.resolve()
    },
  })
  assertEquals(urls.length, 2)
  assertEquals(waits, [1_000])
  assertEquals(result.data, { podcast: { podcast_id: 'a' } })

  const { impl: limited } = scriptedFetch([json({ error: 'concurrency_limit_exceeded' }, 429, { 'X-Concurrency-Limit': '5' })])
  const error = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: limited }))
  assertEquals(error instanceof PodscanRateLimitError && error.code, 'PODSCAN_CONCURRENCY_LIMIT')
  assertEquals(error instanceof PodscanRateLimitError && error.concurrencyLimit, '5')
})

Deno.test('a spent daily quota is reported as such and not retried', async () => {
  const { impl, urls } = scriptedFetch([
    json({ message: 'Daily limit reached', error: 'per_day_limit_exceeded', retry_after: 3600 }, 429, { 'Retry-After': '3600' }),
  ])
  const error = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl, retries: 2, sleep: noWait }))
  assertEquals(error instanceof PodscanRateLimitError && error.code, 'PODSCAN_DAILY_LIMIT')
  assertEquals(isRetryablePodscanError(error), false)
  assertEquals(urls.length, 1)
})

Deno.test('a per-minute 429 is retryable', async () => {
  const { impl } = scriptedFetch([json({ error: 'per_minute_limit_exceeded', retry_after: 20 }, 429)])
  const error = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl }))
  assertEquals(error instanceof PodscanRateLimitError && error.code, 'PODSCAN_RATE_LIMIT')
  assertEquals(isRetryablePodscanError(error), true)
})

Deno.test('a 5xx is retried up to the limit, then thrown', async () => {
  const { impl, urls } = scriptedFetch([json({}, 503), json({}, 503), json({}, 503)])
  const error = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl, retries: 2, sleep: noWait }))
  assertEquals(error instanceof HttpError && error.code, 'PODSCAN_UPSTREAM_503')
  assertEquals(urls.length, 3)
})

Deno.test('a dropped connection and a non-JSON body are retryable failures', async () => {
  const dropped = (() => Promise.reject(new TypeError('connection reset'))) as typeof fetch
  const unreachable = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: dropped }))
  assertEquals(unreachable instanceof HttpError && unreachable.code, 'PODSCAN_UNAVAILABLE')

  const { impl } = scriptedFetch([() => new Response('<html>gateway</html>', { status: 200 })])
  const invalid = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl }))
  assertEquals(invalid instanceof HttpError && invalid.code, 'PODSCAN_INVALID_RESPONSE')
  assertEquals(isRetryablePodscanError(invalid), true)
})

Deno.test('the key never reaches the error message', async () => {
  const { impl } = scriptedFetch([() => new Response(`bad token ${KEY}`, { status: 401 })])
  const originalError = console.error
  const logged: string[] = []
  console.error = (...args: unknown[]) => logged.push(args.join(' '))
  try {
    const error = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl }))
    assertEquals(error instanceof Error && error.message.includes(KEY), false)
  } finally {
    console.error = originalError
  }
  assertEquals(logged.some((line) => line.includes(KEY)), false)
  assertEquals(logged.some((line) => line.includes('[redacted]')), true)
})

Deno.test('no more than the cap are in flight at once', async () => {
  let inFlight = 0
  let peak = 0
  const releases: Array<() => void> = []
  const impl = (() => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    return new Promise<Response>((resolve) => {
      releases.push(() => {
        inFlight -= 1
        resolve(json({ ok: true })())
      })
    })
  }) as typeof fetch

  const calls = Array.from({ length: 6 }, () => podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl, maxConcurrent: 2 }))
  // Let the first two start and the rest queue.
  await new Promise((resolve) => setTimeout(resolve, 0))
  assertEquals(inFlight, 2)
  while (releases.length > 0 || inFlight > 0) {
    releases.shift()?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  await Promise.all(calls)
  assertEquals(peak, 2)
})
