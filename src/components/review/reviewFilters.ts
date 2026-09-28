import type { ReviewCategory, ReviewFeedbackMap, ReviewPodcast } from '@/components/review/reviewTypes'

export type DecisionFilter = 'all' | 'approved' | 'rejected' | 'not_reviewed'
export type EpisodeFilter = 'any' | 'under50' | '50to100' | '100to200' | '200plus'
export type AudienceFilter = 'any' | 'under1k' | '1kto5k' | '5kto10k' | '10kto25k' | '25kto50k' | '50kto100k' | '100kplus'
export type ReviewSort = 'default' | 'audience_desc' | 'audience_asc'

export interface ReviewFilterState {
  search: string
  decision: DecisionFilter
  categories: string[]
  episodes: EpisodeFilter
  audience: AudienceFilter
  sort: ReviewSort
}

export const EMPTY_REVIEW_FILTERS: ReviewFilterState = {
  search: '',
  decision: 'all',
  categories: [],
  episodes: 'any',
  audience: 'any',
  sort: 'default',
}

export const EPISODE_FILTER_OPTIONS: Array<{ value: EpisodeFilter; label: string }> = [
  { value: 'any', label: 'Any episode count' },
  { value: 'under50', label: 'Under 50 episodes' },
  { value: '50to100', label: '50 to 100 episodes' },
  { value: '100to200', label: '100 to 200 episodes' },
  { value: '200plus', label: '200+ episodes' },
]

export const AUDIENCE_FILTER_OPTIONS: Array<{ value: AudienceFilter; label: string }> = [
  { value: 'any', label: 'Any audience estimate' },
  { value: 'under1k', label: 'Under 1K' },
  { value: '1kto5k', label: '1K to 5K' },
  { value: '5kto10k', label: '5K to 10K' },
  { value: '10kto25k', label: '10K to 25K' },
  { value: '25kto50k', label: '25K to 50K' },
  { value: '50kto100k', label: '50K to 100K' },
  { value: '100kplus', label: '100K+' },
]

export const SORT_OPTIONS: Array<{ value: ReviewSort; label: string }> = [
  { value: 'default', label: 'Recommended order' },
  { value: 'audience_desc', label: 'Largest audience' },
  { value: 'audience_asc', label: 'Emerging shows first' },
]

const EPISODE_RANGES: Record<Exclude<EpisodeFilter, 'any'>, [number, number]> = {
  under50: [0, 50],
  '50to100': [50, 100],
  '100to200': [100, 200],
  '200plus': [200, Number.POSITIVE_INFINITY],
}

const AUDIENCE_RANGES: Record<Exclude<AudienceFilter, 'any'>, [number, number]> = {
  under1k: [0, 1000],
  '1kto5k': [1000, 5000],
  '5kto10k': [5000, 10000],
  '10kto25k': [10000, 25000],
  '25kto50k': [25000, 50000],
  '50kto100k': [50000, 100000],
  '100kplus': [100000, Number.POSITIVE_INFINITY],
}

function inRange(value: number, [from, to]: [number, number]): boolean {
  return value >= from && value < to
}

/** Applies every filter in `filters`, then the chosen sort. */
export function filterReviewPodcasts<T extends ReviewPodcast>(
  podcasts: T[],
  filters: ReviewFilterState,
  feedback: ReviewFeedbackMap,
): T[] {
  const query = filters.search.trim().toLowerCase()

  const matches = podcasts.filter((podcast) => {
    if (query) {
      const haystack = [podcast.podcast_name, podcast.podcast_description, podcast.publisher_name]
      if (!haystack.some((field) => field?.toLowerCase().includes(query))) return false
    }

    if (filters.categories.length > 0) {
      const ids = (podcast.podcast_categories ?? []).map((category) => category.category_id)
      if (!filters.categories.some((id) => ids.includes(id))) return false
    }

    if (filters.decision !== 'all') {
      const status = feedback.get(podcast.podcast_id)?.status ?? null
      if (filters.decision === 'not_reviewed' ? status !== null : status !== filters.decision) return false
    }

    if (filters.episodes !== 'any' && !inRange(podcast.episode_count || 0, EPISODE_RANGES[filters.episodes])) return false
    if (filters.audience !== 'any' && !inRange(podcast.audience_size || 0, AUDIENCE_RANGES[filters.audience])) return false

    return true
  })

  if (filters.sort === 'default') return matches
  const direction = filters.sort === 'audience_desc' ? -1 : 1
  return [...matches].sort((left, right) => direction * ((left.audience_size || 0) - (right.audience_size || 0)))
}

/** Every category on the list, once each, alphabetically. */
export function collectReviewCategories(podcasts: ReviewPodcast[]): ReviewCategory[] {
  const seen = new Map<string, ReviewCategory>()
  for (const podcast of podcasts) {
    for (const category of podcast.podcast_categories ?? []) {
      if (category?.category_id && category?.category_name && !seen.has(category.category_id)) {
        seen.set(category.category_id, { category_id: category.category_id, category_name: category.category_name })
      }
    }
  }
  return [...seen.values()].sort((left, right) => left.category_name.localeCompare(right.category_name))
}

/** Filters that narrow the list. Search and sort are shown separately. */
export function countActiveFilters(filters: ReviewFilterState): number {
  return filters.categories.length
    + (filters.decision === 'all' ? 0 : 1)
    + (filters.episodes === 'any' ? 0 : 1)
    + (filters.audience === 'any' ? 0 : 1)
}

export function hasActiveFilters(filters: ReviewFilterState): boolean {
  return countActiveFilters(filters) > 0 || Boolean(filters.search)
}
