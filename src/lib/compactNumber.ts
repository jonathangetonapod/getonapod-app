/**
 * "12.4K" for a listener count, or null when there is no number worth showing.
 *
 * Three portal surfaces formatted audience figures with their own copy of this
 * and could have drifted apart; a client sees the same show on all three.
 */
export function compactNumber(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
