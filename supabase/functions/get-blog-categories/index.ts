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
    const { include_empty = false } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Get Blog Categories] include_empty=${include_empty}`)

    // Fetch all active categories
    const { data: categories, error: categoriesError } = await supabase
      .from('blog_categories')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (categoriesError) {
      throw categoriesError
    }

    if (!categories || categories.length === 0) {
      return new Response(
        JSON.stringify({ success: true, categories: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // For each category, count published posts
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const { count, error: countError } = await supabase
          .from('blog_posts')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', category.id)
          .eq('status', 'published')

        if (countError) {
          console.error(`[Get Blog Categories] Count error for ${category.name}:`, countError)
        }

        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          post_count: count || 0,
        }
      })
    )

    // Filter out empty categories unless include_empty is true
    const result = include_empty
      ? categoriesWithCounts
      : categoriesWithCounts.filter((c) => c.post_count > 0)

    console.log(`[Get Blog Categories] Returning ${result.length} categories`)

    return new Response(
      JSON.stringify({
        success: true,
        categories: result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Get Blog Categories] Error:', error)

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
