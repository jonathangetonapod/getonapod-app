import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// All allowed fields and their types for validation
const ALLOWED_FIELDS: Record<string, string> = {
  prospect_name: 'string',
  prospect_bio: 'string',
  prospect_image_url: 'string',
  prospect_industry: 'string',
  prospect_expertise: 'string[]',
  prospect_topics: 'string[]',
  prospect_target_audience: 'string',
  prospect_company: 'string',
  prospect_title: 'string',
  first_name: 'string',
  spreadsheet_id: 'string',
  spreadsheet_url: 'string',
  personalized_tagline: 'string',
  media_kit_url: 'string',
  loom_video_url: 'string',
  loom_thumbnail_url: 'string',
  loom_video_title: 'string',
  show_loom_video: 'boolean',
  show_pricing_section: 'boolean',
  show_testimonials: 'boolean',
  testimonial_ids: 'string[]',
  is_active: 'boolean',
  background_video_url: 'string',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prospect_id, updates } = await req.json()

    if (!prospect_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'prospect_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'updates object is required and must not be empty' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Update Prospect Dashboard] Updating prospect ${prospect_id}`)

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

    // Filter to only allowed fields, ignoring null/undefined values
    const sanitizedUpdates: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (key in ALLOWED_FIELDS && value !== null && value !== undefined) {
        sanitizedUpdates[key] = value
      }
    }

    if (Object.keys(sanitizedUpdates).length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No valid fields to update' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Update Prospect Dashboard] Fields to update: ${Object.keys(sanitizedUpdates).join(', ')}`)

    // Perform the update
    const { data: updated, error: updateError } = await supabase
      .from('prospect_dashboards')
      .update(sanitizedUpdates)
      .eq('id', prospect_id)
      .select('id, prospect_name, updated_at')
      .single()

    if (updateError) {
      console.error('[Update Prospect Dashboard] DB update error:', updateError)
      throw updateError
    }

    console.log(`[Update Prospect Dashboard] Successfully updated prospect ${prospect_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        dashboard: {
          id: updated.id,
          prospect_name: updated.prospect_name,
          updated_at: updated.updated_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Update Prospect Dashboard] Error:', error)

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
