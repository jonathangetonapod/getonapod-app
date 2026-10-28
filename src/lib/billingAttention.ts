/**
 * Which workspaces a platform admin needs to look at, and in what order.
 *
 * One rule for the count, the sort and the filter. They used to be three
 * separate calculations that drifted apart: the count read credit health and
 * billing status, the sort read them in a different order, and neither knew a
 * trial could end, so a platform of lapsed trials reported nothing to do.
 */

export type AttentionReason = 'payment_failed' | 'trial_ended' | 'trial_ending' | 'low_balance'

export interface AttentionInput {
  name?: string
  billing_status: string
  has_subscription: boolean
  trial_ends_at?: string | null
  balance: number
  monthly_credit_allowance: number
}

export interface Attention {
  /** Most urgent first; empty when nothing is wrong. */
  reasons: AttentionReason[]
  needsAttention: boolean
  /** 0 is most urgent. A workspace with nothing wrong ranks after every reason. */
  rank: number
}

const DAY_MS = 86_400_000
export const TRIAL_WARNING_DAYS = 7
/** Below this share of the monthly allowance a balance needs topping up. */
export const LOW_BALANCE_SHARE = 0.2

const REASON_ORDER: AttentionReason[] = ['payment_failed', 'trial_ended', 'trial_ending', 'low_balance']

export const ATTENTION_LABELS: Record<AttentionReason, string> = {
  payment_failed: 'Payment failed',
  trial_ended: 'Trial ended',
  trial_ending: 'Trial ending',
  low_balance: 'Low balance',
}

/** Stripe statuses that mean a charge was attempted and did not succeed. */
const FAILED_PAYMENT_STATUSES = ['past_due', 'unpaid', 'incomplete', 'incomplete_expired']

/**
 * A subscription that is still trying to collect counts: a failed charge is
 * its own reason, not a trial that ended. Paused and cancelled do not.
 */
function hasActiveSubscription(input: AttentionInput): boolean {
  return input.has_subscription
    && ['active', 'trialing', ...FAILED_PAYMENT_STATUSES].includes(input.billing_status)
}

export function workspaceAttention(input: AttentionInput, now: number = Date.now()): Attention {
  const found = new Set<AttentionReason>()

  if (FAILED_PAYMENT_STATUSES.includes(input.billing_status)) found.add('payment_failed')

  // A complimentary workspace was never meant to convert, and one with a live
  // subscription converts on its own; the trial only matters to the rest.
  const trialEnd = input.trial_ends_at ? Date.parse(input.trial_ends_at) : Number.NaN
  if (!Number.isNaN(trialEnd) && input.billing_status !== 'comped' && !hasActiveSubscription(input)) {
    if (trialEnd <= now) found.add('trial_ended')
    else if (trialEnd - now <= TRIAL_WARNING_DAYS * DAY_MS) found.add('trial_ending')
  }



  const reasons = REASON_ORDER.filter((reason) => found.has(reason))
  return {
    reasons,
    needsAttention: reasons.length > 0,
    rank: reasons.length > 0 ? REASON_ORDER.indexOf(reasons[0]) : REASON_ORDER.length,
  }
}

/** Most urgent first, then the smallest balance, then by name so the order is stable. */
export function compareByAttention(left: AttentionInput, right: AttentionInput, now: number = Date.now()): number {
  const rankDifference = workspaceAttention(left, now).rank - workspaceAttention(right, now).rank
  if (rankDifference !== 0) return rankDifference
  return (left.name ?? '').localeCompare(right.name ?? '')
}

/**
 * Whether a workspace's allowance was set by hand rather than taken from its
 * plan. Unknown when the plan's allowance is, so nothing is flagged on a guess.
 */
export function allowanceIsOverride(allowance: number, planAllowance: number | null | undefined): boolean {
  return typeof planAllowance === 'number' && allowance !== planAllowance
}
