import type { PodcastDemographics } from '@/services/podscan'

/*
 * The shared vocabulary of the two client-facing review pages. Each page
 * fetches its own data (a client dashboard, a prospect dashboard) and maps it
 * into these shapes; the components under this folder render them and call
 * back. Nothing here fetches.
 */

/** A decision a reader can make on a show. `null` means no decision yet. */
export type ReviewDecision = 'approved' | 'rejected'
export type ReviewStatus = ReviewDecision | null

export interface ReviewCategory {
  category_id: string
  category_name: string
}

export interface ReviewPitchAngle {
  title: string
  description: string
}

export interface ReviewPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  podcast_categories?: ReviewCategory[] | null
  last_posted_at: string | null
  is_featured?: boolean
  featured_order?: number | null
  display_order?: number
  // Precomputed enrichment. Public pages never trigger fresh AI work.
  ai_clean_description?: string | null
  ai_fit_reasons?: string[] | null
  ai_pitch_angles?: ReviewPitchAngle[] | null
  demographics?: PodcastDemographics | null
}

/** The part of a saved feedback row the review surface needs. */
export interface ReviewFeedback {
  podcast_id: string
  status: ReviewStatus
  notes: string | null
}

export type ReviewFeedbackMap = ReadonlyMap<string, ReviewFeedback>

export interface PodcastFitAnalysis {
  clean_description: string
  fit_reasons: string[]
  pitch_angles: ReviewPitchAngle[]
}

export interface ReviewCounts {
  total: number
  toReview: number
  interested: number
  notAFit: number
}

/** Cards per page in the shortlist grid. */
export const REVIEW_CARDS_PER_PAGE = 10

export const GENERIC_FIT_REASON = 'Selected for the overlap between your expertise and this show’s audience.'

/** Drops accidental duplicates so no visible total counts a show twice. */
export function uniqueReviewPodcasts<T extends ReviewPodcast>(podcasts: T[]): T[] {
  const seen = new Set<string>()
  return podcasts.filter((podcast) => {
    if (seen.has(podcast.podcast_id)) return false
    seen.add(podcast.podcast_id)
    return true
  })
}

export function reviewCounts(podcasts: ReviewPodcast[], feedback: ReviewFeedbackMap): ReviewCounts {
  const counts: ReviewCounts = { total: 0, toReview: 0, interested: 0, notAFit: 0 }
  for (const podcast of podcasts) {
    counts.total += 1
    const status = feedback.get(podcast.podcast_id)?.status ?? null
    if (status === 'approved') counts.interested += 1
    else if (status === 'rejected') counts.notAFit += 1
    else counts.toReview += 1
  }
  return counts
}

/** The precomputed fit analysis carried on a podcast row, or null when none exists. */
export function fitAnalysisFor(podcast: ReviewPodcast): PodcastFitAnalysis | null {
  if (!podcast.ai_fit_reasons?.length) return null
  return {
    clean_description: podcast.ai_clean_description || podcast.podcast_description || '',
    fit_reasons: podcast.ai_fit_reasons,
    pitch_angles: podcast.ai_pitch_angles || [],
  }
}

export function formatListeners(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
  return value.toLocaleString()
}
