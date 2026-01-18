import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  sessionToken?: string
  clientId: string
}

serve(async (req) => {
  console.log('[Get Client Bookings] ========== FUNCTION INVOKED ==========')
  console.log('[Get Client Bookings] Method:', req.method)
  console.log('[Get Client Bookings] URL:', req.url)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('[Get Client Bookings] CORS preflight request')
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('[Get Client Bookings] Raw request body:', JSON.stringify(body))

    const { sessionToken, clientId }: RequestBody = body

    console.log('[Get Client Bookings] Request:', { clientId, hasSessionToken: !!sessionToken, sessionTokenLength: sessionToken?.length })

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    console.log('[Get Client Bookings] Env check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseServiceKey
    })

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Get Client Bookings] Missing environment variables!')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // If session token provided, validate it
    // If no session token, allow it (for admin impersonation)
    if (sessionToken) {
      console.log('[Get Client Bookings] Validating session token:', {
        tokenPreview: sessionToken.substring(0, 20) + '...',
        tokenLength: sessionToken.length,
        tokenType: typeof sessionToken
      })

      // First, let's check if ANY sessions exist for debugging
      const { data: allSessions, error: countError } = await supabase
        .from('client_portal_sessions')
        .select('session_token, client_id, expires_at, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(5)

      console.log('[Get Client Bookings] Recent sessions for client:', {
        clientId,
        sessionCount: allSessions?.length || 0,
        sessions: allSessions?.map(s => ({
          tokenPreview: s.session_token.substring(0, 20) + '...',
          clientId: s.client_id,
          expiresAt: s.expires_at,
          createdAt: s.created_at
        })),
        countError: countError?.message
      })

      const { data: session, error: sessionError } = await supabase
        .from('client_portal_sessions')
        .select('client_id, expires_at')
        .eq('session_token', sessionToken)
        .single()

      console.log('[Get Client Bookings] Session query result:', {
        hasSession: !!session,
        hasError: !!sessionError,
        errorCode: sessionError?.code,
        errorMessage: sessionError?.message,
        errorDetails: sessionError?.details,
        errorHint: sessionError?.hint,
        sessionClientId: session?.client_id,
        expiresAt: session?.expires_at,
        requestedToken: sessionToken.substring(0, 20) + '...',
        matchFound: !!session
      })

      if (sessionError || !session) {
        console.error('[Get Client Bookings] Invalid session:', {
          error: sessionError,
          code: sessionError?.code,
          message: sessionError?.message,
          hint: sessionError?.hint
        })
        return new Response(
          JSON.stringify({ error: 'Invalid session. Please log out and log back in.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if session expired
      const now = new Date()
      const expiresAt = new Date(session.expires_at)
      console.log('[Get Client Bookings] Time check:', {
        now: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        expired: expiresAt < now
      })

      if (expiresAt < now) {
        console.log('[Get Client Bookings] Session expired for client:', clientId)
        return new Response(
          JSON.stringify({ error: 'Session expired. Please log in again.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify client ID matches session
      if (session.client_id !== clientId) {
        console.error('[Get Client Bookings] Client ID mismatch:', {
          sessionClientId: session.client_id,
          requestedClientId: clientId,
          match: session.client_id === clientId
        })
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('[Get Client Bookings] Session validated for client:', clientId)
    } else {
      console.log('[Get Client Bookings] No session token - allowing (admin impersonation)')
    }

    // Fetch bookings with service role (bypasses RLS)
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*')
      .eq('client_id', clientId)
      .order('scheduled_date', { ascending: false, nullsFirst: false })

    if (bookingsError) {
      console.error('[Get Client Bookings] Error:', bookingsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch bookings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch outreach messages with service role (bypasses RLS) and enrich with podcast metadata
    const { data: outreachMessages, error: outreachError } = await supabase
      .from('outreach_messages')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })

    if (outreachError) {
      console.error('[Get Client Bookings] Error fetching outreach messages:', outreachError)
      // Don't fail the whole request if outreach messages fail
      return new Response(
        JSON.stringify({ bookings, outreachMessages: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Enrich outreach messages with podcast metadata from client_dashboard_podcasts
    const enrichedOutreachMessages = await Promise.all(
      (outreachMessages || []).map(async (message) => {
        if (!message.podcast_id) return message

        const { data: podcastMeta } = await supabase
          .from('client_dashboard_podcasts')
          .select('podcast_image_url, audience_size, itunes_rating, episode_count')
          .eq('client_id', clientId)
          .eq('podcast_id', message.podcast_id)
          .maybeSingle()

        return {
          ...message,
          podcast_image_url: podcastMeta?.podcast_image_url,
          audience_size: podcastMeta?.audience_size,
          itunes_rating: podcastMeta?.itunes_rating,
          episode_count: podcastMeta?.episode_count
        }
      })
    )

    return new Response(
      JSON.stringify({ bookings, outreachMessages: enrichedOutreachMessages }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Get Client Bookings] Error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
