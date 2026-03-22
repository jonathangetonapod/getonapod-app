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
    const { client_id, slug } = await req.json()

    if (!client_id && !slug) {
      return new Response(
        JSON.stringify({ success: false, error: 'Either client_id or slug is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Get Client Portfolio] Fetching client by ${client_id ? 'id' : 'slug'}`)

    // Fetch the client
    let query = supabase
      .from('clients')
      .select('id, name, bio, photo_url, media_kit_url, linkedin_url, website, dashboard_slug, dashboard_tagline')

    if (client_id) {
      query = query.eq('id', client_id)
    } else {
      query = query.eq('dashboard_slug', slug)
    }

    const { data: client, error: clientError } = await query.single()

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ success: false, error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch booking count (all non-cancelled bookings)
    const { count: bookingCount, error: bookingCountError } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .neq('status', 'cancelled')

    if (bookingCountError) {
      console.error('[Get Client Portfolio] Booking count error:', bookingCountError)
    }

    // Fetch published count
    const { count: publishedCount, error: publishedCountError } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('status', 'published')

    if (publishedCountError) {
      console.error('[Get Client Portfolio] Published count error:', publishedCountError)
    }

    console.log(`[Get Client Portfolio] Found client: ${client.name} (bookings: ${bookingCount}, published: ${publishedCount})`)

    return new Response(
      JSON.stringify({
        success: true,
        client: {
          name: client.name,
          bio: client.bio,
          photo_url: client.photo_url,
          media_kit_url: client.media_kit_url,
          linkedin_url: client.linkedin_url,
          website: client.website,
          dashboard_slug: client.dashboard_slug,
          dashboard_tagline: client.dashboard_tagline,
          booking_count: bookingCount || 0,
          published_count: publishedCount || 0,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Get Client Portfolio] Error:', error)

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
