import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  HttpError,
  parseOptionalJsonObject,
  requireOnlyKeys,
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

    const body = await parseOptionalJsonObject(req, 4_096)
    requireOnlyKeys(body, ['category', 'type', 'featured_only', 'limit', 'offset'])

    for (const key of ['category', 'type'] as const) {
      if (body[key] !== undefined && typeof body[key] !== 'string') {
        throw new HttpError(400, 'INVALID_FIELD', `${key} must be a string`)
      }
    }
    if (body.featured_only !== undefined && typeof body.featured_only !== 'boolean') {
      throw new HttpError(400, 'INVALID_FIELD', 'featured_only must be a boolean')
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
    if (
      body.offset !== undefined
      && (typeof body.offset !== 'number' || !Number.isSafeInteger(body.offset) || body.offset < 0)
    ) {
      throw new HttpError(400, 'INVALID_FIELD', 'offset must be a non-negative integer')
    }

    const category = body.category as string | undefined
    const type = body.type as string | undefined
    const featured_only = (body.featured_only as boolean | undefined) ?? false
    const limit = (body.limit as number | undefined) ?? 50
    const offset = (body.offset as number | undefined) ?? 0

    let query = supabase
      .from('guest_resources')
      .select('id, title, description, content, category, type, url, file_url, featured, display_order, created_at, updated_at', { count: 'exact' })

    if (category) {
      query = query.eq('category', category)
    }

    if (type) {
      query = query.eq('type', type)
    }

    if (featured_only) {
      query = query.eq('featured', true)
    }

    query = query
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: resources, error, count } = await query

    if (error) {
      throw error
    }

    return new Response(
      JSON.stringify({
        success: true,
        resources: resources || [],
        total: count || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof HttpError ? error.message : 'Internal server error'
    console.error('[get-guest-resources] Request failed')

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
