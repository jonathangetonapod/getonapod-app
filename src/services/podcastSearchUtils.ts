import { PodcastData, searchPodcasts, SearchOptions } from './podscan'

/**
 * Deduplicate podcasts by podcast_id
 */
export function deduplicatePodcasts(podcasts: PodcastData[]): PodcastData[] {
  const seen = new Set<string>()
  const unique: PodcastData[] = []

  for (const podcast of podcasts) {
    if (!seen.has(podcast.podcast_id)) {
      seen.add(podcast.podcast_id)
      unique.push(podcast)
    }
  }

  return unique
}

/**
 * Search multiple queries and combine results
 */
export async function searchMultipleQueries(
  queries: string[],
  baseFilters: Omit<SearchOptions, 'query'> = {},
  onQueryComplete?: (queryIndex: number, results: PodcastData[]) => void
): Promise<PodcastData[]> {
  const allResults: PodcastData[] = []

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]

    try {
      const response = await searchPodcasts({
        ...baseFilters,
        query,
      })

      const results = response.podcasts || []
      allResults.push(...results)

      if (onQueryComplete) {
        onQueryComplete(i, results)
      }
    } catch (error) {
      console.error(`Error searching query "${query}":`, error)
      // Continue with other queries even if one fails
      if (onQueryComplete) {
        onQueryComplete(i, [])
      }
    }
  }

  // Deduplicate across all queries
  return deduplicatePodcasts(allResults)
}

/**
 * Search with progressive results
 * Returns results as they come in for better UX
 */
export async function searchWithProgressiveResults(
  queries: string[],
  baseFilters: Omit<SearchOptions, 'query'> = {},
  onResults: (results: PodcastData[], queryIndex: number, isComplete: boolean) => void
): Promise<PodcastData[]> {
  const allResults: PodcastData[] = []
  const seenIds = new Set<string>()

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i]

    try {
      const response = await searchPodcasts({
        ...baseFilters,
        query,
      })

      const results = response.podcasts || []

      // Filter out duplicates in real-time
      const newResults = results.filter(p => {
        if (seenIds.has(p.podcast_id)) {
          return false
        }
        seenIds.add(p.podcast_id)
        return true
      })

      allResults.push(...newResults)

      // Send progressive update
      onResults(newResults, i, i === queries.length - 1)
    } catch (error) {
      console.error(`Error searching query "${query}":`, error)
      onResults([], i, i === queries.length - 1)
    }
  }

  return allResults
}

/**
 * Get statistics about search results
 */
export interface SearchStatistics {
  totalPodcasts: number
  uniquePodcasts: number
  duplicatesRemoved: number
  averageAudienceSize: number
  podcastsWithGuests: number
  topCategories: Array<{ category: string; count: number }>
  audienceSizeDistribution: {
    small: number // 0-10K
    medium: number // 10K-50K
    large: number // 50K-100K
    mega: number // 100K+
  }
}

export function calculateSearchStatistics(podcasts: PodcastData[]): SearchStatistics {
  const audienceSizes = podcasts
    .filter(p => p.reach?.audience_size)
    .map(p => p.reach!.audience_size!)

  const avgAudience = audienceSizes.length > 0
    ? audienceSizes.reduce((sum, size) => sum + size, 0) / audienceSizes.length
    : 0

  // Count categories
  const categoryCount = new Map<string, number>()
  podcasts.forEach(p => {
    p.podcast_categories?.forEach(cat => {
      const count = categoryCount.get(cat.category_name) || 0
      categoryCount.set(cat.category_name, count + 1)
    })
  })

  const topCategories = Array.from(categoryCount.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Audience distribution
  const distribution = {
    small: 0,
    medium: 0,
    large: 0,
    mega: 0,
  }

  podcasts.forEach(p => {
    const size = p.reach?.audience_size || 0
    if (size < 10000) distribution.small++
    else if (size < 50000) distribution.medium++
    else if (size < 100000) distribution.large++
    else distribution.mega++
  })

  return {
    totalPodcasts: podcasts.length,
    uniquePodcasts: podcasts.length,
    duplicatesRemoved: 0,
    averageAudienceSize: Math.round(avgAudience),
    podcastsWithGuests: podcasts.length, // Assume all have guests for now
    topCategories,
    audienceSizeDistribution: distribution,
  }
}

/**
 * Filter podcasts by various criteria
 */
export interface FilterCriteria {
  minAudienceSize?: number
  maxAudienceSize?: number
  minEpisodeCount?: number
  categories?: string[]
  minRating?: number
  excludePodcastIds?: string[]
}

export function filterPodcasts(
  podcasts: PodcastData[],
  criteria: FilterCriteria
): PodcastData[] {
  return podcasts.filter(podcast => {
    // Audience size
    if (criteria.minAudienceSize !== undefined) {
      const size = podcast.reach?.audience_size || 0
      if (size < criteria.minAudienceSize) return false
    }

    if (criteria.maxAudienceSize !== undefined) {
      const size = podcast.reach?.audience_size || 0
      if (size > criteria.maxAudienceSize) return false
    }

    // Episode count
    if (criteria.minEpisodeCount !== undefined) {
      const count = podcast.episode_count || 0
      if (count < criteria.minEpisodeCount) return false
    }

    // Categories
    if (criteria.categories && criteria.categories.length > 0) {
      const podcastCategories = podcast.podcast_categories?.map(c => c.category_name) || []
      const hasMatchingCategory = criteria.categories.some(cat =>
        podcastCategories.includes(cat)
      )
      if (!hasMatchingCategory) return false
    }

    // Rating
    if (criteria.minRating !== undefined) {
      const rating = parseFloat(podcast.reach?.itunes?.itunes_rating_average || '0')
      if (rating < criteria.minRating) return false
    }

    // Exclusions
    if (criteria.excludePodcastIds && criteria.excludePodcastIds.length > 0) {
      if (criteria.excludePodcastIds.includes(podcast.podcast_id)) return false
    }

    return true
  })
}

/**
 * Sort podcasts by various criteria
 */
export type SortBy = 'audience' | 'episodes' | 'rating' | 'name' | 'compatibility'

export function sortPodcasts(
  podcasts: PodcastData[],
  sortBy: SortBy,
  sortOrder: 'asc' | 'desc' = 'desc'
): PodcastData[] {
  const sorted = [...podcasts].sort((a, b) => {
    let comparison = 0

    switch (sortBy) {
      case 'audience':
        comparison = (a.reach?.audience_size || 0) - (b.reach?.audience_size || 0)
        break
      case 'episodes':
        comparison = (a.episode_count || 0) - (b.episode_count || 0)
        break
      case 'rating':
        const ratingA = parseFloat(a.reach?.itunes?.itunes_rating_average || '0')
        const ratingB = parseFloat(b.reach?.itunes?.itunes_rating_average || '0')
        comparison = ratingA - ratingB
        break
      case 'name':
        comparison = a.podcast_name.localeCompare(b.podcast_name)
        break
      default:
        comparison = 0
    }

    return sortOrder === 'asc' ? comparison : -comparison
  })

  return sorted
}
