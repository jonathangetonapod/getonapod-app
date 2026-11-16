import { describe, expect, it } from 'vitest'

import { outreachStageCounts, portalJourneyCounts, portalJourneyStatus } from '@/lib/portalJourney'
import type { PortalExperienceBooking, PortalOutreachTarget } from '@/services/clientPortal'

const target = (stage: PortalOutreachTarget['stage'], id: string): PortalOutreachTarget => ({
  id,
  podcast_name: `Show ${id}`,
  podcast_image_url: null,
  stage,
  first_message_at: null,
  last_activity_at: null,
  opens: 0,
  replies: 0,
})

const booking = (status: string, id: string) => ({ id, status } as unknown as PortalExperienceBooking)

describe('portal journey counts', () => {
  it('prefers the server totals, which stay exact past the list cap', () => {
    const counts = outreachStageCounts({
      bookings: [],
      outreach_pipeline: { preparing: 3, queued: 250, contacted: 40 },
      outreach_targets: [target('queued', 'a')],
    })
    expect(counts).toEqual({ preparing: 3, queued: 250, contacted: 40, replied: 0, completed: 0 })
  })

  it('counts the list when an older response carries no totals', () => {
    const counts = outreachStageCounts({
      bookings: [],
      outreach_targets: [target('queued', 'a'), target('queued', 'b'), target('contacted', 'c')],
    })
    expect(counts).toEqual({ preparing: 0, queued: 2, contacted: 1, replied: 0, completed: 0 })
  })

  it('reads a malformed total as zero rather than passing it to the page', () => {
    const counts = outreachStageCounts({
      bookings: [],
      outreach_pipeline: { queued: -4, contacted: Number.NaN } as never,
    })
    expect(counts.queued).toBe(0)
    expect(counts.contacted).toBe(0)
  })

  // Between syncs the sending platform's total runs ahead of the per-show
  // send records. The page showed "reached 5 hosts" beside a tile saying 15.
  it('moves scheduled shows to sent up to the sending platform total', () => {
    const source = {
      bookings: [],
      outreach: { podcasts_contacted: 15 } as never,
      outreach_pipeline: { preparing: 0, queued: 94, contacted: 5, replied: 0, completed: 0 },
    }
    expect(outreachStageCounts(source)).toEqual({ preparing: 0, queued: 84, contacted: 15, replied: 0, completed: 0 })
    const counts = portalJourneyCounts(source)
    expect(counts.emailed).toBe(15)
    expect(counts.queued).toBe(84)
    expect(counts.inOutreach).toBe(99)
  })

  it('never moves more shows than are scheduled, nor lowers a recorded count', () => {
    expect(outreachStageCounts({
      bookings: [],
      outreach: { podcasts_contacted: 500 } as never,
      outreach_pipeline: { queued: 3, contacted: 2 },
    })).toEqual({ preparing: 0, queued: 0, contacted: 5, replied: 0, completed: 0 })
    expect(outreachStageCounts({
      bookings: [],
      outreach: { podcasts_contacted: 1 } as never,
      outreach_pipeline: { queued: 3, contacted: 2 },
    })).toEqual({ preparing: 0, queued: 3, contacted: 2, replied: 0, completed: 0 })
  })

  it('separates emailed from scheduled, and conversations from secured shows', () => {
    const counts = portalJourneyCounts({
      outreach_pipeline: { preparing: 8, queued: 84, contacted: 15, replied: 2, completed: 1 },
      bookings: [booking('in_progress', '1'), booking('booked', '2'), booking('published', '3'), booking('cancelled', '4')],
    })
    expect(counts).toEqual({
      preparing: 8,
      queued: 84,
      emailed: 18,
      replied: 3,
      inOutreach: 102,
      conversations: 1,
      secured: 2,
      live: 1,
    })
  })
})

describe('portal journey status', () => {
  const none = { preparing: 0, queued: 0, emailed: 0, replied: 0, inOutreach: 0, conversations: 0, secured: 0, live: 0 }

  it('says nothing before any pitch exists', () => {
    expect(portalJourneyStatus(none)).toBeNull()
  })

  it('describes pitches being written', () => {
    expect(portalJourneyStatus({ ...none, preparing: 12 })?.headline).toBe('Your team is writing 12 pitches')
  })

  // The state the portal used to call "being written": written, queued, unsent.
  it('describes pitches that are written and waiting to send', () => {
    const status = portalJourneyStatus({ ...none, queued: 99, inOutreach: 99 })
    expect(status?.headline).toBe('99 pitches written and scheduled to send')
  })

  it('reports hosts emailed and how many are still scheduled', () => {
    const status = portalJourneyStatus({ ...none, queued: 84, emailed: 15, inOutreach: 99 })
    expect(status?.headline).toBe('Your pitch has reached 15 hosts')
    expect(status?.detail).toContain('84 more pitches are scheduled')
  })

  it('uses the singular for one of anything', () => {
    expect(portalJourneyStatus({ ...none, emailed: 1, queued: 1, inOutreach: 2 })).toEqual({
      headline: 'Your pitch has reached 1 host',
      detail: '1 more pitch is scheduled and goes out on a coming sending day. Hosts who do not answer get a follow-up.',
    })
    expect(portalJourneyStatus({ ...none, emailed: 1, replied: 1, inOutreach: 1 })?.headline).toBe('1 host has replied')
  })

  it('leads with replies once a host writes back', () => {
    expect(portalJourneyStatus({ ...none, emailed: 20, replied: 3, inOutreach: 20 })?.headline).toBe('3 hosts have replied')
  })

  it('leads with secured shows over everything earlier', () => {
    const status = portalJourneyStatus({ ...none, emailed: 20, replied: 3, inOutreach: 20, conversations: 2, secured: 4, live: 1 })
    expect(status?.headline).toBe('4 shows secured, 1 live')
    expect(status?.detail).toBe('Your team is also talking to 2 more hosts about a date. Outreach continues for 20 more shows.')
  })

  it('names conversations when nothing is confirmed yet', () => {
    expect(portalJourneyStatus({ ...none, conversations: 1 })?.headline).toBe('Your team is talking to 1 host')
  })
})
