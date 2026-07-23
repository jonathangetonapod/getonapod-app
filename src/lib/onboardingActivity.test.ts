import { describe, expect, it } from 'vitest'
import { onboardingActivityStage, onboardingStatusLabel } from '@/lib/onboardingActivity'

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

describe('onboardingStatusLabel', () => {
  it('collapses internal states into the four statuses shown in the app', () => {
    expect(onboardingStatusLabel('invited')).toBe('Active')
    expect(onboardingStatusLabel('in_progress')).toBe('Active')
    expect(onboardingStatusLabel('changes_requested')).toBe('Active')
    expect(onboardingStatusLabel('submitted')).toBe('Awaiting review')
    expect(onboardingStatusLabel('approved')).toBe('Approved')
    expect(onboardingStatusLabel('expired')).toBe('Expired')
    expect(onboardingStatusLabel('revoked')).toBe('Expired')
  })
})
