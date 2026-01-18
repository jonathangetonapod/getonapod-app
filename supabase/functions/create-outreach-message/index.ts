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

    // Validate required fields
    if (!payload.client_id) {
      throw new Error('client_id is required')
    }

    if (!payload.podcast?.name) {
      throw new Error('podcast.name is required')
    }

    if (!payload.podcast?.host_name) {
      throw new Error('podcast.host_name is required')
    }

    if (!payload.podcast?.host_email) {
      throw new Error('podcast.host_email is required')
    }

    if (!payload.email?.subject) {
      throw new Error('email.subject is required')
    }

    if (!payload.email?.body) {
      throw new Error('email.body is required')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify client exists
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', payload.client_id)
      .single()

    if (clientError || !client) {
      console.error('[Create Outreach Message] Client not found:', clientError)
      throw new Error(`Client not found: ${payload.client_id}`)
    }

    console.log('[Create Outreach Message] Client verified:', client.name)

    // Insert outreach message
    const { data: message, error: insertError } = await supabase
      .from('outreach_messages')
      .insert({
        client_id: payload.client_id,
        podcast_id: payload.podcast.id || null,
        podcast_name: payload.podcast.name,
        podcast_url: payload.podcast.url || null,
        host_name: payload.podcast.host_name,
        host_email: payload.podcast.host_email,
        subject_line: payload.email.subject,
        email_body: payload.email.body,
        bison_campaign_id: payload.bison_campaign_id || null,
        personalization_data: payload.personalization_data || null,
        status: 'pending_review',
        priority: payload.priority || null,
        created_by: 'clay'
      })
      .select()
      .single()

    if (insertError) {
      console.error('[Create Outreach Message] Insert error:', insertError)
      throw new Error(`Failed to create outreach message: ${insertError.message}`)
    }

    console.log('[Create Outreach Message] Message created:', message.id)

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
