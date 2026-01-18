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
    const payload = await req.json()

    console.log('[Create Outreach Message] Received payload:', JSON.stringify(payload, null, 2))

    // Validate required fields from Clay
    if (!payload.client_id) {
      throw new Error('client_id is required')
    }

    if (!payload.final_host_email) {
      throw new Error('final_host_email is required')
    }

    if (!payload.email_1) {
      throw new Error('email_1 is required')
    }

    if (!payload.subject_line) {
      throw new Error('subject_line is required')
    }

    // Accept host_name directly, or construct from first_name + last_name
    let hostName = 'Unknown Host'
    if (payload.host_name) {
      hostName = payload.host_name.trim()
    } else if (payload.first_name || payload.last_name) {
      hostName = [payload.first_name, payload.last_name].filter(Boolean).join(' ').trim()
    } else {
      throw new Error('host_name or (first_name and/or last_name) is required')
    }

    // Extract podcast name from research text (looks for "Podcast Research Report: NAME" pattern)
    let podcastName = 'Unknown Podcast'
    if (payload.podcast_research) {
      const match = payload.podcast_research.match(/(?:Podcast Research Report:|research report on)\s*[*_]?([^*_\n]+)[*_]?/i)
      if (match && match[1]) {
        podcastName = match[1].trim()
      }
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify client exists and get their bison_campaign_id
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, bison_campaign_id')
      .eq('id', payload.client_id)
      .single()

    if (clientError || !client) {
      console.error('[Create Outreach Message] Client not found:', clientError)
      throw new Error(`Client not found: ${payload.client_id}`)
    }

    console.log('[Create Outreach Message] Client verified:', client.name)
    console.log('[Create Outreach Message] Client bison_campaign_id:', client.bison_campaign_id)
    console.log('[Create Outreach Message] Payload bison_campaign_id:', payload.bison_campaign_id)

    // Use client's bison_campaign_id if payload doesn't have one
    const bisonCampaignId = payload.bison_campaign_id || client.bison_campaign_id || null
    console.log('[Create Outreach Message] Final bison_campaign_id to use:', bisonCampaignId)

    // Look up podcast name from cache if podcast_id is provided
    if (payload.podcast_id) {
      console.log('[Create Outreach Message] Looking up podcast in cache:', payload.podcast_id)

      // Try client_dashboard_podcasts first
      const { data: cachedPodcast } = await supabase
        .from('client_dashboard_podcasts')
        .select('podcast_name, podcast_url')
        .eq('podcast_id', payload.podcast_id)
        .maybeSingle()

      if (cachedPodcast && cachedPodcast.podcast_name) {
        podcastName = cachedPodcast.podcast_name
        console.log('[Create Outreach Message] Found cached podcast:', podcastName)
      } else {
        // Fallback to prospect_dashboard_podcasts
        const { data: prospectPodcast } = await supabase
          .from('prospect_dashboard_podcasts')
          .select('podcast_name, podcast_url')
          .eq('podcast_id', payload.podcast_id)
          .maybeSingle()

        if (prospectPodcast && prospectPodcast.podcast_name) {
          podcastName = prospectPodcast.podcast_name
          console.log('[Create Outreach Message] Found podcast in prospect cache:', podcastName)
        } else {
          console.warn('[Create Outreach Message] Podcast not found in cache, will try regex extraction')
        }
      }
    }

    // Insert outreach message with Clay fields
    const { data: message, error: insertError } = await supabase
      .from('outreach_messages')
      .insert({
        client_id: payload.client_id,
        podcast_id: payload.podcast_id || null,
        podcast_name: podcastName,
        podcast_url: null,
        host_name: hostName,
        host_email: payload.final_host_email,
        subject_line: payload.subject_line,
        email_body: payload.email_1,
        bison_campaign_id: bisonCampaignId,
        personalization_data: {
          podcast_research: payload.podcast_research,
          host_info: payload.host_info,
          topics: payload.topics,
          host_name: payload.host_name,
          first_name: payload.first_name,
          last_name: payload.last_name
        },
        status: 'pending_review',
        priority: payload.priority || 'medium',
        created_by: 'clay'
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Create Outreach Message] Insert error:', insertError)
      throw new Error(`Failed to create outreach message: ${insertError.message}`)
    }

    console.log('[Create Outreach Message] Message created:', message.id)
    console.log('[Create Outreach Message] Message bison_campaign_id:', message.bison_campaign_id)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Outreach message created successfully',
        data: {
          id: message.id,
          client_id: message.client_id,
          podcast_name: message.podcast_name,
          status: message.status
        }
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
    console.error('[Create Outreach Message] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
