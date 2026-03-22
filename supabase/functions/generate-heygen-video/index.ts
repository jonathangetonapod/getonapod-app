import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HEYGEN_API_BASE = 'https://api.heygen.com'

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

    const heygenApiKey = Deno.env.get('HEYGEN_API_KEY')
    if (!heygenApiKey) {
      throw new Error('HEYGEN_API_KEY not configured')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // --- CHECK STATUS ---
    if (action === 'check_status') {
      console.log(`[HeyGen Video] Checking status for prospect ${prospect_id}`)

      const { data: prospect, error: fetchError } = await supabase
        .from('prospect_dashboards')
        .select('id, heygen_video_id, heygen_video_status, heygen_video_url, heygen_video_thumbnail_url')
        .eq('id', prospect_id)
        .single()

      if (fetchError || !prospect) {
        throw new Error(`Prospect not found: ${prospect_id}`)
      }

      if (!prospect.heygen_video_id) {
        return new Response(
          JSON.stringify({ success: true, status: 'not_generated', video_url: null, thumbnail_url: null }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Call HeyGen API to check video status
      const statusResponse = await fetch(
        `${HEYGEN_API_BASE}/v1/video_status.get?video_id=${prospect.heygen_video_id}`,
        {
          headers: {
            accept: 'application/json',
            'x-api-key': heygenApiKey,
          },
        }
      )

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text()
        console.error('[HeyGen Video] Status check error:', errorText)
        throw new Error(`HeyGen status check failed: ${statusResponse.status}`)
      }

      const statusData = await statusResponse.json()
      const videoData = statusData.data

      console.log(`[HeyGen Video] Status for ${prospect.heygen_video_id}: ${videoData.status}`)

      // If completed, update the prospect record
      if (videoData.status === 'completed' && videoData.video_url) {
        const { error: updateError } = await supabase
          .from('prospect_dashboards')
          .update({
            heygen_video_url: videoData.video_url,
            heygen_video_thumbnail_url: videoData.thumbnail_url || null,
            heygen_video_status: 'completed',
          })
          .eq('id', prospect_id)

        if (updateError) {
          console.error('[HeyGen Video] DB update error on status check:', updateError)
        }
      } else if (videoData.status === 'failed') {
        await supabase
          .from('prospect_dashboards')
          .update({ heygen_video_status: 'failed' })
          .eq('id', prospect_id)
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: videoData.status,
          video_url: videoData.video_url || null,
          thumbnail_url: videoData.thumbnail_url || null,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- GENERATE VIDEO ---
    const { template_id, variables } = body

    if (!template_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'template_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[HeyGen Video] Generating video for prospect ${prospect_id} with template ${template_id}`)

    // Fetch prospect data
    const { data: prospect, error: fetchError } = await supabase
      .from('prospect_dashboards')
      .select('id, prospect_name, prospect_bio, prospect_image_url, first_name, background_video_url')
      .eq('id', prospect_id)
      .single()

    if (fetchError || !prospect) {
      throw new Error(`Prospect not found: ${prospect_id}`)
    }

    // Build the generate request with template variables
    // Merge prospect data into variables, allowing caller to override
    const generateRequest: Record<string, any> = {
      title: `Video for ${prospect.prospect_name || 'Prospect'}`,
      caption: false,
      ...( variables ? { variables } : {} ),
    }

    console.log(`[HeyGen Video] Calling HeyGen generate API for template ${template_id}`)

    // Call HeyGen API to generate video from template
    const generateResponse = await fetch(
      `${HEYGEN_API_BASE}/v2/template/${template_id}/generate`,
      {
        method: 'POST',
        headers: {
          'X-Api-Key': heygenApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(generateRequest),
      }
    )

    if (!generateResponse.ok) {
      const errorData = await generateResponse.json().catch(() => ({}))
      const errorMessage = errorData.message || errorData.error || `HeyGen API error: ${generateResponse.status}`
      console.error('[HeyGen Video] Generate error:', errorMessage)
      throw new Error(errorMessage)
    }

    const generateData = await generateResponse.json()
    const videoId = generateData.data?.video_id || generateData.video_id

    if (!videoId) {
      console.error('[HeyGen Video] No video_id in response:', JSON.stringify(generateData))
      throw new Error('No video_id returned from HeyGen API')
    }

    console.log(`[HeyGen Video] Video generation started: ${videoId}`)

    // Update prospect record with video generation info
    const { error: updateError } = await supabase
      .from('prospect_dashboards')
      .update({
        heygen_video_id: videoId,
        heygen_video_status: 'processing',
        heygen_video_generated_at: new Date().toISOString(),
      })
      .eq('id', prospect_id)

    if (updateError) {
      console.error('[HeyGen Video] DB update error:', updateError)
      throw updateError
    }

    console.log(`[HeyGen Video] Prospect ${prospect_id} updated with video_id ${videoId}`)

    return new Response(
      JSON.stringify({
        success: true,
        video_id: videoId,
        status: 'processing',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[HeyGen Video] Error:', error)

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
