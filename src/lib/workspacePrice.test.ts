import { describe, expect, it } from 'vitest'
import { resolveWorkspacePrice } from '@/lib/workspacePrice'

describe('resolveWorkspacePrice', () => {
  // Sam Bylett: trialing, no subscription, profile column still at its $29
  // default. The plan costs $49 and that is what checkout charges.
  it('shows the plan price when there is no subscription', () => {
    expect(resolveWorkspacePrice({ subscription_price_cents: null, plan_base_price_cents: 4900 })).toEqual({
      cents: 4900, legacy: false, planCents: 4900, label: '$49/mo',
    })
  })

  it('shows what Stripe charges when there is a subscription', () => {
    expect(resolveWorkspacePrice({ subscription_price_cents: 4900, plan_base_price_cents: 4900 }).label).toBe('$49/mo')
  })

  it('labels a grandfathered price against the current one', () => {
    const price = resolveWorkspacePrice({ subscription_price_cents: 2900, plan_base_price_cents: 4900 })
    expect(price.legacy).toBe(true)
    expect(price.label).toBe('$29/mo · Legacy price (current $49)')
  })

  it('keeps cents when a price has them', () => {
    expect(resolveWorkspacePrice({ plan_base_price_cents: 4950 }).label).toBe('$49.50/mo')
  })

  it('says it does not know rather than inventing a number', () => {
    expect(resolveWorkspacePrice({}).label).toBe('Unknown')
  })
})
