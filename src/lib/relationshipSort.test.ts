import { describe, expect, it } from 'vitest'
import { sortRelationships } from '@/lib/relationshipSort'
import type { HostRelationshipSummary } from '@/services/hostRelationships'

const now = new Date('2026-08-01T12:00:00Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

const row = (podcastName: string | null, extra: Partial<HostRelationshipSummary> = {}) => ({
  podcast_name: podcastName,
  host_name: null as string | null,
  derived_state: 'none' as HostRelationshipSummary['derived_state'],
  manual_stage: null as HostRelationshipSummary['manual_stage'],
  last_contacted_at: null as string | null,
  last_message_at: null as string | null,
  last_message_direction: null as HostRelationshipSummary['last_message_direction'],
  ...extra,
})

describe('sortRelationships', () => {
  it('puts rows that need attention first, then the rest, each by most recent contact', () => {
    const rows = [
      row('Fresh pitch', { derived_state: 'pitched', last_contacted_at: daysAgo(1) }),
      row('Old overdue', { derived_state: 'pitched', last_contacted_at: daysAgo(40) }),
      row('Never contacted'),
      row('Host replied', { derived_state: 'in_conversation', last_message_direction: 'inbound', last_message_at: daysAgo(3) }),
      row('Placed', { derived_state: 'booked', last_contacted_at: daysAgo(0) }),
    ]
    expect(sortRelationships(rows, 'attention', now).map((entry) => entry.podcast_name)).toEqual([
      'Host replied', 'Old overdue', 'Placed', 'Fresh pitch', 'Never contacted',
    ])
  })

  it('keeps a snoozed row out of the attention block', () => {
    const rows = [
      row('Recent', { derived_state: 'booked', last_contacted_at: daysAgo(1) }),
      row('Snoozed overdue', { derived_state: 'pitched', last_contacted_at: daysAgo(40), snoozed_until: daysAgo(-3) }),
    ]
    expect(sortRelationships(rows, 'attention', now).map((entry) => entry.podcast_name))
      .toEqual(['Recent', 'Snoozed overdue'])
  })

  it('orders recent contact by the newest message or touch, undated rows last', () => {
    const rows = [
      row('Undated'),
      row('Touched 5d', { last_contacted_at: daysAgo(5) }),
      row('Message 1d', { last_contacted_at: daysAgo(30), last_message_at: daysAgo(1) }),
    ]
    const sorted = sortRelationships(rows, 'recent', now)
    expect(sorted.map((entry) => entry.podcast_name)).toEqual(['Message 1d', 'Touched 5d', 'Undated'])
    expect(rows[0].podcast_name).toBe('Undated')
  })

  it('orders by show name without mutating the input', () => {
    const rows = [row('Zebra Show'), row('apple show'), row('Middle Show')]
    const sorted = sortRelationships(rows, 'show')
    expect(sorted.map((entry) => entry.podcast_name)).toEqual(['apple show', 'Middle Show', 'Zebra Show'])
    expect(rows[0].podcast_name).toBe('Zebra Show')
  })

  it('orders by host name independently of the show name', () => {
    const rows = [row('Apple Show', { host_name: 'Zoe Host' }), row('Zebra Show', { host_name: 'Adam Host' })]
    expect(sortRelationships(rows, 'host').map((entry) => entry.host_name))
      .toEqual(['Adam Host', 'Zoe Host'])
  })

  it('sinks unnamed rows instead of heading the list with them', () => {
    const rows = [row(null), row('Apple Show'), row(null), row('Zebra Show')]
    expect(sortRelationships(rows, 'show').map((entry) => entry.podcast_name))
      .toEqual(['Apple Show', 'Zebra Show', null, null])
  })

  it('decodes entities so an escaped name sorts where it reads', () => {
    const rows = [row('Bravo Show'), row('&amp;lpha Show')]
    // Sorting the raw string would file this under "&", not "A".
    expect(sortRelationships(rows, 'show')[0].podcast_name).toBe('&amp;lpha Show')
  })
})
