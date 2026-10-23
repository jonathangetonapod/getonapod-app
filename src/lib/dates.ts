// The two date shapes the Agencies page uses, and the only code on it that
// formats a date: a calendar date ("Aug 9, 2026") and a span ("68 days").
// Pinned to en-US so every reader sees the same words the copy is written in.

const DAY_MS = 86_400_000

const calendarDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "Aug 9, 2026". Empty string for a missing or unreadable value. */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? calendarDate.format(date) : ''
}

/** Whole days between the date and now, either direction, floored. Null when unreadable. */
export function daysFromNow(value: string | Date | null | undefined, now = Date.now()): number | null {
  const date = toDate(value)
  if (!date) return null
  return Math.floor(Math.abs(date.getTime() - now) / DAY_MS)
}

/** "68 days", "1 day", "0 days". Empty string for a missing or unreadable value. */
export function formatRelativeDays(value: string | Date | null | undefined, now = Date.now()): string {
  const days = daysFromNow(value, now)
  if (days === null) return ''
  return `${days} ${days === 1 ? 'day' : 'days'}`
}
