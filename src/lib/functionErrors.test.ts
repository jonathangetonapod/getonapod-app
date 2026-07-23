import { describe, expect, it } from 'vitest'
import { toFunctionError } from '@/lib/functionErrors'

describe('toFunctionError', () => {
  it('preserves rate-limit response details for retry handling', async () => {
    const context = new Response(JSON.stringify({
      error: 'Podscan concurrency limit reached',
      code: 'PODSCAN_CONCURRENCY_LIMIT',
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '7',
        'X-Concurrency-Limit': '15',
      },
    })

    const result = await toFunctionError({ context }, 'Podscan request failed.') as Error & {
      status?: number
      retryAfterSeconds?: number
      concurrencyLimit?: number
    }

    expect(result.message).toBe('Podscan concurrency limit reached')
    expect(result.name).toBe('PODSCAN_CONCURRENCY_LIMIT')
    expect(result.status).toBe(429)
    expect(result.retryAfterSeconds).toBe(7)
    expect(result.concurrencyLimit).toBe(15)
  })

  it('does not mistake missing numeric headers for zero-valued limits', async () => {
    const context = new Response(JSON.stringify({ error: 'Upstream unavailable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await toFunctionError({ context }, 'Request failed.') as Error & {
      retryAfterSeconds?: number
      concurrencyLimit?: number
    }

    expect(result.retryAfterSeconds).toBeUndefined()
    expect(result.concurrencyLimit).toBeUndefined()
  })
})
