import { describe, expect, it } from 'vitest'
import { centsFromDollars, creditsFromDraft, planChangeSummary } from '@/lib/planPricing'
import type { BillingPlan } from '@/services/workspaceStaff'

const standard: BillingPlan = {
  plan_key: 'standard',
  display_name: 'Standard',
  base_price_cents: 9900,
  monthly_credit_allowance: 300,
  stripe_price_id: 'price_x',
  is_purchasable: true,
  workspace_count: 5,
  subscriber_count: 3,
}

describe('planChangeSummary', () => {
  it('says a new price is for new subscribers only, and who stays on the old one', () => {
    expect(planChangeSummary(standard, { cents: 11_900, credits: 300, applyToExisting: false })).toEqual([
      'Standard: $99 → $119. New subscribers only.',
      '3 current subscribers stay on $99.',
    ])
  })

  it('counts one subscriber as one', () => {
    expect(planChangeSummary({ ...standard, subscriber_count: 1 }, { cents: 11_900, credits: 300, applyToExisting: false })[1])
      .toBe('1 current subscriber stays on $99.')
    expect(planChangeSummary({ ...standard, subscriber_count: 0 }, { cents: 11_900, credits: 300, applyToExisting: false })[1])
      .toBe('No current subscribers.')
  })

  it('separates an allowance change from who receives it', () => {
    expect(planChangeSummary(standard, { cents: 9900, credits: 400, applyToExisting: false })).toEqual([
      'Credits each month: 300 → 400.',
      'Workspaces already on the plan keep their current credits until their subscription next changes.',
    ])
    expect(planChangeSummary(standard, { cents: 9900, credits: 400, applyToExisting: true })[1])
      .toMatch(/^5 workspaces on Standard get 400 credits from their next monthly grant/u)
  })

  it('never mentions a price for a plan that is not sold', () => {
    const comped = { ...standard, plan_key: 'comped', display_name: 'Complimentary', is_purchasable: false, base_price_cents: 0, stripe_price_id: null }
    expect(planChangeSummary(comped, { cents: 0, credits: 150, applyToExisting: false }).join(' ')).not.toMatch(/\$/u)
  })
})

describe('draft parsing', () => {
  it('reads dollars to cents and refuses anything else', () => {
    expect(centsFromDollars('119')).toBe(11_900)
    expect(centsFromDollars('49.50')).toBe(4950)
    expect(centsFromDollars('12abc')).toBeNull()
    expect(centsFromDollars('1.234')).toBeNull()
  })

  it('reads whole credits only', () => {
    expect(creditsFromDraft('400')).toBe(400)
    expect(creditsFromDraft('4.5')).toBeNull()
    expect(creditsFromDraft('-1')).toBeNull()
  })
})
