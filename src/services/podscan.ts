import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'
import { normalizeChartCategories } from '@/lib/podcastResearch'

export interface PodscanRateLimit {
  limit?: number
  remaining?: number
  retryAfterSeconds?: number
  concurrencyLimit?: number
}

interface PodscanEnvelope<T> {
  data: T
  rateLimit?: PodscanRateLimit
}

async function invokePodscanEnvelope<T>(body: Record<string, unknown>): Promise<PodscanEnvelope<T>> {
  const { data, error } = await supabase.functions.invoke('podscan-proxy', { body })
  if (error) throw await toFunctionError(error, 'Podscan request failed.')
  return {
    data: data.data as T,
    rateLimit: data.meta?.rate_limit as PodscanRateLimit | undefined,
  }
}

async function invokePodscan<T>(body: Record<string, unknown>): Promise<T> {
  return (await invokePodscanEnvelope<T>(body)).data
}

export interface PodcastData {
  podcast_id: string;
  podcast_guid?: string;
  podcast_name: string;
  podcast_url: string;
  podcast_description?: string;
  podcast_image_url?: string;
  podcast_reach_score?: number;
  podcast_categories?: Array<{ category_id: string; category_name: string }>;
  episode_count?: number;
  language?: string;
  region?: string;
  publisher_name?: string;
  is_active?: boolean;
  rss_url?: string;
  last_posted_at?: string;
  podcast_itunes_id?: string;
  podcast_spotify_id?: string;
  podcast_has_guests?: boolean;
  podcast_has_sponsors?: boolean;
  reach?: {
    itunes?: {
      itunes_rating_average?: string;
      itunes_rating_count?: string;
      itunes_rating_count_bracket?: string;
    };
    spotify?: {
      spotify_rating_average?: string;
      spotify_rating_count?: string;
      spotify_rating_count_bracket?: string;
    };
    audience_size?: number;
    social_links?: Array<{
      platform: string;
      url: string;
    }>;
    email?: string;
    website?: string;
  };
  brand_safety?: {
    framework: string;
    risk_level: string;
    recommendation: string;
  };
}

export interface PodcastSearchResponse {
  podcasts: PodcastData[];
  pagination?: {
    total?: string;
    per_page?: string;
    current_page?: string;
    last_page?: string;
    from?: string;
    to?: string;
  };
}

export interface SearchOptions {
  query?: string;
  category_ids?: string;
  per_page?: number;
  order_by?: 'best_match' | 'name' | 'created_at' | 'episode_count' | 'rating' | 'audience_size' | 'last_posted_at';
  order_dir?: 'asc' | 'desc';
  search_fields?: string;
  language?: string;
  region?: string;
  min_audience_size?: number;
  max_audience_size?: number;
  min_episode_count?: number;
  max_episode_count?: number;
  min_last_episode_posted_at?: string;
  max_last_episode_posted_at?: string;
  has_guests?: boolean;
  has_sponsors?: boolean;
  page?: number;
}

/**
 * Search for podcasts directly
 */
export async function searchPodcasts(options: SearchOptions = {}): Promise<PodcastSearchResponse> {
  return await invokePodscan<PodcastSearchResponse>({ action: 'search', options })
}

export async function searchPodcastsWithMeta(options: SearchOptions = {}): Promise<PodscanEnvelope<PodcastSearchResponse>> {
  return await invokePodscanEnvelope<PodcastSearchResponse>({ action: 'search', options })
}

/**
 * Search for business/entrepreneurship podcasts with variety
 */
