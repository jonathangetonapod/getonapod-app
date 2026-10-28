import { describe, expect, it } from 'vitest'
import { allowanceIsOverride, compareByAttention, workspaceAttention, type AttentionInput } from '@/lib/billingAttention'

const NOW = Date.parse('2026-10-26T12:00:00Z')
const DAY = 86_400_000
const inDays = (days: number) => new Date(NOW + days * DAY).toISOString()

const healthy: AttentionInput = {
  name: 'Healthy',
  billing_status: 'active',
  has_subscription: true,
  trial_ends_at: inDays(-30),
  balance: 200,
  monthly_credit_allowance: 100,
}

describe('workspaceAttention', () => {
  it('leaves a paying, funded workspace alone', () => {
    expect(workspaceAttention(healthy, NOW)).toEqual({ reasons: [], needsAttention: false, rank: 4 })
  })

  it('flags a trial that ends within seven days', () => {
    const row = { ...healthy, billing_status: 'trialing', has_subscription: false, trial_ends_at: inDays(5) }
    expect(workspaceAttention(row, NOW).reasons).toEqual(['trial_ending'])
    expect(workspaceAttention({ ...row, trial_ends_at: inDays(7) }, NOW).reasons).toEqual(['trial_ending'])
    expect(workspaceAttention({ ...row, trial_ends_at: inDays(8) }, NOW).needsAttention).toBe(false)
  })

  // The case that read 0 on the live page: every workspace trialing, no
  // subscription, and trials long over.
  it('flags a trial that has ended with no subscription', () => {
    const row = { ...healthy, billing_status: 'trialing', has_subscription: false, trial_ends_at: inDays(-1) }
    expect(workspaceAttention(row, NOW).reasons).toEqual(['trial_ended'])
  })

  it('ignores the trial once a subscription is live, or for a complimentary workspace', () => {
    expect(workspaceAttention({ ...healthy, billing_status: 'trialing', trial_ends_at: inDays(2) }, NOW).needsAttention).toBe(false)
    expect(workspaceAttention({ ...healthy, billing_status: 'comped', has_subscription: false }, NOW).needsAttention).toBe(false)
  })

  it('counts a cancelled subscription as no subscription', () => {
    const row = { ...healthy, billing_status: 'canceled' }
    expect(workspaceAttention(row, NOW).reasons).toEqual(['trial_ended'])
  })

  it('flags failed and past-due payments', () => {
    for (const status of ['past_due', 'unpaid', 'incomplete']) {
      expect(workspaceAttention({ ...healthy, billing_status: status }, NOW).reasons).toContain('payment_failed')
    }
  })

  it('ignores historical balances when assessing subscription health', () => {
    expect(workspaceAttention({ ...healthy, balance: 19 }, NOW).reasons).toEqual([])
    expect(workspaceAttention({ ...healthy, balance: 20 }, NOW).needsAttention).toBe(false)
    // Nothing to be a fraction of.
    expect(workspaceAttention({ ...healthy, balance: 0, monthly_credit_allowance: 0 }, NOW).needsAttention).toBe(false)
  })

  it('reports every reason, most urgent first', () => {
    const row = { ...healthy, billing_status: 'past_due', balance: 5 }
    expect(workspaceAttention(row, NOW)).toMatchObject({ reasons: ['payment_failed'], rank: 0 })
  })

  it('treats a missing trial end as no trial deadline', () => {
    const row = { ...healthy, billing_status: 'trialing', has_subscription: false, trial_ends_at: null }
    expect(workspaceAttention(row, NOW).needsAttention).toBe(false)
  })
})

describe('compareByAttention', () => {
  it('sorts most urgent first, then by workspace name', () => {
    const rows: AttentionInput[] = [
      { ...healthy, name: 'Rich and fine', balance: 900 },
      { ...healthy, name: 'Low', balance: 10 },
      { ...healthy, name: 'Poor and fine', balance: 30 },
      { ...healthy, name: 'Ending', billing_status: 'trialing', has_subscription: false, trial_ends_at: inDays(3), balance: 500 },
      { ...healthy, name: 'Ended', billing_status: 'trialing', has_subscription: false, trial_ends_at: inDays(-3), balance: 800 },
      { ...healthy, name: 'Ended, poorer', billing_status: 'trialing', has_subscription: false, trial_ends_at: inDays(-9), balance: 200 },
      { ...healthy, name: 'Card failed', billing_status: 'past_due', balance: 1000 },
    ]
    const sorted = [...rows].sort((left, right) => compareByAttention(left, right, NOW)).map((row) => row.name)
    expect(sorted).toEqual([
      'Card failed',
      'Ended',
      'Ended, poorer',
      'Ending',
      'Low',
      'Poor and fine',
      'Rich and fine',
    ])
  })

  it('falls back to name so equal rows keep a stable order', () => {
    const a = { ...healthy, name: 'Alpha' }
    const b = { ...healthy, name: 'Beta' }
    expect(compareByAttention(b, a, NOW)).toBeGreaterThan(0)
  })
})

describe('allowanceIsOverride', () => {
  it('flags an allowance that differs from the plan default', () => {
    // Get On A Pod: 150 on a 100-credit plan.
    expect(allowanceIsOverride(150, 100)).toBe(true)
    expect(allowanceIsOverride(100, 100)).toBe(false)
  })

  it('flags nothing when the plan default is unknown', () => {
    expect(allowanceIsOverride(150, null)).toBe(false)
    expect(allowanceIsOverride(150, undefined)).toBe(false)
  })
})
