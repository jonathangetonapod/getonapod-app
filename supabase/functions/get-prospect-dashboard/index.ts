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
    const { slug } = await req.json()

    if (!slug) {
      return new Response(
        JSON.stringify({ success: false, error: 'slug is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Get Prospect Dashboard] Fetching dashboard for slug: ${slug}`)

    // Fetch prospect dashboard by slug
    const { data: dashboard, error: dashboardError } = await supabase
      .from('prospect_dashboards')
      .select('*')
      .eq('slug', slug)
      .single()

    if (dashboardError || !dashboard) {
      console.log(`[Get Prospect Dashboard] Not found: ${slug}`)
      return new Response(
        JSON.stringify({ success: false, error: 'Dashboard not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!dashboard.is_active) {
      console.log(`[Get Prospect Dashboard] Inactive dashboard: ${slug}`)
      return new Response(
        JSON.stringify({ success: false, error: 'This dashboard link is no longer active' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch feedback and increment view count in parallel
    const [feedbackResult, _viewCountResult] = await Promise.all([
      // Fetch prospect_podcast_feedback for this dashboard
      supabase
        .from('prospect_podcast_feedback')
        .select('*')
        .eq('prospect_dashboard_id', dashboard.id),

      // Increment view count atomically
      supabase
        .from('prospect_dashboards')
        .update({
          view_count: (dashboard.view_count || 0) + 1,
          last_viewed_at: new Date().toISOString(),
        })
        .eq('id', dashboard.id),
    ])

    const feedback = feedbackResult.data || []

    if (feedbackResult.error) {
      console.warn(`[Get Prospect Dashboard] Feedback fetch error:`, feedbackResult.error)
    }

    console.log(`[Get Prospect Dashboard] Returning dashboard ${dashboard.id} with ${feedback.length} feedback entries`)

    return new Response(
      JSON.stringify({
        success: true,
        dashboard: {
          id: dashboard.id,
          slug: dashboard.slug,
          prospect_name: dashboard.prospect_name,
          prospect_bio: dashboard.prospect_bio,
          prospect_image_url: dashboard.prospect_image_url,
          spreadsheet_id: dashboard.spreadsheet_id,
          is_active: dashboard.is_active,
          show_pricing_section: dashboard.show_pricing_section,
          personalized_tagline: dashboard.personalized_tagline,
          media_kit_url: dashboard.media_kit_url,
          loom_video_url: dashboard.loom_video_url,
          loom_thumbnail_url: dashboard.loom_thumbnail_url,
          loom_video_title: dashboard.loom_video_title,
          show_loom_video: dashboard.show_loom_video,
          testimonial_ids: dashboard.testimonial_ids,
          show_testimonials: dashboard.show_testimonials,
          view_count: (dashboard.view_count || 0) + 1,
        },
        feedback,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Get Prospect Dashboard] Error:', error)

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
