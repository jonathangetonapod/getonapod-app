import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CREDIT_COSTS, OPERATION_NAMES, creditsLabel, type MeteredOperation } from '@/lib/creditCosts'
import { knownDate, operationName } from '@/lib/billingActivity'

import { AutoRefillCard } from '@/components/workspace/AutoRefillCard'
import { BillingActivityList } from '@/components/workspace/BillingActivityList'
import { BillingSummary } from '@/components/workspace/BillingSummary'
import { CreditPackPicker, DEFAULT_REFILL_THRESHOLD } from '@/components/workspace/CreditPackPicker'
import { WorkspaceLayout } from '@/components/workspace/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getWorkspaceBillingOverview,
  createWorkspaceBillingPortal,
  createWorkspaceCreditCheckout,
  createWorkspaceSubscriptionCheckout,
  setWorkspaceAutoRefill,
} from '@/services/workspaceStaff'
import { CREDIT_PACKS } from '@/lib/creditPacks'

// The price list, grouped: mailboxes are a different kind of spend from the
// per-run AI and data work above them.
const MAILBOX_OPERATIONS: MeteredOperation[] = ['mailbox_domain_purchase', 'mailbox_monthly']
const WORK_OPERATIONS = (Object.keys(CREDIT_COSTS) as MeteredOperation[])
  .filter((operation) => !MAILBOX_OPERATIONS.includes(operation))

// One word for "costs nothing" across the price list, which also says runs on
// your own AI keys are free.
const priceLabel = (credits: number): string => (credits <= 0 ? 'Free' : creditsLabel(credits))

// How long a purchased balance is given to arrive before the page stops
// claiming it is on its way. The webhook is normally seconds; a minute means
// something is wrong with it rather than slow.
const CREDIT_ARRIVAL_TIMEOUT_MS = 60_000

const CHECKOUT_MARKER_KEY = 'billing-checkout-marker-v1'

// Reference material most visits do not need, kept on the page but folded.
const Disclosure = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <details className="group rounded-xl border bg-card">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
      <h2 className="text-base font-semibold">{title}</h2>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="border-t px-5 py-4">{children}</div>
  </details>
)

