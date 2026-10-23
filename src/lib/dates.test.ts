import { describe, expect, it } from 'vitest'
import { daysFromNow, formatDate, formatRelativeDays } from '@/lib/dates'

const NOW = Date.parse('2026-10-23T12:00:00Z')

describe('formatDate', () => {
  it('writes a calendar date with no time', () => {
    expect(formatDate('2026-08-09T15:30:12Z')).toBe('Aug 9, 2026')
  })

  it('says nothing for a missing or unreadable value', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate('')).toBe('')
    expect(formatDate('not a date')).toBe('')
  })
})

describe('formatRelativeDays', () => {
  it('counts whole days in either direction', () => {
    expect(formatRelativeDays('2026-08-16T12:00:00Z', NOW)).toBe('68 days')
    expect(formatRelativeDays('2026-11-04T12:00:00Z', NOW)).toBe('12 days')
  })

  it('uses the singular for one day and counts today as zero', () => {
    expect(formatRelativeDays('2026-10-22T11:00:00Z', NOW)).toBe('1 day')
    expect(formatRelativeDays('2026-10-23T09:00:00Z', NOW)).toBe('0 days')
  })

  it('says nothing for a missing value', () => {
    expect(formatRelativeDays(null, NOW)).toBe('')
    expect(daysFromNow(undefined, NOW)).toBeNull()
  })
})
