import { supabase } from '@/lib/supabase'

export interface PodcastFilters {
  search?: string
  category?: string  // Deprecated: use categories instead
  categories?: string[]  // Multi-select category filter (OR logic)
  minAudience?: number
  maxAudience?: number
  minRating?: number
  maxRating?: number
  minEpisodes?: number
  maxEpisodes?: number
  hasEmail?: boolean
  isActive?: boolean
  language?: string
  region?: string
  hasGuests?: boolean
  hasSponsors?: boolean
}

export interface PodcastDatabaseItem {
  id: string
  podscan_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  host_name: string | null
  podcast_categories: any
  episode_count: number | null
  itunes_rating: number | null
  spotify_rating: number | null
  audience_size: number | null
  language: string | null
  region: string | null
  email: string | null
  website: string | null
  rss_url: string | null
  is_active: boolean
  podscan_last_fetched_at: string | null
  cache_hit_count: number
  podscan_fetch_count: number
  created_at: string
  updated_at: string
}

export interface GetPodcastsParams {
  filters?: PodcastFilters
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

export interface GetPodcastsResult {
  data: PodcastDatabaseItem[] | null
  error: any
  count: number | null
}

/**
 * Get podcasts from the centralized database with filtering, sorting, and pagination
 */
export async function getPodcasts({
  filters = {},
  sortBy = 'podcast_name',
  sortOrder = 'asc',
  page = 1,
  pageSize = 20
}: GetPodcastsParams): Promise<GetPodcastsResult> {
  let query = supabase
    .from('podcasts')
    .select('*', { count: 'exact' })

  // Apply filters
  if (filters.search) {
    // Search across name, host, publisher, and description
    query = query.or(`podcast_name.ilike.%${filters.search}%,host_name.ilike.%${filters.search}%,publisher_name.ilike.%${filters.search}%,podcast_description.ilike.%${filters.search}%`)
  }

  // Category filtering (supports both single and multi-select)
  if (filters.categories && filters.categories.length > 0) {
    // Multi-select: OR logic - match podcasts that have ANY of the selected categories
    const orConditions = filters.categories.map(cat =>
      `podcast_categories.cs.${JSON.stringify([{ category_name: cat }])}`
    ).join(',')
    query = query.or(orConditions)
  } else if (filters.category) {
    // Backward compatibility: single category filter
    query = query.contains('podcast_categories', [{ category_name: filters.category }])
  }

  if (filters.minAudience !== undefined) {
    query = query.gte('audience_size', filters.minAudience)
  }

  if (filters.maxAudience !== undefined) {
    query = query.lte('audience_size', filters.maxAudience)
  }

  if (filters.minRating !== undefined) {
    query = query.gte('itunes_rating', filters.minRating)
  }

  if (filters.maxRating !== undefined) {
    query = query.lte('itunes_rating', filters.maxRating)
  }

  if (filters.hasEmail !== undefined && filters.hasEmail) {
    query = query.not('email', 'is', null)
  }

  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive)
  }

  if (filters.language) {
    query = query.eq('language', filters.language)
  }

  if (filters.region) {
    query = query.eq('region', filters.region)
  }

  if (filters.hasGuests !== undefined) {
    query = query.eq('podcast_has_guests', filters.hasGuests)
  }

  if (filters.hasSponsors !== undefined) {
    query = query.eq('podcast_has_sponsors', filters.hasSponsors)
  }

  if (filters.minEpisodes !== undefined) {
    query = query.gte('episode_count', filters.minEpisodes)
  }

  if (filters.maxEpisodes !== undefined) {
    query = query.lte('episode_count', filters.maxEpisodes)
  }

  // Apply sorting
  const sortColumn = sortBy === 'name' ? 'podcast_name' :
                     sortBy === 'host' ? 'host_name' :
                     sortBy === 'audience' ? 'audience_size' :
                     sortBy === 'rating' ? 'itunes_rating' :
                     sortBy === 'episodes' ? 'episode_count' :
                     sortBy === 'dateAdded' ? 'created_at' :
                     sortBy

  query = query.order(sortColumn, { ascending: sortOrder === 'asc', nullsFirst: false })

  // Apply pagination
  const start = (page - 1) * pageSize
  const end = start + pageSize - 1
  query = query.range(start, end)

  const { data, error, count } = await query

  return { data, error, count }
}

