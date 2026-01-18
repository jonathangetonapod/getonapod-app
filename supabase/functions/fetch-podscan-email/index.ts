import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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

    // Get Podscan API key from environment
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

    console.log('[Fetch Podscan Email] Email found:', email ? 'Yes' : 'No')

    return new Response(
      JSON.stringify({
        success: true,
        email: email,
        podcast_id: podcast_id
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
