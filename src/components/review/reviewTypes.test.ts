import { describe, expect, it } from 'vitest'
import {
  fitAnalysisFor,
  formatListeners,
  reviewCounts,
  uniqueReviewPodcasts,
  type ReviewFeedback,
  type ReviewPodcast,
} from '@/components/review/reviewTypes'

function podcast(id: string, extra: Partial<ReviewPodcast> = {}): ReviewPodcast {
  return {
    podcast_id: id,
    podcast_name: `Show ${id}`,
    podcast_description: null,
    podcast_image_url: null,
    podcast_url: null,
    publisher_name: null,
    itunes_rating: null,
    episode_count: null,
    audience_size: null,
    last_posted_at: null,
    ...extra,
  }
}

describe('reviewCounts', () => {
  it('splits the list into to review, interested and not a fit', () => {
    const feedback = new Map<string, ReviewFeedback>([
      ['a', { podcast_id: 'a', status: 'approved', notes: null }],
      ['b', { podcast_id: 'b', status: 'rejected', notes: null }],
      ['c', { podcast_id: 'c', status: null, notes: 'later' }],
    ])

    expect(reviewCounts([podcast('a'), podcast('b'), podcast('c'), podcast('d')], feedback)).toEqual({
      total: 4,
      toReview: 2,
      interested: 1,
      notAFit: 1,
    })
  })

  it('ignores feedback for shows that are not on the list', () => {
    const feedback = new Map<string, ReviewFeedback>([['gone', { podcast_id: 'gone', status: 'approved', notes: null }]])
    expect(reviewCounts([podcast('a')], feedback)).toEqual({ total: 1, toReview: 1, interested: 0, notAFit: 0 })
  })
})

describe('uniqueReviewPodcasts', () => {
  it('keeps the first occurrence of a duplicated show', () => {
    const first = podcast('a', { podcast_name: 'First' })
    expect(uniqueReviewPodcasts([first, podcast('b'), podcast('a', { podcast_name: 'Second' })])).toEqual([first, podcast('b')])
  })
})

describe('fitAnalysisFor', () => {
  it('returns null when no fit reasons were precomputed', () => {
    expect(fitAnalysisFor(podcast('a'))).toBeNull()
    expect(fitAnalysisFor(podcast('a', { ai_fit_reasons: [] }))).toBeNull()
  })

  it('prefers the cleaned description and falls back to the raw one', () => {
    expect(fitAnalysisFor(podcast('a', { ai_fit_reasons: ['Fits'], ai_clean_description: 'Clean', podcast_description: 'Raw' }))).toEqual({
      clean_description: 'Clean',
      fit_reasons: ['Fits'],
      pitch_angles: [],
    })
    expect(fitAnalysisFor(podcast('a', { ai_fit_reasons: ['Fits'], podcast_description: 'Raw' }))?.clean_description).toBe('Raw')
  })
})

describe('formatListeners', () => {
  it('rounds to thousands and millions', () => {
    expect(formatListeners(950)).toBe('950')
    expect(formatListeners(42000)).toBe('42K')
    expect(formatListeners(1_250_000)).toBe('1.3M')
  })
})
