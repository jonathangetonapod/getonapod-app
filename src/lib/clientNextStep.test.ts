import { describe, expect, it } from 'vitest'

import type { WorkspaceClientBooking } from '@/services/clients'

import {
  getClientFunnel,
  getClientNextStep,
  getClientSetupItems,
  getClientUpcoming,
  hasOutreachStarted,
  outreachAgo,
  type ClientProgressState,
} from './clientNextStep'

const NOW = Date.parse('2026-10-23T12:00:00.000Z')

const FULL_BRIEF = {
  positioning: 'a', topics_and_angles: 'b', listener_takeaways: 'c',
  proof_points: 'd', ideal_opportunities: 'e', booking_details: 'f',
}

function booking(id: string, overrides: Partial<WorkspaceClientBooking> = {}): WorkspaceClientBooking {
  return {
    id,
    client_id: 'c',
    podcast_id: null,
    podcast_name: `Show ${id}`,
    podcast_url: null,
    host_name: null,
    scheduled_date: null,
    recording_date: null,
    publish_date: null,
    status: 'booked',
    episode_url: null,
    prep_sent: false,
    notes: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

// A brand-new client: nothing started anywhere.
function state(overrides: {
  onboarding?: ClientProgressState['onboarding']
  viewer_role?: ClientProgressState['viewer_role']
  client?: Partial<ClientProgressState['client']>
  dashboard?: Partial<ClientProgressState['dashboard']>
  outreach?: Partial<ClientProgressState['outreach']>
  bookings?: WorkspaceClientBooking[]
} = {}): ClientProgressState {
  return {
    viewer_role: overrides.viewer_role ?? 'owner',
    client: { ai_sdr_profile: {}, portal_access_enabled: false, ...overrides.client } as ClientProgressState['client'],
    dashboard: {
      configured: false, enabled: false, tagline: null, view_count: 0, last_viewed_at: null,
      podcast_count: 0, reviewed_count: 0, approved_count: 0, rejected_count: 0, to_review_count: 0,
      analyzed_count: 0, last_synced_at: null, last_feedback_at: null,
      ...overrides.dashboard,
    },
    outreach: {
      initial_emails_sent: 0, podcasts_contacted: 0, pending_review_count: 0,
      approved_count: 0, failed_count: 0, last_sent_at: null,
      ...overrides.outreach,
    },
    bookings: overrides.bookings ?? [],
    onboarding: overrides.onboarding === undefined ? null : overrides.onboarding,
  }
}

function onboarding(status: NonNullable<ClientProgressState['onboarding']>['status']): ClientProgressState['onboarding'] {
  return {
    id: 'o', workspace_id: 'w', client_id: 'c', recipient_name: 'R', recipient_email: 'r@example.com',
    status, invited_at: '2026-10-01T00:00:00.000Z', started_at: null, submitted_at: null,
    approved_at: null, updated_at: '2026-10-01T00:00:00.000Z', archived_at: null,
  }
}

describe('getClientNextStep', () => {
  it('starts a brand-new client with onboarding', () => {
    expect(getClientNextStep(state())).toEqual({ action: 'start_onboarding', label: 'Start onboarding' })
    expect(getClientNextStep(state({ onboarding: onboarding('expired') })).action).toBe('start_onboarding')
  })

  it('continues or reviews an onboarding already under way', () => {
    expect(getClientNextStep(state({ onboarding: onboarding('in_progress') })).label).toBe('Continue onboarding')
    expect(getClientNextStep(state({ onboarding: onboarding('submitted') })).label).toBe('Review onboarding')
  })

  it('moves to the shortlist once onboarding is approved', () => {
    expect(getClientNextStep(state({ onboarding: onboarding('approved') })).label).toBe('Build shortlist')
  })

  it('does not tell a member to start an onboarding they cannot see', () => {
    expect(getClientNextStep(state({ viewer_role: 'member' })).label).toBe('Build shortlist')
  })

  it('launches a campaign once a shortlist exists, whatever onboarding says', () => {
    expect(getClientNextStep(state({ dashboard: { podcast_count: 3, to_review_count: 3 } })).label).toBe('Launch campaign')
  })

  it('points at the pipeline once outreach is live or a placement was logged', () => {
    expect(getClientNextStep(state({ outreach: { initial_emails_sent: 2 } })).label).toBe('View pipeline')
    expect(getClientNextStep(state({ bookings: [booking('a')] })).label).toBe('View pipeline')
    expect(hasOutreachStarted(state({ bookings: [booking('a', { status: 'cancelled' })] }))).toBe(false)
  })
})

describe('getClientSetupItems', () => {
  it('lists every step as not started for a new client', () => {
    const items = getClientSetupItems(state())
    expect(items.map((item) => [item.key, item.status, item.actionLabel])).toEqual([
      ['onboarding', 'not_started', 'Start onboarding'],
      ['host_brief', 'not_started', 'Complete host brief (0/6)'],
      ['portal', 'not_started', 'Enable portal'],
      ['shortlist', 'not_started', 'Build shortlist'],
      ['dashboard', 'not_started', 'Set up dashboard'],
    ])
  })

  it('marks partial work as in progress', () => {
    const items = getClientSetupItems(state({
      onboarding: onboarding('invited'),
      client: { ai_sdr_profile: { positioning: 'x', topics_and_angles: 'y' } },
      dashboard: { podcast_count: 10, reviewed_count: 4, to_review_count: 6 },
    }))
    const byKey = Object.fromEntries(items.map((item) => [item.key, item]))
    expect(byKey.onboarding.status).toBe('in_progress')
    expect(byKey.host_brief).toMatchObject({ status: 'in_progress', actionLabel: 'Complete host brief (2/6)' })
    expect(byKey.shortlist).toMatchObject({ status: 'in_progress', detail: '4 of 10 reviewed', actionLabel: 'Review shortlist' })
  })

  it('is all done for a fully set up client', () => {
    const items = getClientSetupItems(state({
      onboarding: onboarding('approved'),
      client: { ai_sdr_profile: FULL_BRIEF, portal_access_enabled: true },
      dashboard: { configured: true, podcast_count: 5, reviewed_count: 5, to_review_count: 0 },
    }))
    expect(items.every((item) => item.status === 'done')).toBe(true)
  })

  it('leaves onboarding out for a member, who cannot see it', () => {
    expect(getClientSetupItems(state({ viewer_role: 'member' })).map((item) => item.key)).not.toContain('onboarding')
  })
})

describe('getClientFunnel', () => {
  it('counts every show that reached a step and the conversion between steps', () => {
    const steps = getClientFunnel(state({
      outreach: { podcasts_contacted: 20 },
      bookings: [
        booking('a', { status: 'conversation_started' }),
        booking('b', { status: 'booked' }),
        booking('c', { status: 'recorded' }),
        booking('d', { status: 'published' }),
        booking('e', { status: 'cancelled' }),
      ],
    }))
    expect(steps.map((step) => [step.label, step.count, step.conversion])).toEqual([
      ['Contacted', 20, null],
      ['In conversation', 4, 20],
      ['Booked', 3, 75],
      ['Recorded', 2, 67],
      ['Published', 1, 50],
    ])
  })

  it('shows no percentage when a step outnumbers the one before it', () => {
    const steps = getClientFunnel(state({ outreach: { podcasts_contacted: 1 }, bookings: [booking('a'), booking('b')] }))
    expect(steps[1]).toMatchObject({ count: 2, conversion: null })
  })
})

describe('getClientUpcoming', () => {
  it('merges recordings and releases into one list, soonest first', () => {
    const items = getClientUpcoming([
      booking('late', { status: 'recorded', publish_date: '2026-12-01' }),
      booking('soon', { status: 'booked', scheduled_date: '2026-11-01' }),
      booking('past', { status: 'booked', scheduled_date: '2026-10-01' }),
      booking('done', { status: 'published', publish_date: '2026-12-15' }),
    ], 6, NOW)
    expect(items.map((item) => [item.booking.id, item.kind])).toEqual([
      ['soon', 'recording'],
      ['late', 'release'],
    ])
  })
})

describe('outreachAgo', () => {
  it('reads in words', () => {
    expect(outreachAgo(null, NOW)).toBe('')
    expect(outreachAgo('2026-10-23T08:00:00.000Z', NOW)).toBe('today')
    expect(outreachAgo('2026-10-22T08:00:00.000Z', NOW)).toBe('yesterday')
    expect(outreachAgo('2026-10-20T08:00:00.000Z', NOW)).toBe('3 days ago')
    expect(outreachAgo('2026-09-25T08:00:00.000Z', NOW)).toBe('4 weeks ago')
  })
})
