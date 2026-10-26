/**
 * The arithmetic and wording behind the subscription actions on the billing
 * admin page, kept out of the dialog so it can be tested on its own.
 */
import type { SubscriptionOperation } from '@/services/workspaceStaff'

const DAY_MS = 86_400_000

export const TRIAL_EXTENSIONS = [7, 14, 30]

export const SUBSCRIPTION_ACTION_LABELS: Record<SubscriptionOperation, { title: string; confirm: string }> = {
  extend_trial: { title: 'Extend trial', confirm: 'Extend trial' },
  change_plan: { title: 'Change plan', confirm: 'Change plan' },
  make_comped: { title: 'Make complimentary', confirm: 'Make complimentary' },
  checkout_link: { title: 'Send checkout link', confirm: 'Create checkout link' },
  cancel: { title: 'Cancel subscription', confirm: 'Cancel subscription' },
}

/**
 * An extension counts from the current trial end while it is still ahead, and
 * from today once it has passed: seven more days on a trial that ended a month
 * ago would end three weeks in the past.
 */
export function extendedTrialEnd(currentEnd: string | null | undefined, days: number, now: number = Date.now()): Date {
  const current = currentEnd ? Date.parse(currentEnd) : Number.NaN
  const base = Number.isNaN(current) || current < now ? now : current
  return new Date(base + days * DAY_MS)
}

/** A date input's yyyy-mm-dd, as the end of that day in UTC. Null when not a future date. */
export function customTrialEnd(value: string, now: number = Date.now()): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null
  const end = new Date(`${value}T23:59:59Z`)
  if (Number.isNaN(end.getTime()) || end.getTime() <= now || end.getTime() > now + 366 * DAY_MS) return null
  return end
}

/** "yyyy-mm-dd" for a date input's min attribute. */
export function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export interface RenewalLine {
  label: string
  value: string
}

/**
 * The date row of the Subscription panel. It used to read "Renews: —" for a
 * workspace with no subscription, which says nothing; a trial end is what
 * comes next for that workspace, so that is what it shows.
 */
export function renewalLine(
  input: {
    has_subscription?: boolean
    cancel_at_period_end?: boolean
    current_period_end?: string | null
    trial_ends_at?: string | null
    billing_status?: string
  },
  formatDate: (value: string) => string,
  now: number = Date.now(),
): RenewalLine {
  if (input.has_subscription) {
    const end = input.current_period_end ? formatDate(input.current_period_end) : ''
    if (input.cancel_at_period_end) return { label: 'Access until', value: end || 'End of the current period' }
    return { label: 'Next renewal', value: end || 'Waiting for Stripe' }
  }
  if (input.billing_status === 'comped') return { label: 'Renews', value: 'Never charged' }
  if (!input.trial_ends_at) return { label: 'Trial ends', value: 'No end date set' }
  const ended = Date.parse(input.trial_ends_at) <= now
  return { label: ended ? 'Trial ended' : 'Trial ends', value: formatDate(input.trial_ends_at) }
}
