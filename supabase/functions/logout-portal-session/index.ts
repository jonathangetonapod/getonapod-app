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

    console.log('[LOGOUT-SESSION] Logging out session')

    // Get session details before deleting (for activity log)
    const { data: session } = await supabase
      .from('client_portal_sessions')
      .select('id, client_id')
      .eq('session_token', sessionToken)
      .single()

    // Delete the session
    const { error: deleteError } = await supabase
      .from('client_portal_sessions')
      .delete()
      .eq('session_token', sessionToken)

    if (deleteError) {
      console.error('[LOGOUT-SESSION] Error deleting session:', deleteError)
      // Don't throw - logout should always succeed client-side
    }

    // Log the activity
    if (session) {
      await supabase
        .from('client_portal_activity_log')
        .insert({
          client_id: session.client_id,
          session_id: session.id,
          action: 'logout',
          metadata: {}
        })
    }

    console.log('[LOGOUT-SESSION] Logout successful')

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[LOGOUT-SESSION] Error:', error)
    // Return success anyway - logout should always succeed client-side
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
