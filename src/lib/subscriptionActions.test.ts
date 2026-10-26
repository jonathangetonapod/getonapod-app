import { describe, expect, it } from 'vitest'
import { customTrialEnd, extendedTrialEnd, renewalLine } from '@/lib/subscriptionActions'

const NOW = Date.parse('2026-10-26T12:00:00Z')
const DAY = 86_400_000
const iso = (days: number) => new Date(NOW + days * DAY).toISOString()
const day = (value: string) => value.slice(0, 10)

describe('extendedTrialEnd', () => {
  it('extends a trial that is still running from its current end', () => {
    expect(extendedTrialEnd(iso(3), 7, NOW).toISOString()).toBe(iso(10))
  })

  it('extends an ended trial from today, not from the past', () => {
    expect(extendedTrialEnd(iso(-30), 7, NOW).toISOString()).toBe(iso(7))
    expect(extendedTrialEnd(null, 14, NOW).toISOString()).toBe(iso(14))
  })
})

describe('customTrialEnd', () => {
  it('takes the end of a future day within a year', () => {
    expect(customTrialEnd('2026-11-30', NOW)?.toISOString()).toBe('2026-11-30T23:59:59.000Z')
  })

  it('refuses a past day, a day over a year out, and anything not a date', () => {
    expect(customTrialEnd('2026-10-01', NOW)).toBeNull()
    expect(customTrialEnd('2028-01-01', NOW)).toBeNull()
    expect(customTrialEnd('next week', NOW)).toBeNull()
  })
})

describe('renewalLine', () => {
  it('shows the next renewal for a subscription, or when access ends if cancelling', () => {
    expect(renewalLine({ has_subscription: true, current_period_end: iso(20) }, day, NOW))
      .toEqual({ label: 'Next renewal', value: day(iso(20)) })
    expect(renewalLine({ has_subscription: true, cancel_at_period_end: true, current_period_end: iso(20) }, day, NOW))
      .toEqual({ label: 'Access until', value: day(iso(20)) })
  })

  // "Renews: —" on its own said nothing.
  it('shows the trial end instead when there is no subscription', () => {
    expect(renewalLine({ has_subscription: false, trial_ends_at: iso(5) }, day, NOW)).toEqual({ label: 'Trial ends', value: day(iso(5)) })
    expect(renewalLine({ has_subscription: false, trial_ends_at: iso(-5) }, day, NOW)).toEqual({ label: 'Trial ended', value: day(iso(-5)) })
    expect(renewalLine({ has_subscription: false, trial_ends_at: null }, day, NOW)).toEqual({ label: 'Trial ends', value: 'No end date set' })
    expect(renewalLine({ has_subscription: false, billing_status: 'comped' }, day, NOW)).toEqual({ label: 'Renews', value: 'Never charged' })
  })

  it('never renders a bare dash', () => {
    for (const input of [{}, { has_subscription: true }, { has_subscription: true, cancel_at_period_end: true }]) {
      expect(renewalLine(input, day, NOW).value).not.toBe('—')
      expect(renewalLine(input, day, NOW).value).not.toBe('')
    }
  })
})
