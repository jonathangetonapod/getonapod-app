import { supabase } from '@/lib/supabase'

export interface UniversalPodcastCache {
  podcast_id: string
  podcast_name: string
  podcast_description?: string
  podcast_image_url?: string
  podcast_url?: string
  publisher_name?: string
  itunes_rating?: number
  itunes_rating_count?: number
  episode_count?: number
  audience_size?: number
  podcast_categories?: any
  last_posted_at?: string
  rss_url?: string
  demographics?: any // Demographics ARE universal
  source: 'client_dashboard' | 'prospect_dashboard' | 'booking' | 'not_found'
  source_id?: string
  cached_at?: string
  has_demographics?: boolean
}

export interface CacheStatistics {
  total_cached: number
  by_source: {
    client_dashboards: number
    prospect_dashboards: number
    bookings: number
  }
  estimated_credits_saved: number
}

/**
 * Search for podcast metadata across all cache sources
 * Returns ONLY universal data, excludes personalized AI analysis
 * Priority: client_dashboard → prospect_dashboard → booking
 */
export async function findCachedPodcastMetadata(
  podcastId: string
): Promise<UniversalPodcastCache | null> {
  // 1. Check client_dashboard_podcasts (most complete)
  const { data: clientCache, error: clientError } = await supabase
    .from('client_dashboard_podcasts')
    .select(`
      podcast_id,
      podcast_name,
      podcast_description,
      podcast_image_url,
      podcast_url,
      publisher_name,
      itunes_rating,
      episode_count,
      audience_size,
      podcast_categories,
      last_posted_at,
      demographics,
      demographics_fetched_at,
      created_at,
      client_id
    `)
    .eq('podcast_id', podcastId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (clientCache) {
    return {
      podcast_id: clientCache.podcast_id,
      podcast_name: clientCache.podcast_name,
      podcast_description: clientCache.podcast_description,
      podcast_image_url: clientCache.podcast_image_url,
      podcast_url: clientCache.podcast_url,
      publisher_name: clientCache.publisher_name,
      itunes_rating: clientCache.itunes_rating,
      episode_count: clientCache.episode_count,
      audience_size: clientCache.audience_size,
      podcast_categories: clientCache.podcast_categories,
      last_posted_at: clientCache.last_posted_at,
      demographics: clientCache.demographics,
      source: 'client_dashboard',
      source_id: clientCache.client_id,
      cached_at: clientCache.created_at,
      has_demographics: !!clientCache.demographics_fetched_at
    }
  }

  // 2. Check prospect_dashboard_podcasts
  const { data: prospectCache } = await supabase
    .from('prospect_dashboard_podcasts')
    .select(`
      podcast_id,
      podcast_name,
      podcast_description,
      podcast_image_url,
      podcast_url,
      publisher_name,
      itunes_rating,
      episode_count,
      audience_size,
      podcast_categories,
      last_posted_at,
      created_at,
      prospect_dashboard_id
    `)
    .eq('podcast_id', podcastId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (prospectCache) {
    return {
      podcast_id: prospectCache.podcast_id,
      podcast_name: prospectCache.podcast_name,
      podcast_description: prospectCache.podcast_description,
      podcast_image_url: prospectCache.podcast_image_url,
      podcast_url: prospectCache.podcast_url,
      publisher_name: prospectCache.publisher_name,
      itunes_rating: prospectCache.itunes_rating,
      episode_count: prospectCache.episode_count,
      audience_size: prospectCache.audience_size,
      podcast_categories: prospectCache.podcast_categories,
      last_posted_at: prospectCache.last_posted_at,
      source: 'prospect_dashboard',
      source_id: prospectCache.prospect_dashboard_id,
      cached_at: prospectCache.created_at,
      has_demographics: false
    }
  }

  // 3. Check bookings (partial data)
  const { data: bookingCache } = await supabase
    .from('bookings')
    .select(`
      podcast_id,
      podcast_name,
      podcast_description,
      podcast_image_url,
      podcast_url,
      itunes_rating,
      itunes_rating_count,
      episode_count,
      audience_size,
      rss_url,
      created_at,
      client_id
    `)
    .eq('podcast_id', podcastId)
    .not('podcast_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (bookingCache && bookingCache.podcast_id) {
    return {
      podcast_id: bookingCache.podcast_id,
      podcast_name: bookingCache.podcast_name,
      podcast_description: bookingCache.podcast_description,
      podcast_image_url: bookingCache.podcast_image_url,
      podcast_url: bookingCache.podcast_url,
      itunes_rating: bookingCache.itunes_rating,
      itunes_rating_count: bookingCache.itunes_rating_count,
      episode_count: bookingCache.episode_count,
      audience_size: bookingCache.audience_size,
      rss_url: bookingCache.rss_url,
      source: 'booking',
      source_id: bookingCache.client_id,
      cached_at: bookingCache.created_at,
      has_demographics: false
    }
  }

  // 4. Not found anywhere
  return null
}

/**
 * Batch search for podcast metadata across all sources
 * Returns map of podcast_id → cached metadata
 */
export async function findCachedPodcastsMetadata(
  podcastIds: string[]
): Promise<Map<string, UniversalPodcastCache>> {
  const results = new Map<string, UniversalPodcastCache>()

  if (podcastIds.length === 0) {
    return results
  }

  // Query all sources in parallel (excluding AI fields)
  const [clientCaches, prospectCaches, bookingCaches] = await Promise.all([
    supabase
      .from('client_dashboard_podcasts')
      .select(`
        podcast_id, podcast_name, podcast_description, podcast_image_url,
        podcast_url, publisher_name, itunes_rating, episode_count,
        audience_size, podcast_categories, last_posted_at, demographics,
        demographics_fetched_at, created_at, client_id
      `)
      .in('podcast_id', podcastIds),

    supabase
      .from('prospect_dashboard_podcasts')
      .select(`
        podcast_id, podcast_name, podcast_description, podcast_image_url,
        podcast_url, publisher_name, itunes_rating, episode_count,
        audience_size, podcast_categories, last_posted_at,
        created_at, prospect_dashboard_id
      `)
      .in('podcast_id', podcastIds),

    supabase
      .from('bookings')
      .select(`
        podcast_id, podcast_name, podcast_description, podcast_image_url,
        podcast_url, itunes_rating, itunes_rating_count, episode_count,
        audience_size, rss_url, created_at, client_id
      `)
      .in('podcast_id', podcastIds)
      .not('podcast_id', 'is', null)
  ])

  // Process in priority order: bookings (lowest) → prospects → clients (highest)
  // Later entries overwrite earlier ones
  bookingCaches.data?.forEach(cache => {
    if (cache.podcast_id) {
      results.set(cache.podcast_id, {
        podcast_id: cache.podcast_id,
        podcast_name: cache.podcast_name,
        podcast_description: cache.podcast_description,
        podcast_image_url: cache.podcast_image_url,
        podcast_url: cache.podcast_url,
        itunes_rating: cache.itunes_rating,
        itunes_rating_count: cache.itunes_rating_count,
        episode_count: cache.episode_count,
        audience_size: cache.audience_size,
        rss_url: cache.rss_url,
        source: 'booking',
        source_id: cache.client_id,
        cached_at: cache.created_at,
        has_demographics: false
      })
    }
  })

  prospectCaches.data?.forEach(cache => {
    results.set(cache.podcast_id, {
      podcast_id: cache.podcast_id,
      podcast_name: cache.podcast_name,
      podcast_description: cache.podcast_description,
      podcast_image_url: cache.podcast_image_url,
      podcast_url: cache.podcast_url,
      publisher_name: cache.publisher_name,
      itunes_rating: cache.itunes_rating,
      episode_count: cache.episode_count,
      audience_size: cache.audience_size,
      podcast_categories: cache.podcast_categories,
      last_posted_at: cache.last_posted_at,
      source: 'prospect_dashboard',
      source_id: cache.prospect_dashboard_id,
      cached_at: cache.created_at,
      has_demographics: false
    })
  })

  clientCaches.data?.forEach(cache => {
    results.set(cache.podcast_id, {
      podcast_id: cache.podcast_id,
      podcast_name: cache.podcast_name,
      podcast_description: cache.podcast_description,
      podcast_image_url: cache.podcast_image_url,
      podcast_url: cache.podcast_url,
      publisher_name: cache.publisher_name,
      itunes_rating: cache.itunes_rating,
      episode_count: cache.episode_count,
      audience_size: cache.audience_size,
      podcast_categories: cache.podcast_categories,
      last_posted_at: cache.last_posted_at,
      demographics: cache.demographics,
      source: 'client_dashboard',
      source_id: cache.client_id,
      cached_at: cache.created_at,
      has_demographics: !!cache.demographics_fetched_at
    })
  })

  return results
}

/**
 * Get global cache statistics across all sources
 */
export async function getCacheStatistics(): Promise<CacheStatistics> {
  const [clientCount, prospectCount, bookingCount, uniqueCount] = await Promise.all([
    supabase
      .from('client_dashboard_podcasts')
      .select('podcast_id', { count: 'exact', head: true }),

    supabase
      .from('prospect_dashboard_podcasts')
      .select('podcast_id', { count: 'exact', head: true }),

    supabase
      .from('bookings')
      .select('podcast_id', { count: 'exact', head: true })
      .not('podcast_id', 'is', null),

    // Get unique count via RPC function
    supabase.rpc('count_unique_cached_podcasts').catch(() => ({ data: 0 }))
  ])

  const totalUnique = uniqueCount.data || 0

  return {
    total_cached: totalUnique,
    by_source: {
      client_dashboards: clientCount.count || 0,
      prospect_dashboards: prospectCount.count || 0,
      bookings: bookingCount.count || 0
    },
    // Estimate 2 API calls saved per podcast (initial fetch + updates)
    estimated_credits_saved: totalUnique * 2
  }
}

/**
 * Get cache status for a specific client's podcasts
 */
export async function getClientCacheStatus(
  clientId: string,
  podcastIds: string[]
) {
  if (podcastIds.length === 0) {
    return {
      total: 0,
      cached_in_client: 0,
      cached_in_other_clients: 0,
      cached_in_prospects: 0,
      cached_in_bookings: 0,
      needs_fetch: 0,
      cache_map: new Map()
    }
  }

  // Get all cached metadata
  const cachedMap = await findCachedPodcastsMetadata(podcastIds)

  // Count by source
  let cachedInClient = 0
  let cachedInOtherClients = 0
  let cachedInProspects = 0
  let cachedInBookings = 0

  cachedMap.forEach((cached) => {
    if (cached.source === 'client_dashboard') {
      if (cached.source_id === clientId) {
        cachedInClient++
      } else {
        cachedInOtherClients++
      }
    } else if (cached.source === 'prospect_dashboard') {
      cachedInProspects++
    } else if (cached.source === 'booking') {
      cachedInBookings++
    }
  })

  const needsFetch = podcastIds.filter(id => !cachedMap.has(id)).length

  return {
    total: podcastIds.length,
    cached_in_client: cachedInClient,
    cached_in_other_clients: cachedInOtherClients,
    cached_in_prospects: cachedInProspects,
    cached_in_bookings: cachedInBookings,
    needs_fetch: needsFetch,
    cache_map: cachedMap
  }
}
