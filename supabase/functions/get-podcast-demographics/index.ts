import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { podcast_id } = await req.json()

    if (!podcast_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'podcast_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const podscanApiKey = Deno.env.get('PODSCAN_API_KEY')
    if (!podscanApiKey) {
      throw new Error('PODSCAN_API_KEY not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Get Demographics] Fetching demographics for podcast ${podcast_id}`)

    // Look up the podcast row by podscan_id
    const { data: podcast, error: fetchError } = await supabase
      .from('podcasts')
      .select('id, podscan_id, demographics, demographics_fetched_at')
      .eq('podscan_id', podcast_id)
      .single()

    if (fetchError || !podcast) {
      // If not found by podscan_id, try UUID id
      const { data: podcastById, error: fetchByIdError } = await supabase
        .from('podcasts')
        .select('id, podscan_id, demographics, demographics_fetched_at')
        .eq('id', podcast_id)
        .single()

      if (fetchByIdError || !podcastById) {
        return new Response(
          JSON.stringify({ success: false, error: `Podcast not found: ${podcast_id}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Use the found podcast row
      return await handleDemographics(supabase, podcastById, podscanApiKey)
    }

    return await handleDemographics(supabase, podcast, podscanApiKey)
  } catch (error) {
    console.error('[Get Demographics] Error:', error)

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

async function handleDemographics(
  supabase: any,
  podcast: { id: string; podscan_id: string; demographics: any; demographics_fetched_at: string | null },
  podscanApiKey: string
): Promise<Response> {
  // Check if we already have cached demographics (fetched within the last 30 days)
  if (podcast.demographics && podcast.demographics_fetched_at) {
    const fetchedAt = new Date(podcast.demographics_fetched_at)
    const daysSince = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60 * 24)

    if (daysSince < 30) {
      console.log(`[Get Demographics] Returning cached demographics for ${podcast.podscan_id} (${Math.round(daysSince)}d old)`)

      return new Response(
        JSON.stringify({
          success: true,
          demographics: podcast.demographics,
          cached: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  }

  // Fetch from Podscan API
  console.log(`[Get Demographics] Calling Podscan API for ${podcast.podscan_id}`)

  const apiUrl = `https://podscan.fm/api/v1/podcasts/${podcast.podscan_id}/demographics`

  const apiResponse = await fetch(apiUrl, {
    headers: {
      'Authorization': `Bearer ${podscanApiKey}`,
      'Content-Type': 'application/json',
    },
  })

  if (!apiResponse.ok) {
    const status = apiResponse.status

    if (status === 404) {
      return new Response(
        JSON.stringify({ success: false, error: 'Demographics not available for this podcast' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const errorText = await apiResponse.text()
    console.error(`[Get Demographics] Podscan API error: ${status} - ${errorText}`)
    throw new Error(`Podscan API error: ${status}`)
  }

  const demographics = await apiResponse.json()

  // Validate we got real data (not an error response)
  if (demographics.error || !demographics.episodes_analyzed) {
    return new Response(
      JSON.stringify({ success: false, error: 'Demographics not available for this podcast' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Cache the demographics in the podcasts table
  const { error: updateError } = await supabase
    .from('podcasts')
    .update({
      demographics: demographics,
      demographics_episodes_analyzed: demographics.episodes_analyzed || null,
      demographics_fetched_at: new Date().toISOString(),
    })
    .eq('id', podcast.id)

  if (updateError) {
    console.error('[Get Demographics] Cache update error:', updateError)
    // Non-fatal: still return the data even if caching fails
  } else {
    console.log(`[Get Demographics] Cached demographics for ${podcast.podscan_id}`)
  }

  return new Response(
    JSON.stringify({
      success: true,
      demographics,
      cached: false,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
}
