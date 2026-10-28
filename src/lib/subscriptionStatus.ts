/**
 * What each billing status is called, how it is coloured, and what it means
 * happens next. Shared by the Subscription panel and the workspace header on
 * the billing admin page, so the two cannot name one status two ways.
 */

export interface SubscriptionStatusView {
  label: string
  className: string
  note: string
}

const STATUS_VIEW: Record<string, SubscriptionStatusView> = {
  suspended: { label: 'Inactive', className: 'border-amber-200 bg-amber-50 text-amber-900', note: 'Start a subscription to resume workspace operations.' },
  active: {
    label: 'Active',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    note: 'Paying, and renewing on schedule.',
  },
  trialing: {
    label: 'Trialing',
    className: 'border-sky-200 bg-sky-50 text-sky-900',
    note: 'On trial. No subscription is being charged yet.',
  },
  comped: {
    label: 'Comped',
    className: 'border-violet-200 bg-violet-50 text-violet-900',
    note: 'Workspace access is provided at no charge.',
  },
  past_due: {
    label: 'Past due',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    note: 'A payment failed. Stripe will retry, then cancel if it keeps failing.',
  },
  paused: {
    label: 'Paused',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    note: 'Collection is paused at Stripe.',
  },
  canceled: {
    label: 'Cancelled',
    className: 'border-destructive/30 bg-destructive/5 text-destructive',
    note: 'No longer subscribed. Start a plan to resume workspace operations.',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'border-destructive/30 bg-destructive/5 text-destructive',
    note: 'No longer subscribed. Start a plan to resume workspace operations.',
  },
}

export function subscriptionStatusView(status: string): SubscriptionStatusView {
  return STATUS_VIEW[status] ?? {
    label: status.replace(/_/gu, ' '),
    className: 'border-muted bg-muted/40 text-muted-foreground',
    note: 'Reported by Stripe. Nothing in the product knows this one by name.',
  }
}

const PLAN_LABELS: Record<string, string> = {
  founding_member: 'Founding member',
  standard: 'Workspace',
  comped: 'Complimentary',
}

export function planLabel(planKey: string | null | undefined): string {
  if (!planKey) return 'Founding member'
  return PLAN_LABELS[planKey] ?? planKey.replace(/_/gu, ' ')
}
