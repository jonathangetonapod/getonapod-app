import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PODCAST_CATEGORIES = [
  "Business",
  "Entrepreneurship",
  "Marketing",
  "Technology",
  "SaaS & Tech",
  "Finance",
  "Leadership",
  "Sales",
  "Productivity",
  "Health & Fitness",
  "Education",
  "Self-Improvement",
  "Entertainment",
  "News & Politics",
  "True Crime",
  "Sports",
  "Science",
  "Society & Culture",
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { podcastName, description, whyThisShow } = await req.json()

    if (!podcastName) {
      return new Response(
        JSON.stringify({ success: false, error: 'podcastName is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const prompt = `You are a podcast categorization expert. Based on the information below, select the SINGLE BEST category from this list:

${PODCAST_CATEGORIES.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

Podcast Information:
- Name: ${podcastName}
${description ? `- Description: ${description}` : ''}
${whyThisShow ? `- Why This Show: ${whyThisShow}` : ''}

IMPORTANT: Reply with ONLY the category name from the list above. Nothing else. Just the exact category name.`

    console.log(`[Auto-Categorize] Categorizing podcast: ${podcastName}`)

    const haikuResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })

    if (!haikuResponse.ok) {
      const errorText = await haikuResponse.text()
      console.error('[Auto-Categorize] Haiku API error:', errorText)
      throw new Error(`Haiku API error: ${haikuResponse.status} - ${errorText}`)
    }

    const haikuData = await haikuResponse.json()
    const suggestedCategory = haikuData.content[0].text.trim()

    console.log(`[Auto-Categorize] Raw suggestion: ${suggestedCategory}`)

    // Validate that the suggestion is in our list
    let category: string
    if (PODCAST_CATEGORIES.includes(suggestedCategory)) {
      category = suggestedCategory
    } else {
      // Fuzzy match: try case-insensitive and substring matching
      const lowerSuggestion = suggestedCategory.toLowerCase()
      const match = PODCAST_CATEGORIES.find(
        (cat) => cat.toLowerCase() === lowerSuggestion || lowerSuggestion.includes(cat.toLowerCase())
      )
      category = match || 'Business'
    }

    console.log(`[Auto-Categorize] Final category: ${category}`)

    return new Response(
      JSON.stringify({
        success: true,
        category,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Auto-Categorize] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
        category: 'Business', // Default fallback even on error
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
