// Client-facing words for where a show has got to.
//
// The booking status keys are the workspace's vocabulary (a "placement" that
// is "in_progress"). A client reads the same row in their portal, their emails
// and the review page, and those three surfaces used to each invent their own
// label. One table here, so "Talking to the host" means the same thing
// everywhere the client sees it. Staff-facing labels stay with the staff UI.

import type { WorkspaceClientBooking } from '@/services/clients'
import type { PortalOutreachTarget } from '@/services/clientPortal'

export type PlacementStatus = WorkspaceClientBooking['status']
export type OutreachStage = PortalOutreachTarget['stage']

export const PLACEMENT_STATUS_LABELS: Record<PlacementStatus, string> = {
  conversation_started: 'Talking to the host',
  in_progress: 'Talking to the host',
  booked: 'Booked',
  recorded: 'Recorded',
  published: 'Live',
  cancelled: 'Cancelled',
}

export const OUTREACH_STAGE_LABELS: Record<OutreachStage, string> = {
  preparing: 'Pitch being written',
  contacted: 'Pitch sent',
  replied: 'Host replied',
  completed: 'Conversation closed',
}

/**
 * The label for a status, or a readable version of a key this table has not
 * heard of. A new status added server-side should show up as words, not as
 * nothing.
 */
export function placementStatusLabel(status: string): string {
  return (PLACEMENT_STATUS_LABELS as Record<string, string>)[status]
    ?? status.replace(/_/gu, ' ')
}

export function outreachStageLabel(stage: string): string {
  return (OUTREACH_STAGE_LABELS as Record<string, string>)[stage]
    ?? stage.replace(/_/gu, ' ')
}
