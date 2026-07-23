import { describe, expect, it } from 'vitest'
import { onboardingActivityStage } from '@/lib/onboardingActivity'

describe('onboardingActivityStage', () => {
  it('reports the furthest client activity milestone', () => {
    expect(onboardingActivityStage({})).toBe('not_viewed')
    expect(onboardingActivityStage({ viewed_at: '2026-07-23T01:00:00Z' })).toBe('viewed')
    expect(onboardingActivityStage({ started_at: '2026-07-23T01:05:00Z' })).toBe('started')
    expect(onboardingActivityStage({
      viewed_at: '2026-07-23T01:00:00Z',
      started_at: '2026-07-23T01:05:00Z',
      submitted_at: '2026-07-23T01:20:00Z',
    })).toBe('completed')
  })
})
