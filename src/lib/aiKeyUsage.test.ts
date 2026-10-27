import { describe, expect, it } from 'vitest'
import { platformCreditsByProvider } from '@/lib/aiKeyUsage'

describe('platformCreditsByProvider', () => {
  it('adds up the credits spent on the work each key pays for', () => {
    expect(platformCreditsByProvider({
      research_run: { credits: 200 },
      query_generation: { credits: 40 },
      compatibility_scoring: { credits: 12 },
      dashboard_build: { credits: 50 },
      pitch_profile: { credits: 10 },
      semantic_search: { credits: 0 },
      // Not AI work: no key changes what these cost.
      podscan_lookup: { credits: 30 },
      email_unlock_verify: { credits: 4 },
    })).toEqual({ anthropic: 312, openai: 0 })
  })

  it('reads nothing into missing or odd figures', () => {
    expect(platformCreditsByProvider(undefined)).toEqual({ anthropic: 0, openai: 0 })
    expect(platformCreditsByProvider({ research_run: { credits: -5 }, pitch_profile: { credits: Number.NaN } }))
      .toEqual({ anthropic: 0, openai: 0 })
  })
})
