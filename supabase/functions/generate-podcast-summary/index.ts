import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { podcast_name, audience_size, episode_count, rating, reach_score, description, categories, publisher_name } = await req.json()

    if (!podcast_name) {
      return new Response(JSON.stringify({ error: 'podcast_name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const prompt = `You are a podcast booking agency expert. Write a compelling 2-3 sentence description explaining why guests should appear on this podcast and who it's ideal for.

Podcast Details:
- Name: ${podcast_name}
- Audience Size: ${audience_size}
- Episodes: ${episode_count}
- Rating: ${rating}
- Reach Score: ${reach_score}
${publisher_name ? `- Host: ${publisher_name}` : ''}
${categories?.length ? `- Categories: ${categories.join(', ')}` : ''}
${description ? `- Description: ${description}` : ''}

Guidelines:
- Focus on the quality and type of audience (who listens and why they matter)
- Explain the credibility and authority of the host/show
- Describe who this opportunity is ideal for (thought leaders, entrepreneurs, etc)
- DO NOT include specific numbers or metrics in your response
- DO NOT use em dashes (—)
- DO NOT include any title, heading, or hashtag (like "# Prebuilt Shopify Store Podcast")
- Start directly with the description text
- Write in a professional, persuasive tone about the strategic value
- Keep it 2-3 sentences maximum`

    console.log('🤖 Calling Claude API...')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Claude API error:', error)
      throw new Error(`Claude API error: ${response.status}`)
    }

    const data = await response.json()
    const summary = data.content[0].text

    console.log('✅ Summary generated:', summary)

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
