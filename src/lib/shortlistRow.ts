import { isResearchRunStale } from '@/lib/researchProgress'
import { isCorporateFeed, isRecentlyActive } from '@/lib/showQuality'
import type { ClientShortlistPodcast } from '@/services/clientShortlist'

/*
 * Visible shows a client should not have to wade through: no episode in the
 * Finder's 90-day window, or a company's own feed rather than a hosted show.
 * Flagged, never hidden automatically; the operator decides.
 */
export const qualityFlags = (podcast: Pick<ClientShortlistPodcast, 'podcast_name' | 'publisher_name' | 'last_posted_at'>) => ({
  notPosting: isRecentlyActive(podcast.last_posted_at) === false,
  companyFeed: isCorporateFeed(podcast),
})

export function compactNumber(value: number | null | undefined): string {
  if (!value) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

export function researchStatusLabel(progress: ClientShortlistPodcast['research_progress']): string | null {
  if (!progress) return null
  if (isResearchRunStale(progress)) return 'Research needs attention'
  if (progress.status === 'blocked') return 'Needs client info'
  if (progress.status === 'completed') return 'Research complete'
  if (progress.status === 'failed') return 'Research failed'
  return progress.status === 'queued' ? 'Research queued' : 'Research running'
}
