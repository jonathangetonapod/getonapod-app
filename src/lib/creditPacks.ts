/**
 * The credit packs the checkout actually charges, for display in the UI.
 *
 * The authoritative source is supabase/functions/_shared/creditPacks.ts (the
 * server prices from it and grants from the session metadata). This is the ONE
 * frontend copy — WorkspaceBilling and the auto-refill card both read it, so a
 * displayed price can't drift between screens. scripts/test-credit-packs-sync
 * pins these values to the server module, so it also can't drift from the
 * price that is charged.
 */
export interface CreditPackDisplay {
  key: 'starter' | 'growth' | 'scale'
  credits: number
  amountCents: number
  /** Short marketing note shown on the billing card. */
  note: string
}

export const CREDIT_PACKS: CreditPackDisplay[] = [
  { key: 'starter', credits: 100, amountCents: 2_900, note: 'Top-up' },
  { key: 'growth', credits: 300, amountCents: 6_900, note: 'Most popular' },
  { key: 'scale', credits: 800, amountCents: 14_900, note: 'Best value' },
]

/** "$29" or "$14.90" — whole dollars drop the cents. */
export function packPriceLabel(amountCents: number): string {
  const dollars = amountCents / 100
  return `$${dollars.toLocaleString(undefined, {
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export const creditPackByCredits = (credits: number): CreditPackDisplay | undefined =>
  CREDIT_PACKS.find((pack) => pack.credits === credits)

/**
 * How much cheaper per credit a pack is than the smallest one, rounded down so
 * the badge never claims more than the price delivers. 0 for the base pack.
 */
export function packSavingsPercent(pack: CreditPackDisplay): number {
  const base = CREDIT_PACKS[0]
  const baseRate = base.amountCents / base.credits
  const rate = pack.amountCents / pack.credits
  return Math.max(0, Math.floor((1 - rate / baseRate) * 100))
}
