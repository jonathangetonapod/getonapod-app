import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Escape special Supabase/PostgREST filter characters in user input */
function sanitizeSearch(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Escape a value for CSV (wrap in quotes if it contains commas, quotes, or newlines) */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()

    const {
      search,
      categories,
      min_audience,
      max_audience,
      min_rating,
      limit: rawLimit = 1000,
    } = body

    // Clamp limit between 1 and 5000
    const limit = Math.max(1, Math.min(5000, rawLimit))

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Export Podcasts CSV] search="${search || ''}" limit=${limit}`)

    // Build query
    let query = supabase
      .from('podcasts')
      .select('podcast_name, publisher_name, podcast_url, podscan_email, itunes_rating, episode_count, audience_size, podcast_categories, last_posted_at')

    // --- Filters (same as search-podcasts) ---

    if (search) {
      const safe = sanitizeSearch(search)
      query = query.or(
        `podcast_name.ilike.%${safe}%,podcast_description.ilike.%${safe}%,publisher_name.ilike.%${safe}%`
      )
    }

    if (categories && Array.isArray(categories) && categories.length > 0) {
      const orConditions = categories
        .map((cat: string) => `podcast_categories.cs.${JSON.stringify([{ category_name: cat }])}`)
        .join(',')
      query = query.or(orConditions)
    }

    if (min_audience !== undefined) {
      query = query.gte('audience_size', min_audience)
    }

    if (max_audience !== undefined) {
      query = query.lte('audience_size', max_audience)
    }

    if (min_rating !== undefined) {
      query = query.gte('itunes_rating', min_rating)
    }

    // Order and limit
    query = query.order('podcast_name', { ascending: true }).limit(limit)

    const { data, error } = await query

    if (error) {
      console.error('[Export Podcasts CSV] DB error:', error)
      throw error
    }

    const podcasts = data || []

    console.log(`[Export Podcasts CSV] Exporting ${podcasts.length} podcasts`)

    // Build CSV
    const headers = [
      'podcast_name',
      'publisher_name',
      'podcast_url',
      'podscan_email',
      'itunes_rating',
      'episode_count',
      'audience_size',
      'podcast_categories',
      'last_posted_at',
    ]

    const rows = podcasts.map((p: any) => {
      // Flatten podcast_categories array to a semicolon-separated string
      let categoriesStr = ''
      if (p.podcast_categories && Array.isArray(p.podcast_categories)) {
        categoriesStr = p.podcast_categories
          .map((c: any) => c.category_name || '')
          .filter(Boolean)
          .join('; ')
      }

      return [
        csvEscape(p.podcast_name),
        csvEscape(p.publisher_name),
        csvEscape(p.podcast_url),
        csvEscape(p.podscan_email),
        csvEscape(p.itunes_rating),
        csvEscape(p.episode_count),
        csvEscape(p.audience_size),
        csvEscape(categoriesStr),
        csvEscape(p.last_posted_at),
      ].join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="podcasts-export.csv"',
      },
    })
  } catch (error) {
    console.error('[Export Podcasts CSV] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
