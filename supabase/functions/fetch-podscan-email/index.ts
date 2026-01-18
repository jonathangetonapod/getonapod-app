import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { podcast_id } = await req.json()

    if (!podcast_id) {
      throw new Error('podcast_id is required')
    }

    console.log('[Fetch Podscan Email] Fetching email for podcast:', podcast_id)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // First, check if email is already in database
    const { data: cachedEmail, error: cacheError } = await supabase
      .from('podcast_emails')
      .select('email, fetched_at')
      .eq('podcast_id', podcast_id)
      .single()

    if (cachedEmail && !cacheError) {
      console.log('[Fetch Podscan Email] Email found in cache:', cachedEmail.email ? 'Yes' : 'No')
      return new Response(
        JSON.stringify({
          success: true,
          email: cachedEmail.email,
          podcast_id: podcast_id,
          cached: true,
          fetched_at: cachedEmail.fetched_at
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      )
    }

    // Not in cache, fetch from Podscan API
    const podscanApiKey = Deno.env.get('PODSCAN_API_KEY')
    if (!podscanApiKey) {
      throw new Error('PODSCAN_API_KEY not configured')
    }

    // Call Podscan API
    const response = await fetch(`https://podscan.fm/api/v1/podcasts/${podcast_id}`, {
      headers: {
        'Authorization': `Bearer ${podscanApiKey}`,
        'Content-Type': 'application/json',
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Fetch Podscan Email] API error:', errorText)
      throw new Error(`Podscan API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    // Extract email from reach.email field
    const email = data.podcast?.reach?.email || null

    console.log('[Fetch Podscan Email] Email fetched from API:', email ? 'Yes' : 'No')

    // Store in database for future use
    const { error: insertError } = await supabase
      .from('podcast_emails')
      .insert({
        podcast_id: podcast_id,
        email: email,
        source: 'podscan'
      })

    if (insertError) {
      console.error('[Fetch Podscan Email] Failed to cache email:', insertError)
      // Continue anyway, just log the error
    } else {
      console.log('[Fetch Podscan Email] Email cached in database')
    }

    return new Response(
      JSON.stringify({
        success: true,
        email: email,
        podcast_id: podcast_id,
        cached: false
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('[Fetch Podscan Email] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
