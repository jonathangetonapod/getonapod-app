import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { CREDIT_PACKS, packPriceLabel, packSavingsPercent, type CreditPackDisplay } from '@/lib/creditPacks'

/** The balance at which a pack bought with auto-refill ticked is bought again. */
export const DEFAULT_REFILL_THRESHOLD = 50

interface CreditPackPickerProps {
  balance: number
  checkoutPack: string | null
  /** Shown only while no card is saved; once one is, the full settings take over. */
  offerAutoRefill: boolean
  autoRefill: boolean
  onAutoRefillChange: (value: boolean) => void
  onBuy: (pack: CreditPackDisplay['key']) => void
}

export const CreditPackPicker = ({
  balance,
  checkoutPack,
  offerAutoRefill,
  autoRefill,
  onAutoRefillChange,
  onBuy,
}: CreditPackPickerProps) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-base">Buy credits</CardTitle>
      <CardDescription>One-time packs. Purchased credits never expire and are used after your monthly credits.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => {
          const savings = packSavingsPercent(pack)
          return (
            <div key={pack.key} className="flex flex-col rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{pack.note}</p>
                {savings > 0 && (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-900">Save {savings}%</Badge>
                )}
              </div>
              <p className="mt-2 text-2xl font-bold">{pack.credits} <span className="text-sm font-normal text-muted-foreground">credits</span></p>
              <p className="mt-1 text-sm text-muted-foreground">{packPriceLabel(pack.amountCents)} · ${(pack.amountCents / 100 / pack.credits).toFixed(2)}/credit</p>
              <Button
                type="button"
                className="mt-4"
                variant={pack.key === 'growth' ? 'default' : 'outline'}
                disabled={checkoutPack !== null}
                onClick={() => onBuy(pack.key)}
              >
                {checkoutPack === pack.key ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {checkoutPack === pack.key ? 'Opening checkout…' : `Buy for ${packPriceLabel(pack.amountCents)}`}
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                You&rsquo;ll have {(balance + pack.credits).toLocaleString()} credits
              </p>
            </div>
          )
        })}
      </div>

      {/* The same decision as buying by hand, made once. The card is saved at
          this checkout, so the switch can be set before there is one. */}
      {offerAutoRefill && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
          <Checkbox
            id="pack-auto-refill"
            checked={autoRefill}
            disabled={checkoutPack !== null}
            onCheckedChange={(value) => onAutoRefillChange(value === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label htmlFor="pack-auto-refill" className="text-sm font-medium">Auto-refill this pack when I run low</Label>
            <p className="text-xs leading-5 text-muted-foreground">
              Your card is saved at checkout. When your balance drops to {DEFAULT_REFILL_THRESHOLD} credits, we buy the
              same pack again on it without asking, at most once a day. You can set a monthly limit or switch it off
              here afterwards.
            </p>
          </div>
        </div>
      )}
    </CardContent>
  </Card>
)
