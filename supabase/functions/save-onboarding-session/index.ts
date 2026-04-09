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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()
    const { session_id, ...sessionData } = body

    if (!session_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'session_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Save Onboarding Session] Saving session ${session_id}, step ${sessionData.current_step || 1}`)

    // Build the upsert payload
    const payload: Record<string, unknown> = {
      session_id,
      current_step: sessionData.current_step || 1,
      status: sessionData.status || 'in_progress',
    }

    // Track furthest step reached
    if (sessionData.current_step) {
      payload.furthest_step = sessionData.current_step
    }

    // Map form fields
    if (sessionData.name !== undefined) payload.name = sessionData.name
    if (sessionData.email !== undefined) payload.email = sessionData.email
    if (sessionData.title !== undefined) payload.title = sessionData.title
    if (sessionData.company !== undefined) payload.company = sessionData.company
    if (sessionData.website !== undefined) payload.website = sessionData.website
    if (sessionData.social_followers !== undefined) payload.social_followers = sessionData.social_followers
    if (sessionData.bio !== undefined) payload.bio = sessionData.bio
    if (sessionData.linkedin_url !== undefined) payload.linkedin_url = sessionData.linkedin_url
    if (sessionData.compelling_story !== undefined) payload.compelling_story = sessionData.compelling_story
    if (sessionData.unique_journey !== undefined) payload.unique_journey = sessionData.unique_journey
    if (sessionData.previous_podcasts !== undefined) payload.previous_podcasts = sessionData.previous_podcasts
    if (sessionData.expertise !== undefined) payload.expertise = sessionData.expertise
    if (sessionData.topics_confident !== undefined) payload.topics_confident = sessionData.topics_confident
    if (sessionData.passions !== undefined) payload.passions = sessionData.passions
    if (sessionData.goals !== undefined) payload.goals = sessionData.goals
    if (sessionData.ideal_audience !== undefined) payload.ideal_audience = sessionData.ideal_audience
    if (sessionData.specific_podcasts !== undefined) payload.specific_podcasts = sessionData.specific_podcasts
    if (sessionData.audience_value !== undefined) payload.audience_value = sessionData.audience_value
    if (sessionData.availability !== undefined) payload.availability = sessionData.availability
    if (sessionData.calendar_link !== undefined) payload.calendar_link = sessionData.calendar_link
    if (sessionData.personal_stories !== undefined) payload.personal_stories = sessionData.personal_stories
    if (sessionData.hobbies !== undefined) payload.hobbies = sessionData.hobbies
    if (sessionData.future_vision !== undefined) payload.future_vision = sessionData.future_vision
    if (sessionData.specific_angles !== undefined) payload.specific_angles = sessionData.specific_angles
    if (sessionData.additional_info !== undefined) payload.additional_info = sessionData.additional_info
    if (sessionData.key_messages !== undefined) payload.key_messages = sessionData.key_messages
    if (sessionData.impact !== undefined) payload.impact = sessionData.impact
    if (sessionData.has_headshot !== undefined) payload.has_headshot = sessionData.has_headshot

    // Metadata (only set on first save)
    if (sessionData.user_agent !== undefined) payload.user_agent = sessionData.user_agent
    if (sessionData.referrer !== undefined) payload.referrer = sessionData.referrer
    if (sessionData.utm_source !== undefined) payload.utm_source = sessionData.utm_source
    if (sessionData.utm_medium !== undefined) payload.utm_medium = sessionData.utm_medium
    if (sessionData.utm_campaign !== undefined) payload.utm_campaign = sessionData.utm_campaign

    // If marking as completed, set completed_at and link client_id
    if (sessionData.status === 'completed') {
      payload.completed_at = new Date().toISOString()
      if (sessionData.client_id) payload.client_id = sessionData.client_id
    }

    // Check if session exists
    const { data: existing } = await supabase
      .from('onboarding_sessions')
      .select('id, furthest_step')
      .eq('session_id', session_id)
      .maybeSingle()

    if (existing) {
      // Update: keep the highest furthest_step
      if (existing.furthest_step && payload.furthest_step) {
        payload.furthest_step = Math.max(
          existing.furthest_step as number,
          payload.furthest_step as number
        )
      }

      const { error: updateError } = await supabase
        .from('onboarding_sessions')
        .update(payload)
        .eq('session_id', session_id)

      if (updateError) {
        console.error('[Save Onboarding Session] Update error:', updateError)
        throw new Error(`Failed to update session: ${updateError.message}`)
      }

      console.log(`[Save Onboarding Session] Updated session ${session_id}`)
    } else {
      // Insert new session
      const { error: insertError } = await supabase
        .from('onboarding_sessions')
        .insert(payload)

      if (insertError) {
        console.error('[Save Onboarding Session] Insert error:', insertError)
        throw new Error(`Failed to create session: ${insertError.message}`)
      }

      console.log(`[Save Onboarding Session] Created new session ${session_id}`)
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Save Onboarding Session] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
