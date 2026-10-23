import { describe, expect, it } from 'vitest'

import type { WorkspaceProspect } from '@/services/prospectDashboards'

import {
  compareProspects,
  engagementText,
  findDuplicateProspect,
  missingItems,
  prospectFilterCounts,
  prospectMatchesFilter,
  prospectStage,
  relativeTime,
} from './prospectStage'

const NOW = Date.parse('2026-10-23T12:00:00.000Z')

function prospect(id: string, overrides: Partial<WorkspaceProspect> = {}, readiness: Partial<WorkspaceProspect['readiness']> = {}): WorkspaceProspect {
  return {
    id,
    workspace_id: 'w',
    slug: id,
    prospect_name: `Prospect ${id}`,
    first_name: null,
    prospect_email: null,
    prospect_company: null,
    prospect_title: 'Founder',
    prospect_bio: null,
    prospect_image_url: null,
    prospect_linkedin_url: null,
    prospect_website: null,
    prospect_industry: null,
    prospect_expertise: null,
    prospect_topics: null,
    prospect_target_audience: null,
    lifecycle_status: 'draft',
    build_error: null,
    build_started_at: null,
    build_completed_at: null,
    published_at: null,
    pending_review_at: null,
    sent_at: null,
    first_engaged_at: null,
    converted_at: null,
    cta_type: 'reply',
    cta_label: 'Reply',
    cta_url: null,
    show_pricing_section: false,
    is_active: true,
    content_ready: false,
    view_count: 0,
    last_viewed_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    readiness: {
      profile_ready: true,
      visible_count: 12,
      analyzed_count: 12,
      featured_count: 5,
      cta_ready: true,
      publishable: true,
      ...readiness,
    },
    ...overrides,
  }
}

const live = (id: string, views: number, overrides: Partial<WorkspaceProspect> = {}) => prospect(id, {
  published_at: '2026-10-02T00:00:00.000Z',
  // The server turns 'ready' into 'viewed' on a view. Stage must not follow it.
  lifecycle_status: views > 0 ? 'viewed' : 'ready',
  view_count: views,
  last_viewed_at: views > 0 ? '2026-10-21T12:00:00.000Z' : null,
  ...overrides,
})

const draft = (id: string) => prospect(id, { prospect_title: null }, { profile_ready: false, visible_count: 0, analyzed_count: 0, publishable: false })

describe('prospectStage', () => {
  it('keeps a viewed prospect live', () => {
    expect(prospectStage(live('a', 3))).toBe('live')
  })

  it('puts a publishable, unpublished prospect in review and anything less in draft', () => {
    expect(prospectStage(prospect('a'))).toBe('needs_review')
    expect(prospectStage(draft('b'))).toBe('draft')
  })
})

describe('prospectFilterCounts', () => {
  const prospects = [draft('d1'), draft('d2'), prospect('r1'), live('l1', 0), live('l2', 5), live('l3', 1)]

  it('splits the list into buckets that do not overlap and sum to All', () => {
    const counts = prospectFilterCounts(prospects)
    expect(counts).toMatchObject({ all: 6, draft: 2, needs_review: 1, live_not_viewed: 1, live_viewed: 2, live: 3 })
    expect(counts.draft + counts.needs_review + counts.live_not_viewed + counts.live_viewed).toBe(counts.all)
  })

  it('puts every prospect in exactly one bucket', () => {
    for (const item of prospects) {
      const matches = (['draft', 'needs_review', 'live_not_viewed', 'live_viewed'] as const)
        .filter((filter) => prospectMatchesFilter(item, filter))
      expect(matches).toHaveLength(1)
    }
  })
})

