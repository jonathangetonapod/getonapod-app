import { describe, expect, it } from 'vitest'
import {
  EMPTY_REVIEW_FILTERS,
  collectReviewCategories,
  countActiveFilters,
  filterReviewPodcasts,
  hasActiveFilters,
} from '@/components/review/reviewFilters'
import type { ReviewFeedback, ReviewPodcast } from '@/components/review/reviewTypes'

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

const list = [
  podcast('lead', { podcast_name: 'The Clear Leader', publisher_name: 'Morgan Host', audience_size: 42000, episode_count: 146, podcast_categories: [{ category_id: 'leadership', category_name: 'Leadership' }] }),
  podcast('founder', { podcast_name: 'Founder Signal', podcast_description: 'How founders build trust.', audience_size: 18000, episode_count: 82, podcast_categories: [{ category_id: 'business', category_name: 'Business' }] }),
  podcast('quiet', { podcast_name: 'Quiet Craft', audience_size: 700, episode_count: 12 }),
]

const feedback = new Map<string, ReviewFeedback>([
  ['lead', { podcast_id: 'lead', status: 'approved', notes: null }],
  ['quiet', { podcast_id: 'quiet', status: 'rejected', notes: null }],
])

const ids = (podcasts: ReviewPodcast[]) => podcasts.map((entry) => entry.podcast_id)

describe('filterReviewPodcasts', () => {
  it('returns everything in list order with no filters', () => {
    expect(ids(filterReviewPodcasts(list, EMPTY_REVIEW_FILTERS, feedback))).toEqual(['lead', 'founder', 'quiet'])
  })

  it('searches the name, description and host, case-insensitively', () => {
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, search: 'founder' }, feedback))).toEqual(['founder'])
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, search: 'MORGAN' }, feedback))).toEqual(['lead'])
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, search: '  trust ' }, feedback))).toEqual(['founder'])
  })

  it('filters by the decision made on each show', () => {
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, decision: 'not_reviewed' }, feedback))).toEqual(['founder'])
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, decision: 'approved' }, feedback))).toEqual(['lead'])
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, decision: 'rejected' }, feedback))).toEqual(['quiet'])
  })

  it('filters by topic, audience and show depth', () => {
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, categories: ['business'] }, feedback))).toEqual(['founder'])
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, audience: '10kto25k' }, feedback))).toEqual(['founder'])
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, audience: 'under1k' }, feedback))).toEqual(['quiet'])
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, episodes: '100to200' }, feedback))).toEqual(['lead'])
  })

  it('sorts by audience either way without touching the input', () => {
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, sort: 'audience_asc' }, feedback))).toEqual(['quiet', 'founder', 'lead'])
    expect(ids(filterReviewPodcasts(list, { ...EMPTY_REVIEW_FILTERS, sort: 'audience_desc' }, feedback))).toEqual(['lead', 'founder', 'quiet'])
    expect(ids(list)).toEqual(['lead', 'founder', 'quiet'])
  })
})

describe('collectReviewCategories', () => {
  it('lists each category once, alphabetically', () => {
    const categories = collectReviewCategories([
      ...list,
      podcast('again', { podcast_categories: [{ category_id: 'business', category_name: 'Business' }, { category_id: 'arts', category_name: 'Arts' }] }),
    ])
    expect(categories.map((category) => category.category_name)).toEqual(['Arts', 'Business', 'Leadership'])
  })
})

describe('active filter counts', () => {
  it('counts what narrows the list, not search or sort', () => {
    expect(countActiveFilters(EMPTY_REVIEW_FILTERS)).toBe(0)
    expect(countActiveFilters({ ...EMPTY_REVIEW_FILTERS, search: 'x', sort: 'audience_asc' })).toBe(0)
    expect(countActiveFilters({ ...EMPTY_REVIEW_FILTERS, categories: ['a', 'b'], decision: 'approved', audience: 'under1k' })).toBe(4)
    expect(hasActiveFilters({ ...EMPTY_REVIEW_FILTERS, search: 'x' })).toBe(true)
    expect(hasActiveFilters(EMPTY_REVIEW_FILTERS)).toBe(false)
  })
})
