import { describe, expect, it } from 'vitest'
import { queryClient, shouldRetryQuery } from '@/lib/queryClient'

const withStatus = (status: number) => Object.assign(new Error('failed'), { status })

describe('shouldRetryQuery', () => {
  it('retries a network failure once', () => {
    expect(shouldRetryQuery(0, new Error('Failed to fetch'))).toBe(true)
    expect(shouldRetryQuery(1, new Error('Failed to fetch'))).toBe(false)
  })

  it('retries server errors, timeouts and rate limits', () => {
    for (const status of [500, 502, 503, 408, 425, 429]) {
      expect(shouldRetryQuery(0, withStatus(status))).toBe(true)
    }
  })

  it('never retries a client refusal', () => {
    for (const status of [400, 401, 402, 403, 404, 409, 422]) {
      expect(shouldRetryQuery(0, withStatus(status))).toBe(false)
    }
  })
})

describe('queryClient defaults', () => {
  it('uses the shared retry policy and never retries mutations', () => {
    const defaults = queryClient.getDefaultOptions()
    expect(defaults.queries?.retry).toBe(shouldRetryQuery)
    expect(defaults.mutations?.retry).toBe(false)
  })
})
