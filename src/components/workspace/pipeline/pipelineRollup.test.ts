import { describe, expect, it } from 'vitest'
import type { ClientPodcastSystemItem } from '@/services/clientPodcastSystem'
import {
  actionQueue,
  buildClientRollup,
  daysSince,
  funnelStages,
  isStale,
  kpiCounts,
  setupItems,
  STALE_CLIENT_DAYS,
  type ClientRollup,
} from './pipelineRollup'

const BASE = '/app'

function client(name: string, overrides: Partial<ClientRollup['client']> = {}): ClientRollup['client'] {
  return {
    id: name.toLowerCase(),
    name,
    status: 'active',
    onboarding: { status: 'approved' },
    profile: { ready: true, completed_fields: 6, total_fields: 6 },
    last_activity_at: null,
    ...overrides,
  } as ClientRollup['client']
}

function item(clientName: string, id: string, overrides: Partial<ClientPodcastSystemItem> = {}): ClientPodcastSystemItem {
  return {
    id,
    client: { id: clientName.toLowerCase(), name: clientName },
    podcast: { name: `Show ${id}` },
    stage: 'awaiting_review',
    terminal: false,
    has_conflict: false,
    campaign: null,
    booking: null,
    ...overrides,
  } as ClientPodcastSystemItem
}

const rollupFor = (owner: ClientRollup['client'], items: ClientPodcastSystemItem[]) => buildClientRollup(owner, items, '2026-10-23', BASE)

describe('actionQueue', () => {
  const dallas = client('Dallas', { last_activity_at: '2026-10-01T00:00:00Z' })
  const items = [
    ...Array.from({ length: 352 }, (_value, index) => item('Dallas', `review-${index}`)),
    item('Dallas', 'reply-1', { stage: 'conversation' }),
    item('Dallas', 'reply-2', { stage: 'conversation' }),
    item('Dallas', 'reply-3', { stage: 'conversation' }),
    item('Dallas', 'booked', { stage: 'booked', booking: { prep_sent: false, recording_date: '2026-11-04' } as ClientPodcastSystemItem['booking'] }),
    item('Dallas', 'prepped', { stage: 'booked', booking: { prep_sent: true } as ClientPodcastSystemItem['booking'] }),
    item('Dallas', 'recorded', { stage: 'recorded', booking: { publish_date: null } as ClientPodcastSystemItem['booking'] }),
    item('Dallas', 'bad', { stage: 'outreach', has_conflict: true }),
    item('Dallas', 'ready', { stage: 'ready' }),
  ]

  it('orders issues, recorded, booked, replies, then one review batch per client', () => {
    const queue = actionQueue([rollupFor(dallas, items)])
    expect(queue.map((action) => [action.kind, action.verb])).toEqual([
      ['issue', 'Review 1 record'],
      ['recorded', 'Confirm publish date'],
      ['booked', 'Prep the client'],
      ['conversation', 'Reply to 3 hosts'],
      ['review', 'Open review batch'],
    ])
    expect(queue[4].title).toBe("352 podcasts waiting on Dallas's review")
    // A review batch goes to the client's list, never to one podcast.
    expect(queue[4].target).toEqual({ kind: 'record', tab: 'shortlist', filter: 'not_reviewed' })
    // Several replies are read in the inbox; only the blocker is red.
    expect(queue[3].target).toEqual({ kind: 'href', href: '/app/master-inbox?client=dallas' })
    expect(queue.filter((action) => action.blocking).map((action) => action.kind)).toEqual(['issue'])
  })

  it('makes the Need attention count the queue length, and leaves paused clients out', () => {
    const paused = rollupFor(client('Pat', { status: 'paused' }), [item('Pat', 'p1', { stage: 'conversation' })])
    const rollups = [rollupFor(dallas, items), paused]
    const queue = actionQueue(rollups)
    expect(kpiCounts(rollups, queue).attention).toBe(queue.length)
    expect(queue.some((action) => action.client.name === 'Pat')).toBe(false)
  })

  it('asks for the first podcasts and a submitted intake, and nothing for a quiet client', () => {
    const fresh = rollupFor(client('Fresh', { onboarding: { status: 'submitted' } as ClientRollup['client']['onboarding'] }), [])
    expect(fresh.actions.map((action) => action.verb)).toEqual(['Review onboarding', 'Add podcasts'])
    expect(rollupFor(client('Calm'), [item('Calm', 'x', { stage: 'outreach' })]).actions).toEqual([])
  })
})

describe('funnelStages', () => {
  it('links every count to that client\'s filtered list', () => {
    expect(funnelStages(rollupFor(client('Dallas'), []), BASE).map((stage) => stage.href)).toEqual([
      '/app/clients/dallas?tab=shortlist',
      '/app/clients/dallas?tab=shortlist&filter=not_reviewed',
      '/app/clients/dallas?tab=shortlist&filter=approved',
      '/app/client-campaigns/dallas',
      '/app/master-inbox?client=dallas',
      '/app/clients/dallas?tab=placements',
    ])
  })
})

describe('isStale', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString()

  it('goes stale only past the threshold, and only for an active client', () => {
    expect(isStale(rollupFor(client('A', { last_activity_at: ago(STALE_CLIENT_DAYS) }), []), now)).toBe(false)
    expect(isStale(rollupFor(client('B', { last_activity_at: ago(STALE_CLIENT_DAYS + 1) }), []), now)).toBe(true)
    expect(isStale(rollupFor(client('C', { status: 'churned', last_activity_at: ago(90) }), []), now)).toBe(false)
    expect(isStale(rollupFor(client('D'), []), now)).toBe(false)
    expect(daysSince(ago(80), now)).toBe(80)
  })
})

describe('setupItems', () => {
  const client = {
    name: 'Taylor',
    profile: { ready: false, completed_fields: 2, total_fields: 6 },
    onboarding: { status: 'approved' },
    dashboard_configured: true,
    portal: { enabled: false },
  } as ClientRollup['client']

  it('lists every gap with where it is fixed', () => {
    expect(setupItems(client, true, false).map(({ key, done, tab }) => ({ key, done, tab }))).toEqual([
      { key: 'profile', done: false, tab: 'profile' },
      { key: 'onboarding', done: true, tab: 'intake' },
      { key: 'dashboard', done: true, tab: 'sharing' },
      { key: 'portal', done: false, tab: 'sharing' },
    ])
  })

  it('counts onboarding as done for a client already underway without an intake', () => {
    const underway = { ...client, onboarding: null } as ClientRollup['client']
    expect(setupItems(underway, true, true).find((item) => item.key === 'onboarding')).toMatchObject({ done: true, detail: 'Done outside intake' })
    expect(setupItems(underway, true, false).find((item) => item.key === 'onboarding')).toMatchObject({ done: false, detail: 'Not started' })
  })

  it('leaves onboarding uncounted for someone who cannot see it', () => {
    expect(setupItems(client, false, false).find((item) => item.key === 'onboarding')?.done).toBeNull()
  })
})
