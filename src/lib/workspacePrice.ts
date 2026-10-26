/**
 * What a workspace pays each month, and whether that is the plan's price today.
 *
 * The billing profile's base_price_cents is not this: the subscription webhook
 * copies it from the plan, so until a workspace first subscribes it is a column
 * default ($29, from an offer that was never sold), and after a repricing it
 * shows the new price while Stripe keeps the subscriber on the old one.
 */

export interface WorkspacePriceInput {
  subscription_price_cents?: number | null
  plan_base_price_cents?: number | null
}

export interface WorkspacePrice {
  cents: number | null
  /** Paying less or more than the plan costs today: a grandfathered Price. */
  legacy: boolean
  planCents: number | null
  label: string
}

export function formatMonthlyCents(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
}

export function resolveWorkspacePrice(input: WorkspacePriceInput): WorkspacePrice {
  const planCents = typeof input.plan_base_price_cents === 'number' ? input.plan_base_price_cents : null
  const subscriptionCents = typeof input.subscription_price_cents === 'number' ? input.subscription_price_cents : null
  const cents = subscriptionCents ?? planCents

  if (cents === null) return { cents: null, legacy: false, planCents, label: 'Unknown' }

  const legacy = subscriptionCents !== null && planCents !== null && subscriptionCents !== planCents
  return {
    cents,
    legacy,
    planCents,
    label: legacy
      ? `${formatMonthlyCents(cents)}/mo · Legacy price (current ${formatMonthlyCents(planCents)})`
      : `${formatMonthlyCents(cents)}/mo`,
  }
}
