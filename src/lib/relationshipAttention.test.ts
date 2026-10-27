import { describe, expect, it } from 'vitest'
import {
  FOLLOW_UP_AFTER_DAYS,
  GONE_QUIET_AFTER_DAYS,
  daysQuiet,
  followUpOverdue,
  isSnoozed,
  lastMessageSender,
  needsAttention,
  relationshipMove,
  relationshipStatus,
  relativeTime,
  statusText,
} from '@/lib/relationshipAttention'
import type { HostRelationshipSummary } from '@/services/hostRelationships'

const now = new Date('2026-08-01T12:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

const row = (
  state: HostRelationshipSummary['derived_state'],
  lastContactedAt: string | null,
  extra: Partial<HostRelationshipSummary> = {},
) => ({
  derived_state: state,
  manual_stage: null,
  last_contacted_at: lastContactedAt,
  last_message_at: null,
  last_message_direction: null,
  ...extra,
}) as Pick<
  HostRelationshipSummary,
  'derived_state' | 'manual_stage' | 'last_contacted_at' | 'last_message_at' | 'last_message_direction'
>

describe('relationshipStatus', () => {
  it('gives a live conversation one status with its age, never two badges', () => {
    const status = relationshipStatus(row('in_conversation', daysAgo(3)), now)
    expect(statusText(status)).toBe('In conversation · 3d')
    expect(status.goneQuiet).toBe(false)
    expect(statusText(relationshipStatus(row('in_conversation', now.toISOString()), now))).toBe('In conversation · today')
  })

  it('reads a conversation silent past the line as gone quiet, not as both', () => {
    expect(GONE_QUIET_AFTER_DAYS).toBe(30)
    expect(statusText(relationshipStatus(row('in_conversation', daysAgo(29)), now))).toBe('In conversation · 29d')
    const quiet = relationshipStatus(row('in_conversation', daysAgo(92)), now)
    expect(statusText(quiet)).toBe('Gone quiet · 92d')
    expect(quiet.goneQuiet).toBe(true)
    expect(quiet.stage).toBe('in_conversation')
  })

  it('says how long a pitch has waited for a reply', () => {
    expect(statusText(relationshipStatus(row('pitched', daysAgo(249)), now))).toBe('Pitched · no reply 249d')
    expect(statusText(relationshipStatus(row('pitched', now.toISOString()), now))).toBe('Pitched · today')
    expect(statusText(relationshipStatus(row('pitched', null), now))).toBe('Pitched')
  })

  it('dates from the newest of the last message and the last touch', () => {
    const fresher = row('in_conversation', daysAgo(40), { last_message_at: daysAgo(2) })
    expect(daysQuiet(fresher, now)).toBe(2)
    expect(statusText(relationshipStatus(fresher, now))).toBe('In conversation · 2d')
  })

  it('leaves settled stages unqualified', () => {
    expect(statusText(relationshipStatus(row('booked', daysAgo(10)), now))).toBe('Placed')
    expect(statusText(relationshipStatus(row('declined', daysAgo(10)), now))).toBe('Not a fit')
    expect(statusText(relationshipStatus(row('none', null), now))).toBe('New')
  })

  it('follows a manual stage over activity', () => {
    const overridden = row('replied', daysAgo(10), { manual_stage: 'not_a_fit' })
    expect(statusText(relationshipStatus(overridden, now))).toBe('Not a fit')
  })
})

describe('relationshipMove', () => {
  it('reads the move from who sent the last message', () => {
    expect(relationshipMove(row('in_conversation', daysAgo(1), { last_message_direction: 'inbound' }))).toBe('yours')
    expect(relationshipMove(row('in_conversation', daysAgo(1), { last_message_direction: 'outbound' }))).toBe('theirs')
  })

  it('falls back to outreach state when no message was saved', () => {
    expect(relationshipMove(row('replied', daysAgo(1)))).toBe('yours')
    expect(relationshipMove(row('pitched', daysAgo(1)))).toBe('theirs')
    expect(relationshipMove(row('in_conversation', daysAgo(1)))).toBeNull()
  })

  it('gives settled hosts no move', () => {
    expect(relationshipMove(row('booked', daysAgo(1), { last_message_direction: 'inbound' }))).toBeNull()
    expect(relationshipMove(row('none', null))).toBeNull()
  })
})

describe('followUpOverdue', () => {
  it('is our last message on a pitch or conversation with no reply for a week', () => {
    expect(FOLLOW_UP_AFTER_DAYS).toBe(7)
    expect(followUpOverdue(row('pitched', daysAgo(6)), now)).toBe(false)
    expect(followUpOverdue(row('pitched', daysAgo(7)), now)).toBe(true)
    expect(followUpOverdue(row('pitched', daysAgo(249)), now)).toBe(true)
    expect(followUpOverdue(row('in_conversation', daysAgo(10), {
      last_message_direction: 'outbound', last_message_at: daysAgo(10),
    }), now)).toBe(true)
  })

  it('is never overdue when the host spoke last or nobody is waiting', () => {
    expect(followUpOverdue(row('in_conversation', daysAgo(20), {
      last_message_direction: 'inbound', last_message_at: daysAgo(20),
    }), now)).toBe(false)
    expect(followUpOverdue(row('booked', daysAgo(20)), now)).toBe(false)
    expect(followUpOverdue(row('pitched', null), now)).toBe(false)
  })

  it('waits out a snooze, and resumes when it ends', () => {
    expect(followUpOverdue(row('pitched', daysAgo(30), { snoozed_until: daysAgo(-2) }), now)).toBe(false)
    expect(followUpOverdue(row('pitched', daysAgo(30), { snoozed_until: daysAgo(1) }), now)).toBe(true)
  })
})

describe('isSnoozed', () => {
  it('holds only until the date', () => {
    expect(isSnoozed({ snoozed_until: daysAgo(-1) }, now)).toBe(true)
    expect(isSnoozed({ snoozed_until: daysAgo(1) }, now)).toBe(false)
    expect(isSnoozed({ snoozed_until: null }, now)).toBe(false)
    expect(isSnoozed({ snoozed_until: 'not a date' }, now)).toBe(false)
  })
})

describe('needsAttention', () => {
  it('flags a host waiting on our reply, however recent', () => {
    expect(needsAttention(row('in_conversation', daysAgo(0), {
      last_message_direction: 'inbound', last_message_at: daysAgo(0),
    }), now)).toBe(true)
    expect(needsAttention(row('replied', daysAgo(1)), now)).toBe(true)
  })

  it('counts overdue follow-ups', () => {
    expect(needsAttention(row('pitched', daysAgo(9)), now)).toBe(true)
    expect(needsAttention(row('pitched', daysAgo(2)), now)).toBe(false)
  })

  it('counts a conversation that has gone quiet even when nobody knows who spoke last', () => {
    expect(needsAttention(row('in_conversation', daysAgo(45)), now)).toBe(true)
    expect(needsAttention(row('in_conversation', daysAgo(10)), now)).toBe(false)
  })

  it('leaves settled and snoozed hosts alone', () => {
    expect(needsAttention(row('booked', daysAgo(90), { last_message_direction: 'inbound' }), now)).toBe(false)
    expect(needsAttention(row('declined', daysAgo(90)), now)).toBe(false)
    expect(needsAttention(row('replied', daysAgo(1), { snoozed_until: daysAgo(-7) }), now)).toBe(false)
  })
})

describe('lastMessageSender', () => {
  const sender = (extra: Partial<HostRelationshipSummary>) => lastMessageSender({
    last_message_direction: null,
    host_name: null,
    contact_email: null,
    ...extra,
  })

  it('names the host by first name, and us as You', () => {
    expect(sender({ last_message_direction: 'inbound', host_name: 'Morgan Host' })).toBe('Morgan')
    expect(sender({ last_message_direction: 'outbound', host_name: 'Morgan Host' })).toBe('You')
  })

  it('falls back to the address, and says nothing when the direction is unknown', () => {
    expect(sender({ last_message_direction: 'inbound', contact_email: 'host@example.com' })).toBe('host@example.com')
    expect(sender({ host_name: 'Morgan Host' })).toBeNull()
  })
})

describe('relativeTime', () => {
  it('phrases the age of a message', () => {
    expect(relativeTime(daysAgo(88), now)).toBe('88d ago')
    expect(relativeTime(new Date(now.getTime() - 3 * 3_600_000).toISOString(), now)).toBe('3h ago')
    expect(relativeTime(now.toISOString(), now)).toBe('just now')
    expect(relativeTime(null, now)).toBeNull()
  })
})
