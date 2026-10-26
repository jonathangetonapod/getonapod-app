import { clientSdrProfileReadiness } from '@/lib/clientSdrProfile'
import type { WorkspaceClientBooking, WorkspaceClientDetail } from '@/services/clients'

/*
 * Where a client stands and the one thing to do next.
 *
 * The record header's primary button and the Setup checklist both read from
 * here, so the button never says "Launch campaign" while the checklist still
 * asks for a shortlist. The stage is read from the most advanced signal down:
 * a client already in outreach (or with bookings logged by hand) is past
 * setup however its onboarding went.
 */

export type ClientProgressState = Pick<
  WorkspaceClientDetail,
  'viewer_role' | 'client' | 'dashboard' | 'outreach' | 'bookings' | 'onboarding'
>

export type ClientNextStepAction =
  | 'start_onboarding'
  | 'continue_onboarding'
  | 'review_onboarding'
  | 'build_shortlist'
  | 'launch_campaign'
  | 'view_pipeline'

export interface ClientNextStep {
  action: ClientNextStepAction
  label: string
}

export const CLIENT_NEXT_STEP_LABELS: Record<ClientNextStepAction, string> = {
  start_onboarding: 'Start onboarding',
  continue_onboarding: 'Continue onboarding',
  review_onboarding: 'Review onboarding',
  build_shortlist: 'Build shortlist',
  launch_campaign: 'Launch campaign',
  view_pipeline: 'View pipeline',
}

export type SetupItemStatus = 'done' | 'in_progress' | 'not_started'

/** Where a checklist row sends the user: a page, or a tab of this record. */
export type SetupItemTarget = 'onboarding' | 'profile' | 'sharing' | 'shortlist'

export interface ClientSetupItem {
  key: 'onboarding' | 'host_brief' | 'portal' | 'shortlist' | 'dashboard'
  label: string
  status: SetupItemStatus
  /** A short fact beside the status, e.g. "5 of 12 reviewed". */
  detail: string | null
  actionLabel: string
  target: SetupItemTarget
}

export interface ClientFunnelStep {
  key: 'contacted' | 'conversation' | 'booked' | 'recorded' | 'published'
  label: string
  count: number
  /** Percent of the previous step that reached this one; null when it would mislead. */
  conversion: number | null
}

export interface ClientUpcomingItem {
  key: string
  kind: 'recording' | 'release'
  date: string
  booking: WorkspaceClientBooking
}

/*
 * Members never receive onboarding (the function withholds it), so a null
 * there means "not visible", not "not started". Those viewers skip the
 * onboarding stage instead of being told to start one that may exist.
 */
function onboardingVisible(state: ClientProgressState): boolean {
  return state.viewer_role !== 'member'
}

function activeBookings(state: ClientProgressState): WorkspaceClientBooking[] {
  return state.bookings.filter((booking) => booking.status !== 'cancelled')
}

/** Outreach has gone out, or placements exist that were booked another way. */
export function hasOutreachStarted(state: ClientProgressState): boolean {
  return state.outreach.initial_emails_sent > 0 || activeBookings(state).length > 0
}

function onboardingStatus(state: ClientProgressState): SetupItemStatus {
  const status = state.onboarding?.status
  if (status === 'approved') return 'done'
  if (!status || status === 'expired' || status === 'revoked') return 'not_started'
  return 'in_progress'
}

function onboardingAction(state: ClientProgressState): ClientNextStepAction {
  const status = onboardingStatus(state)
  if (status === 'not_started') return 'start_onboarding'
  return state.onboarding?.status === 'submitted' ? 'review_onboarding' : 'continue_onboarding'
}

export function getClientNextStep(state: ClientProgressState): ClientNextStep {
  const step = (action: ClientNextStepAction): ClientNextStep => ({ action, label: CLIENT_NEXT_STEP_LABELS[action] })
  if (hasOutreachStarted(state)) return step('view_pipeline')
  if (state.dashboard.podcast_count > 0) return step('launch_campaign')
  if (!onboardingVisible(state) || onboardingStatus(state) === 'done') return step('build_shortlist')
  return step(onboardingAction(state))
}

const ONBOARDING_DETAIL: Record<NonNullable<WorkspaceClientDetail['onboarding']>['status'], string> = {
  invited: 'Invite sent',
  in_progress: 'Client is filling it in',
  submitted: 'Submitted for review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  expired: 'Invite expired',
  revoked: 'Invite revoked',
}

