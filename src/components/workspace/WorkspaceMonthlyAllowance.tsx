import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { InfoTip } from '@/components/workspace/InfoTip'
import { allowanceIsOverride } from '@/lib/billingAttention'
import { CREDIT_REASON_LABELS, type CreditReason } from '@/lib/creditAdjustments'
import { getWorkspaceBillingOverview, setWorkspaceMonthlyAllowance } from '@/services/workspaceStaff'

interface WorkspaceMonthlyAllowanceProps {
  workspaceId: string
  workspaceName: string | null
}

/**
 * What a workspace is granted every month, editable where an admin already is.
 *
 * The plan ladder carries an allowance, and editing it there looked like the
 * answer — but that number is only copied onto a workspace when a subscription
 * event fires. A workspace that has never been billed has no profile at all,
 * so it fell through to a literal in the granting code and no amount of plan
 * editing would ever change what it received.
 *
 * This writes the number the renewal actually reads.
 */
export function WorkspaceMonthlyAllowance({ workspaceId, workspaceName }: WorkspaceMonthlyAllowanceProps) {
  const queryClient = useQueryClient()
  const queryKey = ['workspace-billing-overview', workspaceId]
  const overviewQuery = useQuery({
    queryKey,
    queryFn: () => getWorkspaceBillingOverview(workspaceId),
    enabled: Boolean(workspaceId),
    retry: false,
  })

  const current = overviewQuery.data?.monthly_credit_allowance ?? null
  const planDefault = overviewQuery.data?.plan_monthly_credit_allowance ?? null
  const overridden = typeof current === 'number' && allowanceIsOverride(current, planDefault)
  const [draft, setDraft] = useState('')
  const [reason, setReason] = useState<CreditReason | ''>('')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (typeof current === 'number') setDraft(String(current))
  }, [current])

  /*
   * Digits only, like the grant form beside this one. parseInt accepted
   * "12abc" as 12 and "1e3" as 1 — an admin typing a thousand saved one, with
   * a success toast.
   */
  const parsed = /^\d+$/u.test(draft.trim()) ? Number.parseInt(draft.trim(), 10) : Number.NaN
  const valid = Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 1_000_000
  const dirty = valid && parsed !== current
  // Saving is a change to what this workspace is given, so it says why, like
  // a grant. Setting the same number twice changes nothing, which makes it
  // safe to repeat.
  const ready = dirty && reason !== ''

  const saveMutation = useMutation({
    mutationFn: () => setWorkspaceMonthlyAllowance(workspaceId, parsed, { reason: reason || 'other', note: note.trim() }),
    onSuccess: async (saved) => {
      /*
       * Every surface that shows this workspace's money, not just this
       * card's own query. The four surfaces key four different families, and
       * invalidating only one's own let the cards on a single screen
       * contradict each other — a grant the adjustment card could not see,
       * a removal the grant preview ignored, a portfolio that never moved.
       */
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-billing-overview', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-portfolio'] }),
      ])
      setReason('')
      setNote('')
      toast.success(`${workspaceName || 'This workspace'} will get ${saved} credits a month.`)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The monthly allowance could not be saved.'),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><RefreshCw className="h-5 w-5" />Monthly credits</CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          Credits granted to {workspaceName || 'this workspace'} at the start of every month.
          <InfoTip topic="monthly credits">
            They expire at the end of the following month. A change applies from the next monthly grant: this month
            was already granted at the current figure. To add credits now, use the grant above.
          </InfoTip>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-2 sm:w-56">
            <Label htmlFor="monthly-allowance">Monthly credits</Label>
            <Input
              id="monthly-allowance"
              inputMode="numeric"
              value={draft}
              aria-describedby="monthly-allowance-default"
              disabled={overviewQuery.isLoading || saveMutation.isPending}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-2 text-sm">
            <span id="monthly-allowance-default" className="text-muted-foreground">
              Plan default: <span className="font-medium tabular-nums text-foreground">{planDefault?.toLocaleString() ?? 'unknown'}</span>
            </span>
            {overridden && typeof planDefault === 'number' && draft !== String(planDefault) && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                disabled={saveMutation.isPending}
                onClick={() => setDraft(String(planDefault))}
              >
                Reset to plan default
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="monthly-allowance-reason">Reason</Label>
            <Select value={reason} onValueChange={(value: CreditReason) => setReason(value)}>
              <SelectTrigger id="monthly-allowance-reason">
                <SelectValue placeholder="Choose why the allowance is changing" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(CREDIT_REASON_LABELS) as Array<[CreditReason, string]>).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthly-allowance-note">Internal note <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="monthly-allowance-note"
              value={note}
              maxLength={500}
              className="min-h-10 resize-y"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={!ready || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Save className="mr-2 h-4 w-4" />}
            Save allowance
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              disabled={saveMutation.isPending}
              onClick={() => setDraft(String(current ?? ''))}
            >
              Undo changes
            </Button>
          )}
        </div>
        {/* Said plainly, because the obvious expectation is that saving a
            bigger number puts the difference in the balance today. */}
        <p className="text-xs leading-5 text-muted-foreground">
          {draft.trim() && !valid
            ? <span className="text-destructive">Enter a whole number of credits between 0 and 1,000,000.</span>
            : 'Takes effect at the next monthly grant.'}
        </p>
      </CardContent>
    </Card>
  )
}
