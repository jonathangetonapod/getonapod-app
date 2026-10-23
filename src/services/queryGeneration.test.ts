import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePodcastQueries, isProfileTooThin, type QueryGenerationError } from '@/services/queryGeneration'

const getSession = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: () => getSession() } } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

describe('generatePodcastQueries', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for the scoped client and returns its queries', async () => {
    const fetchMock = respond(200, { status: 'ok', queries: ['"B2B sales"', '"founder * stories"'] })
    vi.stubGlobal('fetch', fetchMock)

    await expect(generatePodcastQueries({ workspaceId, clientId })).resolves.toEqual(['"B2B sales"', '"founder * stories"'])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://test.supabase.co/functions/v1/generate-podcast-queries')
    expect(JSON.parse(init.body)).toEqual({ workspaceId, clientId })
    expect(init.headers.Authorization).toBe('Bearer token')
  })

  // The finder branches on this to link the client record instead of a toast.
  it('reports a thin profile as profile_too_thin with its reason, uncharged', async () => {
    vi.stubGlobal('fetch', respond(422, {
      status: 'profile_too_thin',
      code: 'PROFILE_TOO_THIN',
      error: 'Not enough profile to draft a strategy. Add a bio, topics or talking points to the client, then try again.',
      reason: 'The profile has 3 topic words; a strategy needs at least 15.',
      credits_charged: 0,
      credits_refunded: 0,
    }))

    const error = await generatePodcastQueries({ workspaceId, clientId }).catch((caught) => caught) as QueryGenerationError
    expect(isProfileTooThin(error)).toBe(true)
    expect(error.message).toBe('Not enough profile to draft a strategy. Add a bio, topics or talking points to the client, then try again.')
    expect(error.reason).toBe('The profile has 3 topic words; a strategy needs at least 15.')
    expect(error.creditsCharged).toBe(0)
  })

  it('passes a provider failure through with its code and refund, unprefixed', async () => {
    vi.stubGlobal('fetch', respond(502, {
      status: 'failed',
      code: 'AI_PROVIDER_REJECTED',
      error: 'The AI service rejected the request. Try again later, or contact support if it keeps happening.',
      credits_charged: 1,
      credits_refunded: 1,
    }))

    const error = await generatePodcastQueries({ workspaceId, clientId }).catch((caught) => caught) as QueryGenerationError
    expect(isProfileTooThin(error)).toBe(false)
    expect(error.code).toBe('AI_PROVIDER_REJECTED')
    expect(error.generationStatus).toBe('failed')
    expect(error.message).toBe('The AI service rejected the request. Try again later, or contact support if it keeps happening.')
    expect(error.creditsCharged).toBe(1)
    expect(error.creditsRefunded).toBe(1)
  })
})
