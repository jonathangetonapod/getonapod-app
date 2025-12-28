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
    const { clientBio, podcasts } = await req.json() as {
      clientBio: string
      podcasts: PodcastForScoring[]
    }

    if (!clientBio || clientBio.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Client bio is required for compatibility scoring' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!podcasts || !Array.isArray(podcasts) || podcasts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Podcasts array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY') || '',
    })

    // Score each podcast
    const scores = await Promise.all(
      podcasts.map(async (podcast) => {
        try {
          const podcastInfo = `
Podcast Name: ${podcast.podcast_name}
Host/Publisher: ${podcast.publisher_name || 'Unknown'}
Description: ${podcast.podcast_description || 'No description available'}
Categories: ${podcast.podcast_categories?.map(c => c.category_name).join(', ') || 'None'}
Audience Size: ${podcast.audience_size ? podcast.audience_size.toLocaleString() : 'Unknown'}
Episodes: ${podcast.episode_count || 'Unknown'}
          `.trim()

          const prompt = `You are a podcast booking expert. Rate the compatibility (1-10) between this client and podcast.

Client Bio:
${clientBio}

Podcast Information:
${podcastInfo}

Scoring Guidelines:
- 9-10: Perfect match - client's expertise directly aligns with podcast's focus and audience
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
            return {
              podcast_id: podcast.podcast_id,
              score: parsed.score,
              reasoning: parsed.reasoning
            }
          } catch (parseError) {
            console.warn(`Failed to parse JSON for ${podcast.podcast_name}:`, content.text)
            // Fallback: try to extract just the score
            const match = content.text.match(/\b([1-9]|10)\b/)
            if (match) {
              return {
                podcast_id: podcast.podcast_id,
                score: parseInt(match[1], 10),
                reasoning: undefined
              }
            }
            return { podcast_id: podcast.podcast_id, score: null, reasoning: undefined }
          }
        } catch (error) {
          console.error(`Error scoring ${podcast.podcast_name}:`, error)
          return { podcast_id: podcast.podcast_id, score: null, reasoning: undefined }
        }
      })
    )

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
