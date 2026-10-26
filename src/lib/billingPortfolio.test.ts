import { describe, expect, it } from 'vitest'
import {
  lastActiveLabel,
  matchesFilter,
  matchesSearch,
  portfolioSummary,
  trialView,
} from '@/lib/billingPortfolio'
import type { BillingPortfolioRow } from '@/services/workspaceStaff'

const NOW = Date.parse('2026-10-26T12:00:00Z')
const DAY = 86_400_000
const inDays = (days: number) => new Date(NOW + days * DAY).toISOString()

const row = (overrides: Partial<BillingPortfolioRow> = {}): BillingPortfolioRow => ({
  workspace_id: 'w',
  name: 'Acme',
  billing_status: 'trialing',
  plan_key: 'founding_member',
  monthly_credit_allowance: 100,
  balance: 200,
  credits_spent_this_month: 0,
  has_subscription: false,
  cancel_at_period_end: false,
  current_period_end: null,
  trial_ends_at: inDays(30),
  owner_email: 'Owner@Acme.com',
  ...overrides,
})

describe('matchesSearch', () => {
  it('finds a workspace by name or owner email, ignoring case', () => {
    expect(matchesSearch(row(), 'acm')).toBe(true)
    expect(matchesSearch(row(), 'owner@')).toBe(true)
    expect(matchesSearch(row(), 'nobody')).toBe(false)
    expect(matchesSearch(row({ owner_email: null }), 'owner')).toBe(false)
    expect(matchesSearch(row(), '   ')).toBe(true)
  })
})

describe('matchesFilter', () => {
  it('reads every problem filter from the attention rule', () => {
    const ending = row({ trial_ends_at: inDays(2) })
    const ended = row({ trial_ends_at: inDays(-2) })
    const low = row({ balance: 5 })
    expect(matchesFilter(ending, 'ending', NOW)).toBe(true)
    expect(matchesFilter(ended, 'ending', NOW)).toBe(false)
    expect(matchesFilter(ended, 'attention', NOW)).toBe(true)
    expect(matchesFilter(low, 'low', NOW)).toBe(true)
    expect(matchesFilter(row(), 'attention', NOW)).toBe(false)
  })

  it('separates paying from trialing', () => {
    const payer = row({ billing_status: 'active', has_subscription: true })
    const pastDue = row({ billing_status: 'past_due', has_subscription: true })
    expect(matchesFilter(payer, 'paying', NOW)).toBe(true)
    expect(matchesFilter(payer, 'trialing', NOW)).toBe(false)
    expect(matchesFilter(pastDue, 'paying', NOW)).toBe(false)
    expect(matchesFilter(row(), 'trialing', NOW)).toBe(true)
  })
})

describe('portfolioSummary', () => {
  it('adds MRR from paying workspaces only, preferring Stripe to the plan', () => {
    const summary = portfolioSummary([
      row({ billing_status: 'active', has_subscription: true, subscription_price_cents: 2900, plan_base_price_cents: 4900 }),
      row({ billing_status: 'active', has_subscription: true, subscription_price_cents: null, plan_base_price_cents: 9900 }),
      row({ billing_status: 'past_due', has_subscription: true, subscription_price_cents: 4900 }),
      row({ billing_status: 'comped', plan_base_price_cents: 0 }),
    ], NOW)
    expect(summary.mrrCents).toBe(12_800)
    expect(summary.paying).toBe(2)
  })

  it('counts trials, attention and credits across every row', () => {
    const summary = portfolioSummary([
      row({ trial_ends_at: inDays(3), balance: 300, credits_spent_this_month: 7 }),
      row({ trial_ends_at: inDays(-3), balance: 100, credits_spent_this_month: 3 }),
      row({ balance: 10 }),
    ], NOW)
    expect(summary).toMatchObject({
      trialing: 3,
      trialsEndingSoon: 1,
      needsAttention: 3,
      creditsOutstanding: 410,
      creditsUsedThisMonth: 10,
    })
  })
})

describe('trialView', () => {
  it('counts the days left, rounding a part day up', () => {
    expect(trialView(row({ trial_ends_at: inDays(5) }), NOW).note).toBe('5 days left')
    expect(trialView(row({ trial_ends_at: new Date(NOW + 30 * 3_600_000).toISOString() }), NOW).note).toBe('2 days left')
    expect(trialView(row({ trial_ends_at: new Date(NOW + 3_600_000).toISOString() }), NOW).note).toBe('1 day left')
  })

  it('says how long ago an ended trial ended', () => {
    expect(trialView(row({ trial_ends_at: inDays(-64) }), NOW)).toMatchObject({ note: 'Ended 64 days ago', ended: true })
    expect(trialView(row({ trial_ends_at: new Date(NOW - 3_600_000).toISOString() }), NOW).note).toBe('Ended today')
  })

  it('stops talking about the trial once it no longer matters', () => {
    expect(trialView(row({ has_subscription: true, billing_status: 'active' }), NOW)).toEqual({ endsAt: null, note: 'Subscribed', ended: false })
    expect(trialView(row({ billing_status: 'comped' }), NOW).note).toBe('Complimentary')
    expect(trialView(row({ trial_ends_at: null }), NOW).note).toBe('No end date')
  })
})

describe('lastActiveLabel', () => {
  it('reads as days, with Never for nothing known', () => {
    expect(lastActiveLabel(new Date(NOW - 3_600_000).toISOString(), NOW)).toBe('Today')
    expect(lastActiveLabel(inDays(-1), NOW)).toBe('Yesterday')
    expect(lastActiveLabel(inDays(-12), NOW)).toBe('12 days ago')
    expect(lastActiveLabel(null, NOW)).toBe('Never')
  })
})
