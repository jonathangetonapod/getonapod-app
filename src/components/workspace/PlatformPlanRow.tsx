import { useRef, useState } from 'react'
import { Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PlanChangeConfirmDialog } from '@/components/workspace/PlanChangeConfirmDialog'
import { centsFromDollars, stripePriceUrl } from '@/lib/planPricing'
import type { BillingPlan } from '@/services/workspaceStaff'

interface PlatformPlanRowProps {
  plan: BillingPlan
}

/**
 * One plan's price and monthly credits. Complimentary is assigned and never
 * sold, so it has credits and no price; it used to invite an admin to "set a
 * price to create one in Stripe", which would have put a free plan on sale.
 */
export const PlatformPlanRow = ({ plan }: PlatformPlanRowProps) => {
  const [priceDraft, setPriceDraft] = useState<string | null>(null)
  // Off by default: giving workspaces that already pay a different allowance
  // is never a side effect of a save.
  const [confirming, setConfirming] = useState(false)
  // The dialog unmounts on close; focus goes back to Save rather than the body.
  const saveRef = useRef<HTMLButtonElement | null>(null)
  const closeConfirm = () => {
    setConfirming(false)
    requestAnimationFrame(() => saveRef.current?.focus())
  }

  const sold = plan.is_purchasable
  const dollars = priceDraft ?? (plan.base_price_cents / 100).toFixed(2)
  const cents = sold ? centsFromDollars(dollars) : plan.base_price_cents
  const credits = 0
  const applyToExisting = false
  // A plan never priced in Stripe has to be savable at the amount it shows:
  // that save is what creates its first Price.
  const changed = cents !== null && credits !== null && (
    cents !== plan.base_price_cents
    || (sold && !plan.stripe_price_id)
  )

  const reset = () => {
    setPriceDraft(null)
    setConfirming(false)
  }

  const copyPriceId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      toast.success('Stripe price ID copied.')
    } catch {
      toast.error('The ID could not be copied.')
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{plan.display_name}</p>
          {!sold && <Badge variant="secondary">Not available for new subscriptions</Badge>}
          {sold && !plan.stripe_price_id && (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">No Stripe price yet</Badge>
          )}
        </div>
        {plan.stripe_price_id && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <code className="truncate">{plan.stripe_price_id}</code>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={`Copy Stripe price ID for ${plan.display_name}`} onClick={() => void copyPriceId(String(plan.stripe_price_id))}>
              <Copy className="h-3 w-3" aria-hidden="true" />
            </Button>
            <Button asChild variant="ghost" size="icon" className="h-6 w-6">
              <a href={stripePriceUrl(plan.stripe_price_id)} target="_blank" rel="noreferrer" aria-label={`Open the ${plan.display_name} price in Stripe`}>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </Button>
          </div>
        )}
        {!sold && <p className="mt-1 text-xs text-muted-foreground">Assigned to a workspace by an admin. No charge.</p>}
      </div>

      <div className="flex flex-col gap-2 sm:items-end">
        <div className="flex items-end gap-2">
          {sold && (
            <div className="space-y-1">
              <Label htmlFor={`plan-price-${plan.plan_key}`} className="text-xs">Per month (USD)</Label>
              <Input id={`plan-price-${plan.plan_key}`} inputMode="decimal" className="w-32" value={dollars} onChange={(event) => setPriceDraft(event.target.value)} />
            </div>
          )}
          <Button ref={saveRef} type="button" size="sm" disabled={!sold || !changed} onClick={() => setConfirming(true)}>
            Save
          </Button>
        </div>

      </div>

      {confirming && cents !== null && credits !== null && (
        <PlanChangeConfirmDialog
          plan={plan}
          change={{ cents, credits, applyToExisting }}
          onClose={closeConfirm}
          onSaved={reset}
        />
      )}
    </div>
  )
}
