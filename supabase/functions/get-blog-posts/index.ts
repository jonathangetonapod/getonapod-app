import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  HttpError,
  parseOptionalJsonObject,
  requireOnlyKeys,
  requirePlatformAdminOrService,
} from '../_shared/workspaceAuth.ts'

/** Escape special Supabase/PostgREST filter characters in user input */
function sanitizeSearch(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

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

    const body = await parseOptionalJsonObject(req, 8_192)
    requireOnlyKeys(body, ['status', 'category', 'search', 'page', 'page_size', 'slug', 'admin'])

    for (const key of ['status', 'category', 'search', 'slug'] as const) {
      if (body[key] !== undefined && typeof body[key] !== 'string') {
        throw new HttpError(400, 'INVALID_FIELD', `${key} must be a string`)
      }
    }
    if (body.admin !== undefined && typeof body.admin !== 'boolean') {
      throw new HttpError(400, 'INVALID_FIELD', 'admin must be a boolean')
    }
    if (
      body.page !== undefined
      && (typeof body.page !== 'number' || !Number.isSafeInteger(body.page) || body.page < 1)
    ) {
      throw new HttpError(400, 'INVALID_FIELD', 'page must be a positive integer')
    }
    if (
      body.page_size !== undefined
      && (
        typeof body.page_size !== 'number'
        || !Number.isSafeInteger(body.page_size)
        || body.page_size < 1
        || body.page_size > 100
      )
    ) {
      throw new HttpError(400, 'INVALID_FIELD', 'page_size must be an integer between 1 and 100')
    }

    const status = body.status as string | undefined
    const category = body.category as string | undefined
    const search = body.search as string | undefined
    const page = (body.page as number | undefined) ?? 1
    const page_size = (body.page_size as number | undefined) ?? 10
    const slug = body.slug as string | undefined
    const admin = body.admin as boolean | undefined

    const adminAccess = admin === true
    if (adminAccess) await requirePlatformAdminOrService(req)

    // ─── Single post by slug ───────────────────────────────────────────
    if (slug) {
      const { data: post, error: fetchError } = await supabase
        .from('blog_posts')
        .select('id, title, slug, content, meta_description, excerpt, category_id, tags, featured_image_url, featured_image_alt, author_name, status, published_at, view_count, read_time_minutes, schema_markup, blog_categories(*)')
        .eq('slug', slug)
        .single()

      if (fetchError || !post) {
        return new Response(
          JSON.stringify({ success: false, error: 'Post not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Only allow published posts for public access
      if (!adminAccess && post.status !== 'published') {
        return new Response(
          JSON.stringify({ success: false, error: 'Post not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Increment view count (fire-and-forget)
      supabase.rpc('increment_post_views', { post_id: post.id }).then(({ error }) => {
        if (error) {
          // Fallback: manual increment
          supabase
            .from('blog_posts')
            .select('view_count')
            .eq('id', post.id)
            .single()
            .then(({ data }) => {
              if (data) {
                supabase
                  .from('blog_posts')
                  .update({ view_count: data.view_count + 1 })
                  .eq('id', post.id)
                  .then(() => {})
              }
            })
        }
      })

      return new Response(
        JSON.stringify({ success: true, post }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── Paginated list ────────────────────────────────────────────────
    const from = (page - 1) * page_size
    const to = from + page_size - 1

    let query = supabase
      .from('blog_posts')
      .select('id, title, slug, content, meta_description, excerpt, category_id, tags, featured_image_url, featured_image_alt, author_name, published_at, view_count, read_time_minutes, blog_categories(*)', { count: 'exact' })

    // Public access: only published posts (unless admin flag)
    if (!adminAccess) {
      query = query.eq('status', 'published')
    } else if (status) {
      query = query.eq('status', status)
    }

    if (category) {
      query = query.eq('category_id', category)
    }

    if (search) {
      const safe = sanitizeSearch(search)
      query = query.or(`title.ilike.%${safe}%,content.ilike.%${safe}%,excerpt.ilike.%${safe}%`)
    }

    query = query
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data: posts, error: listError, count } = await query

    if (listError) {
      throw listError
    }

    return new Response(
      JSON.stringify({
        success: true,
        posts: posts || [],
        total: count || 0,
        page,
        page_size,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof HttpError ? error.message : 'Internal server error'
    console.error('[get-blog-posts] Request failed')

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