export async function searchBusinessPodcasts(limit = 20): Promise<PodcastData[]> {
  // Fetch more than needed to create variety
  const fetchSize = Math.min(limit * 3, 50); // Fetch 3x what we need, max 50

  // Randomize the order_by to get different results each time
  const orderOptions: Array<'rating' | 'episode_count' | 'audience_size' | 'last_posted_at'> = [
    'rating',
    'episode_count',
    'audience_size',
    'last_posted_at'
  ];
  const randomOrder = orderOptions[Math.floor(Math.random() * orderOptions.length)];

  const response = await searchPodcasts({
    query: 'business OR entrepreneurship OR startup OR founder',
    per_page: fetchSize,
    order_by: randomOrder,
    order_dir: 'desc',
    min_episode_count: 10, // Filter out brand new podcasts
    min_audience_size: 1000, // Minimum 1K audience
    max_audience_size: 30000, // Max 30K listeners - realistic boutique agency range
    region: 'US', // Only US-based podcasts
    has_guests: true, // Only shows that do interviews
  });

  // Filter out podcasts with invalid/missing image URLs
  const validPodcasts = response.podcasts.filter(podcast =>
    podcast.podcast_image_url &&
    podcast.podcast_image_url.startsWith('http')
  );

  // Shuffle and return random subset
  const shuffled = validPodcasts.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

/**
 * Search for premium/high-tier podcasts for premium placements
 */
export async function searchPremiumPodcasts(limit = 12): Promise<PodcastData[]> {
  // Fetch more for variety
  const fetchSize = Math.min(limit * 2, 50);

  const response = await searchPodcasts({
    query: 'business OR entrepreneurship OR startup OR founder OR leadership OR SaaS',
    per_page: fetchSize,
    order_by: 'audience_size', // Sort by audience size for premium tier
    order_dir: 'desc',
    min_episode_count: 20, // More established shows
    min_audience_size: 10000, // Minimum 10K audience
    max_audience_size: 200000, // Max 200K - premium tier shows
    region: 'US',
    has_guests: true,
  });

  // Filter out podcasts with invalid/missing image URLs
  const validPodcasts = response.podcasts.filter(podcast =>
    podcast.podcast_image_url &&
    podcast.podcast_image_url.startsWith('http')
  );

  // Shuffle and return subset
  const shuffled = validPodcasts.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

/**
 * Search for finance/investment podcasts
 */
export async function searchFinancePodcasts(limit = 20): Promise<PodcastData[]> {
  const response = await searchPodcasts({
    query: 'finance OR investing OR wealth OR fintech',
    per_page: limit,
    order_by: 'rating',
    order_dir: 'desc',
  });

  return response.podcasts;
}

/**
 * Search for tech/SaaS podcasts
 */
export async function searchTechPodcasts(limit = 20): Promise<PodcastData[]> {
  const response = await searchPodcasts({
    query: 'technology OR tech OR SaaS OR software',
    per_page: limit,
    order_by: 'rating',
    order_dir: 'desc',
  });

  return response.podcasts;
}

/**
 * Search for podcasts in specific categories
 */
export async function searchPodcastsByCategory(
  categories: string[],
  limit = 20
): Promise<PodcastData[]> {
  const response = await searchPodcasts({
    category_ids: categories.join(','),
    per_page: limit,
    order_by: 'rating',
    order_dir: 'desc',
  });

  return response.podcasts;
}

/**
 * Get a single podcast by ID
 */
export async function getPodcastById(podcastId: string): Promise<PodcastData> {
  const data = await invokePodscan<{ podcast?: PodcastData } & PodcastData>({
    action: 'podcast',
    podcast_id: podcastId,
  })

  // API returns { podcast: { ... } }, extract the podcast object
  return data.podcast || data;
}

/**
 * Search all pages of Podscan results for given keywords.
 * Calls onProgress for each page so the UI can show progress.
 * Returns total count of podcasts found.
 */
/**
 * Preview a Podscan search to see how many results exist (1 API call).
 */
export async function previewSearch(
  options: SearchOptions
): Promise<{ totalCount: number; totalPages: number; firstPage: PodcastData[] }> {
  const response = await searchPodcasts({ ...options, per_page: 50, page: 1 })
  const totalCount = parseInt(response.pagination?.total || '0')
  const totalPages = parseInt(response.pagination?.last_page || '1')
  return { totalCount, totalPages, firstPage: response.podcasts || [] }
}

export async function searchAllPodcasts(
  options: SearchOptions,
  onPage: (podcasts: PodcastData[], pageNum: number, totalPages: number, totalCount: number) => void | Promise<void>,
  onProgress?: (message: string) => void,
  maxPages?: number,
  opts?: {
    firstPageData?: PodcastData[]  // Reuse preview data to skip re-fetching page 1
    totalCount?: number
    totalPages?: number
    abortSignal?: AbortSignal
  },
): Promise<{ totalFound: number; totalPages: number }> {
  let totalCount: number
  let lastPage: number
  let firstPagePodcasts: PodcastData[]

  // Reuse preview data if available, otherwise fetch page 1
  if (opts?.firstPageData && opts.totalCount && opts.totalPages) {
    totalCount = opts.totalCount
    lastPage = opts.totalPages
    firstPagePodcasts = opts.firstPageData
  } else {
    const firstResponse = await searchPodcasts({ ...options, per_page: 50, page: 1 })
    totalCount = parseInt(firstResponse.pagination?.total || '0')
    lastPage = parseInt(firstResponse.pagination?.last_page || '1')
    firstPagePodcasts = firstResponse.podcasts || []
  }

  const pagesToFetch = maxPages ? Math.min(lastPage, maxPages) : lastPage

  if (firstPagePodcasts.length > 0) {
    await onPage(firstPagePodcasts, 1, pagesToFetch, totalCount)
  }

  if (totalCount === 0) {
    return { totalFound: 0, totalPages: 0 }
  }

  onProgress?.(`Importing ${pagesToFetch} of ${lastPage} pages (${Math.min(pagesToFetch * 50, totalCount)} of ${totalCount} podcasts)...`)

  // Fetch remaining pages up to maxPages
  for (let page = 2; page <= pagesToFetch; page++) {
    // Check for cancellation
    if (opts?.abortSignal?.aborted) {
      onProgress?.(`Cancelled at page ${page - 1}/${pagesToFetch}`)
      return { totalFound: totalCount, totalPages: page - 1 }
    }

    // Rate limit: ~500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500))

    // Retry logic for rate limits (429)
    let retries = 0
    const maxRetries = 2
    while (retries <= maxRetries) {
      if (opts?.abortSignal?.aborted) break

      try {
        const response = await searchPodcasts({ ...options, per_page: 50, page })
        const podcasts = response.podcasts || []

        if (podcasts.length > 0) {
          await onPage(podcasts, page, pagesToFetch, totalCount)
        }

        onProgress?.(`Page ${page}/${pagesToFetch} — ${podcasts.length} podcasts`)
        break // Success, exit retry loop
      } catch (error: unknown) {
        const requestError = error as { message?: string; status?: number }
        const is429 = requestError.message?.includes('429') || requestError.status === 429
        if (is429 && retries < maxRetries) {
          retries++
          const backoffMs = 1000 * Math.pow(2, retries) // 2s, 4s
          onProgress?.(`Rate limited on page ${page}, retrying in ${backoffMs / 1000}s...`)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
        } else {
          console.error(`Failed to fetch page ${page}:`, error)
          onProgress?.(`Page ${page}/${pagesToFetch} failed, continuing...`)
          break
        }
      }
    }
  }

  return { totalFound: totalCount, totalPages: pagesToFetch }
}

/**
 * Get related podcasts for a given podcast ID
 */
export async function getRelatedPodcasts(podcastId: string): Promise<PodcastData[]> {
  const data = await invokePodscan<{
    related_podcasts?: PodcastData[]
    podcasts?: PodcastData[]
  } | PodcastData[]>({ action: 'related', podcast_id: podcastId })
  if (Array.isArray(data)) return data
  return data.related_podcasts || data.podcasts || [];
}

/**
 * Get podcast analytics/stats
 */
export interface PodcastAnalytics {
  id: string;
  name: string;
  reach_score: number;
  episode_count: number;
  rating: number;
  categories: string[];
  language: string;
  region: string;
  audience_size: number;
}

/**
 * Podcast demographics data from Podscan
 */
export interface PodcastDemographics {
  episodes_analyzed: number
  total_episodes: number
  age: string
  gender_skew: string
  purchasing_power: string
  education_level: string
  engagement_level: string
  age_distribution: Array<{ age: string; percentage: number }>
  geographic_distribution: Array<{ region: string; percentage: number }>
  professional_industry: Array<{ industry: string; percentage: number }>
  family_status_distribution: Array<{ status: string; percentage: number }>
  technology_adoption?: {
    profile: string
    confidence_score: number
    reasoning: string
  }
  content_habits?: {
    primary_platforms: string[]
    content_frequency: string
    preferred_formats: string[]
    consumption_context: string[]
  }
  ideological_leaning?: {
    spectrum: string
    confidence_score: number
    polarization_level: string
    reasoning: string
  }
  living_environment?: {
    urban: number
    suburban: number
    rural: number
    confidence_score: number
    reasoning: string
  }
  brand_relationship?: {
    loyalty_level: string
    price_sensitivity: string
    brand_switching_frequency: string
    advocacy_potential: string
    reasoning: string
  }
}

/**
 * Get podcast demographics data (only available for some podcasts)
 */
export async function getPodcastDemographics(podcastId: string): Promise<PodcastDemographics | null> {
  try {
    const data = await invokePodscan<PodcastDemographics & { error?: string }>({
      action: 'demographics',
      podcast_id: podcastId,
    })

    // Check if we got an error response
    if (data.error || !data.episodes_analyzed) {
      return null
    }

    return data
  } catch (error) {
    console.error('❌ Error fetching demographics:', error)
    return null
  }
}

export function getPodcastAnalytics(podcast: PodcastData): PodcastAnalytics {
  const rating = podcast.reach?.itunes?.itunes_rating_average
    ? parseFloat(podcast.reach.itunes.itunes_rating_average)
    : 0;

  const categories = podcast.podcast_categories?.map(cat => cat.category_name) || [];

  return {
    id: podcast.podcast_id,
    name: podcast.podcast_name,
    reach_score: podcast.podcast_reach_score || 0,
    episode_count: podcast.episode_count || 0,
    rating: rating,
    categories: categories,
    language: podcast.language || 'en',
    region: podcast.region || 'US',
    audience_size: podcast.reach?.audience_size || 0,
  };
}

// ============================================
// CHARTS API
// ============================================

export interface ChartCountry {
  code: string;
  name: string;
}

export interface ChartCategory {
  id: string;
  name: string;
}

export interface ChartPodcast extends PodcastData {
  rank?: number;
  // Chart API specific fields (different from search API)
  name?: string;
  publisher?: string;
  movement?: 'UP' | 'DOWN' | 'UNCHANGED';
  artwork?: string;
  image?: string;
}

interface ChartPodcastPayload extends Partial<PodcastData> {
  id?: string
  name?: string
  title?: string
  description?: string
  publisher?: string
  author?: string
  thumbnail?: string
  artwork?: string
  image?: string
  artworkUrl?: string
  imageUrl?: string
  artwork_url?: string
  image_url?: string
  cover?: string
  audience_size?: number
  rating?: string | number
  rank?: number
  url?: string
  link?: string
}

/**
 * Get all supported countries for chart rankings
 */
export async function getChartCountries(): Promise<ChartCountry[]> {
  const data = await invokePodscan<Record<string, unknown> | ChartCountry[]>({
    action: 'chart_countries',
  })

  // Extract array from response - check various possible structures
  const envelope = Array.isArray(data) ? {} : data
  const countries = envelope.countries || envelope.data || data;

  // If it's an object with country codes as keys, convert to array
  if (countries && !Array.isArray(countries) && typeof countries === 'object') {
    return Object.entries(countries).map(([code, name]) => ({
      code,
      name: typeof name === 'string' ? name : code.toUpperCase()
    }));
  }

  return Array.isArray(countries) ? countries : [];
}

/**
 * Get categories for a specific platform and country
 */
export async function getChartCategories(
  platform: 'apple' | 'spotify',
  countryCode: string
): Promise<ChartCategory[]> {
  const data = await invokePodscan<Record<string, unknown> | ChartCategory[]>({
    action: 'chart_categories',
    platform,
    country: countryCode,
  })

  // Extract array from response - check various possible structures
  const envelope = Array.isArray(data) ? {} : data
  const rawCategories = envelope.categories || envelope.data || data;

  return normalizeChartCategories(rawCategories) as ChartCategory[]
}

/**
 * Get top ranked podcasts from chart
 * @param platform - 'apple' or 'spotify'
 * @param countryCode - Country code (e.g., 'us', 'gb')
 * @param category - Category ID
 * @param limit - Max podcasts to return (default 10, max 200 for Apple, 50 for Spotify)
 */
export async function getTopChartPodcasts(
  platform: 'apple' | 'spotify',
  countryCode: string,
  category: string,
  limit: number = 10
): Promise<ChartPodcast[]> {
  const data = await invokePodscan<Record<string, unknown> | ChartPodcast[]>({
    action: 'chart_top',
    platform,
    country: countryCode,
    category,
    limit,
  })

  // Extract array from response - check various possible structures
  const envelope = Array.isArray(data) ? {} : data
  const podcasts = envelope.podcasts || envelope.data || data;

  if (!Array.isArray(podcasts)) {
    console.error('❌ Unexpected response format - podcasts is not an array:', podcasts);
    return [];
  }

  // Normalize field names and add rank
  return podcasts.map((podcastValue, index: number) => {
    const podcast = podcastValue as ChartPodcastPayload
    // Get image URL from various possible fields
    const imageUrl = podcast.podcast_image_url || podcast.thumbnail || podcast.artwork ||
                     podcast.image || podcast.artworkUrl || podcast.imageUrl ||
                     podcast.artwork_url || podcast.image_url || podcast.cover;

    // Get audience size (chart API has it at top level, search API has it nested)
    const audienceSize = podcast.audience_size || podcast.reach?.audience_size;

    // Get rating (chart API has it at top level, search API has it nested)
    const rawRating = podcast.rating || podcast.reach?.itunes?.itunes_rating_average;
    const rating = rawRating === undefined || rawRating === null ? undefined : String(rawRating)

    return {
      ...podcast,
      // Normalize to standard field names
      podcast_id: podcast.podcast_id || podcast.id || '',
      podcast_name: podcast.podcast_name || podcast.name || podcast.title,
      podcast_description: podcast.podcast_description || podcast.description || '',
      publisher_name: podcast.publisher_name || podcast.publisher || podcast.author,
      podcast_image_url: imageUrl,
      podcast_url: podcast.podcast_url || podcast.url || podcast.link,
      rank: podcast.rank || index + 1,
      // Normalize reach object for consistent access
      reach: {
        ...podcast.reach,
        audience_size: audienceSize,
        itunes: {
          ...podcast.reach?.itunes,
          itunes_rating_average: rating,
        },
      },
    };
  }).filter((podcast) => Boolean(podcast.podcast_id));
}
