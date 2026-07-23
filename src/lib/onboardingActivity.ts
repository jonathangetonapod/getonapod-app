export type OnboardingActivityStage = 'not_viewed' | 'viewed' | 'started' | 'completed'

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
