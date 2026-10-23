import { describe, expect, it, vi } from 'vitest'
import {
  classifyPodscanError,
  creditsMovedBy,
  podscanFailureReason,
  PodscanSearchError,
  withPodscanRetry,
} from '@/lib/podscanRetry'

function coded(code: string | null, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`failed: ${code}`), { code, status: code ? 502 : undefined, ...extra })
}

describe('classifyPodscanError', () => {
  it('reads the index status out of the proxy code', () => {
    expect(classifyPodscanError(coded('PODSCAN_UPSTREAM_403'))).toMatchObject({ kind: 'rejected', upstreamStatus: 403 })
    expect(classifyPodscanError(coded('PODSCAN_UPSTREAM_401'))).toMatchObject({ kind: 'rejected', upstreamStatus: 401 })
    expect(classifyPodscanError(coded('PODSCAN_UPSTREAM_503'))).toMatchObject({ kind: 'unavailable', upstreamStatus: 503 })
    expect(classifyPodscanError(coded('PODSCAN_UPSTREAM_404'))).toMatchObject({ kind: 'other', upstreamStatus: 404 })
  })

  it('treats timeouts and a lost connection as transient', () => {
    expect(classifyPodscanError(coded('PODSCAN_TIMEOUT'))).toMatchObject({ kind: 'unavailable', upstreamStatus: 504 })
    expect(classifyPodscanError(new Error('Failed to fetch'))).toMatchObject({ kind: 'unavailable' })
  })

  it('stops on a missing key or an empty balance', () => {
    expect(classifyPodscanError(coded('SERVER_MISCONFIGURED'))).toMatchObject({ kind: 'rejected' })
    expect(classifyPodscanError(coded('INSUFFICIENT_CREDITS'))).toMatchObject({ kind: 'insufficient_credits' })
  })
})

describe('withPodscanRetry', () => {
  it('stops at the first refusal instead of trying again', async () => {
    const run = vi.fn().mockRejectedValue(coded('PODSCAN_UPSTREAM_403'))
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(withPodscanRetry(run, { sleep })).rejects.toBeInstanceOf(PodscanSearchError)
    expect(run).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('retries a 5xx at most twice with backoff, then fails', async () => {
    const run = vi.fn().mockRejectedValue(coded('PODSCAN_UPSTREAM_502'))
    const sleep = vi.fn().mockResolvedValue(undefined)

    const error = await withPodscanRetry(run, { sleep }).catch((caught) => caught)
    expect(error).toBeInstanceOf(PodscanSearchError)
    expect((error as PodscanSearchError).failure.kind).toBe('unavailable')
    expect(run).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000])
  })

  it('returns the result when a retry succeeds', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(coded('PODSCAN_TIMEOUT'))
      .mockResolvedValueOnce('ok')

    await expect(withPodscanRetry(run, { sleep: async () => undefined })).resolves.toBe('ok')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('honours Retry-After on a rate limit, capped so a scan cannot stall', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(coded('PODSCAN_RATE_LIMIT', { retryAfterSeconds: 60 }))
      .mockResolvedValueOnce('ok')
    const sleep = vi.fn().mockResolvedValue(undefined)

    await withPodscanRetry(run, { sleep })
    expect(sleep).toHaveBeenCalledWith(5_000)
  })

  it('does not retry once the scan is cancelled', async () => {
    const run = vi.fn().mockRejectedValue(coded('PODSCAN_UPSTREAM_502'))

    await expect(withPodscanRetry(run, { sleep: async () => undefined, isCancelled: () => true }))
      .rejects.toBeInstanceOf(PodscanSearchError)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('reports every failed attempt so each refund is counted', async () => {
    const run = vi.fn().mockRejectedValue(coded('PODSCAN_UPSTREAM_502', { creditsCharged: 1, creditsRefunded: 1 }))
    let refunded = 0

    await withPodscanRetry(run, {
      sleep: async () => undefined,
      onFailedAttempt: (error) => { refunded += creditsMovedBy(error).refunded },
    }).catch(() => undefined)
    expect(refunded).toBe(3)
  })
})

describe('podscanFailureReason', () => {
  it('says what happened in plain words, without em dashes', () => {
    const rejected = podscanFailureReason(classifyPodscanError(coded('PODSCAN_UPSTREAM_403')))
    expect(rejected).toBe('The podcast index rejected the request (error 403).')
    for (const code of ['PODSCAN_UPSTREAM_502', 'PODSCAN_TIMEOUT', 'PODSCAN_RATE_LIMIT', 'INSUFFICIENT_CREDITS', null]) {
      expect(podscanFailureReason(classifyPodscanError(coded(code)))).not.toContain('—')
    }
  })
})
