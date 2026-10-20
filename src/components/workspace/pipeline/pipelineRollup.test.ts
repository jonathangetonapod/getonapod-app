import { describe, expect, it } from 'vitest'
import type { ClientPodcastSystemItem } from '@/services/clientPodcastSystem'
import {
  actionQueue,
  actionUrgency,
  bottleneckIndex,
  daysSince,
  QUIET_CLIENT_DAYS,
  quietLevel,
  relativeDays,
  setupItems,
  type ClientRollup,
  type FunnelStage,
} from './pipelineRollup'

function stages(...counts: number[]): FunnelStage[] {
  return counts.map((count, index) => ({ label: `Stage ${index}`, count }))
}

function rollup(
  name: string,
  overrides: Partial<ClientRollup['nextAction']> & { status?: string; lastActivityAt?: string | null; items?: Partial<ClientPodcastSystemItem>[] } = {},
): ClientRollup {
  const { status = 'active', lastActivityAt = null, items = [], ...nextAction } = overrides
  return {
    client: { id: name, name, status } as ClientRollup['client'],
    items: items as ClientPodcastSystemItem[],
    awaitingReview: 0,
    preparation: 0,
    activeOutreach: 0,
    conversations: 0,
    placements: 0,
    published: 0,
    upcomingRecordings: 0,
    needsAttentionItems: [],
    needsAttention: true,
    nextAction: { label: 'Do the work', detail: '', tone: 'work', target: null, ...nextAction },
    lastActivityAt,
  }
}

describe('bottleneckIndex', () => {
  it('points at the stage that falls furthest below the one before it', () => {
    // Podcasts, To review, Approved, Outreach, Replies, Placements
    expect(bottleneckIndex(stages(400, 352, 7, 5, 1, 0))).toBe(2)
  })

  it('never blames To review for being smaller than the total', () => {
    expect(bottleneckIndex(stages(50, 0, 0, 0, 0, 0))).toBeNull()
  })

  it('flags nothing when no stage drops', () => {
    expect(bottleneckIndex(stages(3, 0, 1, 1, 1, 1))).toBeNull()
  })
})

describe('actionQueue', () => {
  it('puts blocking work first, then the longest-untouched client, and leaves out clear and inactive clients', () => {
    const conflict = rollup('Conflict', {
      tone: 'urgent',
      target: { kind: 'item', itemId: 'bad' },
      lastActivityAt: '2026-10-19T00:00:00Z',
      items: [{ id: 'bad', has_conflict: true, campaign: null }],
    })
    const reply = rollup('Reply', { tone: 'urgent', target: { kind: 'item', itemId: 'ok' }, items: [{ id: 'ok', has_conflict: false, campaign: null }] })
    const staleWork = rollup('Stale', { lastActivityAt: '2026-08-01T00:00:00Z' })
    const freshWork = rollup('Fresh', { lastActivityAt: '2026-10-01T00:00:00Z' })
    const clear = rollup('Clear', { tone: 'clear' })
    const churned = rollup('Churned', { status: 'churned' })

    expect(actionUrgency(conflict)).toBe('blocking')
    expect(actionUrgency(reply)).toBe('soon')
    expect(actionUrgency(freshWork)).toBe('routine')
    expect(actionQueue([freshWork, clear, staleWork, churned, reply, conflict]).map((entry) => entry.client.name))
      .toEqual(['Conflict', 'Reply', 'Stale', 'Fresh'])
  })
})

describe('quietLevel', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString()

  it('turns amber after the warn threshold and red after the alert threshold', () => {
    const active = rollup('Active')
    expect(quietLevel(active, daysSince(ago(QUIET_CLIENT_DAYS.warn), now))).toBe('recent')
    expect(quietLevel(active, daysSince(ago(QUIET_CLIENT_DAYS.warn + 1), now))).toBe('warn')
    expect(quietLevel(active, daysSince(ago(QUIET_CLIENT_DAYS.alert + 1), now))).toBe('alert')
  })

  it('never flags a client who is not active', () => {
    expect(quietLevel(rollup('Gone', { status: 'churned' }), 90)).toBe('recent')
  })

  it('reads as relative days', () => {
    expect(relativeDays(null)).toBe('No activity yet')
    expect(relativeDays(0)).toBe('Today')
    expect(relativeDays(1)).toBe('Yesterday')
    expect(relativeDays(72)).toBe('72 days ago')
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
    expect(setupItems(client, true).map(({ key, done, tab }) => ({ key, done, tab }))).toEqual([
      { key: 'profile', done: false, tab: 'profile' },
      { key: 'onboarding', done: true, tab: 'intake' },
      { key: 'dashboard', done: true, tab: 'sharing' },
      { key: 'portal', done: false, tab: 'sharing' },
    ])
  })

  it('leaves onboarding uncounted for someone who cannot see it', () => {
    expect(setupItems(client, false).find((item) => item.key === 'onboarding')?.done).toBeNull()
  })
})
