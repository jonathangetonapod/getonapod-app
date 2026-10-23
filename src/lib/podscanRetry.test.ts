import { describe, expect, it, vi } from 'vitest'
import {
  classifyPodscanError,
  podscanFailureReason,
  scanFailureCreditLine,
  withPodscanRetry,
} from '@/lib/podscanRetry'

function edgeError(fields: Record<string, unknown>): Error {
  return Object.assign(new Error('Podscan API error'), fields)
}

const noWait = () => Promise.resolve()

describe('classifyPodscanError', () => {
  it('treats a refused key or account as final, whatever status the proxy wrapped it in', () => {
    expect(classifyPodscanError(edgeError({ code: 'PODSCAN_UPSTREAM_403', status: 502 }))).toBe('auth')
    expect(classifyPodscanError(edgeError({ code: 'PODSCAN_UPSTREAM_401', status: 502 }))).toBe('auth')
  })

  it('retries timeouts, 5xx, rate limits and dropped connections', () => {
    expect(classifyPodscanError(edgeError({ code: 'PODSCAN_TIMEOUT', status: 504 }))).toBe('retryable')
    expect(classifyPodscanError(edgeError({ code: 'PODSCAN_UPSTREAM_503', status: 502 }))).toBe('retryable')
    expect(classifyPodscanError(edgeError({ code: 'PODSCAN_RATE_LIMIT', status: 429 }))).toBe('retryable')
    expect(classifyPodscanError(new Error('Failed to fetch'))).toBe('retryable')
  })

  it('does not retry an empty credit balance or a bad request', () => {
    expect(classifyPodscanError(edgeError({ code: 'INSUFFICIENT_CREDITS', status: 402 }))).toBe('fatal')
    expect(classifyPodscanError(edgeError({ code: 'INVALID_FIELD', status: 400 }))).toBe('fatal')
  })
})

describe('podscanFailureReason', () => {
  it('names the upstream status the proxy reported', () => {
    expect(podscanFailureReason(edgeError({ code: 'PODSCAN_UPSTREAM_403', status: 502 })))
      .toBe('The podcast index rejected the request (error 403).')
    expect(podscanFailureReason(edgeError({ code: 'PODSCAN_TIMEOUT', status: 504 })))
      .toBe('The podcast index did not respond in time.')
  })
})

describe('withPodscanRetry', () => {
  it('stops on the first 403 and reports the refund for it', async () => {
    const request = vi.fn().mockRejectedValue(edgeError({ code: 'PODSCAN_UPSTREAM_403', status: 502, creditsCharged: 1, creditsRefunded: 1 }))
    const onFailedAttempt = vi.fn()

    await expect(withPodscanRetry(request, { onFailedAttempt, sleep: noWait })).rejects.toMatchObject({ code: 'PODSCAN_UPSTREAM_403' })
    expect(request).toHaveBeenCalledTimes(1)
    expect(onFailedAttempt).toHaveBeenCalledWith({ charged: 1, refunded: 1 })
  })

  it('retries a 5xx twice with growing waits, then gives up', async () => {
    const request = vi.fn().mockRejectedValue(edgeError({ code: 'PODSCAN_UPSTREAM_500', status: 502 }))
    const sleep = vi.fn((_ms: number) => Promise.resolve())

    await expect(withPodscanRetry(request, { sleep })).rejects.toMatchObject({ code: 'PODSCAN_UPSTREAM_500' })
    expect(request).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1_000, 2_000])
  })

  it('returns the result once a retry succeeds', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(edgeError({ code: 'PODSCAN_TIMEOUT', status: 504 }))
      .mockResolvedValueOnce('ok')

    await expect(withPodscanRetry(request, { sleep: noWait })).resolves.toBe('ok')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not retry once the scan has been cancelled', async () => {
    const request = vi.fn().mockRejectedValue(edgeError({ code: 'PODSCAN_TIMEOUT', status: 504 }))

    await expect(withPodscanRetry(request, { sleep: noWait, shouldContinue: () => false })).rejects.toBeTruthy()
    expect(request).toHaveBeenCalledTimes(1)
  })
})

describe('scanFailureCreditLine', () => {
  it('says nothing was charged when every charge came back', () => {
    expect(scanFailureCreditLine({ strategy: 0, successfulLookups: 0, refunded: 1, unrefunded: 0 }))
      .toBe('No credits were charged for this scan. 1 credit taken for the failed request was refunded.')
  })

  it('names what was spent and what could not be refunded', () => {
    expect(scanFailureCreditLine({ strategy: 1, successfulLookups: 2, refunded: 0, unrefunded: 1 }))
      .toBe('This scan used 3 credits: 1 for the AI search strategy and 2 for the searches that worked. The strategy is saved for your next try. 1 credit could not be refunded automatically. Contact support and we will put it back.')
  })
})
