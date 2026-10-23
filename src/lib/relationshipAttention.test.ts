import { describe, expect, it } from 'vitest'
import {
  COLD_AFTER_DAYS,
  QUIET_AFTER_DAYS,
  conversationAttention,
  describeQuiet,
  needsAttention,
  quietConversations,
  relativeTime,
} from '@/lib/relationshipAttention'
import type { HostRelationshipSummary } from '@/services/hostRelationships'

const now = new Date('2026-08-01T12:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

const row = (
  id: string,
  state: HostRelationshipSummary['derived_state'],
  lastContactedAt: string | null,
  manualStage: HostRelationshipSummary['manual_stage'] = null,
) => ({ podcast_id: id, derived_state: state, manual_stage: manualStage, last_contacted_at: lastContactedAt })

describe('thresholds', () => {
  it('goes quiet at five days and cold past thirty', () => {
    expect(QUIET_AFTER_DAYS).toBe(5)
    expect(COLD_AFTER_DAYS).toBe(30)
  })

  it('places each conversation on the right side of both lines', () => {
    expect(conversationAttention(row('a', 'in_conversation', daysAgo(4)), now)).toBeNull()
    expect(conversationAttention(row('b', 'in_conversation', daysAgo(5)), now)).toBe('quiet')
    expect(conversationAttention(row('c', 'in_conversation', daysAgo(30)), now)).toBe('quiet')
    expect(conversationAttention(row('d', 'in_conversation', daysAgo(31)), now)).toBe('cold')
    expect(conversationAttention(row('e', 'in_conversation', daysAgo(88)), now)).toBe('cold')
  })

  it('only watches live conversations', () => {
    expect(conversationAttention(row('booked', 'booked', daysAgo(10)), now)).toBeNull()
    expect(conversationAttention(row('declined', 'declined', daysAgo(10)), now)).toBeNull()
    // A host someone marked Not a fit is no longer a conversation to save.
    expect(conversationAttention(row('overridden', 'replied', daysAgo(10), 'not_a_fit'), now)).toBeNull()
    // A host replied: the stage is In conversation even though the raw state says replied.
    expect(conversationAttention(row('replied', 'replied', daysAgo(10)), now)).toBe('quiet')
  })

  it('never flags a row it cannot date', () => {
    expect(conversationAttention(row('undated', 'in_conversation', null), now)).toBeNull()
    expect(conversationAttention(row('garbage', 'in_conversation', 'not a date'), now)).toBeNull()
  })
})

describe('quietConversations', () => {
  it('lists only the conversations going quiet, longest silence first', () => {
    const rows = quietConversations([
      row('quiet-6d', 'in_conversation', daysAgo(6)),
      row('quiet-12d', 'in_conversation', daysAgo(12)),
      row('cold-88d', 'in_conversation', daysAgo(88)),
      row('active', 'in_conversation', daysAgo(1)),
    ], now)

    expect(rows.map((item) => item.podcast_id)).toEqual(['quiet-12d', 'quiet-6d'])
  })
})

describe('needsAttention', () => {
  it('holds both the quiet and the cold', () => {
    expect(needsAttention(row('quiet', 'in_conversation', daysAgo(6)), now)).toBe(true)
    expect(needsAttention(row('cold', 'in_conversation', daysAgo(88)), now)).toBe(true)
    expect(needsAttention(row('fresh', 'in_conversation', daysAgo(1)), now)).toBe(false)
  })
})

describe('time phrasing', () => {
  it('phrases the silence and the age of a message', () => {
    expect(describeQuiet(daysAgo(6), now)).toBe('quiet 6d')
    expect(describeQuiet(null, now)).toBeNull()
    expect(relativeTime(daysAgo(88), now)).toBe('88d ago')
    expect(relativeTime(new Date(now.getTime() - 3 * 3_600_000).toISOString(), now)).toBe('3h ago')
    expect(relativeTime(now.toISOString(), now)).toBe('just now')
    expect(relativeTime(null, now)).toBeNull()
  })
})
