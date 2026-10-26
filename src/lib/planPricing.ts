/**
 * What a plan edit will do, said before it is saved. A price change only
 * reaches new subscribers, an allowance change only reaches existing ones when
 * asked, and neither was visible until after the save.
 */
import { formatMonthlyCents } from '@/lib/workspacePrice'
import type { BillingPlan } from '@/services/workspaceStaff'

export interface PlanChange {
  cents: number
  credits: number
  applyToExisting: boolean
}

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`

/** "$99" from "99", "$99.50" from "99.5"; null when it is not an amount. */
export function centsFromDollars(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/u.test(value.trim())) return null
  const cents = Math.round(Number(value) * 100)
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 1_000_000 ? cents : null
}

export function creditsFromDraft(value: string): number | null {
  if (!/^\d+$/u.test(value.trim())) return null
  const credits = Number(value)
  return Number.isSafeInteger(credits) && credits >= 0 && credits <= 1_000_000 ? credits : null
}

/** One sentence per thing that changes, in the order an admin weighs them. */
export function planChangeSummary(plan: BillingPlan, change: PlanChange): string[] {
  const lines: string[] = []
  const subscribers = plan.subscriber_count ?? 0
  const workspaces = plan.workspace_count ?? 0

  if (plan.is_purchasable) {
    if (!plan.stripe_price_id) {
      lines.push(`${plan.display_name}: creates the first Stripe price, at ${formatMonthlyCents(change.cents)}/mo.`)
    } else if (change.cents !== plan.base_price_cents) {
      const from = formatMonthlyCents(plan.base_price_cents)
      lines.push(`${plan.display_name}: ${from} → ${formatMonthlyCents(change.cents)}. New subscribers only.`)
      lines.push(subscribers === 0
        ? 'No current subscribers.'
        : `${count(subscribers, 'current subscriber stays', 'current subscribers stay')} on ${from}.`)
    }
  }

  if (change.credits !== plan.monthly_credit_allowance) {
    lines.push(`Credits each month: ${plan.monthly_credit_allowance.toLocaleString()} → ${change.credits.toLocaleString()}.`)
  }
  if (change.applyToExisting) {
    lines.push(workspaces === 0
      ? `No workspaces are on ${plan.display_name} yet.`
      : `${count(workspaces, 'workspace', 'workspaces')} on ${plan.display_name} get ${change.credits.toLocaleString()} credits from their next monthly grant, replacing any set by hand. Price is unchanged for them.`)
  } else if (change.credits !== plan.monthly_credit_allowance && workspaces > 0) {
    lines.push('Workspaces already on the plan keep their current credits until their subscription next changes.')
  }
  return lines
}

export function stripePriceUrl(priceId: string): string {
  return `https://dashboard.stripe.com/prices/${encodeURIComponent(priceId)}`
}
