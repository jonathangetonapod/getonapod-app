import { relationshipStage } from '@/lib/relationshipLabels'
import type { HostRelationshipSummary } from '@/services/hostRelationships'

/**
 * Live conversations going quiet, and the ones that already went cold.
 *
 * The relationship book counts conversations that are live, but the count is
 * not the actionable fact; which of them has gone silent is. The banner used
 * to say "no touch in five days" next to a chip reading "quiet 88d", which was
 * true of both and useful for neither: a conversation silent for three months
 * is not going quiet, it is over unless someone revives it.
 *
 * So there are two thresholds. Between them a conversation is going quiet and
 * belongs in the banner, one reply away from saved. Past the second it went
 * cold: it leaves the banner and waits under Needs attention instead.
 */

/**
 * Five days, not the inbox's two. An inbox reply is a person waiting on an
 * answer; a relationship touch is a slower cadence, and flagging every
 * three-day gap would bury the genuinely stalled under the merely unhurried.
 */
export const QUIET_AFTER_DAYS = 5
export const COLD_AFTER_DAYS = 30

const DAY_MS = 86_400_000

export type ConversationAttention = 'quiet' | 'cold'

type AttentionRow = Pick<HostRelationshipSummary, 'derived_state' | 'manual_stage' | 'last_contacted_at'>

/** Whole days since a timestamp, or null when there is nothing to date. */
export function daysSince(value: string | null | undefined, now: Date = new Date()): number | null {
  if (!value) return null
  const at = new Date(value).getTime()
  if (Number.isNaN(at)) return null
  return Math.max(0, Math.floor((now.getTime() - at) / DAY_MS))
}

/** Whether a relationship needs someone, and how badly. */
export function conversationAttention(row: AttentionRow, now: Date = new Date()): ConversationAttention | null {
  if (relationshipStage(row) !== 'in_conversation') return null
  const days = daysSince(row.last_contacted_at, now)
  if (days === null || days < QUIET_AFTER_DAYS) return null
  return days > COLD_AFTER_DAYS ? 'cold' : 'quiet'
}

/** The banner: conversations going quiet, longest silence first. */
export function quietConversations<T extends AttentionRow>(rows: T[], now: Date = new Date()): T[] {
  return rows
    .filter((row) => conversationAttention(row, now) === 'quiet')
    .sort((left, right) => String(left.last_contacted_at).localeCompare(String(right.last_contacted_at)))
}

/**
 * The Needs attention filter: every live conversation past the quiet line,
 * the ones in the banner and the ones that already went cold.
 */
export function needsAttention(row: AttentionRow, now: Date = new Date()): boolean {
  return conversationAttention(row, now) !== null
}

/** "quiet 6d" for a banner item. */
export function describeQuiet(lastContactedAt: string | null, now: Date = new Date()): string | null {
  const days = daysSince(lastContactedAt, now)
  return days !== null && days >= 1 ? `quiet ${days}d` : null
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
