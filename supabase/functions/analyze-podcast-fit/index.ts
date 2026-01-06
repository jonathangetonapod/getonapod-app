import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FitAnalysis {
  clean_description: string
  fit_reasons: string[]
  pitch_angles: Array<{
    title: string
    description: string
  }>
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { podcastId, podcastName, podcastDescription, clientId, clientName, clientBio } = await req.json()

    if (!podcastId || !podcastName || !clientId || !clientBio) {
      throw new Error('podcastId, podcastName, clientId, and clientBio are required')
    }

    console.log('[Analyze Podcast Fit] Starting analysis for:', podcastName, 'and client:', clientName)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check cache first
    const { data: cached } = await supabase
      .from('podcast_fit_analyses')
      .select('*')
      .eq('podcast_id', podcastId)
      .eq('client_id', clientId)
      .single()

    if (cached) {
      // Check if cache is less than 7 days old
      const cacheAge = Date.now() - new Date(cached.created_at).getTime()
      const sevenDays = 7 * 24 * 60 * 60 * 1000

      if (cacheAge < sevenDays) {
        console.log('[Analyze Podcast Fit] Returning cached analysis')
        return new Response(
          JSON.stringify({
            success: true,
            cached: true,
            analysis: {
              clean_description: cached.clean_description,
              fit_reasons: cached.fit_reasons,
              pitch_angles: cached.pitch_angles,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Call Claude API with web search
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const prompt = `You are a podcast booking strategist. I need you to analyze a podcast and determine why it would be a great fit for a specific client.

## Podcast Information
- **Name**: ${podcastName}
- **Current Description**: ${podcastDescription || 'Not available'}

## Client Information
- **Name**: ${clientName || 'Client'}
- **Bio**: ${clientBio}

## Your Tasks

1. **Research the podcast** using web search to understand:
   - What topics they typically cover
   - Their audience demographics
   - Notable past guests
   - The host's interview style and interests

2. **Generate a clean description** of the podcast (2-3 sentences, no HTML, professional tone)

3. **Analyze the fit** between this client and podcast. Provide 3-4 specific reasons why this is a great match.

4. **Generate 3 pitch angles** - specific episode topic ideas that would appeal to this podcast's audience while showcasing the client's expertise.

## Response Format
Respond with ONLY valid JSON in this exact format:
{
  "clean_description": "A 2-3 sentence description of the podcast without any HTML tags",
  "fit_reasons": [
    "First reason why this is a great fit",
    "Second reason why this is a great fit",
    "Third reason why this is a great fit"
  ],
  "pitch_angles": [
    {
      "title": "Catchy Episode Title Idea",
      "description": "2-3 sentences explaining this angle and why it would resonate with the podcast's audience"
    },
    {
      "title": "Second Episode Title Idea",
      "description": "2-3 sentences explaining this angle"
    },
    {
      "title": "Third Episode Title Idea",
      "description": "2-3 sentences explaining this angle"
    }
  ]
}`

    console.log('[Analyze Podcast Fit] Calling Claude API with web search...')

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 5,
          },
        ],
      }),
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      console.error('[Analyze Podcast Fit] Claude API error:', error)
      throw new Error(`Claude API error: ${error}`)
    }

    const claudeData = await claudeResponse.json()
    console.log('[Analyze Podcast Fit] Claude response received')

    // Extract text content from response
    let analysisText = ''
    for (const block of claudeData.content) {
      if (block.type === 'text') {
        analysisText += block.text
      }
    }

    // Parse JSON from response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[Analyze Podcast Fit] Failed to parse JSON from:', analysisText)
      throw new Error('Failed to parse analysis from Claude response')
    }

    const analysis: FitAnalysis = JSON.parse(jsonMatch[0])

    console.log('[Analyze Podcast Fit] Analysis parsed successfully')

    // Cache the result
    const { error: upsertError } = await supabase
      .from('podcast_fit_analyses')
      .upsert({
        podcast_id: podcastId,
        client_id: clientId,
        clean_description: analysis.clean_description,
        fit_reasons: analysis.fit_reasons,
        pitch_angles: analysis.pitch_angles,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'podcast_id,client_id',
      })

    if (upsertError) {
      console.error('[Analyze Podcast Fit] Cache error:', upsertError)
      // Don't fail the request, just log the error
    } else {
      console.log('[Analyze Podcast Fit] Analysis cached successfully')
    }

    return new Response(
      JSON.stringify({
        success: true,
        cached: false,
        analysis,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Analyze Podcast Fit] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to analyze podcast fit',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
