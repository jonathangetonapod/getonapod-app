import { supabase } from '@/lib/supabase'

// ==================== TYPES ====================

export interface PodcastGrowthStats {
  added_today: number
  added_last_7_days: number
  added_last_30_days: number
}

export interface TopCachedPodcast {
  id: string
  podcast_name: string
  host_name: string | null
  audience_size: number | null
  cache_hit_count: number
  podscan_fetch_count: number
  created_at: string
}

export interface RecentlyAddedPodcast {
  id: string
  podcast_name: string
  host_name: string | null
  audience_size: number | null
  itunes_rating: number | null
  created_at: string
}

export interface CategoryStats {
  category_name: string
  podcast_count: number
  avg_audience_size: number
  max_audience_size: number
}

export interface DetailedCacheStats {
  total_podcasts: number
  podcasts_with_demographics: number
  demographics_coverage_pct: number
  podcasts_with_email: number
  email_coverage_pct: number
  active_podcasts: number
  stale_podcasts: number
  avg_audience_size: number
  max_audience_size: number
  total_cache_hits: number
  avg_cache_hits_per_podcast: number
  total_podscan_fetches: number
  estimated_api_calls_saved: number
  cache_efficiency_pct: number
  estimated_money_saved_usd: number
  unique_languages: number
  unique_regions: number
  added_last_7_days: number
  added_last_30_days: number
}

export interface AudienceDistribution {
  under_1k: number
  '1k_10k': number
  '10k_50k': number
  '50k_100k': number
  '100k_500k': number
  over_500k: number
}

export interface RatingDistribution {
  excellent_45_plus: number
  good_40_45: number
  average_35_40: number
  below_avg_30_35: number
  poor_under_30: number
  no_rating: number
}

// ==================== FETCH FUNCTIONS ====================

/**
 * Get growth statistics (podcasts added over time)
 */
export async function getPodcastGrowthStats(): Promise<PodcastGrowthStats | null> {
  const { data, error } = await supabase
    .from('podcast_growth_stats')
    .select('*')
    .single()

  if (error) {
    console.error('Failed to fetch growth stats:', error)
    return null
  }

  return data
}

/**
 * Get top 20 most cached podcasts
 */
export async function getTopCachedPodcasts(): Promise<TopCachedPodcast[]> {
  const { data, error } = await supabase
    .from('top_cached_podcasts')
    .select('*')

  if (error) {
    console.error('Failed to fetch top cached podcasts:', error)
    return []
  }

  return data || []
}

/**
 * Get recently added podcasts
 */
export async function getRecentlyAddedPodcasts(): Promise<RecentlyAddedPodcast[]> {
  const { data, error } = await supabase
    .from('recently_added_podcasts')
    .select('*')

  if (error) {
    console.error('Failed to fetch recently added podcasts:', error)
    return []
  }

  return data || []
}

/**
 * Get category statistics
 */
export async function getCategoryStats(): Promise<CategoryStats[]> {
  const { data, error } = await supabase
    .from('podcast_category_stats')
    .select('*')

  if (error) {
    console.error('Failed to fetch category stats:', error)
    return []
  }

  return data || []
}

/**
 * Get detailed cache statistics
 */
export async function getDetailedCacheStats(): Promise<DetailedCacheStats | null> {
  const { data, error } = await supabase
    .from('podcast_cache_statistics_detailed')
    .select('*')
    .single()

  if (error) {
    console.error('Failed to fetch detailed cache stats:', error)
    return null
  }

  return data
}

/**
 * Get audience size distribution
 */
export async function getAudienceDistribution(): Promise<AudienceDistribution | null> {
  const { data, error } = await supabase
    .from('podcast_audience_distribution')
    .select('*')
    .single()

  if (error) {
    console.error('Failed to fetch audience distribution:', error)
    return null
  }

  return data
}

/**
 * Get rating distribution
 */
export async function getRatingDistribution(): Promise<RatingDistribution | null> {
  const { data, error } = await supabase
    .from('podcast_rating_distribution')
    .select('*')
    .single()

  if (error) {
    console.error('Failed to fetch rating distribution:', error)
    return null
  }

  return data
}

/**
 * Get all analytics data in one call
 */
export async function getAllAnalytics() {
  const [
    growthStats,
    detailedStats,
    topCached,
    recentlyAdded,
    categoryStats,
    audienceDistribution,
    ratingDistribution
  ] = await Promise.all([
    getPodcastGrowthStats(),
    getDetailedCacheStats(),
    getTopCachedPodcasts(),
    getRecentlyAddedPodcasts(),
    getCategoryStats(),
    getAudienceDistribution(),
    getRatingDistribution()
  ])

  return {
    growthStats,
    detailedStats,
    topCached,
    recentlyAdded,
    categoryStats,
    audienceDistribution,
    ratingDistribution
  }
}
