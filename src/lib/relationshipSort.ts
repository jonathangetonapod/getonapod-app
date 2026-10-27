import { decodeFeedText } from '@/lib/feedText'
import { lastActivityAt, needsAttention } from '@/lib/relationshipAttention'
import type { HostRelationshipSummary } from '@/services/hostRelationships'

export type RelationshipSort = 'attention' | 'recent' | 'show' | 'host'

type SortRow = Pick<
  HostRelationshipSummary,
  | 'podcast_name' | 'host_name' | 'derived_state' | 'manual_stage'
  | 'last_contacted_at' | 'last_message_at' | 'last_message_direction'
> & Partial<Pick<HostRelationshipSummary, 'snoozed_until'>>

function activityTime(row: SortRow): number {
  const at = lastActivityAt(row)
  return at ? new Date(at).getTime() : Number.NEGATIVE_INFINITY
}

/** Most recent contact first; rows nobody has written on yet go last. */
function byRecent(left: SortRow, right: SortRow): number {
  return activityTime(right) - activityTime(left)
}

/**
 * Ordering for the host relationship book.
 *
 * The default is the work: rows that need attention first, then the rest,
 * each by most recent contact. Name sorts are for finding one host among a
 * hundred.
 *
 * Unnamed rows sink rather than heading an alphabetical list: a run of them
 * at the top is what makes sorting useless. Sorting never mutates the input.
 */
export function sortRelationships<T extends SortRow>(rows: T[], sort: RelationshipSort, now: Date = new Date()): T[] {
  if (sort === 'attention') {
    const attention = new Map(rows.map((row) => [row, needsAttention(row, now)]))
    return [...rows].sort((left, right) => (
      Number(attention.get(right)) - Number(attention.get(left)) || byRecent(left, right)
    ))
  }
  if (sort === 'recent') return [...rows].sort(byRecent)
  return [...rows].sort((left, right) => {
    // Decoded before comparing, so an escaped "&amp;lpha" files under A rather
    // than under the ampersand it is stored as.
    const leftName = decodeFeedText((sort === 'host' ? left.host_name : left.podcast_name) ?? '').toLowerCase()
    const rightName = decodeFeedText((sort === 'host' ? right.host_name : right.podcast_name) ?? '').toLowerCase()
    if (!leftName) return rightName ? 1 : 0
    if (!rightName) return -1
    return leftName.localeCompare(rightName)
  })
}
