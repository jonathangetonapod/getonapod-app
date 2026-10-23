import { missingItems, prospectStage, relativeTime, wasViewed } from '@/lib/prospectStage'
import type { WorkspaceProspect } from '@/services/prospectDashboards'

/*
 * The one thing to do next with a prospect.
 *
 * The card used to say "Share the private dashboard" to every live prospect,
 * forever. These rules read stage, whether the link went out, whether it was
 * opened and how recently, and the recorded outcome. The first match wins,
 * with outcomes checked first: a won prospect whose link was never copied in
 * Studio has nothing left to send.
 */

export type NextStepAction =
  | 'edit_profile'
  | 'build_shortlist'
  | 'review_shortlist'
  | 'publish'
  | 'copy_link'
  | 'open_live'
  | 'find_podcasts'
  | 'mark_call_booked'
  | 'mark_won'
  | 'mark_lost'
  | 'reopen'

export type NextStepRule =
  | 'won'
  | 'lost'
  | 'call_booked'
  | 'draft'
  | 'needs_review'
  | 'send_link'
  | 'waiting'
  | 'no_views'
  | 'warm'
  | 'reengage'

export interface NextStep {
  rule: NextStepRule
  title: string
  body: string
  primary: NextStepAction | null
  secondary: NextStepAction | null
}

const DAY_MS = 86_400_000
/** How long a sent link may go unopened before it needs a nudge. */
export const NUDGE_AFTER_DAYS = 3
/** How long after the last view a follow-up still counts as warm. */
export const WARM_FOR_DAYS = 7
/** Missing items an operator fixes in the profile form, not by building. */
const PROFILE_ITEMS = new Set(['title', 'bio', 'next step'])

export const NEXT_STEP_ACTION_LABELS: Record<NextStepAction, string> = {
  edit_profile: 'Edit profile',
  build_shortlist: 'Build shortlist',
  review_shortlist: 'Review shortlist',
  publish: 'Publish',
  copy_link: 'Copy private link',
  open_live: 'Open live',
  find_podcasts: 'Find podcasts',
  mark_call_booked: 'Mark call booked',
  mark_won: 'Mark won',
  mark_lost: 'Mark lost',
  reopen: 'Reopen',
}

function firstName(prospect: WorkspaceProspect): string {
  return prospect.first_name?.trim() || prospect.prospect_name.trim().split(/\s+/u)[0] || 'The prospect'
}

function since(value: string | null | undefined, now: number): number {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(time) ? 0 : now - time
}

export function nextStep(prospect: WorkspaceProspect, now = Date.now()): NextStep {
  const name = firstName(prospect)
  const outcomeWhen = relativeTime(prospect.outcome_at ?? null, now)

  if (prospect.outcome === 'won') {
    return { rule: 'won', title: 'Won', body: `Closed ${outcomeWhen}.`, primary: null, secondary: null }
  }
  if (prospect.outcome === 'lost') {
    return { rule: 'lost', title: 'Lost', body: `Closed ${outcomeWhen}.`, primary: 'reopen', secondary: null }
  }
  if (prospect.outcome === 'call_booked') {
    return { rule: 'call_booked', title: 'Call booked', body: `Booked ${outcomeWhen}.`, primary: 'mark_won', secondary: 'mark_lost' }
  }

  const stage = prospectStage(prospect)
  if (stage === 'draft') {
    const missing = missingItems(prospect)
    // A finished profile with no shortlist is not fixed by editing the profile.
    const profileDone = !missing.some((item) => PROFILE_ITEMS.has(item))
    return {
      rule: 'draft',
      title: profileDone ? 'Build the shortlist' : 'Finish the profile',
      body: `Missing: ${missing.join(', ')}.`,
      primary: profileDone ? 'build_shortlist' : 'edit_profile',
      secondary: null,
    }
  }
  if (stage === 'needs_review') {
    return {
      rule: 'needs_review',
      title: 'Review and publish',
      body: 'Check the shortlist and publish when it looks right.',
      primary: 'review_shortlist',
      secondary: 'publish',
    }
  }

  const viewed = wasViewed(prospect)
  // A view proves the link reached them, even when it was sent before Studio
  // recorded copies.
  if (!prospect.sent_at && !viewed) {
    return {
      rule: 'send_link',
      title: 'Send the private link',
      body: `${name} has not received their link yet.`,
      primary: 'copy_link',
      secondary: null,
    }
  }
  if (!viewed) {
    const sentFor = since(prospect.sent_at, now)
    if (sentFor < NUDGE_AFTER_DAYS * DAY_MS) {
      return {
        rule: 'waiting',
        title: `Waiting on ${name}`,
        body: `Link sent ${relativeTime(prospect.sent_at, now)}. Give it a couple of days.`,
        primary: 'open_live',
        secondary: null,
      }
    }
    const days = Math.floor(sentFor / DAY_MS)
    return {
      rule: 'no_views',
      title: 'No views yet',
      body: `${name} has not opened the link in ${days} days. Send a nudge.`,
      primary: 'copy_link',
      secondary: 'mark_lost',
    }
  }
  const lastViewed = relativeTime(prospect.last_viewed_at, now)
  if (since(prospect.last_viewed_at, now) <= WARM_FOR_DAYS * DAY_MS) {
    return {
      rule: 'warm',
      title: 'Follow up while it is warm',
      body: `${name} viewed ${prospect.view_count}x, last ${lastViewed}.`,
      primary: 'mark_call_booked',
      secondary: 'open_live',
    }
  }
  return {
    rule: 'reengage',
    title: 'Re-engage',
    body: `Last viewed ${lastViewed}. Send a fresh angle or a new match.`,
    primary: 'find_podcasts',
    secondary: 'mark_lost',
  }
}
