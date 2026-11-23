import { supabase } from '@/lib/supabase'

/**
 * A value for a PostgREST filter string. Quoting it keeps a comma, dot or
 * parenthesis typed into the search box from being read as filter syntax.
 */
function postgrestLiteral(value: string): string {
  return `"${value.replace(/["\\]/gu, (char) => `\\${char}`)}"`
}

/*
 * The only columns a caller may sort by. sortBy reaches this from the URL
 * (?sortBy=), so it is mapped through this list rather than passed to
 * .order() as typed. The column names themselves are accepted too, for
 * callers that already pass them.
 */
const SORT_COLUMNS: Record<string, string> = {
  name: 'podcast_name',
  host: 'host_name',
  audience: 'audience_size',
  rating: 'itunes_rating',
  episodes: 'episode_count',
  dateAdded: 'created_at',
  prs: 'podcast_reach_score',
  podcast_name: 'podcast_name',
  host_name: 'host_name',
  audience_size: 'audience_size',
  itunes_rating: 'itunes_rating',
  episode_count: 'episode_count',
  created_at: 'created_at',
  podcast_reach_score: 'podcast_reach_score',
}

export function podcastSortColumn(sortBy: string | undefined): string {
  return (sortBy && Object.prototype.hasOwnProperty.call(SORT_COLUMNS, sortBy))
    ? SORT_COLUMNS[sortBy]
    : 'podcast_name'
}

