import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PodcastInput {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  publisher_name?: string | null
  podcast_categories?: Array<{ category_name: string }> | null
  audience_size?: number | null
  episode_count?: number | null
}

interface QAResult {
  podcast_id: string
  bio_fit_score: number | null
  topic_relevance_score: number | null
  bio_fit_reasoning: string | null
  topic_reasoning: string | null
  pitch_angles: Array<{ title: string; description: string }>
  topic_signals: string[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prospect_bio, target_topic, podcasts } = await req.json()

    if (!prospect_bio || typeof prospect_bio !== 'string') {
      return new Response(
        JSON.stringify({ error: 'prospect_bio is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!Array.isArray(podcasts) || podcasts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'podcasts must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (podcasts.length > 10) {
      return new Response(
        JSON.stringify({ error: 'Maximum 10 podcasts per request (frontend batches larger sets)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    console.log(`[QA Review] Scoring ${podcasts.length} podcasts | Topic: "${target_topic || 'none'}" | Bio length: ${prospect_bio.length}`)

    // Score all podcasts concurrently (one API call per podcast)
    const results: QAResult[] = await Promise.all(
      podcasts.map((podcast: PodcastInput) => scorePodcast(anthropicApiKey, prospect_bio, target_topic, podcast))
    )

    const validScores = results.filter(r => r.bio_fit_score !== null)
    console.log(`[QA Review] Complete: ${validScores.length}/${podcasts.length} scored successfully`)

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[QA Review] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function scorePodcast(
  apiKey: string,
  bio: string,
  targetTopic: string | null,
  podcast: PodcastInput
): Promise<QAResult> {
  const categories = podcast.podcast_categories
    ?.map(c => c.category_name).join(', ') || 'Unknown'

  const topicSection = targetTopic
    ? `
TARGET TOPIC: "${targetTopic}"
Score "topic_relevance_score" based on how specifically this podcast covers "${targetTopic}" — not just the broader category.`
    : `
No target topic provided. Set "topic_relevance_score" to null.`

  const prompt = `You are evaluating whether a podcast is a good fit for a prospective guest.

PROSPECT BIO:
${bio}

PODCAST:
- Name: ${podcast.podcast_name}
- Host/Publisher: ${podcast.publisher_name || 'Unknown'}
- Description: ${podcast.podcast_description || 'No description available'}
- Categories: ${categories}
- Audience Size: ${podcast.audience_size?.toLocaleString() || 'Unknown'}
- Episodes: ${podcast.episode_count || 'Unknown'}
${topicSection}

SCORING GUIDELINES:
- bio_fit_score (1-10): How well the prospect's expertise aligns with this podcast's audience and content.
  9-10: Perfect match — expertise directly aligns with podcast focus
  7-8: Strong match — related topics, good audience overlap
  5-6: Moderate match — some relevance but not ideal
  3-4: Weak match — tangentially related
  1-2: Poor match — not relevant

- topic_relevance_score (1-10): How specifically the podcast covers the target topic.
  9-10: Podcast is dedicated to this exact topic
  7-8: Topic is a regular focus area
  5-6: Topic comes up occasionally
  3-4: Tangentially related category
  1-2: Different topic entirely

- pitch_angles: Only provide if topic_relevance_score >= 5. Each has a "title" (5-8 word episode title) and "description" (2-3 sentence pitch).

- topic_signals: Evidence from the podcast metadata that supports your scoring. Reference specific phrases from the description, category names, or other metadata. Do NOT fabricate episode titles.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "bio_fit_score": <number>,
  "topic_relevance_score": <number or null>,
  "bio_fit_reasoning": "<1-2 sentences>",
  "topic_reasoning": "<1-2 sentences or null>",
  "pitch_angles": [{"title": "...", "description": "..."}],
  "topic_signals": ["signal 1", "signal 2"]
}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1000,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[QA Review] Anthropic API error for ${podcast.podcast_name}:`, errorText)
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    const responseText = data.content[0].text.trim()

    // Parse JSON — try raw first, then extract from markdown blocks
    let parsed: any
    try {
      parsed = JSON.parse(responseText)
    } catch {
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
        || responseText.match(/(\{[\s\S]*"bio_fit_score"[\s\S]*\})/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1])
      } else {
        throw new Error('Could not parse AI response as JSON')
      }
    }

    return {
      podcast_id: podcast.podcast_id,
      bio_fit_score: parsed.bio_fit_score ?? null,
      topic_relevance_score: parsed.topic_relevance_score ?? null,
      bio_fit_reasoning: parsed.bio_fit_reasoning ?? null,
      topic_reasoning: parsed.topic_reasoning ?? null,
      pitch_angles: Array.isArray(parsed.pitch_angles) ? parsed.pitch_angles : [],
      topic_signals: Array.isArray(parsed.topic_signals) ? parsed.topic_signals : [],
    }
  } catch (error) {
    console.error(`[QA Review] Failed to score "${podcast.podcast_name}":`, error)
    return {
      podcast_id: podcast.podcast_id,
      bio_fit_score: null,
      topic_relevance_score: null,
      bio_fit_reasoning: null,
      topic_reasoning: null,
      pitch_angles: [],
      topic_signals: [],
    }
  }
}
