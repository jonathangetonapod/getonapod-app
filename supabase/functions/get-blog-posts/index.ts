import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Escape special Supabase/PostgREST filter characters in user input */
function sanitizeSearch(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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
      status,
      category,
      search,
      page = 1,
      page_size = 10,
      slug,
      admin,
    } = body

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
      if (!admin && post.status === 'draft') {
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
    if (!admin) {
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
    console.error('[get-blog-posts] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
