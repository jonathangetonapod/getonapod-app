import { describe, expect, it } from 'vitest'
import { formatLocalDateKey, parseLocalDate } from '@/lib/localDate'

describe('parseLocalDate', () => {
  it('returns local midnight for a date-only string', () => {
    const date = parseLocalDate('2026-03-05')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2026)
    expect(date!.getMonth()).toBe(2)
    expect(date!.getDate()).toBe(5)
    expect(date!.getHours()).toBe(0)
    expect(date!.getMinutes()).toBe(0)
  })

  it('ignores a trailing time component', () => {
    const date = parseLocalDate('2026-03-05T23:30:00.000Z')
    expect(date!.getDate()).toBe(5)
    expect(date!.getHours()).toBe(0)
  })

  it('returns null for bad input', () => {
    expect(parseLocalDate('')).toBeNull()
    expect(parseLocalDate(null)).toBeNull()
    expect(parseLocalDate(undefined)).toBeNull()
    expect(parseLocalDate('March 5')).toBeNull()
    expect(parseLocalDate('2026-02-31')).toBeNull()
  })
})

describe('formatLocalDateKey', () => {
  it('formats local components with zero padding', () => {
    expect(formatLocalDateKey(new Date(2026, 0, 9))).toBe('2026-01-09')
    expect(formatLocalDateKey(new Date(2026, 11, 25, 23, 59))).toBe('2026-12-25')
  })

  it('round-trips with parseLocalDate', () => {
    expect(formatLocalDateKey(parseLocalDate('2026-07-04')!)).toBe('2026-07-04')
  })
})
