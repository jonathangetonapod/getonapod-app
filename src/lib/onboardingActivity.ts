export type OnboardingActivityStage = 'not_viewed' | 'viewed' | 'started' | 'completed'
export type OnboardingWorkflowStatus = 'invited' | 'in_progress' | 'submitted' | 'changes_requested' | 'approved' | 'expired' | 'revoked'
export type OnboardingStatusLabel = 'Active' | 'Awaiting review' | 'Approved' | 'Expired'

interface OnboardingActivityTimestamps {
  viewed_at?: string | null
  started_at?: string | null
  submitted_at?: string | null
}

export function onboardingActivityStage(activity: OnboardingActivityTimestamps): OnboardingActivityStage {
  if (activity.submitted_at) return 'completed'
  if (activity.started_at) return 'started'
  if (activity.viewed_at) return 'viewed'
  return 'not_viewed'
}

export function onboardingStatusLabel(status: OnboardingWorkflowStatus): OnboardingStatusLabel {
  if (status === 'submitted') return 'Awaiting review'
  if (status === 'approved') return 'Approved'
  if (status === 'expired' || status === 'revoked') return 'Expired'
  return 'Active'
}
