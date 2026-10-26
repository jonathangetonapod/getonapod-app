import { useQuery } from '@tanstack/react-query'
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { subscriptionStatusView } from '@/lib/subscriptionStatus'
import { resolveWorkspacePrice } from '@/lib/workspacePrice'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

interface WorkspaceSubscriptionStatusProps {
  workspaceId: string
  workspaceName: string | null
}

const day = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null

/**
 * What this workspace is subscribed to, read from the platform side.
 *
 * The overview already carried the plan, the status and the renewal date; the
 * admin page showed none of it, so the only way to know whether an agency was
 * paying, trialling or cancelled was to open Stripe and search for them.
 */
export function WorkspaceSubscriptionStatus({ workspaceId, workspaceName }: WorkspaceSubscriptionStatusProps) {
  const overviewQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  })

  const billing = overviewQuery.data
  const status = String(billing?.billing_status ?? 'trialing')
  const view = subscriptionStatusView(status)
  const renews = day(billing?.current_period_end)
  // Stripe's price for this subscription, or the plan's when there is none.
  // Never the profile's base_price_cents: that is a default until the first
  // subscription event, which is how a trial showed $29 for a $49 plan.
  const price = resolveWorkspacePrice(billing ?? {})
  const customerId = billing?.stripe_customer_id ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><CreditCard className="h-5 w-5" />Subscription</CardTitle>
        <CardDescription>
          What {workspaceName || 'this workspace'} is on, and whether it is being charged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {overviewQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Reading the subscription…
          </p>
        ) : overviewQuery.error ? (
          <p className="text-sm text-destructive">
            {overviewQuery.error instanceof Error ? overviewQuery.error.message : 'The subscription could not be read.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={view.className}>{view.label}</Badge>
              {billing?.cancel_at_period_end && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">
                  Ends {renews || 'at period end'}
                </Badge>
              )}
              {billing?.has_subscription === false && (
                <Badge variant="outline" className="border-muted bg-muted/40 text-muted-foreground">
                  No Stripe subscription
                </Badge>
              )}
            </div>
            {/* A status word on its own tells an operator nothing about what
                happens next, which is the only reason they are looking. */}
            <p className="text-sm leading-6 text-muted-foreground">{view.note}</p>

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Plan</dt>
                <dd className="mt-0.5 font-medium capitalize">{String(billing?.plan_key ?? '—').replace(/_/gu, ' ')}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Price</dt>
                <dd className="mt-0.5 font-medium">{price.label}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {billing?.cancel_at_period_end ? 'Access until' : 'Renews'}
                </dt>
                <dd className="mt-0.5 font-medium">{renews || '—'}</dd>
              </div>
            </dl>

            {customerId ? (
              <Button asChild variant="outline" size="sm" className="w-fit">
                <a
                  href={`https://dashboard.stripe.com/customers/${customerId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />Open in Stripe
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                No Stripe customer yet — one is created the first time this workspace subscribes or buys credits.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
