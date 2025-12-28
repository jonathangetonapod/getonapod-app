import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { sessionToken } = await req.json()

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Session token is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Create Supabase client with service role to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('[VALIDATE-SESSION] Validating session token')

    // Verify session exists and is not expired
    const { data: session, error: sessionError } = await supabase
      .from('client_portal_sessions')
      .select('*, clients(*)')
      .eq('session_token', sessionToken)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (sessionError || !session) {
      console.log('[VALIDATE-SESSION] Session not found or expired')
      return new Response(
        JSON.stringify({ success: false, error: 'Session expired or invalid' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    console.log('[VALIDATE-SESSION] Session valid, client:', session.clients.name)

    // Update last_active_at
    await supabase
      .from('client_portal_sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('session_token', sessionToken)

    // Return client data
    return new Response(
      JSON.stringify({
        success: true,
        client: session.clients
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[VALIDATE-SESSION] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to validate session'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
