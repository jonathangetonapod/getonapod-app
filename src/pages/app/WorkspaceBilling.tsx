import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowUpRight, Check, CreditCard, FileText, KeyRound, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { WorkspaceAiKeysCard } from '@/components/workspace/WorkspaceAiKeysCard'
import { useAuth } from '@/contexts/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { knownDate } from '@/lib/billingActivity'
import { formatMonthlyCents } from '@/lib/workspacePrice'
import { subscriptionStatusView } from '@/lib/subscriptionStatus'
import { createWorkspaceBillingPortal, createWorkspaceSubscriptionCheckout, getWorkspaceSubscriptionOverview } from '@/services/workspaceStaff'

export default function WorkspaceBilling() {
  const { canManageWorkspaceStaff, isPlatformAdmin, user, workspace, membership } = useAuth()
  const workspaceId = workspace?.id ?? ''
  const canManage = Boolean(canManageWorkspaceStaff || isPlatformAdmin)
  const [params, setParams] = useSearchParams()
  const [opening, setOpening] = useState<'plan' | 'payment' | 'invoices' | null>(null)
  const [checkingUntil, setCheckingUntil] = useState<number | null>(null)
  const [confirmationPending, setConfirmationPending] = useState(false)
  const [checkoutCancelled, setCheckoutCancelled] = useState(false)
  const overviewQuery = useQuery({
    queryKey: ['workspace-subscription-overview', workspaceId],
    queryFn: () => getWorkspaceSubscriptionOverview(workspaceId),
    enabled: Boolean(workspaceId) && canManage,
    retry: false,
    staleTime: 0,
    refetchInterval: checkingUntil ? 3_000 : false,
  })
  const billing = overviewQuery.data

  useEffect(() => {
    if (!canManage || !workspaceId) return
    if (params.get('plan') === 'updated') {
      setCheckingUntil(Date.now() + 60_000)
      setConfirmationPending(true)
      void overviewQuery.refetch()
    }
    if (params.get('plan') === 'cancelled') setCheckoutCancelled(true)
    if (params.has('plan') || params.has('checkout')) {
      const next = new URLSearchParams(params)
      next.delete('plan')
      next.delete('checkout')
      setParams(next, { replace: true })
    }
    // A return URL starts verification; it never marks a subscription paid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, canManage, workspaceId])

  useEffect(() => {
    if (confirmationPending && billing?.has_subscription && billing.billing_status === 'active') {
      setCheckingUntil(null)
      setConfirmationPending(false)
      return
    }
    if (!checkingUntil) return
    const timeout = window.setTimeout(() => setCheckingUntil(null), Math.max(0, checkingUntil - Date.now()))
    return () => window.clearTimeout(timeout)
  }, [checkingUntil, confirmationPending, billing])

  const openBilling = async (intent: 'plan' | 'payment' | 'invoices') => {
    if (opening) return
    setOpening(intent)
    try {
      const url = intent !== 'plan' || billing?.has_subscription
        ? await createWorkspaceBillingPortal(workspaceId)
        : await createWorkspaceSubscriptionCheckout(workspaceId, 'standard')
      window.location.assign(url)
    } catch (error) {
      if ((error as { code?: string })?.code === 'SUBSCRIPTION_EXISTS') {
        try {
          window.location.assign(await createWorkspaceBillingPortal(workspaceId))
        } catch (portalError) {
          toast.error(portalError instanceof Error ? portalError.message : 'Could not open billing. Please try again.')
        }
      } else {
        toast.error(error instanceof Error ? error.message : 'Could not open billing. Please try again.')
      }
    } finally {
      setOpening(null)
    }
  }

  if (!canManage) return <Navigate to="/app/clients" replace />

  const complimentary = billing?.billing_status === 'comped'
  const hasSubscription = billing?.has_subscription === true
  // Do not substitute today's catalog price for an unavailable legacy price.
  const cents = complimentary ? 0 : hasSubscription ? billing?.subscription_price_cents : billing?.plan_base_price_cents
  const price = typeof cents === 'number' ? formatMonthlyCents(cents) : null
  const trialEnd = knownDate(billing?.trial_ends_at)
  const trialExpired = billing?.billing_status === 'trialing' && Boolean(billing.trial_ends_at)
    && Date.parse(billing.trial_ends_at!) <= Date.now()
  const status = subscriptionStatusView(billing?.billing_status ?? 'trialing')
  const periodEnd = knownDate(billing?.current_period_end)
  const keyOwner = membership?.role === 'owner' || isPlatformAdmin
  const busy = opening !== null
  const paymentNeedsAttention = billing?.billing_status === 'past_due'
  const planAction = paymentNeedsAttention && hasSubscription ? 'Update payment method' : hasSubscription ? 'Manage subscription' : 'Start subscription'

  return (
    <WorkspaceLayout>
      <div className="mx-auto max-w-5xl space-y-6 pb-12 sm:space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Workspace settings</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Billing</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">Your plan, payments and connected provider accounts, all in one place.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void overviewQuery.refetch()} disabled={overviewQuery.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${overviewQuery.isFetching ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </header>
        <nav aria-label="Billing sections" className="flex flex-wrap gap-2 text-sm">
          {[['subscription', 'Workspace plan'], ['payments', 'Payments & invoices'], ['providers', 'Provider accounts']].map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full border bg-background px-4 py-2 font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{label}</a>)}
        </nav>

        {overviewQuery.isLoading ? (
          <Card><CardContent className="flex min-h-48 items-center justify-center gap-2 pt-6" role="status"><Loader2 className="h-5 w-5 animate-spin" />Loading your subscription…</CardContent></Card>
        ) : !billing ? (
          <Card><CardContent className="space-y-3 pt-6" role="alert">
            <p className="font-medium">We couldn’t load your billing details.</p>
            <p className="text-sm text-muted-foreground">Try again to see your subscription and payment options.</p>
            <Button variant="outline" onClick={() => void overviewQuery.refetch()}>Try again</Button>
          </CardContent></Card>
        ) : <>
          {checkoutCancelled && !confirmationPending && <div className="flex items-start justify-between gap-4 rounded-xl border bg-muted/40 p-4 text-sm" role="status">
            <p>Checkout wasn’t completed. You can return to it whenever you’re ready.</p>
            <button type="button" className="shrink-0 font-medium underline underline-offset-4" onClick={() => setCheckoutCancelled(false)}>Dismiss</button>
          </div>}
          {confirmationPending && <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950" role="status">
            {checkingUntil ? 'Checking your subscription with Stripe…' : 'Your subscription is not confirmed yet. Refresh to check again. If you received a receipt, contact support before starting another checkout.'}
          </div>}
          {(trialExpired || ['past_due', 'suspended'].includes(billing.billing_status)) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            {trialExpired ? 'Your trial has ended. Start your subscription to continue workspace operations.' : billing.billing_status === 'past_due' ? 'Your payment needs attention. Open payment settings to resolve it.' : 'Your subscription is inactive. Start a plan to resume workspace operations.'}
          </div>}

          <section id="subscription" aria-label="Your subscription" className="scroll-mt-24">
            <Card className="overflow-hidden border-primary/20 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 bg-primary/5 px-6 py-4 sm:px-8">
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">One workspace. Your whole team.</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Payments secured by Stripe</span>
              </div>
              <CardContent className="grid gap-8 p-6 sm:p-8 md:grid-cols-[1fr_auto]">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold">{complimentary ? 'Complimentary workspace' : 'Workspace plan'}</h2>
                    <Badge variant="outline" className={status.className}>{trialExpired ? 'Trial ended' : status.label}</Badge>
                    {billing.plan_key === 'founding_member' && hasSubscription && <Badge variant="secondary">Founding member price</Badge>}
                  </div>
                  <p className="max-w-xl text-sm leading-6 text-muted-foreground">Everything your team needs to find podcasts, build relationships and manage client placements.</p>
                  <ul className="grid gap-3 text-sm sm:grid-cols-2">
                    {['Unlimited clients', 'Unlimited team members', 'Shared podcast catalog', 'Your own provider accounts'].map((item) => <li key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600" />{item}</li>)}
                  </ul>
                  <p className="text-xs leading-5 text-muted-foreground">One flat workspace fee. No per-seat charges or app credit top-ups.</p>
                </div>
                <div className="space-y-4 border-t pt-6 md:min-w-52 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{hasSubscription ? 'Your monthly price' : 'Monthly subscription'}</p>
                  <p className="text-4xl font-semibold tracking-tight">{price ?? '—'}{price && <span className="ml-1 text-base font-normal text-muted-foreground">/ month</span>}</p>
                  <p className="text-xs text-muted-foreground">USD · Provider charges are separate</p>
                  {!price && <p className="text-xs text-muted-foreground">Price unavailable. Your current invoice is available in Stripe.</p>}
                  {!complimentary && <Button className="w-full" disabled={busy || (!hasSubscription && !price) || confirmationPending} onClick={() => void openBilling(paymentNeedsAttention && hasSubscription ? 'payment' : 'plan')}>
                    {opening === 'plan' || opening === 'payment' && paymentNeedsAttention ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{planAction}<ArrowUpRight className="ml-2 h-4 w-4" />
                  </Button>}
                  <p className="text-xs leading-5 text-muted-foreground">
                    {complimentary ? 'Workspace access is provided at no charge.' : billing.cancel_at_period_end ? `Ends ${periodEnd ?? 'at the end of your billing period'}. It will not renew.` : hasSubscription ? periodEnd ? `Next renewal: ${periodEnd}` : 'See Stripe for your next invoice and renewal date.' : trialEnd ? `Trial ${trialExpired ? 'ended' : 'ends'} ${trialEnd}.` : 'Complete checkout to activate your subscription.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="payments" aria-label="Payments and invoices" className="grid scroll-mt-24 gap-4 sm:grid-cols-2">
            {[{ id: 'payment' as const, title: 'Payment method', icon: CreditCard, copy: 'Update your card and billing details securely in Stripe.', action: 'Payment settings' }, { id: 'invoices' as const, title: 'Invoices & receipts', icon: FileText, copy: 'View your billing history and download invoices and receipts.', action: 'View invoices' }].map((item) => <Card key={item.id}><CardContent className="space-y-4 p-6">
              <item.icon className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">{item.title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{item.copy}</p>
              <Button variant="outline" disabled={busy || !billing.has_billing_customer && !hasSubscription} onClick={() => void openBilling(item.id)}>{opening === item.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{item.action}<ArrowUpRight className="ml-2 h-4 w-4" /></Button>
              {!billing.has_billing_customer && !hasSubscription && <p className="text-xs text-muted-foreground">Available after you start checkout.</p>}
            </CardContent></Card>)}
          </section>

          <section id="providers" aria-labelledby="provider-accounts-title" className="scroll-mt-24 space-y-4">
            <div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><KeyRound className="h-5 w-5" aria-hidden="true" /></div><div><h2 id="provider-accounts-title" className="text-xl font-semibold">Provider accounts</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Bring your own API keys for the features you use. Providers charge your account directly, separately from your workspace subscription.</p></div></div>
            {keyOwner ? <WorkspaceAiKeysCard workspaceId={workspaceId} queryScope={['tenant', user?.id, workspaceId]} /> : <Card><CardContent className="pt-6 text-sm text-muted-foreground">Ask your workspace owner to connect or update provider keys.</CardContent></Card>}
            <Link className="flex items-center justify-between gap-4 rounded-xl border px-5 py-4 text-sm transition-colors hover:bg-muted/40" to="/app/settings"><span><span className="block font-medium">Sending accounts</span><span className="mt-1 block text-muted-foreground">Manage email sending connections in workspace settings.</span></span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>
          </section>
          <details className="rounded-xl border p-5"><summary className="cursor-pointer font-medium">How billing works</summary><div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground"><p>Your workspace subscription covers access for your team and clients. AI, enrichment and sending services bill your connected accounts directly.</p><p>You can manage cancellation in Stripe. Your subscription screen shows when a scheduled cancellation takes effect.</p><p>If you purchased credits before this change, your transaction history is retained. Contact support to reconcile any remaining purchased balance.</p></div></details>
        </>}
      </div>
    </WorkspaceLayout>
  )
}
