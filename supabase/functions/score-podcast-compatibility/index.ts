import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PodcastForScoring {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  publisher_name?: string | null
  podcast_categories?: Array<{ category_name: string }> | null
  audience_size?: number | null
  episode_count?: number | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientBio, prospectBio, podcasts } = await req.json() as {
      clientBio?: string
      prospectBio?: string
      podcasts: PodcastForScoring[]
    }

    // Type validation
    if (clientBio !== undefined && typeof clientBio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'clientBio must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (prospectBio !== undefined && typeof prospectBio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'prospectBio must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!Array.isArray(podcasts)) {
      return new Response(
        JSON.stringify({ error: 'podcasts must be an array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Support both client and prospect mode
    const targetBio = prospectBio || clientBio
    const isProspectMode = !!prospectBio

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 [PODCAST FINDER] Compatibility Scoring Request')
    console.log(`   Mode: ${isProspectMode ? 'PROSPECT' : 'CLIENT'}`)
    console.log(`   Bio length: ${targetBio?.length || 0} characters`)
    console.log(`   Podcasts to score: ${podcasts?.length || 0}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    if (!targetBio || targetBio.trim().length === 0) {
      console.error('❌ [ERROR] Bio is required but was empty')
      return new Response(
        JSON.stringify({ error: `${isProspectMode ? 'Prospect' : 'Client'} bio is required for compatibility scoring` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!podcasts || !Array.isArray(podcasts) || podcasts.length === 0) {
      console.error('❌ [ERROR] Podcasts array is empty or invalid')
      return new Response(
        JSON.stringify({ error: 'Podcasts array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY') || '',
    })

    console.log('🤖 [AI] Using Claude Haiku 4.5 for fast batch scoring...')
    console.log(`   Processing ${podcasts.length} podcasts in parallel`)

    let successCount = 0
    let errorCount = 0

    // Score each podcast
    const scores = await Promise.all(
      podcasts.map(async (podcast, index) => {
        try {
          const podcastInfo = `
Podcast Name: ${podcast.podcast_name}
Host/Publisher: ${podcast.publisher_name || 'Unknown'}
Description: ${podcast.podcast_description || 'No description available'}
Categories: ${podcast.podcast_categories?.map(c => c.category_name).join(', ') || 'None'}
Audience Size: ${podcast.audience_size ? podcast.audience_size.toLocaleString() : 'Unknown'}
Episodes: ${podcast.episode_count || 'Unknown'}
          `.trim()

          const prompt = `You are a podcast booking expert. Rate the compatibility (1-10) between this ${isProspectMode ? 'prospect' : 'client'} and podcast.

${isProspectMode ? 'Prospect' : 'Client'} Bio:
${targetBio}

Podcast Information:
${podcastInfo}

Scoring Guidelines:
- 9-10: Perfect match - ${isProspectMode ? 'prospect' : 'client'}'s expertise directly aligns with podcast's focus and audience
- 7-8: Strong match - related topics, good audience overlap
- 5-6: Moderate match - some relevance but not ideal
- 3-4: Weak match - tangentially related
- 1-2: Poor match - not relevant

Return your answer as JSON in this exact format:
{
  "score": <number 1-10>,
  "reasoning": "<2-3 sentences explaining why this score>"
}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, just the raw JSON object.`

          const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            temperature: 0,
            messages: [{ role: 'user', content: prompt }],
          })

          const content = message.content[0]
          if (content.type !== 'text') {
            return { podcast_id: podcast.podcast_id, score: null, reasoning: undefined }
          }

          // Strip markdown code blocks if present
          let jsonText = content.text.trim()
          if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
          }

          try {
            const parsed = JSON.parse(jsonText)
            successCount++
            if (successCount % 10 === 0 || successCount === podcasts.length) {
              console.log(`⏳ [PROGRESS] Scored ${successCount}/${podcasts.length} podcasts...`)
            }
            return {
              podcast_id: podcast.podcast_id,
              score: parsed.score,
              reasoning: parsed.reasoning
            }
          } catch (parseError) {
            console.warn(`⚠️  [PARSE WARNING] Failed to parse JSON for ${podcast.podcast_name.substring(0, 50)}`)
            // Fallback: try to extract just the score
            const match = content.text.match(/\b([1-9]|10)\b/)
            if (match) {
              successCount++
              return {
                podcast_id: podcast.podcast_id,
                score: parseInt(match[1], 10),
                reasoning: undefined
              }
            }
            errorCount++
            return { podcast_id: podcast.podcast_id, score: null, reasoning: undefined }
          }
        } catch (error) {
          console.error(`❌ [ERROR] Scoring ${podcast.podcast_name.substring(0, 50)}:`, error)
          errorCount++
          return { podcast_id: podcast.podcast_id, score: null, reasoning: undefined }
        }
      })
    )

    // Calculate statistics
    const validScores = scores.filter(s => s.score !== null)
    const highScores = validScores.filter(s => s.score && s.score >= 7)
    const avgScore = validScores.length > 0
      ? (validScores.reduce((sum, s) => sum + (s.score || 0), 0) / validScores.length).toFixed(1)
      : 'N/A'

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ [SCORING COMPLETE] Batch processing finished!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 [STATISTICS]:')
    console.log(`   Total podcasts: ${podcasts.length}`)
    console.log(`   ✅ Successfully scored: ${successCount}`)
    console.log(`   ❌ Failed: ${errorCount}`)
    console.log(`   🎯 High scores (7+): ${highScores.length}`)
    console.log(`   📈 Average score: ${avgScore}/10`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🚀 [NEXT STEP] Frontend will filter and rank by score')
    console.log(`   Recommended: Filter for scores >= 7 (${highScores.length} podcasts)`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return new Response(
      JSON.stringify({ scores }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
