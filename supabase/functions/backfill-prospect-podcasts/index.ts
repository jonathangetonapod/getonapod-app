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
  const TIMEOUT_MS = 45000 // 45-second safety margin (Supabase edge functions timeout at 60s)

  const fetchWithTimeout = (url: string, options: RequestInit, timeoutMs = 15000) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout))
  }

  try {
    let body: any
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: 'Request body must be valid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const { prospectId } = body

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

    // 2. Create text for embedding (use full bio + tagline for richer context)
    const prospectText = [
      `Podcast guest: ${prospect.prospect_name}`,
      prospect.prospect_bio ? `Professional background and expertise: ${prospect.prospect_bio.substring(0, 1000)}` : '',
      prospect.personalized_tagline ? `Focus: ${prospect.personalized_tagline}` : ''
    ].filter(Boolean).join('\n')

    // 3. Generate embedding via OpenAI
    console.log('🔮 [EMBEDDING] Generating embedding...')
    const embeddingResponse = await fetchWithTimeout('https://api.openai.com/v1/embeddings', {
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
    }, 10000)

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
      match_threshold: 0.35,
      match_count: 50
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

    // 5. Filter with Claude Sonnet for quality ranking
    let filteredMatches = matches.slice(0, 15)
    let aiFilterApplied = false

    if (anthropicKey && matches.length > 15) {
      console.log('🤖 [AI FILTER] Filtering with Claude Sonnet...')
      try {
        const anthropic = new Anthropic({ apiKey: anthropicKey })

        const candidateCount = Math.min(matches.length, 30)
        const podcastSummaries = matches.slice(0, candidateCount).map((m: any, i: number) => ({
          index: i,
          name: m.podcast_name,
          description: m.podcast_description?.substring(0, 300) || 'No description',
          audience: m.audience_size || 'unknown'
        }))

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 200,
          temperature: 0.1,
          messages: [{
            role: 'user',
            content: `You are a podcast booking agent selecting the best podcast guest placements.

GUEST PROFILE:
${prospectText}

CANDIDATE PODCASTS (${candidateCount} total, already ranked by semantic similarity):
${podcastSummaries.map((p: any) => `${p.index}. ${p.name} (audience: ${p.audience}): ${p.description}`).join('\n')}

Select the TOP 15 podcasts where this guest would be the best fit. Prioritize:
1. Topic alignment — the podcast covers subjects the guest is an expert in
2. Audience relevance — the listeners would benefit from the guest's expertise
3. Show quality — higher audience size, active shows with recent episodes
4. Diversity — mix of niche and broad-reach shows for maximum exposure

Return ONLY a JSON array of the index numbers, best fit first:
[0, 5, 12, ...]`
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
            .filter((idx: number) => idx >= 0 && idx < matches.length)
            .map((idx: number) => matches[idx])
            .filter(Boolean)
          aiFilterApplied = true
          console.log(`   AI selected: ${filteredMatches.length} podcasts`)
        }
      } catch (err) {
        console.warn('[AI FILTER FALLBACK] Using similarity-based selection:', err.message)
        filteredMatches = matches.slice(0, 15)
      }
    }

    console.log(`   AI filter applied: ${aiFilterApplied}`)

    console.log(`   Final matches: ${filteredMatches.length}`)

    let newAdded = filteredMatches.length
    let duplicatesSkipped = 0

    // 6. Deduplicate and write to Google Sheet
    if (prospect.spreadsheet_id && filteredMatches.length > 0) {
      console.log('📊 [EXPORT] Checking for duplicates before appending...')

      // Read existing podcast IDs from the Google Sheet (column E) to prevent duplicates
      let existingIds: Set<string> = new Set()
      try {
        const sheetResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/get-prospect-podcasts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            spreadsheetId: prospect.spreadsheet_id,
            cacheOnly: true
          })
        }, 10000)
        if (sheetResponse.ok) {
          const sheetData = await sheetResponse.json()
          if (sheetData.podcasts) {
            for (const p of sheetData.podcasts) {
              if (p.podcast_id) existingIds.add(p.podcast_id)
            }
          }
        }
      } catch (err) {
        console.warn('[DEDUP] Could not read sheet, proceeding without dedup')
      }

      // Filter out podcasts already in the sheet
      const newMatches = filteredMatches.filter((m: any) => {
        const id = m.podscan_id || m.id
        return !existingIds.has(id)
      })

      duplicatesSkipped = filteredMatches.length - newMatches.length
      newAdded = newMatches.length
      console.log(`   Existing in sheet: ${existingIds.size}, New to add: ${newMatches.length}, Skipped duplicates: ${duplicatesSkipped}`)

      const podcasts = newMatches.map((m: any) => ({
        podcast_name: m.podcast_name,
        podcast_description: m.podcast_description,
        podscan_podcast_id: m.podscan_id,
        podcast_id: m.id,
        audience_size: m.audience_size
      }))

      // Only append if there are new podcasts to add
      if (podcasts.length > 0) {
        const appendResponse = await fetchWithTimeout(`${supabaseUrl}/functions/v1/append-prospect-sheet`, {
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
          console.log(`   ✅ Exported ${newMatches.length} new podcasts to sheet`)
        } else {
          console.warn('   ⚠️ Sheet export failed, but podcasts matched')
        }
      } else {
        console.log('   ℹ️ All matched podcasts already in sheet, nothing to append')
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
        total_matched: filteredMatches.length,
        new_added: newAdded,
        duplicates_skipped: duplicatesSkipped,
        ai_filter_applied: aiFilterApplied,
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
