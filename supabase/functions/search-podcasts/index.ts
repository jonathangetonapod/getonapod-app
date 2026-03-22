import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
      min_episodes,
      has_email,
      sort_by = 'podcast_name',
      sort_order = 'asc',
      page = 1,
      page_size: rawPageSize = 25,
    } = body

    // Clamp page_size between 1 and 100
    const page_size = Math.max(1, Math.min(100, rawPageSize))

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Search Podcasts] query="${search || ''}" page=${page} page_size=${page_size}`)

    // Build query with exact count for pagination
    let query = supabase
      .from('podcasts')
      .select(
        'id, podscan_id, podcast_name, podcast_description, podcast_url, publisher_name, itunes_rating, episode_count, audience_size, podcast_categories, podscan_email, last_posted_at',
        { count: 'exact' }
      )

    // --- Filters ---

    // Full-text search across name, description, publisher
    if (search) {
      query = query.or(
        `podcast_name.ilike.%${search}%,podcast_description.ilike.%${search}%,publisher_name.ilike.%${search}%`
      )
    }

    // Multi-select category filter (OR logic)
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

    if (min_episodes !== undefined) {
      query = query.gte('episode_count', min_episodes)
    }

    if (has_email === true) {
      query = query.not('podscan_email', 'is', null)
    }

    // --- Sorting ---
    const sortColumn =
      sort_by === 'name' ? 'podcast_name' :
      sort_by === 'audience' ? 'audience_size' :
      sort_by === 'rating' ? 'itunes_rating' :
      sort_by === 'episodes' ? 'episode_count' :
      sort_by === 'last_posted' ? 'last_posted_at' :
      sort_by  // allow raw column names too

    query = query.order(sortColumn, {
      ascending: sort_order === 'asc',
      nullsFirst: false,
    })

    // --- Pagination ---
    const start = (page - 1) * page_size
    const end = start + page_size - 1
    query = query.range(start, end)

    const { data, error, count } = await query

    if (error) {
      console.error('[Search Podcasts] DB error:', error)
      throw error
    }

    console.log(`[Search Podcasts] Found ${count} total, returning ${data?.length || 0}`)

    return new Response(
      JSON.stringify({
        success: true,
        podcasts: data || [],
        total: count || 0,
        page,
        page_size,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Search Podcasts] Error:', error)

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
