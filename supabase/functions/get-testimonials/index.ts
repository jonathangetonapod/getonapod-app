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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json().catch(() => ({}))
    const {
      featured_only = false,
      active_only = true,
      limit = 20,
    } = body

    let query = supabase
      .from('testimonials')
      .select('id, video_url, client_name, client_title, client_company, client_photo_url, quote, is_featured, display_order, is_active, created_at', { count: 'exact' })

    // Default: only active testimonials for public access
    if (active_only) {
      query = query.eq('is_active', true)
    }

    if (featured_only) {
      query = query.eq('is_featured', true)
    }

    query = query
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit)

    const { data: testimonials, error, count } = await query

    if (error) {
      throw error
    }

    return new Response(
      JSON.stringify({
        success: true,
        testimonials: testimonials || [],
        total: count || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[get-testimonials] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
