import { describe, expect, it } from 'vitest'

import type { WorkspaceProspect } from '@/services/prospectDashboards'

import { nextStep } from './prospectNextStep'

const NOW = Date.parse('2026-10-23T12:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString()

function prospect(overrides: Partial<WorkspaceProspect> = {}, readiness: Partial<WorkspaceProspect['readiness']> = {}): WorkspaceProspect {
  return {
    id: 'p',
    workspace_id: 'w',
    slug: 'p',
    prospect_name: 'Tyler Brennan',
    first_name: 'Tyler',
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
    lifecycle_status: 'ready',
    build_error: null,
    build_started_at: null,
    build_completed_at: null,
    published_at: daysAgo(30),
    pending_review_at: null,
    sent_at: null,
    first_engaged_at: null,
    converted_at: null,
    cta_type: 'reply',
    cta_label: 'Reply',
    cta_url: null,
    show_pricing_section: false,
    is_active: true,
    content_ready: true,
    view_count: 0,
    last_viewed_at: null,
    outcome: null,
    outcome_at: null,
    created_at: daysAgo(40),
    updated_at: daysAgo(30),
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

describe('nextStep, one test per rule', () => {
  it('draft: finish the profile, listing what is missing', () => {
    const step = nextStep(prospect({ published_at: null, prospect_title: null }, { profile_ready: false, publishable: false }), NOW)
    expect(step).toEqual({
      rule: 'draft',
      title: 'Finish the profile',
      body: 'Missing: title, bio.',
      primary: 'edit_profile',
      secondary: null,
    })
  })

  it('needs review: review and publish', () => {
    expect(nextStep(prospect({ published_at: null }), NOW)).toEqual({
      rule: 'needs_review',
      title: 'Review and publish',
      body: 'Check the shortlist and publish when it looks right.',
      primary: 'review_shortlist',
      secondary: 'publish',
    })
  })

  it('live, link not sent: send the private link', () => {
    expect(nextStep(prospect(), NOW)).toEqual({
      rule: 'send_link',
      title: 'Send the private link',
      body: 'Tyler has not received their link yet.',
      primary: 'copy_link',
      secondary: null,
    })
  })

  it('live, sent under three days ago, no views: waiting', () => {
    expect(nextStep(prospect({ sent_at: daysAgo(1) }), NOW)).toEqual({
      rule: 'waiting',
      title: 'Waiting on Tyler',
      body: 'Link sent 1d ago. Give it a couple of days.',
      primary: 'open_live',
      secondary: null,
    })
  })

  it('live, sent three or more days ago, no views: nudge', () => {
    expect(nextStep(prospect({ sent_at: daysAgo(4) }), NOW)).toEqual({
      rule: 'no_views',
      title: 'No views yet',
      body: 'Tyler has not opened the link in 4 days. Send a nudge.',
      primary: 'copy_link',
      secondary: 'mark_lost',
    })
  })

  it('live, viewed in the last week: follow up while it is warm', () => {
    expect(nextStep(prospect({ sent_at: daysAgo(5), view_count: 42, last_viewed_at: daysAgo(2) }), NOW)).toEqual({
      rule: 'warm',
      title: 'Follow up while it is warm',
      body: 'Tyler viewed 42x, last 2d ago.',
      primary: 'mark_call_booked',
      secondary: 'open_live',
    })
  })

  it('live, last viewed over a week ago: re-engage', () => {
    expect(nextStep(prospect({ sent_at: daysAgo(20), view_count: 3, last_viewed_at: daysAgo(10) }), NOW)).toEqual({
      rule: 'reengage',
      title: 'Re-engage',
      body: 'Last viewed 10d ago. Send a fresh angle or a new match.',
      primary: 'find_podcasts',
      secondary: 'mark_lost',
    })
  })

  it('call booked: mark won or lost', () => {
    expect(nextStep(prospect({ outcome: 'call_booked', outcome_at: daysAgo(3) }), NOW)).toEqual({
      rule: 'call_booked',
      title: 'Call booked',
      body: 'Booked 3d ago.',
      primary: 'mark_won',
      secondary: 'mark_lost',
    })
  })

  it('won: nothing left to do', () => {
    expect(nextStep(prospect({ outcome: 'won', outcome_at: daysAgo(1) }), NOW)).toEqual({
      rule: 'won',
      title: 'Won',
      body: 'Closed 1d ago.',
      primary: null,
      secondary: null,
    })
  })

  it('lost: reopen', () => {
    expect(nextStep(prospect({ outcome: 'lost', outcome_at: daysAgo(2) }), NOW)).toEqual({
      rule: 'lost',
      title: 'Lost',
      body: 'Closed 2d ago.',
      primary: 'reopen',
      secondary: null,
    })
  })
})

describe('nextStep edges', () => {
  it('asks for a build, not a profile edit, when only the shortlist is missing', () => {
    const step = nextStep(prospect({ published_at: null }, { visible_count: 0, analyzed_count: 0, publishable: false }), NOW)
    expect(step).toMatchObject({ rule: 'draft', title: 'Build the shortlist', body: 'Missing: shortlist.', primary: 'build_shortlist' })
  })

  it('treats a view as proof the link was sent', () => {
    expect(nextStep(prospect({ view_count: 2, last_viewed_at: daysAgo(1) }), NOW).rule).toBe('warm')
  })

  it('checks the outcome before anything else', () => {
    expect(nextStep(prospect({ published_at: null, outcome: 'won', outcome_at: daysAgo(1) }), NOW).rule).toBe('won')
  })

  it('switches from waiting to nudge at exactly three days', () => {
    expect(nextStep(prospect({ sent_at: daysAgo(3) }), NOW).rule).toBe('no_views')
  })
})
