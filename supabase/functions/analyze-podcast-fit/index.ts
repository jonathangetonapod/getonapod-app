import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  clientBio: string
  podcastName: string
  podcastDescription: string
  hostName?: string
  audienceSize?: number
  itunesRating?: number
  episodeCount?: number
  categories?: string[]
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      clientBio,
      podcastName,
      podcastDescription,
      hostName,
      audienceSize,
      itunesRating,
      episodeCount,
      categories = []
    }: RequestBody = await req.json()

    // Validation
    if (!clientBio || !podcastName) {
      return new Response(
        JSON.stringify({ error: 'Client bio and podcast name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      console.error('[Podcast Fit] ANTHROPIC_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build podcast context
    const podcastContext = `
Podcast Name: ${podcastName}
${hostName ? `Host: ${hostName}` : ''}
${podcastDescription ? `Description: ${podcastDescription}` : ''}
${audienceSize ? `Audience Size: ${audienceSize.toLocaleString()} listeners` : ''}
${itunesRating ? `Rating: ${itunesRating}/5.0 stars` : ''}
${episodeCount ? `Episodes: ${episodeCount}` : ''}
${categories.length > 0 ? `Categories: ${categories.join(', ')}` : ''}
    `.trim()

    // Call Claude API
    const prompt = `You are analyzing why a specific podcast is a great fit for a guest based on their background.

Guest Bio:
${clientBio}

Podcast Details:
${podcastContext}

Based on the guest's bio and the podcast details, generate a compelling, personalized explanation (2-4 bullet points) of why this podcast is an excellent fit for them. Focus on:
- Audience alignment (why this audience would resonate with their expertise)
- Topic/content alignment (how their background matches the podcast's focus)
- Authority/credibility signals (podcast quality, established audience, etc.)
- Opportunity value (reach, engagement, growth potential)

Format your response as bullet points starting with relevant emojis. Be specific, enthusiastic, and personalized. Keep each point to 1-2 sentences max.

Example format:
🎯 [Specific audience alignment reason]
🤝 [Specific content/expertise match]
⭐ [Authority or quality signal]
🚀 [Opportunity value]`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Podcast Fit] Claude API error:', errorText)
      throw new Error('Failed to analyze podcast fit')
    }

    const data = await response.json()
    const analysis = data.content[0].text

    console.log(`[Podcast Fit] Analysis generated for ${podcastName}`)

    return new Response(
      JSON.stringify({
        success: true,
        analysis,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[Podcast Fit] Error:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
