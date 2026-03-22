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
    const { prospect_dashboard_id, podcast_id, status, notes, podcast_name } = await req.json()

    if (!prospect_dashboard_id || !podcast_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'prospect_dashboard_id and podcast_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate status value
    if (status !== undefined && status !== null && status !== 'approved' && status !== 'rejected') {
      return new Response(
        JSON.stringify({ success: false, error: "status must be 'approved', 'rejected', or null" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Save Prospect Feedback] Dashboard: ${prospect_dashboard_id}, Podcast: ${podcast_id}, Status: ${status}`)

    // Validate the prospect dashboard exists and is active
    const { data: dashboard, error: dashboardError } = await supabase
      .from('prospect_dashboards')
      .select('id, is_published')
      .eq('id', prospect_dashboard_id)
      .single()

    if (dashboardError || !dashboard) {
      console.error('[Save Prospect Feedback] Dashboard not found:', prospect_dashboard_id)
      return new Response(
        JSON.stringify({ success: false, error: 'Prospect dashboard not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!dashboard.is_published) {
      console.error('[Save Prospect Feedback] Dashboard not active:', prospect_dashboard_id)
      return new Response(
        JSON.stringify({ success: false, error: 'Prospect dashboard is not active' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert feedback (unique on prospect_dashboard_id + podcast_id)
    const feedbackData: Record<string, unknown> = {
      prospect_dashboard_id,
      podcast_id,
      status: status ?? null,
    }

    if (notes !== undefined) {
      feedbackData.notes = notes
    }

    if (podcast_name !== undefined) {
      feedbackData.podcast_name = podcast_name
    }

    const { data: feedback, error: upsertError } = await supabase
      .from('prospect_podcast_feedback')
      .upsert(feedbackData, {
        onConflict: 'prospect_dashboard_id,podcast_id',
      })
      .select('id, status, notes, created_at, updated_at')
      .single()

    if (upsertError) {
      console.error('[Save Prospect Feedback] Upsert error:', upsertError)
      throw upsertError
    }

    console.log(`[Save Prospect Feedback] Saved feedback: ${feedback.id} (status: ${feedback.status})`)

    return new Response(
      JSON.stringify({
        success: true,
        feedback: {
          id: feedback.id,
          status: feedback.status,
          notes: feedback.notes,
          created_at: feedback.created_at,
          updated_at: feedback.updated_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Save Prospect Feedback] Error:', error)

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
