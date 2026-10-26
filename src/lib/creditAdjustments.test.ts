import { describe, expect, it } from 'vitest'
import { formatExpiryBreakdown, ledgerReasonLabel, parseCreditAmount, projectBalance } from '@/lib/creditAdjustments'

describe('parseCreditAmount', () => {
  it('treats an empty field as nothing yet, not a mistake', () => {
    expect(parseCreditAmount('')).toEqual({ amount: null, error: null })
    expect(parseCreditAmount('   ')).toEqual({ amount: null, error: null })
  })

  it('accepts whole numbers from 1 to 10,000 only', () => {
    expect(parseCreditAmount('1').amount).toBe(1)
    expect(parseCreditAmount(' 250 ').amount).toBe(250)
    expect(parseCreditAmount('10000').amount).toBe(10_000)
    expect(parseCreditAmount('0').error).toMatch(/1 to 10,000/u)
    expect(parseCreditAmount('10001').error).toMatch(/1 to 10,000/u)
    for (const value of ['1e3', '12abc', '-5', '2.5']) {
      expect(parseCreditAmount(value).amount).toBeNull()
    }
  })

  // A removal is capped at what the workspace holds.
  it('caps at the balance when one is given', () => {
    expect(parseCreditAmount('200', { max: 200 }).amount).toBe(200)
    expect(parseCreditAmount('201', { max: 200 })).toEqual({
      amount: null,
      error: 'Only 200 credits are available to remove.',
    })
    expect(parseCreditAmount('1', { max: 0 }).error).toBe('This workspace has no credits to remove.')
    // An unknown balance does not cap.
    expect(parseCreditAmount('9000', { max: null }).amount).toBe(9000)
  })
})

describe('projectBalance', () => {
  it('adds a grant and takes a removal', () => {
    expect(projectBalance(200, 100)).toBe(300)
    expect(projectBalance(200, -200)).toBe(0)
  })
})

describe('ledgerReasonLabel', () => {
  it('names reason keys, references and operations, and keeps older free text', () => {
    expect(ledgerReasonLabel({ reason: 'customer_support' })).toBe('Customer support')
    expect(ledgerReasonLabel({ reason: 'allowance_period' })).toBe('Monthly allowance')
    expect(ledgerReasonLabel({ reason: 'research_run' })).toBe('Research a podcast')
    expect(ledgerReasonLabel({ reason: 'some_new_thing' })).toBe('Some new thing')
    expect(ledgerReasonLabel({ reason: 'Duplicate onboarding grant' })).toBe('Duplicate onboarding grant')
    expect(ledgerReasonLabel({ reason: null })).toBe('')
  })
})

describe('formatExpiryBreakdown', () => {
  it('reads soonest first, then what never expires', () => {
    expect(formatExpiryBreakdown([
      { expires_on: '2026-11-30', credits: 120 },
      { expires_on: null, credits: 80 },
    ])).toBe('120 expire Nov 30, 80 never expire')
  })

  it('says nothing when there is nothing to break down', () => {
    expect(formatExpiryBreakdown([])).toBe('')
    expect(formatExpiryBreakdown(undefined)).toBe('')
  })
})
