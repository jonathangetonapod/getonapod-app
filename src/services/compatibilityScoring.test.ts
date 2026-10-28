import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartialScoringError, scoreCompatibilityBatch } from './compatibilityScoring'

vi.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'token' } } })) },
} }))

const podcasts = ['a', 'b', 'c'].map((id) => ({ podcast_id: id, podcast_name: id }))
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('batch scoring recovery', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it.each(['PROVIDER_BILLING_REQUIRED', 'SUBSCRIPTION_REQUIRED'])('preserves %s on HTTP 402 and stops later batches', async (code) => {
    vi.mocked(fetch).mockResolvedValue(reply(402, { code, error: 'Account needs attention' }))
    const error = await scoreCompatibilityBatch('Bio', podcasts, 1).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PartialScoringError)
    expect(error).toMatchObject({ code, scored: [], failedCount: 3, message: 'Account needs attention' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('keeps completed scores when a later provider batch fails', async () => {
    const scored = [{ podcast_id: 'a', score: 8 }]
    vi.mocked(fetch).mockResolvedValueOnce(reply(200, { scores: scored }))
      .mockResolvedValue(reply(409, { code: 'PROVIDER_KEY_REJECTED', error: 'Key rejected' }))
    const error = await scoreCompatibilityBatch('Bio', podcasts, 1).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'PROVIDER_KEY_REJECTED', scored, failedCount: 2 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
