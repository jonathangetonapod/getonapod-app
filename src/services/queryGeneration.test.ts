import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePodcastQueries, ProfileTooThinError, StrategyGenerationError } from '@/services/queryGeneration'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'token' } } })) },
  },
}))

const input = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
}

function respond(status: number, body: unknown) {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

describe('generatePodcastQueries', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the queries and sends only the scoped target', async () => {
    respond(200, { queries: ['"b2b sales" OR "revenue leadership"'] })

    await expect(generatePodcastQueries(input)).resolves.toEqual(['"b2b sales" OR "revenue leadership"'])
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(JSON.parse(String(init?.body))).toEqual(input)
  })

  it('turns a thin-profile refusal into ProfileTooThinError', async () => {
    respond(422, { status: 'profile_too_thin', code: 'PROFILE_TOO_THIN', error: 'The profile has only 3 descriptive words.' })

    const error = await generatePodcastQueries(input).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ProfileTooThinError)
    expect((error as Error).message).toBe('The profile has only 3 descriptive words.')
  })

  it('keeps the code and plain message of a failed generation', async () => {
    respond(502, { code: 'STRATEGY_PROVIDER_FAILED', error: 'The AI could not draft a search strategy. Try again in a moment.' })

    const error = await generatePodcastQueries(input).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(StrategyGenerationError)
    expect(error).toMatchObject({
      code: 'STRATEGY_PROVIDER_FAILED',
      message: 'The AI could not draft a search strategy. Try again in a moment.',
    })
  })
})
