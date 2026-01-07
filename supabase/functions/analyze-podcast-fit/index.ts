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
    const {
      podcastId,
      podcastName,
      podcastDescription,
      podcastUrl,
      publisherName,
      itunesRating,
      episodeCount,
      audienceSize,
      clientId,
      clientName,
      clientBio
    } = await req.json()

    if (!podcastId || !podcastName || !clientId || !clientBio) {
      throw new Error('podcastId, podcastName, clientId, and clientBio are required')
    }

    console.log('[Analyze Podcast Fit] Starting analysis for:', podcastName, 'and client:', clientName)
    console.log('[Analyze Podcast Fit] Podcast data:', { podcastUrl, publisherName, itunesRating, episodeCount, audienceSize })

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

    // Build podcast context with all available data
    const podcastContext = [
      `- **Name**: ${podcastName}`,
      podcastDescription ? `- **Raw Description** (may contain HTML): ${podcastDescription}` : null,
      podcastUrl ? `- **Website/URL**: ${podcastUrl}` : null,
      publisherName ? `- **Publisher/Host**: ${publisherName}` : null,
      itunesRating ? `- **iTunes Rating**: ${itunesRating}/5` : null,
      episodeCount ? `- **Episode Count**: ${episodeCount} episodes` : null,
      audienceSize ? `- **Estimated Audience Size**: ${audienceSize.toLocaleString()}` : null,
    ].filter(Boolean).join('\n')

    const prompt = `You are a podcast booking strategist. Analyze this podcast and determine why it would be a great fit for a specific client.

## Podcast Information
${podcastContext}

## Client Information
- **Name**: ${clientName || 'Client'}
- **Bio**: ${clientBio}

## Your Tasks

1. **Generate a clean, compelling description** of the podcast:
   - 2-3 sentences, professional tone
   - NO HTML tags - clean plain text only
   - Based on the podcast name, description, and other data provided
   - Capture what the show is about and who it's for

2. **Analyze the fit** between this client and podcast. Provide 3 specific reasons why this is a great match based on the client's expertise and the podcast's focus.

3. **Generate 3 pitch angles** - specific episode topic ideas that would appeal to this podcast's audience while showcasing the client's expertise.

## Response Format
Respond with ONLY valid JSON in this exact format (no markdown code blocks):
{
  "clean_description": "A compelling 2-3 sentence description of the podcast without any HTML tags",
  "fit_reasons": [
    "First specific reason why this is a great fit",
    "Second specific reason why this is a great fit",
    "Third specific reason why this is a great fit"
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

    console.log('[Analyze Podcast Fit] Calling Claude API...')

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt,
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
    console.log('[Analyze Podcast Fit] Claude response received, content blocks:', claudeData.content?.length)

    // Extract text content from response (web search responses have multiple block types)
    let analysisText = ''
    for (const block of claudeData.content) {
      if (block.type === 'text') {
        analysisText += block.text
        console.log('[Analyze Podcast Fit] Found text block, length:', block.text?.length)
      }
    }

    console.log('[Analyze Podcast Fit] Combined text length:', analysisText.length)
    console.log('[Analyze Podcast Fit] Text preview:', analysisText.substring(0, 500))

    // Parse JSON from response - try multiple patterns
    // First try to find JSON in code blocks
    let jsonMatch = analysisText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    let jsonStr = jsonMatch ? jsonMatch[1] : null

    // If not in code blocks, try to find raw JSON
    if (!jsonStr) {
      jsonMatch = analysisText.match(/(\{[\s\S]*"clean_description"[\s\S]*"fit_reasons"[\s\S]*"pitch_angles"[\s\S]*\})/)
      jsonStr = jsonMatch ? jsonMatch[1] : null
    }

    // Last resort: find any JSON object
    if (!jsonStr) {
      jsonMatch = analysisText.match(/\{[\s\S]*\}/)
      jsonStr = jsonMatch ? jsonMatch[0] : null
    }

    if (!jsonStr) {
      console.error('[Analyze Podcast Fit] Failed to parse JSON from:', analysisText)
      throw new Error('Failed to parse analysis from Claude response')
    }

    console.log('[Analyze Podcast Fit] Found JSON, parsing...')
    console.log('[Analyze Podcast Fit] JSON string length:', jsonStr.length)

    // Try to parse, with fallback cleanup for common issues
    let analysis: FitAnalysis
    try {
      analysis = JSON.parse(jsonStr)
    } catch (parseError) {
      console.log('[Analyze Podcast Fit] Initial parse failed, attempting cleanup...')

      // Try to fix common JSON issues
      let cleanedJson = jsonStr
        // Remove any trailing commas before closing brackets
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        // Fix unescaped newlines in strings
        .replace(/([^\\])\n/g, '$1\\n')
        // Fix unescaped tabs
        .replace(/([^\\])\t/g, '$1\\t')

      try {
        analysis = JSON.parse(cleanedJson)
        console.log('[Analyze Podcast Fit] Cleaned JSON parsed successfully')
      } catch (secondError) {
        // Last resort: try to extract fields manually
        console.error('[Analyze Podcast Fit] JSON parse error:', parseError)
        console.error('[Analyze Podcast Fit] Failed JSON string:', jsonStr.substring(0, 1000))

        // Create a fallback response
        const descMatch = jsonStr.match(/"clean_description"\s*:\s*"([^"]*(?:\\"[^"]*)*)"/)
        const fitMatch = jsonStr.match(/"fit_reasons"\s*:\s*\[([\s\S]*?)\]/)

        if (descMatch) {
          analysis = {
            clean_description: descMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
            fit_reasons: ['Analysis partially completed - please try again for full results'],
            pitch_angles: []
          }
          console.log('[Analyze Podcast Fit] Created fallback response from partial data')
        } else {
          throw new Error(`Failed to parse analysis: ${parseError.message}`)
        }
      }
    }

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
