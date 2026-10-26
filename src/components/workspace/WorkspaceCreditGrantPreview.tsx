import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Crown, Plus, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { getWorkspaceBillingOverview, grantWorkspaceCredits } from '@/services/workspaceStaff'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { InfoTip } from '@/components/workspace/InfoTip'
import {
  CREDIT_REASON_LABELS,
  QUICK_CREDIT_AMOUNTS,
  parseCreditAmount,
  projectBalance,
  type CreditReason,
} from '@/lib/creditAdjustments'

interface WorkspaceCreditGrantPreviewProps {
  workspaceId: string
  workspaceName: string
  // Null when the owner has been invited but has not accepted yet. The ledger
  // can still be credited; there is simply no name to put against it.
  ownerName: string | null
  ownerEmail: string | null
}

const reasonLabels = CREDIT_REASON_LABELS

export function WorkspaceCreditGrantPreview({
  workspaceId,
  workspaceName,
  ownerName,
  ownerEmail,
}: WorkspaceCreditGrantPreviewProps) {
  const queryClient = useQueryClient()
  // Empty, not a default: a pre-filled 100 was granted by anyone who only
  // meant to pick the reason.
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<CreditReason | ''>('')
  const [note, setNote] = useState('')
  // One key per review, so a double click or a retry inside the same review
  // is the same grant and the ledger records it once.
  const [reviewKey, setReviewKey] = useState<string | null>(null)
  const reviewOpen = reviewKey !== null
  // Opened by a submit, not a dialog trigger, so Radix has nowhere to send
  // focus on close; it goes back to the button that opened the review.
  const reviewButtonRef = useRef<HTMLButtonElement | null>(null)

  // The same query, by key, as every other card for this workspace. A private
  // key meant a second fetch, and when only that one failed this card said the
  // balance could not be read beside a card showing it.
  const overviewQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    retry: false,
  })
  // Null until the balance is actually known. It used to fall back to 0, so a
  // single failed read — there are no retries — rendered a confident "0" and
  // projected "0 → 250". An admin who topped this workspace up an hour ago
  // would read that as the grant never landing, and grant again.
  const knownBalance = typeof overviewQuery.data?.balance === 'number'
    ? overviewQuery.data.balance
    : null

  const { amount: parsedAmount, error: amountError } = parseCreditAmount(amount)
  const trimmedNote = note.trim()
  const grantMutation = useMutation({
    mutationFn: (grantKey: string) => grantWorkspaceCredits(workspaceId, {
      amount: parsedAmount ?? 0,
      reason: reason || 'other',
      note: trimmedNote,
      grantKey,
    }),
    onSuccess: (result) => {
      // Every surface that shows this workspace's money, so no card on the
      // page contradicts another.
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-billing-overview', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-credit-ledger', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-portfolio'] }),
      ])
      setAmount('')
      setReason('')
      setNote('')
      setReviewKey(null)
      toast.success(`${result.granted.toLocaleString()} credits added to ${workspaceName}.`)
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'The credit grant could not be recorded.')
    },
  })
  // The note is optional. The reason still is not: it is what the ledger entry
  // is filed under, and it costs one click rather than a sentence per grant.
  // Not while the balance is still on its way: the review would project from a
  // number that is about to arrive. A failed read still lets the grant through.
  const formReady = parsedAmount !== null && reason !== '' && !grantMutation.isPending && !overviewQuery.isLoading
  const projectedBalance = projectBalance(knownBalance ?? 0, parsedAmount || 0)

  const confirmPreview = () => {
    if (!reviewKey || parsedAmount === null || reason === '' || grantMutation.isPending) return
    grantMutation.mutate(reviewKey)
  }

  return (
    <>
      <section
        id="workspace-credits"
        className="min-w-0 scroll-mt-28 space-y-4"
        aria-labelledby="workspace-credits-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="workspace-credits-title" className="text-2xl font-semibold tracking-tight">Workspace credits</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              Add credits without changing the plan.
              <InfoTip topic="adding credits">
                For support, onboarding or account adjustments. A grant applies immediately and is recorded in the
                credit history and the audit log against your account.
              </InfoTip>
            </p>
          </div>
        </div>

        <Card className="min-w-0 overflow-hidden border-border/70 shadow-sm">
          <CardContent className="p-0">
            <div className="grid min-w-0 lg:grid-cols-[minmax(18rem,0.78fr)_minmax(0,1.22fr)]">
              <div className="relative overflow-hidden bg-slate-950 p-6 text-white sm:p-7">
                <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
                <div className="relative">
                  <p className="text-sm text-white/65">Available now</p>
                  {knownBalance === null ? (
                    <div className="mt-1">
                      <p className="text-2xl font-semibold tracking-tight text-white/70">
                        {overviewQuery.isLoading ? 'Loading…' : 'Unavailable'}
                      </p>
                      {!overviewQuery.isLoading && (
                        <button
                          type="button"
                          className="mt-1 text-sm text-violet-200 underline underline-offset-2"
                          onClick={() => void overviewQuery.refetch()}
                        >
                          Try again
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-5xl font-semibold tracking-tight" aria-label={`${knownBalance} credits available`}>
                      {knownBalance.toLocaleString()}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-white/65">Credits</p>

                  <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-300/15 text-amber-200">
                        <Crown className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/50">Current owner</p>
                        {ownerName ? (
                          <>
                            <p className="mt-1 truncate font-semibold">{ownerName}</p>
                            {ownerEmail && <p className="truncate text-sm text-white/60">{ownerEmail}</p>}
                          </>
                        ) : (
                          <p className="mt-1 text-sm text-white/60">Nobody has accepted the invite yet</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Named after the workspace, never after the owner: these two
                      are often the same person, and "granted to X, not to this
                      person" under a card showing X reads as a contradiction. */}
                  <div className="mt-4 flex gap-3 rounded-xl border border-violet-300/15 bg-violet-300/[0.08] p-3 text-xs leading-5 text-violet-100/80">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
                    <p>Credits belong to the workspace, not to whoever owns it today. They stay put if ownership changes.</p>
                  </div>
                </div>
              </div>

              <form
                className="min-w-0 space-y-6 p-6 sm:p-7"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (formReady) setReviewKey(crypto.randomUUID())
                }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                      <Plus className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="font-semibold">Add credits manually</h3>
                      <p className="text-xs text-muted-foreground">Adds spendable credits to the workspace ledger. No charge or plan change.</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="workspace-credit-amount">Credits to add</Label>
                  <div className="relative max-w-sm">
                    <Input
                      id="workspace-credit-amount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={10_000}
                      step={1}
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="pr-20 text-base font-semibold"
                      aria-describedby="workspace-credit-amount-help"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">credits</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Each sets the amount rather than adding to it, and the one
                        that matches the field shows as chosen. */}
                    {QUICK_CREDIT_AMOUNTS.map((quickAmount) => {
                      const active = parsedAmount === quickAmount
                      return (
                        <Button
                          key={quickAmount}
                          type="button"
                          size="sm"
                          variant={active ? 'default' : 'outline'}
                          aria-pressed={active}
                          aria-label={`Set credit amount to ${quickAmount}`}
                          onClick={() => setAmount(String(quickAmount))}
                        >
                          +{quickAmount}
                        </Button>
                      )
                    })}
                  </div>
                  <p id="workspace-credit-amount-help" className={`text-xs ${amountError ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {amountError ?? 'Choose a quick amount or enter a custom grant.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workspace-credit-reason">Reason</Label>
                  <Select value={reason} onValueChange={(value: CreditReason) => setReason(value)}>
                    <SelectTrigger id="workspace-credit-reason" className="max-w-xl">
                      <SelectValue placeholder="Choose why credits are being added" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(reasonLabels) as Array<[CreditReason, string]>).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="workspace-credit-note">Internal note <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Textarea
                    id="workspace-credit-note"
                    value={note}
                    maxLength={300}
                    placeholder="Example: Added after onboarding call so the team can test direct-email search."
                    onChange={(event) => setNote(event.target.value)}
                    aria-describedby="workspace-credit-note-help"
                    className="min-h-24 max-w-xl resize-y"
                  />
                  <p id="workspace-credit-note-help" className="text-xs text-muted-foreground">
                    Workspace members will not see this note.
                  </p>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Balance after grant</p>
                    {knownBalance === null && overviewQuery.isError ? (
                      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                        The current balance could not be read, so this cannot be projected. The grant will still be added.
                      </p>
                    ) : knownBalance === null ? (
                      <p className="mt-1 text-sm text-muted-foreground" role="status">Reading the current balance…</p>
                    ) : (
                      <div className="mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums">
                        <span>{knownBalance.toLocaleString()}</span>
                        {parsedAmount !== null && (
                          <>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-label="becomes" />
                            <span className="text-violet-700">{projectedBalance.toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  <Button ref={reviewButtonRef} type="submit" disabled={!formReady} className="shrink-0">
                    Review credit grant
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>
          </CardContent>
        </Card>

      </section>

      <AlertDialog open={reviewOpen} onOpenChange={(open) => { if (!open && !grantMutation.isPending) setReviewKey(null) }}>
        <AlertDialogContent
          className="billing-admin"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            // After a grant the form is empty and the button disabled, so the
            // amount field, where the next grant starts, takes focus instead.
            const button = reviewButtonRef.current
            if (button && !button.disabled) button.focus()
            else document.getElementById('workspace-credit-amount')?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Add {parsedAmount?.toLocaleString() || 0} credits to {workspaceName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm the target and balance before recording a manual workspace adjustment.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 rounded-2xl border bg-muted/20 p-4 text-sm">
            <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">Workspace</span><span className="text-right font-medium">{workspaceName}</span></div>
            <div className="flex items-start justify-between gap-4"><span className="text-muted-foreground">Current owner</span><span className="text-right"><span className="block font-medium">{ownerName}</span><span className="block text-xs text-muted-foreground">{ownerEmail}</span></span></div>
            <div className="flex items-center justify-between gap-4 border-t pt-3"><span className="text-muted-foreground">Reason</span><span className="font-medium">{reason ? reasonLabels[reason] : ''}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Balance change</span>{knownBalance === null ? (<span className="text-right font-medium">+{parsedAmount?.toLocaleString() || 0}, from a balance that could not be read</span>) : (<span className="flex items-center gap-2 font-semibold"><span>{knownBalance.toLocaleString()}</span><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-violet-700">{projectedBalance.toLocaleString()}</span></span>)}</div>
            <div className="border-t pt-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Internal note</p><p className="mt-1 leading-6">{trimmedNote || 'None'}</p></div>
          </div>

          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
            Confirming immediately adds these credits to the workspace balance and records the grant in the ledger and audit log.
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={grantMutation.isPending}>Go back</AlertDialogCancel>
            <AlertDialogAction
              disabled={grantMutation.isPending}
              onClick={(event) => { event.preventDefault(); confirmPreview() }}
            >
              {grantMutation.isPending ? 'Adding…' : 'Add credits'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
