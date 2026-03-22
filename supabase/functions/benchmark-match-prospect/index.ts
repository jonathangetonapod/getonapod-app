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
    const { prospect_id, match_count = 50, similarity_threshold = 0.30 } = await req.json()

    if (!prospect_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'prospect_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    // 1. Get prospect
    const { data: prospect, error: prospectError } = await supabase
      .from('prospect_dashboards')
      .select('*')
      .eq('id', prospect_id)
      .single()

    if (prospectError || !prospect) {
      return new Response(
        JSON.stringify({ success: false, error: 'Prospect not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[Benchmark] Matching for: ${prospect.prospect_name}`)

    // 2. Build embedding text from bio + structured fields
    const parts = [prospect.prospect_bio || '']
    if (prospect.prospect_industry) parts.push(`Industry: ${prospect.prospect_industry}`)
    if (prospect.prospect_expertise?.length) parts.push(`Expertise: ${prospect.prospect_expertise.join(', ')}`)
    if (prospect.prospect_topics?.length) parts.push(`Topics: ${prospect.prospect_topics.join(', ')}`)
    if (prospect.prospect_target_audience) parts.push(`Target audience: ${prospect.prospect_target_audience}`)
    if (prospect.prospect_company) parts.push(`Company: ${prospect.prospect_company}`)
    if (prospect.prospect_title) parts.push(`Title: ${prospect.prospect_title}`)

    const embeddingText = parts.join('\n')
    console.log(`[Benchmark] Embedding text length: ${embeddingText.length}`)

    // 3. Generate embedding
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: embeddingText,
      }),
    })

    if (!embeddingResponse.ok) {
      throw new Error(`OpenAI embedding failed: ${embeddingResponse.statusText}`)
    }

    const embeddingData = await embeddingResponse.json()
    const embedding = embeddingData.data[0].embedding

    // 4. Vector search
    const { data: matches, error: searchError } = await supabase.rpc('search_similar_podcasts', {
      query_embedding: embedding,
      match_threshold: similarity_threshold,
      match_count: match_count,
    })

    if (searchError) {
      throw new Error(`Vector search failed: ${searchError.message}`)
    }

    console.log(`[Benchmark] Found ${matches?.length || 0} matches`)

    // 5. Save matches to prospect_dashboard_podcasts (so they show up in admin UI for review)
    const savedPodcasts = []
    for (const match of (matches || [])) {
      const { error: insertError } = await supabase
        .from('prospect_dashboard_podcasts')
        .upsert({
          prospect_dashboard_id: prospect_id,
          podcast_id: match.podscan_id,
          podcast_name: match.podcast_name,
          podcast_description: match.podcast_description,
          podcast_image_url: match.podcast_image_url || null,
          podcast_url: match.podcast_url || null,
          publisher_name: match.publisher_name || null,
          itunes_rating: match.itunes_rating || null,
          episode_count: match.episode_count || null,
          audience_size: match.audience_size || null,
          podcast_categories: match.podcast_categories || null,
          last_posted_at: match.last_posted_at || null,
        }, { onConflict: 'prospect_dashboard_id,podcast_id' })

      if (!insertError) {
        savedPodcasts.push({
          podcast_id: match.podscan_id,
          podcast_name: match.podcast_name,
          similarity: match.similarity,
          audience_size: match.audience_size,
        })
      }
    }

    console.log(`[Benchmark] Saved ${savedPodcasts.length} podcasts for review`)

    return new Response(
      JSON.stringify({
        success: true,
        prospect_name: prospect.prospect_name,
        total_matches: matches?.length || 0,
        saved_for_review: savedPodcasts.length,
        podcasts: savedPodcasts,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Benchmark] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