/**
 * Get podcast statistics from the pre-calculated view
 */
export async function getPodcastStatistics() {
  const { data, error } = await supabase
    .from('podcast_cache_statistics')
    .select('*')
    .single()

  if (error) {
    console.error('Failed to fetch podcast statistics:', error)
    return null
  }

  return data
}

/**
 * Get a single podcast by ID
 */
export async function getPodcastById(id: string) {
  const { data, error } = await supabase
    .from('podcasts')
    .select('*')
    .eq('id', id)
    .single()

  return { data, error }
}

/**
 * Get unique categories from all podcasts
 */
export async function getPodcastCategories() {
  const { data, error } = await supabase
    .from('podcasts')
    .select('podcast_categories')
    .not('podcast_categories', 'is', null)

  if (error) return { categories: [], error }

  // Extract unique category names from JSONB arrays
  const categorySet = new Set<string>()
  data?.forEach(row => {
    if (Array.isArray(row.podcast_categories)) {
      row.podcast_categories.forEach((cat: any) => {
        if (cat.category_name) {
          categorySet.add(cat.category_name)
        }
      })
    }
  })

  const categories = Array.from(categorySet).sort()
  return { categories, error: null }
}

/**
 * Get unique languages from all podcasts
 */
export async function getPodcastLanguages() {
  const { data, error } = await supabase
    .from('podcasts')
    .select('language')
    .not('language', 'is', null)

  if (error) return { languages: [], error }

  const languageSet = new Set<string>()
  data?.forEach(row => {
    if (row.language) languageSet.add(row.language)
  })

  const languages = Array.from(languageSet).sort()
  return { languages, error: null }
}

/**
 * Get unique regions from all podcasts
 */
export async function getPodcastRegions() {
  const { data, error } = await supabase
    .from('podcasts')
    .select('region')
    .not('region', 'is', null)

  if (error) return { regions: [], error }

  const regionSet = new Set<string>()
  data?.forEach(row => {
    if (row.region) regionSet.add(row.region)
  })

  const regions = Array.from(regionSet).sort()
  return { regions, error: null }
}

/**
 * Check if podcast data is stale (> 7 days old)
 */
export function isPodcastStale(lastFetchedAt: string | null): boolean {
  if (!lastFetchedAt) return true

  const lastFetch = new Date(lastFetchedAt)
  const now = new Date()
  const daysSince = (now.getTime() - lastFetch.getTime()) / (1000 * 60 * 60 * 24)

  return daysSince > 7
}

/**
 * Export podcasts to CSV
 */
export async function exportPodcastsToCSV(
  podcasts: PodcastDatabaseItem[],
  filename: string = `podcasts-${new Date().toISOString()}.csv`
) {
  if (podcasts.length === 0) {
    throw new Error('No podcasts to export')
  }

  // CSV headers
  const headers = [
    'Name',
    'Host',
    'Publisher',
    'Audience',
    'Rating',
    'Episodes',
    'Categories',
    'Email',
    'URL',
    'Language',
    'Region',
    'Cache Hits',
    'Last Fetched'
  ]

  // CSV rows
  const rows = podcasts.map(p => [
    p.podcast_name,
    p.host_name || '',
    p.publisher_name || '',
    p.audience_size || '',
    p.itunes_rating || '',
    p.episode_count || '',
    Array.isArray(p.podcast_categories)
      ? p.podcast_categories.map((c: any) => c.category_name).join('; ')
      : '',
    p.email || '',
    p.podcast_url || '',
    p.language || '',
    p.region || '',
    p.cache_hit_count || 0,
    p.podscan_last_fetched_at || ''
  ])

  // Combine and format as CSV
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)

  return true
}