export function getClientSetupItems(state: ClientProgressState): ClientSetupItem[] {
  const items: ClientSetupItem[] = []

  if (onboardingVisible(state)) {
    const status = onboardingStatus(state)
    items.push({
      key: 'onboarding',
      label: 'Onboarding',
      status,
      detail: state.onboarding ? ONBOARDING_DETAIL[state.onboarding.status] : null,
      actionLabel: status === 'done' ? 'View onboarding' : CLIENT_NEXT_STEP_LABELS[onboardingAction(state)],
      target: 'onboarding',
    })
  }

  const brief = clientSdrProfileReadiness(state.client.ai_sdr_profile)
  items.push({
    key: 'host_brief',
    label: 'Host brief',
    status: brief.ready ? 'done' : brief.completed_fields > 0 ? 'in_progress' : 'not_started',
    detail: `${brief.completed_fields} of ${brief.total_fields} sections`,
    actionLabel: brief.ready
      ? 'View host brief'
      : `Complete host brief (${brief.completed_fields}/${brief.total_fields})`,
    target: 'profile',
  })

  items.push({
    key: 'portal',
    label: 'Client portal',
    status: state.client.portal_access_enabled ? 'done' : 'not_started',
    detail: state.client.portal_access_enabled ? 'Enabled' : null,
    actionLabel: state.client.portal_access_enabled ? 'Manage portal' : 'Enable portal',
    target: 'sharing',
  })

  const { podcast_count: podcasts, reviewed_count: reviewed, to_review_count: toReview } = state.dashboard
  items.push({
    key: 'shortlist',
    label: 'Shortlist',
    status: podcasts === 0 ? 'not_started' : toReview > 0 ? 'in_progress' : 'done',
    detail: podcasts === 0 ? null : `${reviewed} of ${podcasts} reviewed`,
    actionLabel: podcasts === 0 ? 'Build shortlist' : toReview > 0 ? 'Review shortlist' : 'View shortlist',
    target: 'shortlist',
  })

  items.push({
    key: 'dashboard',
    label: 'Approval dashboard',
    status: state.dashboard.configured ? 'done' : 'not_started',
    detail: state.dashboard.configured ? 'Live' : null,
    actionLabel: state.dashboard.configured ? 'View sharing' : 'Set up dashboard',
    target: 'sharing',
  })

  return items
}

/*
 * Each placement step counts every show that reached it, so a published
 * episode is also booked and recorded. Counted that way the steps only ever
 * narrow and the percentages between them mean something. Contacted comes
 * from sent outreach while placements can be logged by hand, so a placement
 * step can outnumber it; no percentage is shown then rather than one over 100.
 */
export function getClientFunnel(state: ClientProgressState): ClientFunnelStep[] {
  const bookings = activeBookings(state)
  const reached = (statuses: WorkspaceClientBooking['status'][]) => (
    bookings.filter((booking) => statuses.includes(booking.status)).length
  )
  const counts: Omit<ClientFunnelStep, 'conversion'>[] = [
    { key: 'contacted', label: 'Contacted', count: state.outreach.podcasts_contacted },
    {
      key: 'conversation',
      label: 'In conversation',
      count: reached(['conversation_started', 'in_progress', 'booked', 'recorded', 'published']),
    },
    { key: 'booked', label: 'Booked', count: reached(['booked', 'recorded', 'published']) },
    { key: 'recorded', label: 'Recorded', count: reached(['recorded', 'published']) },
    { key: 'published', label: 'Published', count: reached(['published']) },
  ]
  return counts.map((step, index) => {
    const previous = index > 0 ? counts[index - 1].count : 0
    const conversion = previous > 0 && step.count > 0 && step.count <= previous
      ? Math.round((step.count / previous) * 100)
      : null
    return { ...step, conversion }
  })
}

function isFutureDay(value: string | null | undefined, now: number): boolean {
  if (!value) return false
  const date = new Date(`${value.slice(0, 10)}T23:59:59`)
  return !Number.isNaN(date.getTime()) && date.getTime() >= now
}

/** Recordings and releases still ahead, soonest first. */
export function getClientUpcoming(
  bookings: WorkspaceClientBooking[],
  limit = 6,
  now = Date.now(),
): ClientUpcomingItem[] {
  const items: ClientUpcomingItem[] = []
  for (const booking of bookings) {
    const recordingDate = booking.recording_date || booking.scheduled_date
    if (['conversation_started', 'in_progress', 'booked'].includes(booking.status) && isFutureDay(recordingDate, now)) {
      items.push({ key: `${booking.id}:recording`, kind: 'recording', date: recordingDate!, booking })
    }
    if (!['cancelled', 'published'].includes(booking.status) && isFutureDay(booking.publish_date, now)) {
      items.push({ key: `${booking.id}:release`, kind: 'release', date: booking.publish_date!, booking })
    }
  }
  return items
    .sort((left, right) => left.date.slice(0, 10).localeCompare(right.date.slice(0, 10)))
    .slice(0, limit)
}

const DAY_MS = 86_400_000

/** "today", "yesterday", "3 days ago", then weeks and months in words. */
export function outreachAgo(value: string | null, now = Date.now()): string {
  if (!value) return ''
  const then = Date.parse(value)
  if (Number.isNaN(then)) return ''
  const days = Math.max(0, Math.floor((now - then) / DAY_MS))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  const months = Math.round(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}
