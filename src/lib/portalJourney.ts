// Where a client's podcast tour stands, as one set of numbers.
//
// The dashboard and the outreach page each used to count for themselves, from
// different sources: the sending platform's totals in the tiles, the per-show
// rows in the pipeline. They disagreed on the same screen. Everything a client
// reads about progress comes from here, so the tiles, the pipeline and the
// sentence telling them what happens next are the same count.

import { plural } from '@/lib/plural'
import type { PortalExperienceOverview, PortalOutreachTarget } from '@/services/clientPortal'

export interface PortalJourneyCounts {
  /** Shows whose pitch is still being written. */
  preparing: number
  /** Pitch written and in the sending campaign, not emailed yet. */
  queued: number
  /** Hosts a pitch has been emailed to, replies included. */
  emailed: number
  /** Hosts who have written back. */
  replied: number
  /** Shows with a pitch written, sent or not. */
  inOutreach: number
  /** Placements where the host and the team are working out a date. */
  conversations: number
  /** Confirmed placements: booked, recorded or live. */
  secured: number
  live: number
}

export interface PortalJourneyStatus {
  headline: string
  detail: string
}

type JourneySource = Pick<PortalExperienceOverview, 'bookings' | 'outreach_pipeline' | 'outreach_targets'>

const STAGES: Array<PortalOutreachTarget['stage']> = ['preparing', 'queued', 'contacted', 'replied', 'completed']

/**
 * Shows at each outreach stage. The server's totals when it sends them; the
 * list otherwise, which is exact below its two-hundred-row cap and is all an
 * older response carries.
 */
export function outreachStageCounts(overview: JourneySource | null | undefined): Record<PortalOutreachTarget['stage'], number> {
  const counts = { preparing: 0, queued: 0, contacted: 0, replied: 0, completed: 0 }
  if (!overview) return counts
  if (overview.outreach_pipeline) {
    for (const stage of STAGES) {
      const value = overview.outreach_pipeline[stage]
      counts[stage] = typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
    }
    return counts
  }
  for (const target of overview.outreach_targets ?? []) {
    if (target.stage in counts) counts[target.stage] += 1
  }
  return counts
}

export function portalJourneyCounts(overview: JourneySource | null | undefined): PortalJourneyCounts {
  const stages = outreachStageCounts(overview)
  const bookings = (overview?.bookings ?? []).filter((booking) => booking.status !== 'cancelled')
  const conversations = bookings.filter((booking) => ['conversation_started', 'in_progress'].includes(booking.status)).length
  const replied = stages.replied + stages.completed
  return {
    preparing: stages.preparing,
    queued: stages.queued,
    emailed: stages.contacted + replied,
    replied,
    inOutreach: stages.queued + stages.contacted + replied,
    conversations,
    secured: bookings.length - conversations,
    live: bookings.filter((booking) => booking.status === 'published').length,
  }
}

/**
 * What is happening now and what comes next, for the furthest point the tour
 * has reached. Null before any pitch exists: the shortlist cards own that
 * stretch. States what is true and what follows, never when a host will say
 * yes.
 */
export function portalJourneyStatus(counts: PortalJourneyCounts): PortalJourneyStatus | null {
  if (counts.secured > 0 || counts.conversations > 0) {
    const working = counts.inOutreach > 0
      ? `Outreach continues for ${plural(counts.inOutreach, 'more show')}.`
      : 'New conversations appear here as hosts reply.'
    if (counts.secured > 0) {
      return {
        headline: `${plural(counts.secured, 'show')} secured${counts.live > 0 ? `, ${counts.live} live` : ''}`,
        detail: counts.conversations > 0
          ? `Your team is also talking to ${plural(counts.conversations, 'more host')} about a date. ${working}`
          : working,
      }
    }
    return {
      headline: `Your team is talking to ${plural(counts.conversations, 'host')}`,
      detail: `They are working out fit and a recording date. ${working}`,
    }
  }
  if (counts.replied > 0) {
    return {
      headline: `${plural(counts.replied, 'host')} ${counts.replied === 1 ? 'has' : 'have'} replied`,
      detail: 'Your team is following up with each one. A show moves to your dashboard once a conversation about a date begins.',
    }
  }
  if (counts.emailed > 0) {
    return {
      headline: `Your pitch has reached ${plural(counts.emailed, 'host')}`,
      detail: counts.queued > 0
        ? `${plural(counts.queued, 'more pitch', 'more pitches')} ${counts.queued === 1 ? 'is scheduled and goes out on a coming sending day' : 'are scheduled and go out a few each sending day'}. Hosts who do not answer get a follow-up.`
        : 'Hosts who do not answer get a follow-up. Replies appear here as they come in.',
    }
  }
  if (counts.queued > 0) {
    return {
      headline: `${plural(counts.queued, 'pitch', 'pitches')} written and scheduled to send`,
      detail: counts.queued === 1
        ? 'It goes out on a coming sending day.'
        : 'They go out a few each sending day, and each one is written for that show.',
    }
  }
  if (counts.preparing > 0) {
    return {
      headline: `Your team is writing ${plural(counts.preparing, 'pitch', 'pitches')}`,
      detail: 'Each show you picked gets its own pitch. Sending starts once they are written.',
    }
  }
  return null
}
