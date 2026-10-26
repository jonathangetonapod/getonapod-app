import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { knownDate } from '@/lib/billingActivity'
import { packPriceLabel } from '@/lib/creditPacks'
import { resolveWorkspacePrice } from '@/lib/workspacePrice'
import type { WorkspaceBillingOverview } from '@/services/workspaceStaff'

interface BillingSummaryProps {
  overview: WorkspaceBillingOverview
  creditsSpent: number
  openingPlan: boolean
  onManagePlan: (hasSubscription: boolean) => void
}

const PLAN_LABELS: Record<string, string> = {
  founding_member: 'Founding member',
  standard: 'Standard',
  comped: 'Complimentary',
}

// A workspace in past_due or suspended used to be told nothing at all: the
// status was fetched and never rendered, so the first sign of trouble was a
// feature refusing to run.
const BILLING_STATUS: Record<string, { label: string; className: string }> = {
  trialing: { label: 'Trial', className: 'border-sky-300 bg-sky-50 text-sky-900' },
  active: { label: 'Active', className: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  past_due: { label: 'Payment overdue', className: 'border-red-300 bg-red-50 text-red-900' },
  comped: { label: 'Complimentary', className: 'border-violet-300 bg-violet-50 text-violet-900' },
  suspended: { label: 'Suspended', className: 'border-red-300 bg-red-50 text-red-900' },
  // The platform screens know all of these; a cancelled workspace used to get
  // no badge and no alert here, its only hint the button reading
  // "Choose a plan".
  paused: { label: 'Paused', className: 'border-amber-300 bg-amber-50 text-amber-900' },
  canceled: { label: 'Cancelled', className: 'border-red-300 bg-red-50 text-red-900' },
  cancelled: { label: 'Cancelled', className: 'border-red-300 bg-red-50 text-red-900' },
  unpaid: { label: 'Payment failed', className: 'border-red-300 bg-red-50 text-red-900' },
  incomplete: { label: 'Payment incomplete', className: 'border-amber-300 bg-amber-50 text-amber-900' },
}

// An unknown status is stated as itself rather than hidden: silence about a
// billing state is how trouble stays unnoticed until a feature refuses.
const billingStatusBadge = (status: string): { label: string; className: string } =>
  BILLING_STATUS[status] ?? { label: status.replace(/_/gu, ' '), className: 'border-border bg-muted text-muted-foreground' }

// Monthly credits close enough to lapsing that the page should say so out loud.
const EXPIRY_WARNING_DAYS = 7
const DAY_MS = 86_400_000

export const BillingSummary = ({ overview, creditsSpent, openingPlan, onManagePlan }: BillingSummaryProps) => {
  const status = billingStatusBadge(overview.billing_status)
  // What Stripe charges, or the plan's price before there is a subscription.
  // The profile's base_price_cents is a column default until then, which put
  // $29 on a button that opened a $49 checkout.
  const resolvedPrice = resolveWorkspacePrice(overview)
  const price = packPriceLabel(resolvedPrice.cents ?? overview.base_price_cents)
  const allowance = overview.monthly_credit_allowance ?? 0
  const spentPercent = allowance > 0 ? Math.min(100, Math.round((creditsSpent / allowance) * 100)) : 0

  // Two kinds of credit behave differently: monthly ones lapse, bought ones
  // do not. An older overview has no purchased figure, so it is derived.
  const balance = overview.balance
  const expiring = Math.min(balance, overview.expiring_credits)
  const purchased = overview.purchased_credits ?? Math.max(0, balance - expiring)
  const expiringPercent = balance > 0 ? Math.round((expiring / balance) * 100) : 0
  const nextExpiry = knownDate(overview.next_expiry_at)
  const expiringNext = overview.expiring_next_credits ?? expiring
  const daysToExpiry = overview.next_expiry_at && Number.isFinite(Date.parse(overview.next_expiry_at))
    ? Math.max(0, Math.ceil((Date.parse(overview.next_expiry_at) - Date.now()) / DAY_MS))
    : null
  const expirySoon = expiringNext > 0 && daysToExpiry !== null && daysToExpiry <= EXPIRY_WARNING_DAYS
  const nextAllowance = knownDate(overview.next_allowance_at)
  const trialEnds = overview.billing_status === 'trialing' ? knownDate(overview.trial_ends_at) : null
  const trialOver = Boolean(trialEnds) && Date.parse(overview.trial_ends_at as string) <= Date.now()

  return (
    <Card>
      <CardContent className="grid gap-6 p-6 md:grid-cols-3 md:divide-x">
        {/* The plan: what you are on, and whether it is healthy. */}
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted-foreground">Plan</p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-semibold">{PLAN_LABELS[overview.plan_key] || overview.plan_key}</p>
            <Badge variant="outline" className={status.className}>{status.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {trialEnds
              ? `${trialOver ? 'Trial ended' : 'Trial ends'} ${trialEnds}. ${trialOver ? `Start a plan at ${price}/month to keep going.` : `Then ${price}/month.`}`
              : resolvedPrice.legacy ? resolvedPrice.label : `${price}/month`}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" disabled={openingPlan} onClick={() => onManagePlan(Boolean(overview.has_subscription))}>
              {openingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {overview.has_subscription ? 'Manage plan' : `Start plan · ${price}/mo`}
            </Button>
            {/* Invoices, receipts and card details are Stripe's pages. */}
            {overview.has_subscription && (
              <Button type="button" variant="ghost" size="sm" disabled={openingPlan} onClick={() => onManagePlan(true)}>
                Invoices &amp; receipts<ExternalLink className="ml-2 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* The balance, in its two parts. */}
        <div className="min-w-0 space-y-2 md:pl-6">
          <p className="text-sm text-muted-foreground">Balance</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{balance.toLocaleString()}</p>
          <div
            className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${expiring.toLocaleString()} monthly credits and ${purchased.toLocaleString()} purchased credits`}
          >
            <div className="h-full bg-violet-600" style={{ width: `${expiringPercent}%` }} />
            <div className="h-full bg-emerald-500" style={{ width: `${balance > 0 ? 100 - expiringPercent : 0}%` }} />
          </div>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            <li>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-violet-600" aria-hidden="true" />
              {expiring.toLocaleString()} monthly{expiring > 0 && nextExpiry ? ` · expire ${nextExpiry}` : ''}
            </li>
            <li>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              {purchased.toLocaleString()} purchased · never expire
            </li>
          </ul>
        </div>

        {/* This month: what has gone, and when more arrives. */}
        <div className="min-w-0 space-y-2 md:pl-6">
          <p className="text-sm text-muted-foreground">Used this month</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {creditsSpent.toLocaleString()}
            <span className="text-base font-normal text-muted-foreground"> / {allowance.toLocaleString()}</span>
          </p>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={spentPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Monthly allowance used"
          >
            <div
              className={`h-full rounded-full ${spentPercent >= 90 ? 'bg-red-500' : spentPercent >= 70 ? 'bg-amber-500' : 'bg-violet-600'}`}
              style={{ width: `${spentPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {allowance === 0
              ? 'This plan includes no monthly credits.'
              : `Next monthly credits: ${allowance.toLocaleString()}${nextAllowance ? ` on ${nextAllowance}` : ''}`}
          </p>
        </div>
      </CardContent>

      {(expirySoon || (overview.cancel_at_period_end && overview.billing_status !== 'suspended') || overview.billing_status === 'past_due') && (
        <CardContent className="space-y-2 border-t px-6 py-4">
          {expirySoon && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {expiringNext.toLocaleString()} credits expire{' '}
                {daysToExpiry === 0 ? 'today' : `in ${daysToExpiry} ${daysToExpiry === 1 ? 'day' : 'days'}`}
                {nextExpiry ? `, on ${nextExpiry}` : ''}. Monthly credits are spent before purchased ones.
              </span>
            </p>
          )}
          {/* Cancelled from the portal, but still running. The status stays
              active through this window, so without saying so the plan looks
              like one that is staying. */}
          {overview.cancel_at_period_end && overview.billing_status !== 'suspended' && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
              This plan is set to end on {knownDate(overview.current_period_end) ?? '—'} and will not renew. Reopen
              Manage plan to keep it.
            </p>
          )}
          {overview.billing_status === 'past_due' && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
              A payment did not go through. Update your card to keep your workspace running.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
