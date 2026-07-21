import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  HttpError,
  parseOptionalJsonObject,
  requireOnlyKeys,
  requirePlatformAdminOrService,
} from '../_shared/workspaceAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Only POST is allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await parseOptionalJsonObject(req, 2_048)
    requireOnlyKeys(body, ['featured_only', 'active_only', 'limit'])

    for (const key of ['featured_only', 'active_only'] as const) {
      if (body[key] !== undefined && typeof body[key] !== 'boolean') {
        throw new HttpError(400, 'INVALID_FIELD', `${key} must be a boolean`)
      }
    }
    if (
      body.limit !== undefined
      && (
        typeof body.limit !== 'number'
        || !Number.isSafeInteger(body.limit)
        || body.limit < 1
        || body.limit > 100
      )
    ) {
      throw new HttpError(400, 'INVALID_FIELD', 'limit must be an integer between 1 and 100')
    }

    const featured_only = (body.featured_only as boolean | undefined) ?? false
    const active_only = (body.active_only as boolean | undefined) ?? true
    const limit = (body.limit as number | undefined) ?? 20

    if (active_only === false) await requirePlatformAdminOrService(req)

    let query = supabase
      .from('testimonials')
      .select('id, video_url, client_name, client_title, client_company, client_photo_url, quote, is_featured, display_order, is_active, created_at', { count: 'exact' })

    // Default: only active testimonials for public access
    if (active_only !== false) {
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
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof HttpError ? error.message : 'Internal server error'
    console.error('[get-testimonials] Request failed')

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
