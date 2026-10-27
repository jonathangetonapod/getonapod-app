import { decodeFeedText } from '@/lib/feedText'
import { RELATIONSHIP_STAGE_VIEW, relationshipStage, type RelationshipStage } from '@/lib/relationshipLabels'
import type { HostRelationshipSummary } from '@/services/hostRelationships'

/**
 * What a relationship row says about where things stand, in one badge.
 *
 * A row used to carry its stage badge and, beside it, a "Went cold" badge, so
 * one host read "In conversation" and "Went cold" at once. Now there is one
 * status with a time qualifier ("In conversation · 3d", "Gone quiet · 92d",
 * "Pitched · no reply 249d") and, separately, whose move it is.
 */

/**
 * A live conversation silent this long has gone quiet: it is over unless
 * someone revives it, and it reads that way rather than as a conversation.
 */
export const GONE_QUIET_AFTER_DAYS = 30

const DAY_MS = 86_400_000

type StatusRow = Pick<
  HostRelationshipSummary,
  'derived_state' | 'manual_stage' | 'last_contacted_at' | 'last_message_at' | 'last_message_direction'
>

/** Whole days since a timestamp, or null when there is nothing to date. */
export function daysSince(value: string | null | undefined, now: Date = new Date()): number | null {
  if (!value) return null
  const at = new Date(value).getTime()
  if (Number.isNaN(at)) return null
  return Math.max(0, Math.floor((now.getTime() - at) / DAY_MS))
}

/** When anyone last wrote: the latest saved message or outreach touch, whichever is newer. */
export function lastActivityAt(row: Pick<StatusRow, 'last_contacted_at' | 'last_message_at'>): string | null {
  const times = [row.last_contacted_at, row.last_message_at]
    .filter((value): value is string => Boolean(value) && !Number.isNaN(new Date(value as string).getTime()))
  if (times.length === 0) return null
  return times.reduce((latest, value) => (new Date(value) > new Date(latest) ? value : latest))
}

/** Days since anyone last wrote, or null when the row has no dated activity. */
export function daysQuiet(row: StatusRow, now: Date = new Date()): number | null {
  return daysSince(lastActivityAt(row), now)
}

export type RelationshipMove = 'yours' | 'theirs'

/**
 * Whose move it is, from who sent the last message.
 *
 * Only a live exchange has a move: a host at New, Placed or Not a fit is not
 * waiting on anyone. When no message was saved, outreach state still says who
 * spoke last: a host who replied is waiting on us, a pitch with no reply is
 * waiting on them.
 */
export function relationshipMove(row: StatusRow): RelationshipMove | null {
  const stage = relationshipStage(row)
  if (stage !== 'pitched' && stage !== 'in_conversation') return null
  if (row.last_message_direction === 'inbound') return 'yours'
  if (row.last_message_direction === 'outbound') return 'theirs'
  if (row.derived_state === 'replied') return 'yours'
  if (stage === 'pitched') return 'theirs'
  return null
}

export interface RelationshipStatus {
  stage: RelationshipStage
  /** "In conversation", "Gone quiet", "Pitched". */
  label: string
  /** "3d", "92d", "no reply 249d"; null when there is nothing to date. */
  qualifier: string | null
  goneQuiet: boolean
  className: string
}

const GONE_QUIET_CLASS = 'border-amber-300 bg-amber-50 text-amber-900'

/** The one status a row shows. */
export function relationshipStatus(row: StatusRow, now: Date = new Date()): RelationshipStatus {
  const stage = relationshipStage(row)
  const view = RELATIONSHIP_STAGE_VIEW[stage]
  const days = daysQuiet(row, now)
  if (stage === 'in_conversation') {
    const goneQuiet = days !== null && days >= GONE_QUIET_AFTER_DAYS
    return {
      stage,
      label: goneQuiet ? 'Gone quiet' : view.label,
      qualifier: days === null ? null : days === 0 ? 'today' : `${days}d`,
      goneQuiet,
      className: goneQuiet ? GONE_QUIET_CLASS : view.className,
    }
  }
  if (stage === 'pitched') {
    return {
      stage,
      label: view.label,
      qualifier: days === null ? null : days === 0 ? 'today' : `no reply ${days}d`,
      goneQuiet: false,
      className: view.className,
    }
  }
  return { stage, label: view.label, qualifier: null, goneQuiet: false, className: view.className }
}

/** "In conversation · 3d": the badge text, and the accessible name of the badge. */
export function statusText(status: RelationshipStatus): string {
  return status.qualifier ? `${status.label} · ${status.qualifier}` : status.label
}

/**
 * Who wrote the last message, by name: "You" for us, and for the host their
 * first name, else the show, else the address.
 */
export function lastMessageSender(
  row: Pick<HostRelationshipSummary, 'last_message_direction' | 'host_name' | 'contact_email'>,
): string | null {
  if (row.last_message_direction === 'outbound') return 'You'
  if (row.last_message_direction !== 'inbound') return null
  const host = decodeFeedText(row.host_name ?? '').trim()
  if (host) return host.split(/\s+/u)[0]
  return (row.contact_email ?? '').trim() || 'Host'
}

/** "3d ago", "5h ago" or "just now" next to a message. */
export function relativeTime(value: string | null | undefined, now: Date = new Date()): string | null {
  if (!value) return null
  const at = new Date(value).getTime()
  if (Number.isNaN(at)) return null
  const elapsed = Math.max(0, now.getTime() - at)
  if (elapsed >= DAY_MS) return `${Math.floor(elapsed / DAY_MS)}d ago`
  const hours = Math.floor(elapsed / 3_600_000)
  if (hours >= 1) return `${hours}h ago`
  const minutes = Math.floor(elapsed / 60_000)
  return minutes >= 1 ? `${minutes}m ago` : 'just now'
}

/**
 * Five days, not the inbox's two. A relationship touch is a slower cadence,
 * and flagging every three-day gap would bury the genuinely stalled.
 */
export const QUIET_AFTER_DAYS = 5

/** The Needs attention filter: a live conversation silent past the quiet line. */
export function needsAttention(row: StatusRow, now: Date = new Date()): boolean {
  if (relationshipStage(row) !== 'in_conversation') return false
  const days = daysQuiet(row, now)
  return days !== null && days >= QUIET_AFTER_DAYS
}
