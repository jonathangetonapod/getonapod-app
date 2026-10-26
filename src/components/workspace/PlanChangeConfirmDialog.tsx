import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CREDIT_REASON_LABELS, type CreditReason } from '@/lib/creditAdjustments'
import { planChangeSummary, type PlanChange } from '@/lib/planPricing'
import { updateBillingPlanPrice, type BillingPlan } from '@/services/workspaceStaff'

interface PlanChangeConfirmDialogProps {
  plan: BillingPlan
  change: PlanChange
  onClose: () => void
  onSaved: () => void
}

/**
 * The last look before a plan changes for everyone on it. Mounted fresh for
 * each opening, so one opening is one action key and a retried save mints one
 * Stripe Price, not two.
 */
export const PlanChangeConfirmDialog = ({ plan, change, onClose, onSaved }: PlanChangeConfirmDialogProps) => {
  const queryClient = useQueryClient()
  const [actionKey] = useState(() => crypto.randomUUID())
  const [reason, setReason] = useState<CreditReason | ''>('')
  const [note, setNote] = useState('')
  const lines = planChangeSummary(plan, change)

  const mutation = useMutation({
    mutationFn: () => updateBillingPlanPrice(plan.plan_key, change.cents, change.credits, {
      applyToExistingSubscribers: change.applyToExisting,
      reason: reason || 'other',
      note: note.trim(),
      actionKey,
    }),
    onSuccess: (plans) => {
      queryClient.setQueryData(['platform-billing-plans'], plans)
      void queryClient.invalidateQueries({ queryKey: ['billing-portfolio'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-billing-overview'] })
      toast.success(`${plan.display_name} saved.`)
      onSaved()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The plan could not be saved.'),
  })

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save {plan.display_name}?</DialogTitle>
          <DialogDescription>Check what changes and for whom.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 rounded-xl border bg-muted/20 p-4 text-sm leading-6">
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (reason !== '' && !mutation.isPending) mutation.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="plan-change-reason">Reason</Label>
            <Select value={reason} onValueChange={(value: CreditReason) => setReason(value)}>
              <SelectTrigger id="plan-change-reason"><SelectValue placeholder="Choose why" /></SelectTrigger>
              <SelectContent>
                {(Object.entries(CREDIT_REASON_LABELS) as Array<[CreditReason, string]>).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-change-note">Internal note <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="plan-change-note" value={note} maxLength={500} className="min-h-16 resize-y" onChange={(event) => setNote(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Go back</Button>
            <Button type="submit" disabled={reason === '' || mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Save {plan.display_name}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
