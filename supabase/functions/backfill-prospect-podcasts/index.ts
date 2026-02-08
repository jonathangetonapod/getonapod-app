import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Backfill podcasts for a prospect dashboard
 * 1. Generate embedding from prospect name + bio
 * 2. Search similar podcasts via vector search
 * 3. Filter with Claude for quality
 * 4. Append to Google Sheet
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  
  try {
    const { prospectId } = await req.json()
    
    if (!prospectId) {
      return new Response(
        JSON.stringify({ error: 'prospectId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 [BACKFILL] Starting podcast backfill')
    console.log(`   Prospect ID: ${prospectId}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // 1. Get prospect info
    const { data: prospect, error: prospectError } = await supabase
      .from('prospect_dashboards')
      .select('*')
      .eq('id', prospectId)
      .single()

    if (prospectError || !prospect) {
      return new Response(
        JSON.stringify({ error: 'Prospect not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`   Prospect: ${prospect.prospect_name}`)
    console.log(`   Bio length: ${prospect.prospect_bio?.length || 0}`)
    console.log(`   Spreadsheet ID: ${prospect.spreadsheet_id}`)

    // 2. Create text for embedding
    const prospectText = [
      `Guest: ${prospect.prospect_name}`,
      prospect.prospect_bio ? `Background: ${prospect.prospect_bio.substring(0, 500)}` : ''
    ].filter(Boolean).join('\n')

    // 3. Generate embedding via OpenAI
    console.log('🔮 [EMBEDDING] Generating embedding...')
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: prospectText,
        dimensions: 1536
      })
    })

    if (!embeddingResponse.ok) {
      const error = await embeddingResponse.text()
      console.error('[EMBEDDING ERROR]', error)
      return new Response(
        JSON.stringify({ error: 'Failed to generate embedding' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const embeddingData = await embeddingResponse.json()
    const embedding = embeddingData.data[0].embedding
    console.log(`   Embedding dimensions: ${embedding.length}`)

    // 4. Search similar podcasts
    console.log('🔍 [SEARCH] Searching for matching podcasts...')
    const { data: matches, error: searchError } = await supabase.rpc('search_similar_podcasts', {
      query_embedding: embedding,
      match_threshold: 0.2,
      match_count: 100
    })

    if (searchError) {
      console.error('[SEARCH ERROR]', searchError)
      return new Response(
        JSON.stringify({ error: 'Search failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`   Raw matches: ${matches?.length || 0}`)

    if (!matches || matches.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No matching podcasts found',
          total: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Filter with Claude (top 30 for analysis)
    let filteredMatches = matches.slice(0, 30)
    
    if (anthropicKey && matches.length > 15) {
      console.log('🤖 [AI FILTER] Filtering with Claude...')
      try {
        const anthropic = new Anthropic({ apiKey: anthropicKey })
        
        const podcastSummaries = matches.slice(0, 50).map((m: any, i: number) => ({
          index: i,
          name: m.podcast_name,
          description: m.podcast_description?.substring(0, 200) || 'No description'
        }))

        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          temperature: 0.2,
          messages: [{
            role: 'user',
            content: `You're a podcast booking expert. Rate which podcasts are BEST for this guest.

GUEST PROFILE:
${prospectText}

PODCASTS:
${podcastSummaries.map((p: any) => `${p.index}. ${p.name}: ${p.description}`).join('\n')}

Return ONLY a JSON array of indices for the TOP 15 most relevant podcasts, ordered by fit:
[0, 5, 12, ...]

No explanations, just the array.`
          }]
        })

        const content = response.content[0].type === 'text' ? response.content[0].text : ''
        let jsonContent = content.trim()
        if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        }
        
        const selectedIndices = JSON.parse(jsonContent)
        if (Array.isArray(selectedIndices)) {
          filteredMatches = selectedIndices
            .slice(0, 15)
            .map((idx: number) => matches[idx])
            .filter(Boolean)
          console.log(`   AI selected: ${filteredMatches.length} podcasts`)
        }
      } catch (err) {
        console.warn('[AI FILTER FALLBACK] Using similarity-based selection')
        filteredMatches = matches.slice(0, 15)
      }
    } else {
      filteredMatches = matches.slice(0, 15)
    }

    console.log(`   Final matches: ${filteredMatches.length}`)

    // 6. Write to Google Sheet via append-prospect-sheet function
    if (prospect.spreadsheet_id && filteredMatches.length > 0) {
      console.log('📊 [EXPORT] Appending to Google Sheet...')
      
      const podcasts = filteredMatches.map((m: any) => ({
        podcast_name: m.podcast_name,
        podcast_description: m.podcast_description,
        podscan_podcast_id: m.podscan_id,
        podcast_id: m.id,
        audience_size: m.audience_size
      }))

      // Call the append function
      const appendResponse = await fetch(`${supabaseUrl}/functions/v1/append-prospect-sheet`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dashboardId: prospectId,
          podcasts
        })
      })

      if (appendResponse.ok) {
        const appendResult = await appendResponse.json()
        console.log(`   ✅ Exported ${filteredMatches.length} podcasts to sheet`)
      } else {
        console.warn('   ⚠️ Sheet export failed, but podcasts matched')
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✅ [COMPLETE] Backfill finished in ${duration}s`)
    console.log(`   Prospect: ${prospect.prospect_name}`)
    console.log(`   Podcasts: ${filteredMatches.length}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return new Response(
      JSON.stringify({
        success: true,
        prospect_name: prospect.prospect_name,
        total: filteredMatches.length,
        duration_seconds: parseFloat(duration)
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[BACKFILL ERROR]', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
