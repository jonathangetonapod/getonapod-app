import { HttpError } from './httpError.ts'
import {
  isPodscanAuthError,
  isPodscanDeadlineError,
  isPodscanId,
  isRetryablePodscanError,
  PodscanRateLimitError,
  podscanFetch,
  podscanPodcastPayload,
  podscanRating,
  podscanUserError,
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

Deno.test('the daily quota error Podscan sends in production is not retried', async () => {
  const { impl, urls } = scriptedFetch([
    json({ message: 'Daily API limit exceeded. Resets in 10 hour(s).', error: 'daily_limit_exceeded', retry_after: 35560 }, 429),
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
  assertEquals(logged.some((line) => line.includes('bad token')), false)
  assertEquals(logged.some((line) => line.includes('PLATFORM_PROVIDER_ACTION_REQUIRED')), true)
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

const codeOf = (error: unknown) => error instanceof HttpError ? error.code : String(error)

Deno.test('a fetch that times out is a retryable PODSCAN_TIMEOUT', async () => {
  const timedOut = (() => Promise.reject(new DOMException('slow', 'TimeoutError'))) as typeof fetch
  const error = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: timedOut }))
  assertEquals(codeOf(error), 'PODSCAN_TIMEOUT')
  assertEquals(isRetryablePodscanError(error), true)
})

Deno.test('an oversized response is refused by its declared length and not retried', async () => {
  const { impl, urls } = scriptedFetch([() => new Response('{}', { headers: { 'content-length': '6000000' } })])
  const error = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl, retries: 2, sleep: noWait }))
  assertEquals(codeOf(error), 'PODSCAN_RESPONSE_TOO_LARGE')
  assertEquals(urls.length, 1)
})

Deno.test('an oversized body with no length is cut off while streaming, not read whole', async () => {
  let pulled = 0
  let cancelled = false
  const megabyte = new Uint8Array(1_000_000)
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1
      if (pulled > 20) controller.close()
      else controller.enqueue(megabyte)
    },
    cancel() {
      cancelled = true
    },
  })
  const impl = (() => Promise.resolve(new Response(body))) as typeof fetch
  const error = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl }))
  assertEquals(codeOf(error), 'PODSCAN_RESPONSE_TOO_LARGE')
  assertEquals(cancelled, true)
  // Stopped at the first chunk past 5 MB, nowhere near the 20 offered.
  assertEquals(pulled <= 7, true, `pulled ${pulled} chunks`)
})

Deno.test('a long Retry-After is capped at five seconds', async () => {
  const { impl } = scriptedFetch([
    json({ error: 'per_minute_limit_exceeded', retry_after: 60 }, 429, { 'Retry-After': '60' }),
    json({ ok: true }),
  ])
  const waits: number[] = []
  await podscanFetch('/podcasts/a', {
    apiKey: KEY,
    fetchImpl: impl,
    retries: 1,
    sleep: (ms) => {
      waits.push(ms)
      return Promise.resolve()
    },
  })
  assertEquals(waits, [5_000])
})

Deno.test('a failed call gives its slot back', async () => {
  const { impl } = scriptedFetch([json({}, 503), json({ ok: true })])
  await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl, maxConcurrent: 1 }))
  const result = await podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl, maxConcurrent: 1 })
  assertEquals(result.data, { ok: true })
})

Deno.test('a call queued behind busy slots leaves the queue at its deadline', async () => {
  let release: () => void = () => undefined
  const hanging = (() => new Promise<Response>((resolve) => {
    release = () => resolve(json({ ok: true })())
  })) as typeof fetch
  const busy = podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: hanging, maxConcurrent: 1 })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const { impl, urls } = scriptedFetch([json({ ok: true })])
  const started = Date.now()
  const error = await rejection(podscanFetch('/podcasts/b', {
    apiKey: KEY,
    fetchImpl: impl,
    maxConcurrent: 1,
    deadlineAt: Date.now() + 30,
  }))
  assertEquals(isPodscanDeadlineError(error), true)
  assertEquals(urls.length, 0)
  assertEquals(Date.now() - started < 1_000, true)

  // The slot it never got is still the first call's to give back.
  release()
  await busy
  const after = await podscanFetch('/podcasts/c', { apiKey: KEY, fetchImpl: scriptedFetch([json({ ok: 1 })]).impl, maxConcurrent: 1 })
  assertEquals(after.data, { ok: 1 })
})

Deno.test('an attempt cut short by the deadline reports the deadline, not a slow index', async () => {
  const waitsForAbort = ((_input: URL | Request | string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
  })) as typeof fetch
  const error = await rejection(podscanFetch('/podcasts/a', {
    apiKey: KEY,
    fetchImpl: waitsForAbort,
    retries: 2,
    sleep: noWait,
    deadlineAt: Date.now() + 40,
  }))
  assertEquals(codeOf(error), 'PODSCAN_DEADLINE_EXCEEDED')
  assertEquals(isRetryablePodscanError(error), false)
})

Deno.test('no retry is started that could not finish before the deadline', async () => {
  const { impl, urls } = scriptedFetch([json({}, 503), json({ ok: true })])
  const error = await rejection(podscanFetch('/podcasts/a', {
    apiKey: KEY,
    fetchImpl: impl,
    retries: 2,
    sleep: noWait,
    deadlineAt: Date.now() + 500,
  }))
  // The first backoff is a second, more than the half second left.
  assertEquals(codeOf(error), 'PODSCAN_UPSTREAM_503')
  assertEquals(urls.length, 1)
})

Deno.test('a deadline already past fails before any request', async () => {
  const { impl, urls } = scriptedFetch([json({ ok: true })])
  const error = await rejection(podscanFetch('/podcasts/a', { apiKey: KEY, fetchImpl: impl, deadlineAt: Date.now() - 1 }))
  assertEquals(isPodscanDeadlineError(error), true)
  assertEquals(urls.length, 0)
})

Deno.test('tenant Podscan failures are actionable while internal retry semantics stay intact', async () => {
  for (const [status, payload, code, retryable] of [
    [401, { message: KEY }, 'PLATFORM_PROVIDER_ACTION_REQUIRED', false],
    [403, { error: 'insufficient credits' }, 'PLATFORM_PROVIDER_ACTION_REQUIRED', false],
    [429, { error: 'daily_limit_exceeded' }, 'PLATFORM_PROVIDER_ACTION_REQUIRED', false],
    [429, { error: 'concurrency_limit_exceeded' }, 'PROVIDER_RATE_LIMITED', true],
    [503, { message: KEY }, 'PROVIDER_UNAVAILABLE', true],
  ] as const) {
    const error = await rejection(podscanFetch('/podcasts/test', { apiKey: KEY,
      fetchImpl: scriptedFetch([json(payload, status)]).impl }))
    assertEquals(isRetryablePodscanError(error), retryable)
    const visible = podscanUserError(error) as HttpError
    assertEquals(visible.code, code)
    assertEquals(visible.message.includes(KEY), false)
  }
  const missing = await rejection(podscanFetch('/podcasts/test', { apiKey: KEY,
    fetchImpl: scriptedFetch([json({}, 404)]).impl }))
  assertEquals(podscanUserError(missing), missing, '404 keeps its cache-miss semantics')
  const auth = new HttpError(403, 'WORKSPACE_ACCESS_DENIED', 'Access denied')
  assertEquals(podscanUserError(auth), auth, 'tenant authorization is never reclassified')
})
