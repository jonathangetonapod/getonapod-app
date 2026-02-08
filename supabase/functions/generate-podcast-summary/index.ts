import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    const prompt = `You are a podcast booking agency expert. Write a compelling 2-3 sentence "Why This Show" description for the following podcast. Focus on the value proposition for potential guests - why they should appear on this show, what kind of audience reach they'll get, and the potential business impact.

Podcast Details:
- Name: ${podcast_name}
- Audience Size: ${audience_size}
- Episodes: ${episode_count}
- Rating: ${rating}
- Reach Score: ${reach_score}
${publisher_name ? `- Host: ${publisher_name}` : ''}
${categories?.length ? `- Categories: ${categories.join(', ')}` : ''}
${description ? `- Description: ${description}` : ''}

Write the description in a professional, persuasive tone. Emphasize the quality of the audience, engagement potential, and business outcomes for guests. Keep it concise and impactful.`

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

    return new Response(JSON.stringify({ summary }), {
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
