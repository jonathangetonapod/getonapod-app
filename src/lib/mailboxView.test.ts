import { describe, expect, it } from 'vitest'
import type { WorkspaceMailboxAccount } from '@/services/workspaceCampaigns'
import {
  effectiveStatus,
  formatRelativeTime,
  formatWarmup,
  groupMailboxes,
  matchesFilter,
  matchesSearch,
  paginate,
  sendDataPoints,
  sentText,
  sortMailboxes,
  statusLabel,
} from './mailboxView'

const week = (sent: number[]) => sent.map((count, index) => ({ date: `2026-10-${String(index + 10).padStart(2, '0')}`, sent: count }))

function mailbox(overrides: Partial<WorkspaceMailboxAccount> = {}): WorkspaceMailboxAccount {
  return {
    email: 'a@example.com',
    first_name: null,
    last_name: null,
    status: 1,
    status_message: null,
    warmup_status: 1,
    daily_limit: 15,
    sent_today: 3,
    send_history: week([2, 4, 0, 1, 3, 5, 3]),
    warmup_emails: 70,
    warmup_limit: 10,
    health_score: 100,
    tags: [{ id: 't1', label: 'Batch A', description: null }],
    campaigns: [],
    ...overrides,
  }
}

describe('effectiveStatus', () => {
  it('never calls a mailbox with a sending error healthy, whatever its score says', () => {
    expect(effectiveStatus(mailbox({ status: -3, health_score: 100, status_message: '550-5.4.5 Daily user sending limit exceeded' }))).toBe('error')
    expect(effectiveStatus(mailbox({ status: -2, health_score: 100 }))).toBe('error')
  })

  it('treats a connection error or an expired token as disconnected', () => {
    expect(effectiveStatus(mailbox({ status: -1 }))).toBe('disconnected')
    expect(effectiveStatus(mailbox({ status: -3, status_message: "Can't create new access token" }))).toBe('disconnected')
  })

  it('keeps paused and maintenance apart from errors', () => {
    expect(effectiveStatus(mailbox({ status: 2 }))).toBe('paused')
    expect(statusLabel(mailbox({ status: 2 }))).toBe('Paused')
    expect(statusLabel(mailbox({ status: 3 }))).toBe('Maintenance')
  })

  it('calls an active mailbox with warmup on and no outreach sends warming', () => {
    expect(effectiveStatus(mailbox({ send_history: week([0, 0, 0, 0, 0, 0, 0]) }))).toBe('warming')
    expect(effectiveStatus(mailbox())).toBe('healthy')
    expect(effectiveStatus(mailbox({ warmup_status: 0, send_history: week([0, 0, 0, 0, 0, 0, 0]) }))).toBe('healthy')
  })

  it('does not guess warming when the send history failed to load', () => {
    expect(effectiveStatus(mailbox({ send_history: [] }))).toBe('healthy')
  })
})

describe('formatWarmup', () => {
  it('says what each number is', () => {
    expect(formatWarmup(mailbox())).toBe('70 sent · target 10/day')
    expect(formatWarmup(mailbox({ warmup_limit: null }))).toBe('70 sent')
  })

  it('says Not warming instead of a blank over a target', () => {
    expect(formatWarmup(mailbox({ warmup_status: 0, warmup_emails: null }))).toBe('Not warming')
    expect(formatWarmup(mailbox({ status: -3, warmup_emails: null }))).toBe('Not warming')
    expect(formatWarmup(mailbox({ status: 2 }))).toBe('Not warming')
  })

  it('does not invent a zero when warmup is on but analytics did not load', () => {
    expect(formatWarmup(mailbox({ warmup_emails: null }))).toBe('No data yet · target 10/day')
  })
})

describe('filters and search', () => {
  const broken = mailbox({ email: 'broken@x.com', status: -3 })
  const assigned = mailbox({
    email: 'sender@x.com',
    tags: [{ id: 't2', label: 'Solar Q3', description: null }],
    campaigns: [{ campaign_id: 'c', campaign_name: 'C', campaign_status: 'active', client_id: 'k', client_name: 'Dallas Fontaine' }],
  })

  it('needs attention means cannot send', () => {
    expect(matchesFilter(broken, 'attention')).toBe(true)
    expect(matchesFilter(mailbox({ status: 2 }), 'attention')).toBe(false)
    expect(matchesFilter(assigned, 'attention')).toBe(false)
  })

  it('no client means no campaign link', () => {
    expect(matchesFilter(broken, 'unassigned')).toBe(true)
    expect(matchesFilter(assigned, 'unassigned')).toBe(false)
  })

  it('matches email, batch tag and client name', () => {
    expect(matchesSearch(assigned, 'sender@')).toBe(true)
    expect(matchesSearch(assigned, 'solar q3')).toBe(true)
    expect(matchesSearch(assigned, 'fontaine')).toBe(true)
    expect(matchesSearch(assigned, 'nobody')).toBe(false)
  })
})

