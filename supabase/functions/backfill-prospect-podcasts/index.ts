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

    // 1a. Auto-enrich prospect structured fields from bio (Haiku)
    // Runs when ANY of the three key fields are missing, not just when all are empty
    const missingIndustry = !prospect.prospect_industry
    const missingExpertise = !prospect.prospect_expertise || prospect.prospect_expertise.length === 0
    const missingTopics = !prospect.prospect_topics || prospect.prospect_topics.length === 0
    const needsEnrichment = (missingIndustry || missingExpertise || missingTopics)
      && prospect.prospect_bio
      && prospect.prospect_bio.length > 20

    if (needsEnrichment && anthropicKey) {
      const missingFields = [missingIndustry && 'industry', missingExpertise && 'expertise', missingTopics && 'topics'].filter(Boolean)
      console.log(`🧠 [ENRICH] Extracting missing fields: ${missingFields.join(', ')}`)
      try {
        const enrichClient = new Anthropic({ apiKey: anthropicKey })
        const enrichResponse = await enrichClient.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          temperature: 0,
          messages: [{
            role: 'user',
            content: `Extract structured profile data from this person's bio. Return ONLY a JSON object.

NAME: ${prospect.prospect_name}
BIO: ${prospect.prospect_bio}

Return this exact JSON structure:
{
  "industry": "primary industry (e.g. SaaS, Healthcare, FinTech)",
  "expertise": ["3-5 areas of expertise"],
  "topics": ["4-6 specific topics they could speak about on podcasts"],
  "target_audience": "who benefits from their expertise",
  "company": "company name or null",
  "title": "job title or null"
}`
          }]
        })

        const enrichContent = enrichResponse.content[0].type === 'text' ? enrichResponse.content[0].text : ''
        let enrichJson = enrichContent.trim()
        if (enrichJson.startsWith('```')) {
          enrichJson = enrichJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        }

        const enriched = JSON.parse(enrichJson)
        console.log(`   Extracted: industry=${enriched.industry}, expertise=${enriched.expertise?.length || 0} items, topics=${enriched.topics?.length || 0} items`)

        // Only update fields that are currently missing
        const updateFields: any = {}
        if (missingIndustry && enriched.industry) updateFields.prospect_industry = enriched.industry
        if (missingExpertise && Array.isArray(enriched.expertise) && enriched.expertise.length > 0) updateFields.prospect_expertise = enriched.expertise
        if (missingTopics && Array.isArray(enriched.topics) && enriched.topics.length > 0) updateFields.prospect_topics = enriched.topics
        if (!prospect.prospect_target_audience && enriched.target_audience) updateFields.prospect_target_audience = enriched.target_audience
        if (!prospect.prospect_company && enriched.company) updateFields.prospect_company = enriched.company
        if (!prospect.prospect_title && enriched.title) updateFields.prospect_title = enriched.title

        if (Object.keys(updateFields).length > 0) {
          const { error: updateError } = await supabase
            .from('prospect_dashboards')
            .update(updateFields)
            .eq('id', prospectId)

          if (updateError) {
            console.warn('[ENRICH] DB update failed:', updateError.message)
          } else {
            Object.assign(prospect, updateFields)
            console.log(`   ✅ Enriched ${Object.keys(updateFields).length} fields`)
          }
        }
      } catch (err) {
        console.warn('[ENRICH FALLBACK] Continuing with thin data:', err.message)
      }
    } else if (needsEnrichment && !anthropicKey) {
      console.log('   ⚠️ Skipping enrichment: ANTHROPIC_API_KEY not configured')
    } else {
      console.log('   ℹ️ Structured fields complete, skipping enrichment')
    }

    // 1b. Query feedback for rejected and approved podcasts
    const { data: rejectedFeedback } = await supabase
      .from('prospect_podcast_feedback')
      .select('podcast_id')
      .eq('prospect_dashboard_id', prospectId)
      .eq('status', 'rejected')
    const rejectedIds = (rejectedFeedback || []).map((f: any) => f.podcast_id)

    const { data: approvedFeedback } = await supabase
      .from('prospect_podcast_feedback')
      .select('podcast_id')
      .eq('prospect_dashboard_id', prospectId)
      .eq('status', 'approved')
    const approvedPodcastIds = (approvedFeedback || []).map((f: any) => f.podcast_id)

    // Look up approved podcast details for rich AI context
    let approvedPodcastDetails: { name: string; categories: string; audience: number | null; description: string }[] = []
    if (approvedPodcastIds.length > 0) {
      const { data: approvedPodcasts } = await supabase
        .from('podcasts')
        .select('podcast_name, podcast_categories, audience_size, podcast_description')
        .in('podscan_id', approvedPodcastIds)
      approvedPodcastDetails = (approvedPodcasts || []).filter((p: any) => p.podcast_name).map((p: any) => ({
        name: p.podcast_name,
        categories: Array.isArray(p.podcast_categories)
          ? p.podcast_categories.map((c: any) => c.category_name || c).filter(Boolean).join(', ')
          : '',
        audience: p.audience_size,
        description: p.podcast_description?.substring(0, 150) || ''
      }))
    }

    console.log(`   Rejected podcasts: ${rejectedIds.length}`)
    console.log(`   Approved podcasts: ${approvedPodcastDetails.length}`)

    // 2. Create text for embedding (use structured fields for richer context)
    const prospectText = [
      `Podcast guest: ${prospect.prospect_name}`,
      prospect.prospect_title && prospect.prospect_company
        ? `Role: ${prospect.prospect_title} at ${prospect.prospect_company}` : '',
      prospect.prospect_title && !prospect.prospect_company
        ? `Role: ${prospect.prospect_title}` : '',
      !prospect.prospect_title && prospect.prospect_company
        ? `Company: ${prospect.prospect_company}` : '',
      prospect.prospect_industry ? `Industry: ${prospect.prospect_industry}` : '',
      prospect.prospect_expertise?.length > 0
        ? `Expertise: ${prospect.prospect_expertise.join(', ')}` : '',
      prospect.prospect_topics?.length > 0
        ? `Topics: ${prospect.prospect_topics.join(', ')}` : '',
      prospect.prospect_target_audience
        ? `Target audience: ${prospect.prospect_target_audience}` : '',
      prospect.prospect_bio
        ? `Background: ${prospect.prospect_bio.substring(0, 1000)}` : '',
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
      match_threshold: 0.30,
      match_count: 50,
      p_exclude_podcast_ids: rejectedIds.length > 0 ? rejectedIds : null
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

    // 5. Filter with Claude Sonnet for scored quality matching
    let filteredMatches = matches.slice(0, 15)
    let aiFilterApplied = false

    if (anthropicKey && matches.length > 2) {
      console.log('🤖 [AI FILTER] Scoring with Claude Sonnet...')
      try {
        const anthropic = new Anthropic({ apiKey: anthropicKey })

        const candidateCount = Math.min(matches.length, 50)
        const podcastSummaries = matches.slice(0, candidateCount).map((m: any, i: number) => {
          const meta: string[] = []
          if (m.audience_size) meta.push(`audience: ${m.audience_size}`)
          if (m.itunes_rating) meta.push(`rating: ${m.itunes_rating}/5`)
          if (m.episode_count) meta.push(`${m.episode_count} episodes`)
          if (m.last_posted_at) {
            const daysAgo = Math.floor((Date.now() - new Date(m.last_posted_at).getTime()) / (1000 * 60 * 60 * 24))
            meta.push(`last episode: ${daysAgo}d ago`)
          }
          const categories = Array.isArray(m.podcast_categories)
            ? m.podcast_categories.map((c: any) => c.category_name || c).filter(Boolean).join(', ')
            : ''
          return {
            index: i,
            name: m.podcast_name,
            description: m.podcast_description?.substring(0, 300) || 'No description',
            categories,
            metaStr: meta.length > 0 ? meta.join(', ') : ''
          }
        })

        const approvedContext = approvedPodcastDetails.length > 0
          ? `\nPREVIOUSLY APPROVED PODCASTS — the client liked these, so score similar podcasts higher:
${approvedPodcastDetails.map(p => {
              const parts = [p.name]
              if (p.categories) parts[0] += ` [${p.categories}]`
              if (p.audience) parts[0] += ` (audience: ${p.audience})`
              if (p.description) parts[0] += ` - ${p.description}`
              return `- ${parts[0]}`
            }).join('\n')}
Use these approved podcasts to calibrate your scoring — podcasts with similar topics, categories, and audience profiles should score higher.\n`
          : ''

        // Time-box the AI filter to avoid blowing the 60s edge function limit
        const aiTimeoutMs = Math.max(TIMEOUT_MS - (Date.now() - startTime) - 8000, 10000) // leave 8s for dedup+export
        const response = await Promise.race([
          anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            temperature: 0,
          messages: [{
            role: 'user',
            content: `You are an expert podcast booker evaluating which podcasts would be the best fit for a guest. Consider:
1. Topical alignment — Does the podcast cover topics the guest is expert in?
2. Audience match — Would the podcast's listeners benefit from this guest?
3. Format fit — Does the podcast style suit this guest's profile?
4. Authority fit — Does the guest's expertise level match the podcast's depth?
5. Show quality — Higher ratings, more episodes, and recent activity indicate active shows

GUEST PROFILE:
${prospectText}
${approvedContext}
PODCAST CANDIDATES (${candidateCount} total, sorted by semantic similarity):
${podcastSummaries.map((p: any) => `${p.index}. ${p.name}${p.metaStr ? ` (${p.metaStr})` : ''}${p.categories ? `\n   Categories: ${p.categories}` : ''}
   Description: ${p.description}`).join('\n\n')}

SCORING RUBRIC (0-10):
- 9-10: Perfect match — guest expertise directly aligns with podcast focus
- 7-8: Strong match — good topic overlap and clear audience benefit
- 5-6: Moderate match — some relevance but not ideal
- 0-4: Poor match — misaligned topics, audience, or format — EXCLUDE

Only include podcasts scoring 5+. For each, explain the specific connection.

Respond with ONLY a JSON array (no markdown, no other text):
[{"index": 0, "score": 8, "reason": "Specific reason based on guest expertise and podcast focus"}]

Be selective — better to have 10 highly relevant matches than 50 mediocre ones.`
          }]
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`AI filter timed out after ${aiTimeoutMs}ms`)), aiTimeoutMs))
        ]) as Anthropic.Messages.Message

        const content = response.content[0].type === 'text' ? response.content[0].text : ''
        let jsonContent = content.trim()
        if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        }

        const scored = JSON.parse(jsonContent)
        if (Array.isArray(scored) && scored.length > 0) {
          // Filter to score >= 5 and sort by score descending
          const qualified = scored
            .filter((s: any) => s.score >= 5 && s.index >= 0 && s.index < matches.length)
            .sort((a: any, b: any) => b.score - a.score)

          if (qualified.length > 0) {
            filteredMatches = qualified
              .slice(0, 20)
              .map((s: any) => ({
                ...matches[s.index],
                relevance_score: s.score,
                relevance_reason: s.reason
              }))
              .filter(Boolean)
            aiFilterApplied = true
            const avgScore = (qualified.reduce((sum: number, s: any) => sum + s.score, 0) / qualified.length).toFixed(1)
            console.log(`   AI scored: ${scored.length} candidates, ${qualified.length} scored 5+, avg score: ${avgScore}`)
            console.log(`   Top picks: ${filteredMatches.slice(0, 3).map((m: any) => `${m.podcast_name} (${m.relevance_score})`).join(', ')}`)
          } else {
            console.warn('[AI FILTER] No podcasts scored 5+, falling back to similarity top-15')
            filteredMatches = matches.slice(0, 15)
          }
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
            prospectDashboardId: prospectId,
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
        audience_size: m.audience_size,
        compatibility_score: m.relevance_score || null,
        compatibility_reasoning: m.relevance_reason || null
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
        matches: filteredMatches.map((m: any) => ({
          podcast_name: m.podcast_name,
          podscan_id: m.podscan_id,
          relevance_score: m.relevance_score || null,
          relevance_reason: m.relevance_reason || null
        })),
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
