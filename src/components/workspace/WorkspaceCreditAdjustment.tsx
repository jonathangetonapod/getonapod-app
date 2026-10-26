import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Loader2, MinusCircle } from 'lucide-react'
import { toast } from 'sonner'

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { InfoTip } from '@/components/workspace/InfoTip'
import { CREDIT_REASON_LABELS, parseCreditAmount, projectBalance, type CreditReason } from '@/lib/creditAdjustments'
import { adjustWorkspaceCredits, getWorkspaceBillingOverview } from '@/services/workspaceStaff'

interface WorkspaceCreditAdjustmentProps {
  workspaceId: string
  workspaceName: string | null
}

/**
 * Take credits back off a workspace.
 *
 * Every other control adds (a grant, a purchase, the monthly allowance), so a
 * grant of the wrong size could only be undone by editing the database. This
 * is the correction. It is filed and reviewed exactly like a grant, because
 * removing someone's credit should be a decision, not a shortcut.
 */
export function WorkspaceCreditAdjustment({ workspaceId, workspaceName }: WorkspaceCreditAdjustmentProps) {
  const queryClient = useQueryClient()
  const overviewQuery = useQuery({
    queryKey: ['workspace-billing-overview', workspaceId],
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  })
  const balance = typeof overviewQuery.data?.balance === 'number' ? overviewQuery.data.balance : null

  const [amountDraft, setAmountDraft] = useState('')
  const [reason, setReason] = useState<CreditReason | ''>('')
  const [note, setNote] = useState('')
  // One key per review: a double click or a retry inside the same review is
  // the same removal, and the ledger records it once.
  const [reviewKey, setReviewKey] = useState<string | null>(null)
  // Opened by a submit, not a dialog trigger: focus returns here on close.
  const reviewButtonRef = useRef<HTMLButtonElement | null>(null)

  // Capped at what the workspace holds. The server refuses more anyway; saying
  // so here stops an admin reviewing a removal that cannot happen.
  const { amount, error: amountError } = parseCreditAmount(amountDraft, { max: balance })
  const ready = amount !== null && reason !== '' && balance !== null

  const adjustMutation = useMutation({
    mutationFn: (key: string) => adjustWorkspaceCredits(workspaceId, {
      amount: amount ?? 0,
      reason: reason || 'other',
      note: note.trim(),
      adjustmentKey: key,
    }),
    onSuccess: async (result) => {
      // Every surface that shows this workspace's money, so no card on the
      // page contradicts another.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-billing-overview', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-credit-ledger', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-portfolio'] }),
      ])
      setAmountDraft('')
      setReason('')
      setNote('')
      setReviewKey(null)
      toast.success(`Removed ${result.removed.toLocaleString()} credits from ${workspaceName || 'this workspace'}.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The removal could not be recorded.'),
  })

  const confirm = () => {
    if (!reviewKey || !ready || adjustMutation.isPending) return
    adjustMutation.mutate(reviewKey)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><MinusCircle className="h-5 w-5" aria-hidden="true" />Remove credits</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          Correct a grant that was too large or went to the wrong workspace.
          <InfoTip topic="removing credits">
            Credits are taken from the newest and longest-lived first, so the soonest to expire stay spendable. A
            balance cannot go below zero.
          </InfoTip>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (ready) setReviewKey(crypto.randomUUID())
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adjust-amount">Credits to remove</Label>
              <Input
                id="adjust-amount"
                inputMode="numeric"
                value={amountDraft}
                placeholder={balance !== null ? `Up to ${balance.toLocaleString()}` : undefined}
                aria-describedby="adjust-amount-help"
                aria-invalid={Boolean(amountError)}
                onChange={(event) => setAmountDraft(event.target.value)}
              />
              <p id="adjust-amount-help" className={`text-xs ${amountError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {amountError ?? (balance !== null ? `${balance.toLocaleString()} available.` : 'Reading the balance…')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-reason">Reason</Label>
              <Select value={reason} onValueChange={(value: CreditReason) => setReason(value)}>
                <SelectTrigger id="adjust-reason">
                  <SelectValue placeholder="Choose why credits are being removed" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(CREDIT_REASON_LABELS) as Array<[CreditReason, string]>).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjust-note">Internal note <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="adjust-note"
              value={note}
              maxLength={500}
              placeholder="Example: Duplicate onboarding grant."
              className="min-h-20 resize-y"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button ref={reviewButtonRef} type="submit" variant="destructive" disabled={!ready}>
            <MinusCircle className="mr-2 h-4 w-4" aria-hidden="true" />Review removal
          </Button>
        </form>
      </CardContent>

      <AlertDialog open={reviewKey !== null} onOpenChange={(open) => { if (!open && !adjustMutation.isPending) setReviewKey(null) }}>
        <AlertDialogContent
          className="billing-admin"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const button = reviewButtonRef.current
            if (button && !button.disabled) button.focus()
            else document.getElementById('adjust-amount')?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {amount?.toLocaleString() ?? 0} credits from {workspaceName || 'this workspace'}?</AlertDialogTitle>
            <AlertDialogDescription>The removal is recorded in the ledger and the audit log against your account.</AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="space-y-3 rounded-2xl border bg-muted/20 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Balance</dt>
              <dd className="flex items-center gap-2 font-semibold tabular-nums">
                <span>{balance?.toLocaleString()}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="becomes" />
                <span className="text-destructive">{balance !== null && amount !== null ? projectBalance(balance, -amount).toLocaleString() : ''}</span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="font-medium">{reason ? CREDIT_REASON_LABELS[reason] : ''}</dd>
            </div>
            <div className="border-t pt-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Internal note</dt>
              <dd className="mt-1 leading-6">{note.trim() || 'None'}</dd>
            </div>
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={adjustMutation.isPending}>Go back</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={adjustMutation.isPending}
              onClick={(event) => { event.preventDefault(); confirm() }}
            >
              {adjustMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Remove credits
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
