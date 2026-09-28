/**
 * When a host is next due to hear from us.
 *
 * Instantly has no forward-looking field. Every timestamp on a lead points
 * backwards — last contact, last open, last reply — so "when does the next
 * email go out" is arithmetic done here, never a fact read from the provider.
 *
 * That shapes what this is allowed to claim. It reports the earliest the next
 * email could go, not when it will: a daily limit, an account limit, a paused
 * campaign or bounce protection can all hold it, and the provider reports those
 * separately through not_sending_status. Callers must present the result as an
 * estimate, which is why every reason below reads as one.
 */

import { clockZoneFor } from '@/lib/instantlyTimezones'

export interface NextSendInputs {
  /** Provider lead status: 1 active, 2 paused, 3 completed, negatives ended. */
  leadStatus: number | null
  /** Provider campaign status: 1 is the only one that sends. */
  campaignStatus: number | null
  /** When an email last went out. Null means none has. */
  lastContactAt: string | null
  /** Days the campaign may send, indexed as Instantly does: 0 is Sunday. */
  sendDays: number[]
  /** 24h "HH:MM" in the campaign's timezone. */
  windowStart: string
  timezone: string
  /** Days before the first follow-up, which is the shortest possible gap. */
  followUpOneDelayDays: number
}

export type NextSendProjection =
  /**
   * Nothing further will be sent, and the reason is settled.
   *
   * `summary` is for a table cell and `reason` for anywhere with room. A column
   * is scanned down, not read across, so a sentence in every row buries the one
   * row that differs.
   */
  | { kind: 'none'; summary: string; reason: string }
  /** Held by something an operator can change. */
  | { kind: 'held'; summary: string; reason: string }
  /** The earliest it could go out. Never a promise that it will. */
  | { kind: 'due'; at: Date; approximate: true }

/** Minutes into the day, from "HH:MM". Falls back to 09:00. */
function windowMinutes(value: string): number {
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value)
  if (!match) return 9 * 60
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * The weekday a moment falls on in the campaign's timezone, not the viewer's.
 * A campaign sending in Detroit does not change its schedule because the person
 * reading the page is in Bogota.
 */
function weekdayInZone(date: Date, timezone: string): number {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date)
    const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
    return index >= 0 ? index : date.getUTCDay()
  } catch {
    return date.getUTCDay()
  }
}

/** The zone's clock at an instant, as if it were UTC; null when the zone is unknown. */
function zoneClockAsUtc(date: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(date)
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value)
    const value = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'))
    return Number.isNaN(value) ? null : value
  } catch {
    return null
  }
}

/** Minutes the zone is ahead of UTC at this instant. */
function zoneOffsetMinutes(date: Date, timezone: string): number | null {
  const clock = zoneClockAsUtc(date, timezone)
  if (clock === null) return null
  // The formatted clock drops milliseconds; rounding absorbs them.
  return Math.round((clock - date.getTime()) / 60_000)
}

/**
 * The instant the window opens on the zone's calendar day that `candidate`
 * falls on. The weekday was chosen on that calendar, so the window has to be
 * placed on it too: a 09:00 window in Melbourne is the previous UTC evening,
 * and anchoring to UTC midnight lands the send on the wrong day.
 */
function windowStartInZone(candidate: Date, timezone: string, minutes: number): Date {
  const clock = zoneClockAsUtc(candidate, timezone)
  const offset = zoneOffsetMinutes(candidate, timezone)
  if (clock === null || offset === null) {
    const midnight = new Date(candidate)
    midnight.setUTCHours(0, 0, 0, 0)
    return new Date(midnight.getTime() + minutes * 60_000)
  }
  const wall = new Date(clock)
  wall.setUTCHours(0, 0, 0, 0)
  const wallAsUtc = wall.getTime() + minutes * 60_000
  let guess = wallAsUtc - offset * 60_000
  // The offset can change between the candidate and the window on a DST
  // switch day; re-reading it at the guess corrects that in one step.
  const offsetAtGuess = zoneOffsetMinutes(new Date(guess), timezone)
  if (offsetAtGuess !== null && offsetAtGuess !== offset) guess = wallAsUtc - offsetAtGuess * 60_000
  return new Date(guess)
}

export function projectNextSend(input: NextSendInputs, now: Date = new Date()): NextSendProjection {
  if (input.leadStatus === 3) return { kind: 'none', summary: 'Sequence finished', reason: 'The sequence has finished for this host.' }
  if (input.leadStatus === -1) return { kind: 'none', summary: 'Bounced', reason: 'The address bounced, so nothing further will be sent.' }
  if (input.leadStatus === -2) return { kind: 'none', summary: 'Unsubscribed', reason: 'The host unsubscribed, so nothing further will be sent.' }
  if (input.leadStatus === -3) return { kind: 'none', summary: 'Skipped', reason: 'Instantly skipped this lead, so nothing is queued.' }
  if (input.leadStatus === 2) return { kind: 'held', summary: 'Lead paused', reason: 'This lead is paused in Instantly.' }
  // Launch always records a status, so null on an emailed target means the
  // per-lead check found it deleted upstream — projecting a date for it was
  // promising an email that will never send.
  if (input.leadStatus === null) return { kind: 'none', summary: 'Not in Instantly', reason: 'This lead no longer exists in the Instantly campaign.' }
  if (input.campaignStatus !== 1) return { kind: 'held', summary: 'Campaign not started', reason: 'The campaign is not sending, so nothing goes out until it is started.' }
  if (!input.sendDays.length) return { kind: 'held', summary: 'No sending days', reason: 'The campaign has no sending days selected.' }

  // Never contacted: the next open window is the first email, and that one is
  // not a guess about which step comes next.
  const earliest = input.lastContactAt
    ? new Date(new Date(input.lastContactAt).getTime() + input.followUpOneDelayDays * 86_400_000)
    : now
  if (Number.isNaN(earliest.getTime())) return { kind: 'held', summary: 'Unknown', reason: 'The last send time could not be read.' }

  const from = earliest.getTime() > now.getTime() ? earliest : now
  const days = new Set(input.sendDays)
  // Instantly's Pacific entry is America/Dawson, which the IANA rules now
  // keep on a different clock; the campaign means Pacific.
  const timezone = clockZoneFor(input.timezone)
  // Walk forward to the first day the campaign may send on. Two weeks is past
  // any weekly schedule; beyond that the day set is empty, handled above.
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(from.getTime() + offset * 86_400_000)
    if (!days.has(weekdayInZone(candidate, timezone))) continue
    if (offset === 0) return { kind: 'due', at: from, approximate: true }
    // A later day opens at the start of the window rather than at this hour.
    return {
      kind: 'due',
      at: windowStartInZone(candidate, timezone, windowMinutes(input.windowStart)),
      approximate: true,
    }
  }
  return { kind: 'held', summary: 'No sending day soon', reason: 'No sending day falls within the next two weeks.' }
}

/** A phrase for a table cell. Always reads as an estimate. */
export function describeNextSend(projection: NextSendProjection): string {
  if (projection.kind === 'none' || projection.kind === 'held') return projection.summary
  const when = projection.at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `Not before ${when}`
}

/** The whole explanation, for a tooltip or anywhere with room for a sentence. */
export function explainNextSend(projection: NextSendProjection): string {
  if (projection.kind === 'none' || projection.kind === 'held') return projection.reason
  const when = projection.at.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  return `The earliest this host could next be emailed is ${when}. A daily limit, a paused campaign or a sending account at its own limit can each push it later.`
}
