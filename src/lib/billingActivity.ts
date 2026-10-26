import { OPERATION_NAMES } from '@/lib/creditCosts'
import type { BillingActivityEntry } from '@/services/workspaceStaff'

// One name per operation, shared with every button that quotes a price, so
// the usage table and the ledger call a thing what the button called it.
export const operationName = (type: string): string =>
  (OPERATION_NAMES as Record<string, string>)[type] ?? (type === 'other' ? OPERATION_NAMES.other : type)

/**
 * "Nov 1, 2026", or null when there is no date to show. In UTC, because
 * allowances and expiries fall at UTC midnight: local time put the Nov 1
 * refill on Oct 31 for anyone west of Greenwich.
 */
export const knownDate = (value: string | null | undefined): string | null => (
  value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
    : null
)

export interface ActivityRow {
  key: string
  label: string
  /** Why the row reads as it does, when the label alone would not say. */
  note: string | null
  /** Net credits; 0 for a charge that was refunded. */
  amount: number
  /** How many ledger charges the row stands for (folded refund pairs). */
  count: number
  createdAt: string
}

const GRANT_LABELS: Record<string, string> = {
  allowance_period: 'Monthly credits',
  stripe_checkout: 'Credit pack purchased',
  stripe_auto_refill: 'Automatic top-up',
  stripe_dispute_won: 'Dispute won, credits restored',
}

const ADJUSTMENT_LABELS: Record<string, string> = {
  stripe_refund: 'Purchase refunded',
  stripe_dispute: 'Payment disputed',
}

function entryLabel(entry: BillingActivityEntry): string {
  const kind = entry.reference_kind ?? ''
  switch (entry.entry_type) {
    case 'grant':
      return GRANT_LABELS[kind] ?? 'Credits added'
    case 'expiry':
      return 'Monthly credits expired'
    case 'adjustment':
      return ADJUSTMENT_LABELS[kind] ?? 'Adjustment'
    case 'refund':
      return entry.operation_type ? operationName(entry.operation_type) : 'Refund'
    default:
      return entry.operation_type ? operationName(entry.operation_type) : entry.entry_type
  }
}

/**
 * The ledger, as something a person can read.
 *
 * A run that fails is charged and then refunded, and the raw ledger showed
 * those as two unexplained rows, +1 and −1, over and over. Each refund is
 * folded into the charge it reverses, and a run of the same refunded
 * operation is collapsed into one row with a count. Entries arrive newest
 * first and stay that way.
 */
export function foldActivity(entries: BillingActivityEntry[]): ActivityRow[] {
  const refundedDebits = new Set(
    entries
      .filter((entry) => entry.entry_type === 'refund' && entry.reference_id)
      .map((entry) => entry.reference_id as string),
  )
  const debitIds = new Set(entries.filter((entry) => entry.entry_type === 'debit').map((entry) => entry.id))

  const rows: ActivityRow[] = []
  for (const entry of entries) {
    // Shown on its charge instead.
    if (entry.entry_type === 'refund' && entry.reference_id && debitIds.has(entry.reference_id)) continue

    if (entry.entry_type === 'debit' && refundedDebits.has(entry.id)) {
      const label = entryLabel(entry)
      const previous = rows[rows.length - 1]
      if (previous && previous.amount === 0 && previous.note && previous.label === label) {
        previous.count += 1
        previous.note = `Refunded: ${previous.count} runs failed`
        continue
      }
      rows.push({ key: entry.id, label, note: 'Refunded: the run failed', amount: 0, count: 1, createdAt: entry.created_at })
      continue
    }

    rows.push({
      key: entry.id,
      label: entryLabel(entry),
      // The charge itself is older than the page fetched, but the refund
      // still says what it was for.
      note: entry.entry_type === 'refund' ? 'Refunded: the run failed' : null,
      amount: entry.amount,
      count: 1,
      createdAt: entry.created_at,
    })
  }
  return rows
}
