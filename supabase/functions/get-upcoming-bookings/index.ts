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
    // Parse body (all fields optional)
    let days_ahead = 30
    let type: 'recordings' | 'publications' | 'all' = 'all'

    if (req.headers.get('content-type')?.includes('application/json')) {
      const body = await req.json()
      if (body.days_ahead !== undefined) {
        days_ahead = Number(body.days_ahead)
        if (isNaN(days_ahead) || days_ahead < 1) {
          return new Response(
            JSON.stringify({ success: false, error: 'days_ahead must be a positive number' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }
      if (body.type !== undefined) {
        if (!['recordings', 'publications', 'all'].includes(body.type)) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Invalid type '${body.type}'. Must be one of: recordings, publications, all`,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        type = body.type
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date().toISOString()
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + days_ahead)
    const futureDateStr = futureDate.toISOString()

    console.log(`[Get Upcoming Bookings] type=${type}, days_ahead=${days_ahead}, range=${now} to ${futureDateStr}`)

    let recordings: any[] = []
    let publications: any[] = []

    // Fetch upcoming recordings
    if (type === 'recordings' || type === 'all') {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          podcast_name,
          podcast_url,
          host_name,
          recording_date,
          publish_date,
          status,
          prep_sent,
          episode_url,
          notes,
          client_id,
          client:clients(id, name, email)
        `)
        .gte('recording_date', now)
        .lte('recording_date', futureDateStr)
        .in('status', ['conversation_started', 'booked', 'in_progress'])
        .order('recording_date', { ascending: true })

      if (error) {
        throw new Error(`Failed to fetch upcoming recordings: ${error.message}`)
      }

      recordings = (data || []).map((b: any) => ({
        id: b.id,
        podcast_name: b.podcast_name,
        podcast_url: b.podcast_url,
        host_name: b.host_name,
        client_id: b.client_id,
        client_name: b.client?.name || null,
        recording_date: b.recording_date,
        publish_date: b.publish_date,
        status: b.status,
        prep_sent: b.prep_sent,
        episode_url: b.episode_url,
        notes: b.notes,
        type: 'recording',
      }))
    }

    // Fetch upcoming publications
    if (type === 'publications' || type === 'all') {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          podcast_name,
          podcast_url,
          host_name,
          recording_date,
          publish_date,
          status,
          prep_sent,
          episode_url,
          notes,
          client_id,
          client:clients(id, name, email)
        `)
        .gte('publish_date', now)
        .lte('publish_date', futureDateStr)
        .order('publish_date', { ascending: true })

      if (error) {
        throw new Error(`Failed to fetch upcoming publications: ${error.message}`)
      }

      publications = (data || []).map((b: any) => ({
        id: b.id,
        podcast_name: b.podcast_name,
        podcast_url: b.podcast_url,
        host_name: b.host_name,
        client_id: b.client_id,
        client_name: b.client?.name || null,
        recording_date: b.recording_date,
        publish_date: b.publish_date,
        status: b.status,
        prep_sent: b.prep_sent,
        episode_url: b.episode_url,
        notes: b.notes,
        type: 'publication',
      }))
    }

    // Combine results based on type
    let bookings: any[]
    if (type === 'recordings') {
      bookings = recordings
    } else if (type === 'publications') {
      bookings = publications
    } else {
      // Deduplicate: a booking may appear in both recordings and publications
      const seen = new Set<string>()
      bookings = []
      for (const b of [...recordings, ...publications]) {
        const key = `${b.id}-${b.type}`
        if (!seen.has(key)) {
          seen.add(key)
          bookings.push(b)
        }
      }
    }

    console.log(`[Get Upcoming Bookings] Found ${bookings.length} bookings (${recordings.length} recordings, ${publications.length} publications)`)

    return new Response(
      JSON.stringify({
        success: true,
        bookings,
        total: bookings.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Get Upcoming Bookings] Error:', error)

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
