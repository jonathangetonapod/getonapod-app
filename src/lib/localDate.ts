// Postgres DATE columns arrive as 'YYYY-MM-DD'. `new Date('YYYY-MM-DD')` parses
// that as UTC midnight, which is the previous evening anywhere west of UTC, so
// these helpers keep date-only values in local time in both directions.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/

// Local midnight for a 'YYYY-MM-DD' string (a trailing time part is ignored).
// Returns null for anything that is not a real calendar date.
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null
  const match = DATE_ONLY.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  // Reject rolled-over dates such as 2026-02-31.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }
  return date
}

// 'YYYY-MM-DD' from the local calendar components, the inverse of parseLocalDate.
export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
