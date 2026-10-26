import { describe, expect, it } from 'vitest'
import { foldActivity } from '@/lib/billingActivity'

const entry = (over: Record<string, unknown>) => ({
  id: 'x',
  entry_type: 'debit',
  amount: -1,
  operation_type: 'podscan_lookup',
  reference_kind: null,
  reference_id: null,
  created_at: '2026-10-20T14:00:00.000Z',
  ...over,
})

describe('foldActivity', () => {
  it('folds a refund into the charge it reverses', () => {
    const rows = foldActivity([
      entry({ id: 'r1', entry_type: 'refund', amount: 1, reference_kind: 'refund_of', reference_id: 'd1' }),
      entry({ id: 'd1' }),
    ])
    expect(rows).toEqual([expect.objectContaining({ label: 'Look up podcast data', amount: 0, note: 'Refunded: the run failed' })])
  })

  it('keeps a successful charge between two refunded ones apart from them', () => {
    const rows = foldActivity([
      entry({ id: 'r2', entry_type: 'refund', amount: 1, reference_kind: 'refund_of', reference_id: 'd2' }),
      entry({ id: 'd2' }),
      entry({ id: 'd3' }),
      entry({ id: 'r1', entry_type: 'refund', amount: 1, reference_kind: 'refund_of', reference_id: 'd1' }),
      entry({ id: 'd1' }),
    ])
    expect(rows.map((row) => [row.amount, row.count])).toEqual([[0, 1], [-1, 1], [0, 1]])
  })

  it('explains a refund whose charge is older than the page fetched', () => {
    const rows = foldActivity([
      entry({ id: 'r1', entry_type: 'refund', amount: 1, reference_kind: 'refund_of', reference_id: 'gone' }),
    ])
    expect(rows[0]).toMatchObject({ label: 'Look up podcast data', note: 'Refunded: the run failed', amount: 1 })
  })

  it('names grants and expiry by what they were', () => {
    const rows = foldActivity([
      entry({ id: 'g1', entry_type: 'grant', amount: 150, operation_type: null, reference_kind: 'allowance_period' }),
      entry({ id: 'g2', entry_type: 'grant', amount: 300, operation_type: null, reference_kind: 'stripe_checkout' }),
      entry({ id: 'e1', entry_type: 'expiry', amount: -20, operation_type: null }),
    ])
    expect(rows.map((row) => row.label)).toEqual(['Monthly credits', 'Credit pack purchased', 'Monthly credits expired'])
  })
})
