const PODSCAN_API_BASE = 'https://podscan.fm/api/v1';
const API_KEY = import.meta.env.VITE_PODSCAN_API_KEY;

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

interface SearchOptions {
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
}

/**
 * Search for podcasts directly
 */
export async function searchPodcasts(options: SearchOptions = {}): Promise<PodcastSearchResponse> {
  const params = new URLSearchParams();

  // Add all options to params
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  });

  const url = `${PODSCAN_API_BASE}/podcasts/search?${params}`;
  console.log('🎙️ Podscan API Request:', url);
  console.log('📊 Search options:', options);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('❌ Podscan API error:', response.status, response.statusText);
    throw new Error(`Podscan API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ Podscan API Response:', data);
  console.log('📦 Podcasts found:', data.podcasts?.length || 0);

  return data;
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

  console.log(`🎯 Fetched ${response.podcasts.length} business podcasts`);

  // Filter out podcasts with invalid/missing image URLs
  const validPodcasts = response.podcasts.filter(podcast =>
    podcast.podcast_image_url &&
    podcast.podcast_image_url.startsWith('http')
  );

  console.log(`✅ ${validPodcasts.length} podcasts have valid images, selecting ${limit} randomly`);

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

  console.log(`💎 Fetched ${response.podcasts.length} premium podcasts`);

  // Filter out podcasts with invalid/missing image URLs
  const validPodcasts = response.podcasts.filter(podcast =>
    podcast.podcast_image_url &&
    podcast.podcast_image_url.startsWith('http')
  );

  console.log(`✅ ${validPodcasts.length} premium podcasts have valid images, selecting ${limit} randomly`);

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
  const url = `${PODSCAN_API_BASE}/podcasts/${podcastId}`;
  console.log('🎙️ Fetching podcast by ID:', podcastId);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('❌ Podscan API error:', response.status, response.statusText);
    throw new Error(`Failed to fetch podcast: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ Podcast fetched:', data);

  // API returns { podcast: { ... } }, extract the podcast object
  return data.podcast || data;
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
  const url = `${PODSCAN_API_BASE}/podcasts/${podcastId}/demographics`
  console.log('📊 Fetching podcast demographics:', podcastId)

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.log('📊 No demographics available for this podcast')
      return null
    }

    const data = await response.json()

    // Check if we got an error response
    if (data.error || !data.episodes_analyzed) {
      console.log('📊 No demographics data:', data.error || 'No episodes analyzed')
      return null
    }

    console.log('✅ Demographics fetched:', data.episodes_analyzed, 'episodes analyzed')
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

/**
 * Get all supported countries for chart rankings
 */
export async function getChartCountries(): Promise<ChartCountry[]> {
  const url = `${PODSCAN_API_BASE}/charts/countries/supported`;
  console.log('🌍 Fetching chart countries');

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('❌ Podscan API error:', response.status, response.statusText);
    throw new Error(`Failed to fetch chart countries: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ Chart countries fetched:', data);

  // Extract array from response - check various possible structures
  const countries = data.countries || data.data || data;

  // If it's an object with country codes as keys, convert to array
  if (countries && !Array.isArray(countries) && typeof countries === 'object') {
    console.log('📦 Converting countries object to array');
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
  const url = `${PODSCAN_API_BASE}/charts/${platform}/${countryCode}/categories`;
  console.log(`📂 Fetching chart categories for ${platform}/${countryCode}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('❌ Podscan API error:', response.status, response.statusText);
    throw new Error(`Failed to fetch chart categories: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ Chart categories fetched:', data);

  // Extract array from response - check various possible structures
  const categories = data.categories || data.data || data;

  // If it's an object with category IDs as keys, convert to array
  if (categories && !Array.isArray(categories) && typeof categories === 'object') {
    console.log('📦 Converting categories object to array');
    return Object.entries(categories).map(([id, name]) => ({
      id,
      name: typeof name === 'string' ? name : id
    }));
  }

  return Array.isArray(categories) ? categories : [];
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
  const params = new URLSearchParams();
  params.append('limit', String(limit));

  const url = `${PODSCAN_API_BASE}/charts/${platform}/${countryCode}/${category}/top?${params}`;
  console.log(`📊 Fetching top ${limit} podcasts from ${platform}/${countryCode}/${category}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('❌ Podscan API error:', response.status, response.statusText);
    throw new Error(`Failed to fetch chart podcasts: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log('✅ Chart podcasts fetched:', data);

  // Extract array from response - check various possible structures
  const podcasts = data.podcasts || data.data || data;

  if (!Array.isArray(podcasts)) {
    console.error('❌ Unexpected response format - podcasts is not an array:', podcasts);
    return [];
  }

  // Log first podcast to see actual field structure
  if (podcasts.length > 0) {
    console.log('📋 Sample podcast fields:', Object.keys(podcasts[0]));
    console.log('🖼️ Image fields check:', {
      podcast_image_url: podcasts[0].podcast_image_url,
      artwork: podcasts[0].artwork,
      image: podcasts[0].image,
      artworkUrl: podcasts[0].artworkUrl,
      imageUrl: podcasts[0].imageUrl,
      cover: podcasts[0].cover,
      thumbnail: podcasts[0].thumbnail,
      artwork_url: podcasts[0].artwork_url,
      image_url: podcasts[0].image_url,
    });
  }

  // Normalize field names and add rank
  return podcasts.map((podcast: any, index: number) => ({
    ...podcast,
    // Normalize to standard field names
    podcast_id: podcast.podcast_id || podcast.id || `chart-${index}`,
    podcast_name: podcast.podcast_name || podcast.name || podcast.title,
    podcast_description: podcast.podcast_description || podcast.description || '',
    publisher_name: podcast.publisher_name || podcast.publisher || podcast.author,
    podcast_image_url: podcast.podcast_image_url || podcast.artwork || podcast.image ||
                       podcast.artworkUrl || podcast.imageUrl || podcast.artwork_url ||
                       podcast.image_url || podcast.cover || podcast.thumbnail,
    podcast_url: podcast.podcast_url || podcast.url || podcast.link,
    rank: podcast.rank || index + 1,
  }));
}
