/**
 * The rules a platform admin's credit changes share: the reasons they are
 * filed under, what counts as a valid amount, and how the ledger reads back.
 * The grant and removal forms used to keep their own copies, and the removal
 * took free text where the grant took a list.
 */
import { OPERATION_NAMES } from '@/lib/creditCosts'
import type { CreditLedgerEntry, CreditLedgerType } from '@/services/workspaceStaff'

export type CreditReason =
  | 'customer_support'
  | 'service_recovery'
  | 'trial_bonus'
  | 'contract_adjustment'
  | 'other'

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  customer_support: 'Customer support',
  service_recovery: 'Service recovery',
  trial_bonus: 'Trial or launch bonus',
  contract_adjustment: 'Contract adjustment',
  other: 'Other',
}

export const QUICK_CREDIT_AMOUNTS = [25, 50, 100, 250]
export const MAX_CREDIT_CHANGE = 10_000

export interface ParsedCreditAmount {
  amount: number | null
  /** Null while the field is empty: nothing typed is not a mistake yet. */
  error: string | null
}

/**
 * A whole number from 1 to 10,000, and for a removal no more than the
 * workspace holds. The server refuses both anyway; saying so here stops an
 * admin reviewing a change that cannot happen.
 */
export function parseCreditAmount(value: string, options: { max?: number | null } = {}): ParsedCreditAmount {
  const trimmed = value.trim()
  if (!trimmed) return { amount: null, error: null }
  if (!/^\d+$/u.test(trimmed)) return { amount: null, error: 'Enter a whole number of credits.' }
  const amount = Number(trimmed)
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_CREDIT_CHANGE) {
    return { amount: null, error: 'Enter a whole number from 1 to 10,000.' }
  }
  if (typeof options.max === 'number' && amount > options.max) {
    return {
      amount: null,
      error: options.max <= 0
        ? 'This workspace has no credits to remove.'
        : `Only ${options.max.toLocaleString()} credits are available to remove.`,
    }
  }
  return { amount, error: null }
}

/** The balance once a change lands. Negative deltas are removals. */
export function projectBalance(balance: number, delta: number): number {
  return balance + delta
}

export const LEDGER_TYPE_LABELS: Record<CreditLedgerType, string> = {
  all: 'All',
  grant: 'Grant',
  removal: 'Removal',
  allowance: 'Monthly allowance',
  spend: 'Spend',
  purchase: 'Purchase',
  expiry: 'Expired',
}

const REFERENCE_LABELS: Record<string, string> = {
  allowance_period: 'Monthly allowance',
  enforcement_start: 'Starting balance',
  stripe_checkout: 'Credit pack',
  stripe_auto_refill: 'Automatic top-up',
  stripe_dispute_won: 'Dispute won',
  lot_expiry: 'Credits expired',
  refund: 'Refunded',
}

/** A reason a person can read: a known key by its label, older free text as written. */
export function ledgerReasonLabel(entry: Pick<CreditLedgerEntry, 'reason'>): string {
  const reason = entry.reason?.trim()
  if (!reason) return ''
  if (reason in CREDIT_REASON_LABELS) return CREDIT_REASON_LABELS[reason as CreditReason]
  if (reason in REFERENCE_LABELS) return REFERENCE_LABELS[reason]
  if (reason in OPERATION_NAMES) return OPERATION_NAMES[reason as keyof typeof OPERATION_NAMES]
  // An operation key or older free text. Operation keys read better spaced.
  if (!/^[a-z0-9_]+$/u.test(reason)) return reason
  const spaced = reason.replace(/_/gu, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

const expiryDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "120 expire Nov 30, 80 never expire". Empty when there is nothing to break down. */
export function formatExpiryBreakdown(rows: Array<{ expires_on: string | null; credits: number }> | undefined): string {
  return (rows ?? [])
    .filter((row) => row.credits > 0)
    .map((row) => (row.expires_on
      ? `${row.credits.toLocaleString()} expire ${expiryDay.format(new Date(`${row.expires_on}T00:00:00Z`))}`
      : `${row.credits.toLocaleString()} never expire`))
    .join(', ')
}