const WorkspaceBilling = () => {
  const { canManageWorkspaceStaff, isPlatformAdmin, user, workspace } = useAuth()
  const queryClient = useQueryClient()
  const workspaceId = workspace?.id || ''
  const [searchParams, setSearchParams] = useSearchParams()
  const [checkoutPack, setCheckoutPack] = useState<string | null>(null)
  const [openingPlan, setOpeningPlan] = useState(false)
  const [awaitingCredits, setAwaitingCredits] = useState(false)
  const [balanceBeforeCheckout, setBalanceBeforeCheckout] = useState<number | null>(null)
  const [checkoutStartedAt, setCheckoutStartedAt] = useState<number | null>(null)
  const [autoRefillChecked, setAutoRefillChecked] = useState(false)
  // The pack to keep buying, chosen with the checkbox before checkout and
  // switched on once the payment (and with it the saved card) is confirmed.
  const [pendingAutoRefillPack, setPendingAutoRefillPack] = useState<number | null>(null)

  useEffect(() => {
    const outcome = searchParams.get('checkout')
    const planOutcome = searchParams.get('plan')
    if (!outcome && !planOutcome) return
    if (outcome === 'success') {
      try {
        const marker = JSON.parse(window.sessionStorage.getItem(CHECKOUT_MARKER_KEY) ?? 'null') as
          | { startedAt?: number; balanceBefore?: number | null; autoRefillPack?: number | null }
          | null
        window.sessionStorage.removeItem(CHECKOUT_MARKER_KEY)
        if (marker && typeof marker.startedAt === 'number') {
          setCheckoutStartedAt(marker.startedAt)
          if (typeof marker.balanceBefore === 'number') setBalanceBeforeCheckout(marker.balanceBefore)
          if (typeof marker.autoRefillPack === 'number') setPendingAutoRefillPack(marker.autoRefillPack)
        }
      } catch {
        // No marker: the grant heuristic below still works, minus the
        // protection against confirming from an older purchase.
      }
      // The redirect alone proves nothing (anyone can add ?checkout=success),
      // so the copy promises only what the webhook will confirm.
      toast.info('Checkout finished. Your credits appear once Stripe confirms the payment.')
      // Credits are granted by the Stripe webhook, not by the redirect. If the
      // webhook is not wired up the payment still succeeds and the balance
      // never moves, so this watches for it rather than leaving the operator
      // to notice on their own.
      setAwaitingCredits(true)
    } else if (outcome === 'cancelled') {
      toast.info('Checkout cancelled. No charge was made.')
    } else if (planOutcome === 'updated') {
      toast.success('Plan updated. It may take a moment to appear here.')
    } else if (planOutcome === 'cancelled') {
      toast.info('No plan change was made.')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    next.delete('plan')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // A workspace with a subscription manages it in the portal. One without has
  // nothing there to change, so it goes to checkout to start a plan instead.
  const openPlanManagement = async (hasSubscription: boolean) => {
    if (openingPlan) return
    setOpeningPlan(true)
    try {
      const url = hasSubscription
        ? await createWorkspaceBillingPortal(workspaceId)
        : await createWorkspaceSubscriptionCheckout(workspaceId, 'founding_member')
      window.location.assign(url)
    } catch (error) {
      // The page thought there was no plan, but the server found one (the
      // webhook can land after this page loaded). A second checkout would be
      // a second subscription, so the portal is opened instead.
      if (!hasSubscription && (error as { code?: unknown } | null)?.code === 'SUBSCRIPTION_EXISTS') {
        toast.info('This workspace already has a plan. Opening the billing portal to manage it.')
        try {
          window.location.assign(await createWorkspaceBillingPortal(workspaceId))
          return
        } catch (portalError) {
          toast.error(portalError instanceof Error ? portalError.message : 'The billing portal could not be opened.')
          setOpeningPlan(false)
          return
        }
      }
      toast.error(error instanceof Error ? error.message : 'Plan management could not be opened.')
      setOpeningPlan(false)
    }
  }

  const buyPack = async (pack: 'starter' | 'growth' | 'scale') => {
    if (checkoutPack) return
    setCheckoutPack(pack)
    try {
      /*
       * Stamped BEFORE the redirect, which is the only moment the page can
       * still see the world as it was: the balance to compare against, and
       * the instant this checkout began so an OLDER purchase's grant cannot
       * confirm this one. Captured after returning, both were already wrong —
       * the webhook usually beats the redirect.
       */
      try {
        window.sessionStorage.setItem(CHECKOUT_MARKER_KEY, JSON.stringify({
          startedAt: Date.now(),
          balanceBefore: overview?.balance ?? null,
          autoRefillPack: autoRefillChecked && !overview?.has_saved_card
            ? CREDIT_PACKS.find((option) => option.key === pack)?.credits ?? null
            : null,
        }))
      } catch {
        // Storage unavailable: arrival falls back to the grant heuristic.
      }
      const url = await createWorkspaceCreditCheckout(workspaceId, pack)
      window.location.assign(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The checkout could not be started.')
      setCheckoutPack(null)
    }
  }

  const overviewQuery = useQuery({
    queryKey: ['tenant', user?.id || 'unknown', workspaceId, 'billing-overview'],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId) && (canManageWorkspaceStaff || isPlatformAdmin),
    retry: false,
    refetchInterval: awaitingCredits ? 4_000 : false,
    staleTime: awaitingCredits ? 0 : 30_000,
  })
  const overview = overviewQuery.data

  const balance = overview?.balance ?? null
  /*
   * The webhook usually beats the redirect, so the "before" balance captured
   * on a fresh page load already includes the credits — comparing against it
   * could never detect the arrival, and the banner spent its full minute
   * telling a paid-up operator to contact support rather than pay again. A
   * purchase grant in the last few minutes of the ledger is the arrival
   * itself, whichever side of the redirect it landed on.
   */
  const recentPurchaseAt = (overview?.recent_activity ?? []).find((entry) => (
    entry.entry_type === 'grant'
    && (entry.reference_kind === 'stripe_checkout' || entry.reference_kind === 'stripe_auto_refill')
    && Number.isFinite(Date.parse(entry.created_at))
    && Date.now() - Date.parse(entry.created_at) < 5 * 60_000
    /*
     * Newer than THIS checkout began (with a minute of clock skew), when the
     * start time is known. Without this, buying twice within five minutes let
     * the first purchase's grant confirm the second instantly — reporting the
     * exact webhook failure this banner exists to catch as a success.
     */
    && (checkoutStartedAt === null || Date.parse(entry.created_at) >= checkoutStartedAt - 60_000)
  ))
  useEffect(() => {
    if (!awaitingCredits) return
    if (balance !== null && (recentPurchaseAt || (balanceBeforeCheckout !== null && balance > balanceBeforeCheckout))) {
      setAwaitingCredits(false)
      setBalanceBeforeCheckout(null)
      setCheckoutStartedAt(null)
      toast.success('Credits added to your balance.')
      // The header chip and the low-balance warning read a different key with
      // a two-minute staleTime: the same screen must not warn about an empty
      // balance under a toast saying the credits arrived.
      void queryClient.invalidateQueries({ queryKey: ['workspace-billing-overview', workspaceId] })
      return
    }
    if (balance !== null && balanceBeforeCheckout === null) {
      setBalanceBeforeCheckout(balance)
    }
    // Armed even while the balance is unreadable, so a failing overview fetch
    // cannot leave the page polling every four seconds forever.
    const timer = window.setTimeout(() => {
      setAwaitingCredits(false)
      setBalanceBeforeCheckout(null)
      setCheckoutStartedAt(null)
      // Unconfirmed credits mean an unconfirmed card: nothing is switched on.
      setPendingAutoRefillPack(null)
    }, CREDIT_ARRIVAL_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [awaitingCredits, balance, balanceBeforeCheckout, recentPurchaseAt, checkoutStartedAt, queryClient, workspaceId])

  /*
   * Auto-refill asked for at checkout is switched on only once the credits
   * have arrived and Stripe reports a saved card. If either never happens
   * (the tab closed, or a guest payment saved nothing) nothing is set up, and
   * nothing is ever charged without the card the person agreed to.
   */
  useEffect(() => {
    if (pendingAutoRefillPack === null || awaitingCredits || !overview) return
    const packCredits = pendingAutoRefillPack
    setPendingAutoRefillPack(null)
    if (!overview.has_saved_card) {
      toast.info('Your card was not saved at checkout, so automatic top-ups could not be switched on.')
      return
    }
    if (typeof overview.refill_threshold_credits === 'number') return
    setWorkspaceAutoRefill(workspaceId, { thresholdCredits: DEFAULT_REFILL_THRESHOLD, packCredits, monthlyCapCents: null })
      .then(() => {
        toast.success(`Automatic top-ups are on: ${packCredits} credits when you reach ${DEFAULT_REFILL_THRESHOLD}.`)
        void overviewQuery.refetch()
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Automatic top-ups could not be switched on.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoRefillPack, awaitingCredits, overview])

  if (!canManageWorkspaceStaff && !isPlatformAdmin) return <Navigate to="/app/clients" replace />

  const prices = overview?.prices ?? {}
  const ledgerUsage = overview?.ledger_usage_this_month
  /*
   * Credits per operation come from the ledger, the same rows as "Used this
   * month", so the table's total is that figure. Pricing run counts instead
   * charged runs that failed and were refunded, and the two disagreed. An
   * older overview has no ledger breakdown, so runs are priced as before.
   */
  const usageTypes = new Set([...Object.keys(overview?.usage_this_month ?? {}), ...Object.keys(ledgerUsage ?? {})])
  const usageRows = [...usageTypes]
    .map((type) => {
      const counts = overview?.usage_this_month?.[type] ?? { total: 0, byo: 0 }
      const ledger = ledgerUsage?.[type]
      const credits = ledger
        ? ledger.credits
        : Math.max(0, counts.total - counts.byo) * (prices[type] ?? 0)
      return { type, total: counts.total, byo: counts.byo, refunds: ledger?.refunds ?? 0, credits }
    })
    .sort((left, right) => right.credits - left.credits || right.total - left.total)
  const usageTotal = usageRows.reduce((sum, row) => sum + row.credits, 0)
  const creditsSpent = overview?.credits_spent_this_month ?? usageTotal
  const allowance = overview?.monthly_credit_allowance ?? 0
  const nextAllowance = knownDate(overview?.next_allowance_at)
  // Live prices first; the shared table is what they were seeded at.
  const priceFor = (operation: MeteredOperation): number => prices[operation] ?? CREDIT_COSTS[operation]
  // Purchases are hidden until credits are actually being spent. Selling a pack
  // while the page says the balance will not move is asking for money for
  // something the product has just admitted it is not doing yet.
  const canBuyCredits = Boolean(overview?.enforcement_enabled)

  return (
    <WorkspaceLayout>
      <div className="mx-auto w-full max-w-5xl space-y-8 pb-12">
        <header className="border-b border-border/70 pb-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Billing &amp; credits</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Your plan, and the credits your workspace spends on research, outreach and email lookups.
          </p>
        </header>

        {overviewQuery.isLoading ? (
          <Card><CardContent className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your billing…</CardContent></Card>
        ) : !overview ? (
          <Card>
            <CardContent className="space-y-3 p-6 text-sm" role="alert">
              <p className="font-medium">Your billing could not be loaded.</p>
              <p className="text-muted-foreground">Nothing has been charged. This is a problem reading your account, not a problem with it.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void overviewQuery.refetch()}>Try again</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 1. Where things stand: plan, balance, and when more arrives. */}
            <section aria-label="Summary" className="space-y-3">
              <BillingSummary
                overview={overview}
                creditsSpent={creditsSpent}
                openingPlan={openingPlan}
                onManagePlan={(hasSubscription) => void openPlanManagement(hasSubscription)}
              />

              {!overview.enforcement_enabled && (
                <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900" role="status">
                  Usage is being recorded, but credits are not being charged yet. Your balance will not
                  move, and there is nothing to buy until credit billing is switched on.
                </p>
              )}

              {awaitingCredits && (
                <div role="status" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  <span>
                    <span className="font-semibold">Waiting for Stripe to confirm the payment.</span> Credits are added
                    once it does, and this page checks for them for a minute. If your balance has not changed by
                    then and Stripe sent you a receipt, contact support rather than paying again.
                  </span>
                </div>
              )}

              {overview.enforcement_enabled && overview.balance === 0 && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                  You have no credits left. Research, contact finding and prospect page builds are paused
                  until {nextAllowance ? `${nextAllowance}, or until you buy a pack` : 'you buy a pack'}.
                </p>
              )}
            </section>

            {/* 2. Topping up, with the automatic version beside it. */}
            {canBuyCredits && (
              <section aria-label="Buy credits" className="space-y-3">
                <CreditPackPicker
                  balance={overview.balance}
                  checkoutPack={checkoutPack}
                  offerAutoRefill={!overview.has_saved_card}
                  autoRefill={autoRefillChecked}
                  onAutoRefillChange={setAutoRefillChecked}
                  onBuy={(pack) => void buyPack(pack)}
                />
                {overview.has_saved_card && (
                  <AutoRefillCard workspaceId={workspaceId} overview={overview} onSaved={() => void overviewQuery.refetch()} />
                )}
              </section>
            )}

            {/* 3. Usage, from the ledger — so it adds up to the figure above. */}
            <section aria-labelledby="usage-title" className="space-y-3">
              <h2 id="usage-title" className="text-lg font-semibold">Usage this month</h2>
              <Card>
                <CardContent className="p-0">
                  {usageRows.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">No metered operations yet this month.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-5 py-2.5 text-left font-medium">Operation</th>
                            <th scope="col" className="px-5 py-2.5 text-right font-medium">Runs</th>
                            <th scope="col" className="px-5 py-2.5 text-right font-medium">Credits</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {usageRows.map((row) => (
                            <tr key={row.type}>
                              <td className="px-5 py-2.5">
                                {operationName(row.type)}
                                {row.byo > 0 && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {row.byo.toLocaleString()} on your own key, free
                                  </span>
                                )}
                                {row.refunds > 0 && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {row.refunds.toLocaleString()} failed, refunded
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-2.5 text-right tabular-nums">{row.total.toLocaleString()}</td>
                              <td className="px-5 py-2.5 text-right font-medium tabular-nums">{row.credits.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t bg-muted/20">
                          <tr>
                            <td className="px-5 py-2.5 font-medium" colSpan={2}>Total</td>
                            <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                              {(ledgerUsage ? creditsSpent : usageTotal).toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* 4. The ledger, with failed runs folded into their refunds. */}
            <BillingActivityList entries={overview.recent_activity} />

            {/* 5. Reference: every price, and the rules. */}
            <div className="space-y-3">
              <Disclosure title="What credits pay for">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">The price of each operation. Anything that runs on your own AI keys is free.</p>
                  <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                    {WORK_OPERATIONS.map((operation) => (
                      <div key={operation} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
                        <dt>{OPERATION_NAMES[operation]}</dt>
                        <dd className="shrink-0 tabular-nums text-muted-foreground">{priceLabel(priceFor(operation))}</dd>
                      </div>
                    ))}
                  </dl>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mailboxes</h3>
                    <dl className="mt-1.5 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                      {MAILBOX_OPERATIONS.map((operation) => (
                        <div key={operation} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
                          <dt>{OPERATION_NAMES[operation]}</dt>
                          <dd className="shrink-0 tabular-nums text-muted-foreground">{priceLabel(priceFor(operation))}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </Disclosure>

              <Disclosure title="How credits work">
                <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
                  <li>Credits pay for the AI and data work in your workspace.</li>
                  {allowance > 0 && (
                    <li>
                      Your plan includes {allowance.toLocaleString()} credits every month. Monthly credits you do not
                      use expire at the end of the following month.
                    </li>
                  )}
                  <li>Credits you buy never expire and are only used once the monthly ones are gone.</li>
                  <li>
                    When the balance reaches zero, research, contact finding and prospect page builds pause
                    until {nextAllowance ? `${nextAllowance} or until you buy more` : 'you buy more'}.
                  </li>
                  <li>Anything that runs on your own AI keys is free.</li>
                </ul>
              </Disclosure>
            </div>
          </>
        )}
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceBilling
