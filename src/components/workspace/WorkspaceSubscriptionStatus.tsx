import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, CreditCard, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SubscriptionActionDialog } from '@/components/workspace/SubscriptionActionDialog'
import { formatDate } from '@/lib/dates'
import { SUBSCRIPTION_ACTION_LABELS, renewalLine } from '@/lib/subscriptionActions'
import { planLabel, subscriptionStatusView } from '@/lib/subscriptionStatus'
import { resolveWorkspacePrice } from '@/lib/workspacePrice'
import {
  getWorkspaceBillingOverview,
  listBillingPlans,
  type SubscriptionOperation,
} from '@/services/workspaceStaff'

interface WorkspaceSubscriptionStatusProps {
  workspaceId: string
  workspaceName: string | null
  ownerEmail?: string | null
}

const stripeCustomerUrl = (customerId: string) => `https://dashboard.stripe.com/customers/${encodeURIComponent(customerId)}`

/**
 * What this workspace is subscribed to, and the things an admin does about it.
 *
 * It was read-only: the only way to extend a trial, move a plan or stop a
 * subscription was to open Stripe and do it there, with nothing recorded here
 * about who did it or why. Every action now asks for a reason and is audited.
 */
export function WorkspaceSubscriptionStatus({ workspaceId, workspaceName, ownerEmail = null }: WorkspaceSubscriptionStatusProps) {
  const [operation, setOperation] = useState<SubscriptionOperation | null>(null)
  // The dialog unmounts on close, which leaves Radix nothing to return focus
  // to, so a keyboard user landed on the page body. The opener takes it back.
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const closeDialog = () => {
    setOperation(null)
    requestAnimationFrame(() => openerRef.current?.focus())
  }
  const overviewQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  })
  const plansQuery = useQuery({ queryKey: ['platform-billing-plans'], queryFn: listBillingPlans, staleTime: 60_000 })

  const billing = overviewQuery.data
  const status = String(billing?.billing_status ?? 'trialing')
  const view = subscriptionStatusView(status)
  const price = resolveWorkspacePrice(billing ?? {})
  const renewal = renewalLine(billing ?? {}, formatDate)
  const customerId = billing?.stripe_customer_id ?? null
  const subscribed = billing?.has_subscription === true

  // What each action needs to make sense. A disabled button says why.
  const actions: Array<{ operation: SubscriptionOperation; disabled: string | null }> = [
    { operation: 'extend_trial', disabled: subscribed ? 'Subscribed: there is no trial to extend.' : null },
    { operation: 'change_plan', disabled: null },
    { operation: 'make_comped', disabled: status === 'comped' ? 'Already complimentary.' : null },
    { operation: 'checkout_link', disabled: subscribed ? 'Already subscribed.' : null },
    {
      operation: 'cancel',
      disabled: !subscribed ? 'No subscription to cancel.' : billing?.cancel_at_period_end ? 'Already ends at the period end.' : null,
    },
  ]

  const copyCustomerId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      toast.success('Stripe customer ID copied.')
    } catch {
      toast.error('The ID could not be copied.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><CreditCard className="h-5 w-5" aria-hidden="true" />Subscription</CardTitle>
        <CardDescription>What {workspaceName || 'this workspace'} is on, and what it is charged.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {overviewQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Reading the subscription…
          </p>
        ) : overviewQuery.error || !billing ? (
          <p className="text-sm text-destructive">
            {overviewQuery.error instanceof Error ? overviewQuery.error.message : 'The subscription could not be read.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={view.className}>{view.label}</Badge>
              {billing.cancel_at_period_end && (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-900">Ending</Badge>
              )}
              {!subscribed && (
                <Badge variant="outline" className="border-muted bg-muted/40 text-muted-foreground">No Stripe subscription</Badge>
              )}
            </div>
            {/* A status word on its own tells an operator nothing about what
                happens next, which is the only reason they are looking. */}
            <p className="text-sm leading-6 text-muted-foreground">{view.note}</p>

            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Plan</dt>
                <dd className="mt-0.5 font-medium">{planLabel(billing.plan_key)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Price</dt>
                <dd className="mt-0.5 font-medium">{price.label}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{renewal.label}</dt>
                <dd className="mt-0.5 font-medium">{renewal.value}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Card on file</dt>
                <dd className="mt-0.5 font-medium">{billing.has_saved_card ? 'Yes' : 'No'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">Stripe customer</dt>
                <dd className="mt-0.5 flex items-center gap-1">
                  {customerId ? (
                    <>
                      <code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs">{customerId}</code>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Copy Stripe customer ID" onClick={() => void copyCustomerId(customerId)}>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-muted-foreground">None yet. One is created at the first checkout.</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              {actions.map((action) => (
                <Button
                  key={action.operation}
                  type="button"
                  size="sm"
                  variant={action.operation === 'cancel' ? 'destructive' : 'outline'}
                  disabled={Boolean(action.disabled) || !plansQuery.data}
                  title={action.disabled ?? undefined}
                  onClick={(event) => {
                    openerRef.current = event.currentTarget
                    setOperation(action.operation)
                  }}
                >
                  {SUBSCRIPTION_ACTION_LABELS[action.operation].title}
                </Button>
              ))}
              {customerId ? (
                <Button asChild size="sm" variant="ghost">
                  <a href={stripeCustomerUrl(customerId)} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />Open in Stripe
                  </a>
                </Button>
              ) : (
                <Button type="button" size="sm" variant="ghost" disabled title="No Stripe customer yet.">
                  <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />Open in Stripe
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      {operation && billing && plansQuery.data && (
        <SubscriptionActionDialog
          operation={operation}
          workspaceId={workspaceId}
          workspaceName={workspaceName || 'this workspace'}
          billing={billing}
          plans={plansQuery.data}
          ownerEmail={ownerEmail}
          onClose={closeDialog}
        />
      )}
    </Card>
  )
}
