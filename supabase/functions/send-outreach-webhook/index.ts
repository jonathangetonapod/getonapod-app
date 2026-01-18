import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

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
    const { clientId, podcastId } = await req.json()

    // Validation
    if (!clientId) {
      throw new Error('clientId is required')
    }

    if (!podcastId) {
      throw new Error('podcastId is required')
    }

    console.log('[Send Outreach Webhook] Starting for client:', clientId, 'podcast:', podcastId)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch client data (including webhook URL)
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, email, bio, photo_url, contact_person, linkedin_url, website, google_sheet_url, media_kit_url, calendar_link, outreach_webhook_url')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      console.error('[Send Outreach Webhook] Client not found:', clientError)
      throw new Error('Client not found')
    }

    if (!client.outreach_webhook_url) {
      throw new Error('Webhook URL not configured for this client')
    }

    console.log('[Send Outreach Webhook] Client:', client.name, '| Webhook:', client.outreach_webhook_url)

    // Fetch podcast data from cache
    const { data: podcast, error: podcastError } = await supabase
      .from('client_dashboard_podcasts')
      .select('*')
      .eq('client_id', clientId)
      .eq('podcast_id', podcastId)
      .single()

    if (podcastError || !podcast) {
      console.error('[Send Outreach Webhook] Podcast not found:', podcastError)
      throw new Error('Podcast not found in cache')
    }

    console.log('[Send Outreach Webhook] Podcast:', podcast.podcast_name)

    // Build webhook payload
    const payload = {
      event: 'podcast_approved_for_outreach',
      timestamp: new Date().toISOString(),
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        bio: client.bio,
        photo_url: client.photo_url,
        contact_person: client.contact_person,
        linkedin_url: client.linkedin_url,
        website: client.website,
        google_sheet_url: client.google_sheet_url,
        media_kit_url: client.media_kit_url,
        calendar_link: client.calendar_link,
      },
      podcast: {
        id: podcast.podcast_id,
        name: podcast.podcast_name,
        description: podcast.podcast_description,
        url: podcast.podcast_url,
        image_url: podcast.podcast_image_url,
        publisher_name: podcast.publisher_name,
        rating: podcast.itunes_rating,
        episode_count: podcast.episode_count,
        audience_size: podcast.audience_size,
        categories: podcast.podcast_categories,
        ai_clean_description: podcast.ai_clean_description,
        ai_fit_reasons: podcast.ai_fit_reasons,
        ai_pitch_angles: podcast.ai_pitch_angles,
        demographics: podcast.demographics,
      },
    }

    console.log('[Send Outreach Webhook] Sending webhook to:', client.outreach_webhook_url)

    // Send webhook with 10-second timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    let webhookResponse
    let webhookStatus: number | null = null
    let webhookResponseBody: string | null = null

    try {
      webhookResponse = await fetch(client.outreach_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      webhookStatus = webhookResponse.status
      webhookResponseBody = await webhookResponse.text()

      console.log('[Send Outreach Webhook] Webhook response:', webhookStatus, webhookResponseBody?.slice(0, 200))
    } catch (webhookError) {
      clearTimeout(timeoutId)

      if (webhookError.name === 'AbortError') {
        console.error('[Send Outreach Webhook] Webhook timeout after 10 seconds')
        webhookResponseBody = 'Request timeout after 10 seconds'
        webhookStatus = 408
      } else {
        console.error('[Send Outreach Webhook] Webhook error:', webhookError)
        webhookResponseBody = webhookError.message
        webhookStatus = 0 // Connection failed
      }
    }

    // Record action in podcast_outreach_actions table
    const { error: insertError } = await supabase
      .from('podcast_outreach_actions')
      .upsert(
        {
          client_id: clientId,
          podcast_id: podcastId,
          podcast_name: podcast.podcast_name,
          action: 'sent',
          webhook_sent_at: new Date().toISOString(),
          webhook_response_status: webhookStatus,
          webhook_response_body: webhookResponseBody,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,podcast_id' }
      )

    if (insertError) {
      console.error('[Send Outreach Webhook] Error recording action:', insertError)
      throw new Error('Failed to record outreach action')
    }

    console.log('[Send Outreach Webhook] Action recorded successfully')

    // Check if webhook was successful (2xx status)
    const webhookSuccessful = webhookStatus && webhookStatus >= 200 && webhookStatus < 300

    if (!webhookSuccessful) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Webhook failed with status ${webhookStatus}`,
          webhookStatus,
          webhookResponse: webhookResponseBody?.slice(0, 500),
        }),
        {
          status: 200, // Return 200 so frontend can handle error gracefully
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook sent successfully',
        webhookStatus,
        podcast: {
          id: podcast.podcast_id,
          name: podcast.podcast_name,
        },
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
    console.error('[Send Outreach Webhook] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
