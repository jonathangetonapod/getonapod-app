/**
 * The arithmetic behind the platform's workspace list: which rows a filter
 * keeps, what the summary cards add up to, and how a trial's end reads.
 *
 * Every filter that names a problem asks the attention rule, so a row counted
 * under "Needs attention" is always one the filter shows.
 */
import { workspaceAttention } from '@/lib/billingAttention'
import type { BillingPortfolioRow } from '@/services/workspaceStaff'

export type PortfolioFilter = 'all' | 'attention' | 'trialing' | 'ending' | 'low' | 'paying'

export const PORTFOLIO_FILTERS: Array<{ value: PortfolioFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'trialing', label: 'Trialing' },
  { value: 'ending', label: 'Ending in 7 days' },
  { value: 'low', label: 'Low balance' },
  { value: 'paying', label: 'Paying' },
]

export function isPortfolioFilter(value: string | null): value is PortfolioFilter {
  return PORTFOLIO_FILTERS.some((filter) => filter.value === value)
}

const DAY_MS = 86_400_000

/** Charged by Stripe right now. Past due is still a subscription, but not paying. */
export function isPaying(row: BillingPortfolioRow): boolean {
  return row.has_subscription && row.billing_status === 'active'
}

/** On trial without a subscription that will convert it. */
export function isTrialing(row: BillingPortfolioRow): boolean {
  return row.billing_status === 'trialing' && !row.has_subscription
}

export function matchesFilter(row: BillingPortfolioRow, filter: PortfolioFilter, now: number = Date.now()): boolean {
  if (filter === 'all') return true
  if (filter === 'paying') return isPaying(row)
  if (filter === 'trialing') return isTrialing(row)
  const { reasons, needsAttention } = workspaceAttention(row, now)
  if (filter === 'attention') return needsAttention
  if (filter === 'ending') return reasons.includes('trial_ending')
  return reasons.includes('low_balance')
}

/** Workspace name or owner email, case-insensitive, anywhere in either. */
export function matchesSearch(row: BillingPortfolioRow, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return row.name.toLowerCase().includes(needle) || (row.owner_email ?? '').toLowerCase().includes(needle)
}

export interface PortfolioSummary {
  mrrCents: number
  paying: number
  trialing: number
  trialsEndingSoon: number
  creditsOutstanding: number
  creditsUsedThisMonth: number
  needsAttention: number
}

export function portfolioSummary(rows: BillingPortfolioRow[], now: number = Date.now()): PortfolioSummary {
  const summary: PortfolioSummary = {
    mrrCents: 0,
    paying: 0,
    trialing: 0,
    trialsEndingSoon: 0,
    creditsOutstanding: 0,
    creditsUsedThisMonth: 0,
    needsAttention: 0,
  }
  for (const row of rows) {
    const attention = workspaceAttention(row, now)
    if (isPaying(row)) {
      summary.paying += 1
      // Stripe's price where it answered, otherwise what the plan costs.
      summary.mrrCents += row.subscription_price_cents ?? row.plan_base_price_cents ?? 0
    }
    if (isTrialing(row)) summary.trialing += 1
    if (attention.reasons.includes('trial_ending')) summary.trialsEndingSoon += 1
    if (attention.needsAttention) summary.needsAttention += 1
    summary.creditsOutstanding += row.balance
    summary.creditsUsedThisMonth += row.credits_spent_this_month
  }
  return summary
}

export interface TrialView {
  /** Null when the trial no longer matters: subscribed or complimentary. */
  endsAt: string | null
  note: string
  ended: boolean
}

export function trialView(row: BillingPortfolioRow, now: number = Date.now()): TrialView {
  if (row.billing_status === 'comped') return { endsAt: null, note: 'Complimentary', ended: false }
  if (row.has_subscription) return { endsAt: null, note: 'Subscribed', ended: false }
  const end = row.trial_ends_at ? Date.parse(row.trial_ends_at) : Number.NaN
  if (Number.isNaN(end)) return { endsAt: null, note: 'No end date', ended: false }
  if (end <= now) {
    const days = Math.floor((now - end) / DAY_MS)
    return { endsAt: row.trial_ends_at, note: days === 0 ? 'Ended today' : `Ended ${days} ${days === 1 ? 'day' : 'days'} ago`, ended: true }
  }
  // Rounded up: a trial ending in 30 hours has two days of use left, not one.
  const days = Math.ceil((end - now) / DAY_MS)
  return { endsAt: row.trial_ends_at, note: `${days} ${days === 1 ? 'day' : 'days'} left`, ended: false }
}

/** "Today", "Yesterday", "12 days ago"; "Never" when nothing is known. */
export function lastActiveLabel(value: string | null | undefined, now: number = Date.now()): string {
  const time = value ? Date.parse(value) : Number.NaN
  if (Number.isNaN(time)) return 'Never'
  const days = Math.floor(Math.max(0, now - time) / DAY_MS)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}