describe('sortMailboxes', () => {
  it('puts errors first, then disconnected, warming, healthy', () => {
    const sorted = sortMailboxes([
      mailbox({ email: 'healthy@x.com' }),
      mailbox({ email: 'warming@x.com', send_history: week([0, 0, 0, 0, 0, 0, 0]) }),
      mailbox({ email: 'gone@x.com', status: -1 }),
      mailbox({ email: 'error@x.com', status: -3 }),
    ], { key: 'status', direction: 'asc' })
    expect(sorted.map((account) => account.email)).toEqual(['error@x.com', 'gone@x.com', 'warming@x.com', 'healthy@x.com'])
  })

  it('sorts by email in either direction', () => {
    const rows = [mailbox({ email: 'b@x.com' }), mailbox({ email: 'a@x.com' }), mailbox({ email: 'c@x.com' })]
    expect(sortMailboxes(rows, { key: 'email', direction: 'asc' }).map((account) => account.email)).toEqual(['a@x.com', 'b@x.com', 'c@x.com'])
    expect(sortMailboxes(rows, { key: 'email', direction: 'desc' }).map((account) => account.email)).toEqual(['c@x.com', 'b@x.com', 'a@x.com'])
  })

  it('never ranks a mailbox that cannot send by its warmup score, in either direction', () => {
    const rows = [
      mailbox({ email: 'broken@x.com', status: -3, health_score: 100 }),
      mailbox({ email: 'weak@x.com', health_score: 70 }),
      mailbox({ email: 'strong@x.com', health_score: 98 }),
      mailbox({ email: 'unscored@x.com', health_score: null }),
    ]
    expect(sortMailboxes(rows, { key: 'health', direction: 'desc' }).map((account) => account.email))
      .toEqual(['strong@x.com', 'weak@x.com', 'broken@x.com', 'unscored@x.com'])
    expect(sortMailboxes(rows, { key: 'health', direction: 'asc' }).map((account) => account.email))
      .toEqual(['weak@x.com', 'strong@x.com', 'broken@x.com', 'unscored@x.com'])
  })

  it('sorts by sent today descending and keeps unassigned last by client', () => {
    const rows = [mailbox({ email: 'a@x.com', sent_today: 1 }), mailbox({ email: 'b@x.com', sent_today: 9 })]
    expect(sortMailboxes(rows, { key: 'sent', direction: 'desc' })[0].email).toBe('b@x.com')
    const withClient = mailbox({
      email: 'z@x.com',
      campaigns: [{ campaign_id: 'c', campaign_name: 'C', campaign_status: 'active', client_id: 'k', client_name: 'Acme' }],
    })
    expect(sortMailboxes([...rows, withClient], { key: 'client', direction: 'asc' })[0].email).toBe('z@x.com')
    expect(sortMailboxes([...rows, withClient], { key: 'client', direction: 'desc' })[0].email).toBe('z@x.com')
  })
})

describe('groupMailboxes', () => {
  it('groups by humanized error, biggest first, with the clean ones last', () => {
    const groups = groupMailboxes([
      mailbox({ email: '1@x.com' }),
      mailbox({ email: '2@x.com', status: -3, status_message: '550-5.4.5 Daily user sending limit exceeded' }),
      mailbox({ email: '3@x.com', status: -1, status_message: "Can't create new access token" }),
      mailbox({ email: '4@x.com', status: -3, status_message: '550 5.4.5 Daily user sending limit exceeded' }),
    ], 'error')
    expect(groups.map((group) => [group.label, group.accounts.length])).toEqual([
      ['Gmail daily limit', 2],
      ['Reconnect needed', 1],
      ['No errors', 1],
    ])
  })

  it('groups by batch tag and by client', () => {
    expect(groupMailboxes([mailbox(), mailbox({ tags: [] })], 'batch').map((group) => group.label)).toEqual(['Batch A', 'No batch tag'])
    expect(groupMailboxes([mailbox()], 'client').map((group) => group.label)).toEqual(['Unassigned'])
  })
})

describe('helpers', () => {
  it('states sends as X of Y, and never "No data of Y"', () => {
    expect(sentText(mailbox({ sent_today: 3, daily_limit: 20 }))).toBe('3 of 20')
    expect(sentText(mailbox({ sent_today: null, daily_limit: 20 }))).toBe('No data, limit 20')
    expect(sentText(mailbox({ sent_today: null, daily_limit: null }))).toBe('No data')
  })

  it('counts only days with sends as sparkline data', () => {
    expect(sendDataPoints(mailbox({ send_history: week([0, 0, 0, 0, 0, 0, 0]) }))).toBe(0)
    expect(sendDataPoints(mailbox())).toBe(6)
  })

  it('clamps the page into range', () => {
    expect(paginate([1, 2, 3, 4, 5], 9, 2)).toEqual({ items: [5], page: 3, pageCount: 3 })
    expect(paginate([], 1, 50)).toEqual({ items: [], page: 1, pageCount: 1 })
  })

  it('formats sync time relative to now', () => {
    const now = Date.parse('2026-10-23T12:00:00Z')
    expect(formatRelativeTime('2026-10-23T11:48:00Z', now)).toBe('12 min ago')
    expect(formatRelativeTime('2026-10-23T11:59:40Z', now)).toBe('just now')
    expect(formatRelativeTime('2026-10-23T09:00:00Z', now)).toBe('3 hr ago')
    expect(formatRelativeTime('not a date', now)).toBeNull()
  })
})
