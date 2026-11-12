import { isTargetInActiveOutreach } from '@/lib/campaignTargetState'
import type { WorkspaceCampaignTarget } from '@/services/workspaceCampaigns'

export type PitchStatus = 'staged' | 'pending' | 'draft' | 'ready' | 'launching' | 'in_outreach' | 'replied' | 'completed' | 'failed'
export type PitchFilter = 'all' | 'written' | PitchStatus

export const PITCH_LABELS: Record<PitchFilter, string> = {
  all: 'All pitch statuses', written: 'Pitch ready', pending: 'No pitch yet',
  staged: 'Queued in campaign', draft: 'Draft in progress', ready: 'Ready for outreach', launching: 'Launching',
  in_outreach: 'In outreach', replied: 'Replied', completed: 'Completed', failed: 'Needs attention',
}

export function hasWrittenPitch(target?: WorkspaceCampaignTarget): boolean {
  return Boolean(target?.pitch_subject?.trim() && target?.pitch_body?.trim())
}

export function pitchStatus(target?: WorkspaceCampaignTarget): PitchStatus {
  if (target?.status === 'failed') return 'failed'
  if (target?.status === 'replied' || target?.status === 'completed' || target?.status === 'launching') return target.status
  if (target?.lead_staged_at && !target.launched_at && target.status !== 'in_outreach' && target.lead_staged_campaign_status !== 1) return 'staged'
  if (isTargetInActiveOutreach(target)) return 'in_outreach'
  if (target?.status === 'ready') return 'ready'
  return target?.pitch_subject?.trim() || target?.pitch_body?.trim() ? 'draft' : 'pending'
}

/** The row's pitch badge: a draft with both subject and body is a finished pitch. */
export function pitchBadgeLabel(target?: WorkspaceCampaignTarget): string {
  const status = pitchStatus(target)
  return status === 'draft' && hasWrittenPitch(target) ? PITCH_LABELS.written : PITCH_LABELS[status]
}