const MAX_CATEGORY_FILTERS = 50
const MAX_CATEGORY_LENGTH = 200

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
  podcast_reach_score: number | null
  language: string | null
  region: string | null
  podscan_email: string | null
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
    const term = postgrestLiteral(`%${filters.search}%`)
    query = query.or(`podcast_name.ilike.${term},host_name.ilike.${term},publisher_name.ilike.${term},podcast_description.ilike.${term}`)
  }

  // Category filtering (supports both single and multi-select)
  // Category names come from the URL as well as the picker, so each one is
  // checked and its JSON quoted: a comma or parenthesis in a name would
  // otherwise be read as .or() syntax and change the filter.
  const categories = (filters.categories ?? [])
    .filter((cat): cat is string => typeof cat === 'string')
    .map((cat) => cat.trim())
    .filter((cat) => cat.length > 0 && cat.length <= MAX_CATEGORY_LENGTH)
    .slice(0, MAX_CATEGORY_FILTERS)
  if (categories.length > 0) {
    // Multi-select: OR logic - match podcasts that have ANY of the selected categories
    const orConditions = categories.map(cat =>
      `podcast_categories.cs.${postgrestLiteral(JSON.stringify([{ category_name: cat }]))}`
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
    query = query.not('podscan_email', 'is', null)
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
  const sortColumn = podcastSortColumn(sortBy)

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
    'PRS',
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
    p.podcast_reach_score || '',
    p.episode_count || '',
    Array.isArray(p.podcast_categories)
      ? p.podcast_categories.map((c: any) => c.category_name).join('; ')
      : '',
    p.podscan_email || '',
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

// Columns read for the whole-database email export. Embeddings, the search
// index, transcripts, recent episodes and demographics are left out: they are
// large and not useful in a spreadsheet.
const EMAIL_EXPORT_SELECT = [
  'id', 'podscan_id', 'podcast_name', 'host_name', 'publisher_name', 'website',
  'podcast_url', 'rss_url', 'podcast_itunes_id', 'podcast_spotify_id',
  'contact_email', 'contact_email_status', 'podscan_email', 'email_addresses',
  'podcast_categories', 'language', 'region', 'episode_count', 'last_posted_at',
  'is_active', 'podcast_has_guests', 'podcast_has_sponsors', 'audience_size',
  'podcast_reach_score', 'itunes_rating', 'itunes_rating_count', 'spotify_rating',
  'spotify_rating_count', 'social_links', 'jev_b2b_fit', 'jev_takes_guests',
  'jev_format', 'jev_audiences', 'brand_safety_risk_level', 'podcast_description',
  'podcast_image_url', 'created_at', 'updated_at',
].join(',')

const EMAIL_EXPORT_PAGE_SIZE = 1000
const EMAIL_EXPORT_PAGE_TIMEOUT_MS = 30_000
const EMAIL_EXPORT_PAGE_ATTEMPTS = 3

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function readEmailExportPage(lastId: string | null): Promise<Array<Record<string, unknown>>> {
  let lastError = 'unknown error'
  for (let attempt = 1; attempt <= EMAIL_EXPORT_PAGE_ATTEMPTS; attempt += 1) {
    let query = supabase
      .from('podcasts')
      .select(EMAIL_EXPORT_SELECT)
      .is('hidden_reason', null)
      .is('duplicate_of', null)
      .not('contact_email', 'is', null)
      .order('id', { ascending: true })
      .limit(EMAIL_EXPORT_PAGE_SIZE)
    if (lastId) query = query.gt('id', lastId)
    try {
      const { data, error } = await query.abortSignal(AbortSignal.timeout(EMAIL_EXPORT_PAGE_TIMEOUT_MS))
      if (!error) return (data ?? []) as unknown as Array<Record<string, unknown>>
      lastError = error.message
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    if (attempt < EMAIL_EXPORT_PAGE_ATTEMPTS) await pause(1000 * attempt)
  }
  throw new Error(`Could not read podcasts: ${lastError}`)
}

export const EMAIL_EXPORT_HEADERS = [
  'Email', 'Email Status', 'Contact Email', 'Podscan Email', 'All Emails',
  'Podcast Name', 'Host', 'Publisher', 'Website', 'Podcast URL', 'RSS URL',
  'iTunes ID', 'Spotify ID', 'Podscan ID', 'Categories', 'Language', 'Region',
  'Episodes', 'Last Episode', 'Active', 'Has Guests', 'Has Sponsors',
  'Audience Size', 'Reach Score', 'iTunes Rating', 'iTunes Ratings',
  'Spotify Rating', 'Spotify Ratings', 'Social Links', 'B2B Fit',
  'Takes Guests', 'Format', 'Audiences', 'Brand Safety Risk', 'Description',
  'Image URL', 'Added', 'Updated',
]

const textOrBlank = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(textOrBlank).filter(Boolean) : []

/**
 * The address to send to. Only `contact_email` counts: the database picks it
 * from the podcast's addresses and never picks one verified invalid or
 * disposable. Falling back to the raw Podscan field would bring those back.
 */
export const bestPodcastEmail = (row: Record<string, unknown>): string => textOrBlank(row.contact_email)

const jsonNames = (value: unknown, format: (item: Record<string, unknown>) => string): string =>
  Array.isArray(value)
    ? value
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(format)
      .filter(Boolean)
      .join('; ')
    : ''

/**
 * Quotes one CSV cell. Podcast data comes from outside sources, so a cell that
 * starts like a spreadsheet formula gets a leading apostrophe to keep Excel and
 * Google Sheets from running it.
 */
const FORMULA_START = /^[=+\-@\t\r]/
// A plain address with no characters a formula needs ( ( ) " ' & | ! and so on ).
const PLAIN_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i

export const csvCell = (value: unknown, { email = false } = {}): string => {
  let text = value === null || value === undefined ? '' : String(value)
  // A plain address keeps a leading + or - so it still works on import; anything else is guarded.
  if (FORMULA_START.test(text) && !(email && PLAIN_EMAIL.test(text))) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

const csvLine = (cells: unknown[]): string =>
  // The first cell is the email address: a leading + or - is kept so the address still works on import.
  `${cells.map((cell, index) => csvCell(cell, { email: index === 0 })).join(',')}\n`

export const podcastEmailExportRow = (row: Record<string, unknown>): unknown[] => [
  bestPodcastEmail(row),
  row.contact_email_status,
  textOrBlank(row.contact_email),
  row.podscan_email,
  stringList(row.email_addresses).join('; '),
  row.podcast_name,
  row.host_name,
  row.publisher_name,
  row.website,
  row.podcast_url,
  row.rss_url,
  row.podcast_itunes_id,
  row.podcast_spotify_id,
  row.podscan_id,
  jsonNames(row.podcast_categories, (c) => textOrBlank(c.category_name)),
  row.language,
  row.region,
  row.episode_count,
  row.last_posted_at,
  row.is_active,
  row.podcast_has_guests,
  row.podcast_has_sponsors,
  row.audience_size,
  row.podcast_reach_score,
  row.itunes_rating,
  row.itunes_rating_count,
  row.spotify_rating,
  row.spotify_rating_count,
  jsonNames(row.social_links, (s) => [textOrBlank(s.platform), textOrBlank(s.url)].filter(Boolean).join(': ')),
  row.jev_b2b_fit,
  row.jev_takes_guests,
  row.jev_format,
  stringList(row.jev_audiences).join('; '),
  row.brand_safety_risk_level,
  row.podcast_description,
  row.podcast_image_url,
  row.created_at,
  row.updated_at,
]

/**
 * Downloads every podcast in the database that has an email, with its data,
 * as one CSV. Hidden and duplicate rows are skipped. Reads in pages ordered by
 * id so a large table never needs one huge query; the podcasts table's RLS
 * only lets platform admins read it.
 */
export async function exportAllPodcastsWithEmailsToCSV(
  onProgress?: (exported: number) => void,
  filename = `podcasts-with-emails-${new Date().toISOString().slice(0, 10)}.csv`,
): Promise<number> {
  // The byte-order mark makes Excel read the file as UTF-8, so accented names survive.
  // Each page becomes its own Blob so its text can be freed as the download builds.
  const parts: Blob[] = [new Blob(['\uFEFF', csvLine(EMAIL_EXPORT_HEADERS)])]
  let exported = 0
  let lastId: string | null = null

  for (;;) {
    const rows = await readEmailExportPage(lastId)
    // Stop only on an empty page: the server may cap a page below the size asked for.
    if (rows.length === 0) break

    let chunk = ''
    for (const row of rows) {
      if (!bestPodcastEmail(row)) continue
      chunk += csvLine(podcastEmailExportRow(row))
      exported += 1
    }
    parts.push(new Blob([chunk]))
    lastId = String(rows[rows.length - 1].id)
    onProgress?.(exported)
  }

  if (exported === 0) throw new Error('No podcasts with an email were found')

  const blob = new Blob(parts, { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Give the browser a moment to start the download before freeing the file.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)

  return exported
}

/**
 * Auto-save podcasts from Podscan API responses to the local database.
 * Uses upsert on podscan_id so duplicates are safely handled.
 * Runs as fire-and-forget to not block the UI.
 */
export async function savePodcastsToDatabase(
  podcasts: Array<{
    podcast_id: string
    podcast_name: string
    podcast_url: string
    podcast_description?: string
    podcast_image_url?: string
    podcast_guid?: string
    podcast_reach_score?: number
    podcast_categories?: Array<{ category_id: string; category_name: string }>
    episode_count?: number
    language?: string
    region?: string
    publisher_name?: string
    is_active?: boolean
    rss_url?: string
    last_posted_at?: string
    podcast_itunes_id?: string
    podcast_spotify_id?: string
    podcast_has_guests?: boolean
    podcast_has_sponsors?: boolean
    reach?: {
      itunes?: { itunes_rating_average?: string; itunes_rating_count?: string; itunes_rating_count_bracket?: string }
      spotify?: { spotify_rating_average?: string; spotify_rating_count?: string; spotify_rating_count_bracket?: string }
      audience_size?: number
      social_links?: Array<{ platform: string; url: string }>
      email?: string
      website?: string
    }
    brand_safety?: {
      framework: string
      risk_level: string
      recommendation: string
    }
  }>
): Promise<{ saved: number; errors: number }> {
  if (podcasts.length === 0) return { saved: 0, errors: 0 }

  const rows = podcasts.map(p => ({
    podscan_id: p.podcast_id,
    podcast_name: p.podcast_name,
    podcast_description: p.podcast_description || null,
    podcast_image_url: p.podcast_image_url || null,
    podcast_url: p.podcast_url || null,
    podcast_guid: p.podcast_guid || null,
    publisher_name: p.publisher_name || null,
    podcast_categories: p.podcast_categories || null,
    episode_count: p.episode_count ?? null,
    language: p.language || null,
    region: p.region || null,
    is_active: p.is_active ?? true,
    rss_url: p.rss_url || null,
    last_posted_at: p.last_posted_at || null,
    podcast_itunes_id: p.podcast_itunes_id || null,
    podcast_spotify_id: p.podcast_spotify_id || null,
    podcast_has_guests: p.podcast_has_guests ?? null,
    podcast_has_sponsors: p.podcast_has_sponsors ?? null,
    podcast_reach_score: p.podcast_reach_score ?? null,
    // iTunes ratings
    itunes_rating: p.reach?.itunes?.itunes_rating_average
      ? parseFloat(p.reach.itunes.itunes_rating_average)
      : null,
    itunes_rating_count: p.reach?.itunes?.itunes_rating_count
      ? parseInt(p.reach.itunes.itunes_rating_count)
      : null,
    itunes_rating_count_bracket: p.reach?.itunes?.itunes_rating_count_bracket || null,
    // Spotify ratings
    spotify_rating: p.reach?.spotify?.spotify_rating_average
      ? parseFloat(p.reach.spotify.spotify_rating_average)
      : null,
    spotify_rating_count: p.reach?.spotify?.spotify_rating_count
      ? parseInt(p.reach.spotify.spotify_rating_count)
      : null,
    spotify_rating_count_bracket: p.reach?.spotify?.spotify_rating_count_bracket || null,
    // Audience & contact
    audience_size: p.reach?.audience_size ?? null,
    podscan_email: p.reach?.email || null,
    website: p.reach?.website || null,
    social_links: p.reach?.social_links || null,
    // Brand safety
    brand_safety_framework: p.brand_safety?.framework || null,
    brand_safety_risk_level: p.brand_safety?.risk_level || null,
    brand_safety_recommendation: p.brand_safety?.recommendation || null,
    podscan_last_fetched_at: new Date().toISOString(),
  }))

  // Batch upsert in chunks of 50
  let saved = 0
  let errors = 0
  const chunkSize = 50

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await supabase
      .from('podcasts')
      .upsert(chunk, { onConflict: 'podscan_id', ignoreDuplicates: false })

    if (error) {
      console.error('[Auto-save] Batch upsert error:', error)
      errors += chunk.length
    } else {
      saved += chunk.length
    }
  }

  if (saved > 0) {
    console.log(`[Auto-save] Saved ${saved} podcasts to database`)
  }

  return { saved, errors }
}
