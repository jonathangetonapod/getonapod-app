import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}))

import { describeQueryWarnings, searchAllPodcasts } from '@/services/podscan'

function page(ids: string[], lastPage = 4) {
  return {
    data: {
      data: {
        podcasts: ids.map((id) => ({ podcast_id: id, podcast_name: id, podcast_url: '' })),
        pagination: { total: String(lastPage * 50), last_page: String(lastPage) },
      },
      meta: {},
    },
    error: null,
  }
}

function proxyFailure(status: number, code: string) {
  return {
    data: null,
    error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: `Podscan API error`, code }), { status }),
    }),
  }
}

async function run(maxPages = 4) {
  const pages: number[] = []
  const promise = searchAllPodcasts({ query: 'founders' }, (_podcasts, pageNum) => {
    pages.push(pageNum)
  }, undefined, maxPages)
  const settled = promise.then((value) => ({ value }), (error: Error) => ({ error }))
  await vi.runAllTimersAsync()
  return { ...(await settled), pages }
}

describe('searchAllPodcasts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    invoke.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops on the first refused page instead of requesting every remaining one', async () => {
    invoke
      .mockResolvedValueOnce(page(['a']))
      .mockResolvedValue(proxyFailure(502, 'PODSCAN_UPSTREAM_403'))

    const result = await run()

    expect('error' in result && result.error.message)
      .toBe('Import stopped at page 2. The podcast index rejected the request (error 403).')
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(result.pages).toEqual([1])
  })

  it('retries a flaky page, then skips it and reports it as failed', async () => {
    invoke
      .mockResolvedValueOnce(page(['a']))
      .mockResolvedValueOnce(proxyFailure(504, 'PODSCAN_TIMEOUT'))
      .mockResolvedValueOnce(proxyFailure(504, 'PODSCAN_TIMEOUT'))
      .mockResolvedValueOnce(proxyFailure(504, 'PODSCAN_TIMEOUT'))
      .mockResolvedValue(page(['b']))

    const result = await run()

    expect('value' in result && result.value).toEqual({ totalFound: 200, totalPages: 4, failedPages: 1 })
    // Page 1, three tries at page 2, then pages 3 and 4.
    expect(invoke).toHaveBeenCalledTimes(6)
    expect(result.pages).toEqual([1, 3, 4])
  })

  it('sends each page through the proxy as a search action', async () => {
    invoke.mockResolvedValue(page(['a'], 2))

    await run(2)

    expect(invoke).toHaveBeenLastCalledWith('podscan-proxy', {
      body: { action: 'search', options: { query: 'founders', per_page: 50, page: 2 } },
    })
  })
})

describe('describeQueryWarnings', () => {
  it('says nothing when no search was flagged', () => {
    expect(describeQueryWarnings([])).toBeNull()
  })

  it('names one flagged search', () => {
    expect(describeQueryWarnings(['"founder stories'])).toBe(
      'The podcast index could not read one search exactly as written (“"founder stories”), so its results may be broader than intended.',
    )
  })

  it('names the first three and counts the rest', () => {
    expect(describeQueryWarnings(['a AND', 'b OR', 'c NOT', 'd AND'])).toBe(
      'The podcast index could not read 4 searches exactly as written (“a AND”, “b OR”, “c NOT” and 1 more), so their results may be broader than intended.',
    )
  })
})