describe('outcome filters', () => {
  const prospects = [
    draft('d1'),
    live('booked', 2, { outcome: 'call_booked', outcome_at: '2026-10-20T00:00:00.000Z' }),
    live('won', 4, { outcome: 'won', outcome_at: '2026-10-21T00:00:00.000Z' }),
    live('lost', 0, { outcome: 'lost', outcome_at: '2026-10-21T00:00:00.000Z' }),
  ]

  it('keeps won and lost out of All and the stage buckets, which still sum to All', () => {
    const counts = prospectFilterCounts(prospects)
    expect(counts).toMatchObject({ all: 2, draft: 1, live_viewed: 1, call_booked: 1, won: 1, lost: 1 })
    expect(counts.draft + counts.needs_review + counts.live_not_viewed + counts.live_viewed).toBe(counts.all)
  })

  it('shows closed prospects only under their own filter', () => {
    const won = prospects[2]
    expect(prospectMatchesFilter(won, 'all')).toBe(false)
    expect(prospectMatchesFilter(won, 'live_viewed')).toBe(false)
    expect(prospectMatchesFilter(won, 'won')).toBe(true)
  })

  it('leaves a booked call in the default list', () => {
    expect(prospectMatchesFilter(prospects[1], 'all')).toBe(true)
    expect(prospectMatchesFilter(prospects[1], 'call_booked')).toBe(true)
  })
})

describe('engagementText', () => {
  it('says how often and how recently', () => {
    expect(engagementText(live('a', 42), NOW)).toBe('Viewed 42x, last 2d ago')
    expect(engagementText(live('b', 0), NOW)).toBe('Not viewed yet')
  })

  it('formats relative times', () => {
    expect(relativeTime('2026-10-23T11:59:50.000Z', NOW)).toBe('just now')
    expect(relativeTime('2026-10-23T09:00:00.000Z', NOW)).toBe('3h ago')
    expect(relativeTime('2026-09-25T12:00:00.000Z', NOW)).toBe('4w ago')
  })
})

describe('missingItems', () => {
  it('lists what a draft lacks', () => {
    expect(missingItems(draft('a'))).toEqual(['title', 'bio', 'shortlist'])
    expect(missingItems(prospect('b', {}, { analyzed_count: 2, cta_ready: false }))).toEqual(['fit explanations', 'next step'])
    expect(missingItems(prospect('c'))).toEqual([])
  })
})

describe('compareProspects', () => {
  const older = live('older', 1, { updated_at: '2026-10-01T00:00:00.000Z', last_viewed_at: '2026-10-22T00:00:00.000Z', prospect_name: 'Zed', created_at: '2026-09-01T00:00:00.000Z' })
  const newer = prospect('newer', { updated_at: '2026-10-20T00:00:00.000Z', prospect_name: 'Amy', created_at: '2026-10-10T00:00:00.000Z' })

  it('orders by the later of edit and view by default', () => {
    expect([newer, older].sort(compareProspects('last_activity')).map((item) => item.id)).toEqual(['older', 'newer'])
  })

  it('orders by name, created, views and last viewed', () => {
    expect([older, newer].sort(compareProspects('name')).map((item) => item.id)).toEqual(['newer', 'older'])
    expect([older, newer].sort(compareProspects('created')).map((item) => item.id)).toEqual(['newer', 'older'])
    expect([newer, older].sort(compareProspects('views')).map((item) => item.id)).toEqual(['older', 'newer'])
    expect([newer, older].sort(compareProspects('last_viewed')).map((item) => item.id)).toEqual(['older', 'newer'])
  })
})

describe('findDuplicateProspect', () => {
  const existing = [prospect('a', { prospect_name: 'Tyler Brennan', prospect_email: 'tyler@peak.com' })]

  it('matches on a normalized name', () => {
    expect(findDuplicateProspect(existing, '  tyler   brennan. ', '')?.id).toBe('a')
  })

  it('matches on email', () => {
    expect(findDuplicateProspect(existing, 'T. Brennan', 'TYLER@peak.com')?.id).toBe('a')
  })

  it('finds nothing for a new person', () => {
    expect(findDuplicateProspect(existing, 'Maya Ortiz', '')).toBeNull()
  })
})
