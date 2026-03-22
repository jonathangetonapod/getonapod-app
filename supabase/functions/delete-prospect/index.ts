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
    const { prospect_id } = await req.json()

    if (!prospect_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'prospect_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Delete Prospect] Deleting prospect ${prospect_id}`)

    // Verify prospect exists
    const { data: existing, error: fetchError } = await supabase
      .from('prospect_dashboards')
      .select('id, prospect_name')
      .eq('id', prospect_id)
      .single()

    if (fetchError || !existing) {
      return new Response(
        JSON.stringify({ success: false, error: `Prospect not found: ${prospect_id}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Delete Prospect] Found prospect: ${existing.prospect_name}`)

    // Delete in order to respect foreign keys
    // 1. Delete prospect_podcast_feedback
    const { data: deletedFeedback, error: feedbackError } = await supabase
      .from('prospect_podcast_feedback')
      .delete()
      .eq('prospect_dashboard_id', prospect_id)
      .select('id')

    if (feedbackError) {
      console.error('[Delete Prospect] Error deleting feedback:', feedbackError)
      throw feedbackError
    }

    const feedbackCount = deletedFeedback?.length || 0
    console.log(`[Delete Prospect] Deleted ${feedbackCount} feedback entries`)

    // 2. Delete prospect_podcast_analyses
    const { data: deletedAnalyses, error: analysesError } = await supabase
      .from('prospect_podcast_analyses')
      .delete()
      .eq('prospect_dashboard_id', prospect_id)
      .select('id')

    if (analysesError) {
      console.error('[Delete Prospect] Error deleting analyses:', analysesError)
      throw analysesError
    }

    const analysesCount = deletedAnalyses?.length || 0
    console.log(`[Delete Prospect] Deleted ${analysesCount} analyses`)

    // 3. Delete prospect_dashboard_podcasts
    const { data: deletedPodcasts, error: podcastsError } = await supabase
      .from('prospect_dashboard_podcasts')
      .delete()
      .eq('prospect_dashboard_id', prospect_id)
      .select('id')

    if (podcastsError) {
      console.error('[Delete Prospect] Error deleting podcasts:', podcastsError)
      throw podcastsError
    }

    const podcastsCount = deletedPodcasts?.length || 0
    console.log(`[Delete Prospect] Deleted ${podcastsCount} cached podcasts`)

    // 4. Delete the prospect dashboard itself
    const { error: dashboardError } = await supabase
      .from('prospect_dashboards')
      .delete()
      .eq('id', prospect_id)

    if (dashboardError) {
      console.error('[Delete Prospect] Error deleting dashboard:', dashboardError)
      throw dashboardError
    }

    console.log(`[Delete Prospect] Successfully deleted prospect ${prospect_id} (${existing.prospect_name})`)

    return new Response(
      JSON.stringify({
        success: true,
        deleted: {
          feedback: feedbackCount,
          analyses: analysesCount,
          podcasts: podcastsCount,
          dashboard: 1,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Delete Prospect] Error:', error)

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
