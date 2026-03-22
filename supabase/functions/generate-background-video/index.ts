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
    const body = await req.json()
    const { prospect_id, action } = body

    if (!prospect_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'prospect_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const videoServiceUrl = Deno.env.get('VIDEO_SERVICE_URL')
    if (!videoServiceUrl) {
      throw new Error('VIDEO_SERVICE_URL not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // --- CHECK STATUS ---
    if (action === 'check_status') {
      console.log(`[Background Video] Checking status for prospect ${prospect_id}`)

      const { data: prospect, error: fetchError } = await supabase
        .from('prospect_dashboards')
        .select('id, slug, background_video_status, background_video_url, background_video_generated_at')
        .eq('id', prospect_id)
        .single()

      if (fetchError || !prospect) {
        throw new Error(`Prospect not found: ${prospect_id}`)
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: prospect.background_video_status || 'not_generated',
          video_url: prospect.background_video_url || null,
          generated_at: prospect.background_video_generated_at || null,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- GENERATE VIDEO ---
    const { prospect_name, prospect_bio, prospect_image_url } = body

    if (!prospect_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'prospect_name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Background Video] Generating video for prospect ${prospect_id} (${prospect_name})`)

    // Fetch the prospect to get slug for the video service
    const { data: prospect, error: fetchError } = await supabase
      .from('prospect_dashboards')
      .select('id, slug, prospect_name')
      .eq('id', prospect_id)
      .single()

    if (fetchError || !prospect) {
      throw new Error(`Prospect not found: ${prospect_id}`)
    }

    // Update status to processing before calling external service
    const { error: updateError } = await supabase
      .from('prospect_dashboards')
      .update({
        background_video_status: 'processing',
        background_video_generated_at: new Date().toISOString(),
      })
      .eq('id', prospect_id)

    if (updateError) {
      console.error('[Background Video] DB update error:', updateError)
      throw updateError
    }

    console.log(`[Background Video] Calling video service at ${videoServiceUrl}/api/generate-video`)

    // Call the external video generation service
    const response = await fetch(`${videoServiceUrl}/api/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dashboardId: prospect_id,
        slug: prospect.slug,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error || `Video service error: ${response.status}`
      console.error('[Background Video] Service error:', errorMessage)

      // Mark as failed in database
      await supabase
        .from('prospect_dashboards')
        .update({ background_video_status: 'failed' })
        .eq('id', prospect_id)

      throw new Error(errorMessage)
    }

    const result = await response.json()

    console.log(`[Background Video] Service response:`, JSON.stringify(result))

    // If the video service returns the URL immediately (synchronous generation),
    // update the record with the completed video
    if (result.videoUrl) {
      const { error: completeError } = await supabase
        .from('prospect_dashboards')
        .update({
          background_video_url: result.videoUrl,
          background_video_status: 'completed',
        })
        .eq('id', prospect_id)

      if (completeError) {
        console.error('[Background Video] DB update error on completion:', completeError)
      }

      console.log(`[Background Video] Video completed for prospect ${prospect_id}: ${result.videoUrl}`)

      return new Response(
        JSON.stringify({
          success: true,
          status: 'completed',
          video_url: result.videoUrl,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Otherwise, the video is being generated asynchronously
    console.log(`[Background Video] Video generation started (async) for prospect ${prospect_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        status: 'processing',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Background Video] Error:', error)

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
