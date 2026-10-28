import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CREDIT_REASON_LABELS, type CreditReason } from '@/lib/creditAdjustments'
import { formatDate } from '@/lib/dates'
import {
  SUBSCRIPTION_ACTION_LABELS,
  TRIAL_EXTENSIONS,
  customTrialEnd,
  dateInputValue,
  extendedTrialEnd,
} from '@/lib/subscriptionActions'
import { planLabel } from '@/lib/subscriptionStatus'
import { formatMonthlyCents } from '@/lib/workspacePrice'
import {
  runSubscriptionAction,
  type BillingPlan,
  type SubscriptionActionResult,
  type SubscriptionOperation,
  type WorkspaceBillingOverview,
} from '@/services/workspaceStaff'

interface SubscriptionActionDialogProps {
  operation: SubscriptionOperation
  workspaceId: string
  workspaceName: string
  billing: WorkspaceBillingOverview
  plans: BillingPlan[]
  ownerEmail: string | null
  onClose: () => void
}

/**
 * Confirming one subscription action. Mounted fresh for each opening, so each
 * opening is one action key: a double click or a retry inside it is the same
 * change, at Stripe and in the audit log.
 */
export const SubscriptionActionDialog = ({
  operation, workspaceId, workspaceName, billing, plans, ownerEmail, onClose,
}: SubscriptionActionDialogProps) => {
  const queryClient = useQueryClient()
  const [actionKey] = useState(() => crypto.randomUUID())
  const [reason, setReason] = useState<CreditReason | ''>('')
  const [note, setNote] = useState('')
  const [extension, setExtension] = useState<number | 'custom'>(14)
  const [customDate, setCustomDate] = useState('')
  const purchasable = plans.filter((plan) => plan.is_purchasable && plan.plan_key !== 'comped')
  const [planKey, setPlanKey] = useState(() => (
    operation === 'change_plan'
      ? purchasable.find((plan) => plan.plan_key !== billing.plan_key)?.plan_key ?? ''
      : purchasable.find((plan) => plan.plan_key === billing.plan_key)?.plan_key ?? purchasable[0]?.plan_key ?? ''
  ))
  const [emailOwner, setEmailOwner] = useState(Boolean(ownerEmail))
  const [link, setLink] = useState<SubscriptionActionResult['result'] | null>(null)

  const trialEnd = extension === 'custom' ? customTrialEnd(customDate) : extendedTrialEnd(billing.trial_ends_at, extension)
  const periodEnd = billing.current_period_end ? formatDate(billing.current_period_end) : 'the end of the current period'
  const plan = purchasable.find((candidate) => candidate.plan_key === planKey
    && (operation !== 'change_plan' || candidate.plan_key !== billing.plan_key))

  const summary: Record<SubscriptionOperation, string> = {
    extend_trial: trialEnd
      ? `The trial will end ${formatDate(trialEnd)}${billing.trial_ends_at ? ` instead of ${formatDate(billing.trial_ends_at)}` : ''}.`
      : 'Choose a date within the next year.',
    change_plan: !plan ? 'No alternative plan is available for this workspace.' : billing.has_subscription
      ? `Switches to ${planLabel(planKey)} now. Stripe prorates the rest of this period.`
      : `Moves the workspace to ${planLabel(planKey)}. Nothing is charged until it subscribes.`,
    make_comped: billing.has_subscription
      ? `Complimentary from now. Stripe stops charging after ${periodEnd}.`
      : 'Complimentary from now. It is never charged.',
    cancel: `The subscription ends ${periodEnd}. Cancellation does not restore access suspended for unpaid invoices. External campaigns, mailboxes and domains continue until stopped in their provider accounts.`,
    checkout_link: plan
      ? `New checkouts use ${planLabel(planKey)} at ${formatMonthlyCents(plan.base_price_cents)}/mo. An existing open checkout keeps its original price; confirm the amount on Stripe before paying.`
      : 'Choose a plan.',
  }

  const ready = reason !== ''
    && (operation !== 'extend_trial' || trialEnd !== null)
    && (operation !== 'change_plan' && operation !== 'checkout_link' ? true : Boolean(plan))

  const mutation = useMutation({
    mutationFn: () => runSubscriptionAction(workspaceId, {
      operation,
      reason: reason || 'other',
      note: note.trim(),
      actionKey,
      ...(operation === 'extend_trial' && trialEnd ? { trialEndsAt: trialEnd.toISOString() } : {}),
      ...(operation === 'change_plan' || operation === 'checkout_link' ? { planKey } : {}),
      ...(operation === 'checkout_link' ? { emailOwner } : {}),
    }),
    onSuccess: async (response) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-billing-overview', workspaceId] }),
        queryClient.invalidateQueries({ queryKey: ['billing-portfolio'] }),
      ])
      toast.success(`${SUBSCRIPTION_ACTION_LABELS[operation].title}: done for ${workspaceName}.`)
      // The link is the point of this action, so the dialog stays to show it.
      if (operation === 'checkout_link') setLink(response.result)
      else onClose()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The subscription could not be changed.'),
  })

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Checkout link copied.')
    } catch {
      toast.error('The link could not be copied. Select it and copy it by hand.')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose() }}>
      <DialogContent className="billing-admin max-w-lg">
        <DialogHeader>
          <DialogTitle>{SUBSCRIPTION_ACTION_LABELS[operation].title}: {workspaceName}</DialogTitle>
          <DialogDescription>{summary[operation]}</DialogDescription>
        </DialogHeader>

        {link?.url ? (
          <div className="space-y-3">
            <Label htmlFor="checkout-link">Checkout link</Label>
            <div className="flex gap-2">
              <Input id="checkout-link" readOnly value={link.url} onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => void copyLink(String(link.url))}>
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" />Copy
              </Button>
            </div>
            {link.expires_at && Number.isFinite(Date.parse(link.expires_at)) && <p className="text-sm text-muted-foreground">Expires {new Date(link.expires_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZoneName: undefined })} (your local time).</p>}
            <p className="text-sm text-muted-foreground" role="status">
              {link.emailed === 'sent' && `Emailed to ${link.owner_email}.`}
              {link.emailed === 'failed' && 'The email could not be sent. Copy the link and send it yourself.'}
              {link.emailed === 'skipped' && 'No email was sent: there is no owner email or email is not configured.'}
              {link.emailed === 'not_requested' && 'Not emailed. Copy the link and send it yourself.'}
            </p>
            <DialogFooter><Button type="button" onClick={onClose}>Done</Button></DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (ready && !mutation.isPending) mutation.mutate()
            }}
          >
            {operation === 'extend_trial' && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Extend by</legend>
                <div className="flex flex-wrap gap-2">
                  {TRIAL_EXTENSIONS.map((days) => (
                    <Button key={days} type="button" size="sm" variant={extension === days ? 'default' : 'outline'} aria-pressed={extension === days} onClick={() => setExtension(days)}>
                      +{days} days
                    </Button>
                  ))}
                  <Button type="button" size="sm" variant={extension === 'custom' ? 'default' : 'outline'} aria-pressed={extension === 'custom'} onClick={() => setExtension('custom')}>
                    Custom date
                  </Button>
                </div>
                {extension === 'custom' && (
                  <div className="space-y-1">
                    <Label htmlFor="trial-custom-date">Trial ends on</Label>
                    <Input id="trial-custom-date" type="date" min={dateInputValue(new Date())} value={customDate} onChange={(event) => setCustomDate(event.target.value)} className="w-48" />
                  </div>
                )}
              </fieldset>
            )}

            {(operation === 'change_plan' || operation === 'checkout_link') && (
              <div className="space-y-2">
                <Label htmlFor="subscription-plan">Plan</Label>
                <Select value={planKey} onValueChange={setPlanKey}>
                  <SelectTrigger id="subscription-plan"><SelectValue placeholder="Choose a plan" /></SelectTrigger>
                  <SelectContent>
                    {purchasable
                      .filter((candidate) => operation !== 'change_plan' || candidate.plan_key !== billing.plan_key)
                      .map((candidate) => (
                        <SelectItem key={candidate.plan_key} value={candidate.plan_key}>
                          {candidate.display_name} · {formatMonthlyCents(candidate.base_price_cents)}/mo
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {operation === 'checkout_link' && (
              <div className="flex items-start gap-2">
                <Checkbox id="checkout-email-owner" checked={emailOwner} disabled={!ownerEmail} onCheckedChange={(checked) => setEmailOwner(checked === true)} />
                <Label htmlFor="checkout-email-owner" className="font-normal leading-5">
                  {ownerEmail ? `Email it to the owner (${ownerEmail})` : 'No owner email to send it to'}
                </Label>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="subscription-reason">Reason</Label>
              <Select value={reason} onValueChange={(value: CreditReason) => setReason(value)}>
                <SelectTrigger id="subscription-reason"><SelectValue placeholder="Choose why" /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(CREDIT_REASON_LABELS) as Array<[CreditReason, string]>).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subscription-note">Internal note <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="subscription-note" value={note} maxLength={500} className="min-h-16 resize-y" onChange={(event) => setNote(event.target.value)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Go back</Button>
              <Button type="submit" variant={operation === 'cancel' ? 'destructive' : 'default'} disabled={!ready || mutation.isPending}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {SUBSCRIPTION_ACTION_LABELS[operation].confirm}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
