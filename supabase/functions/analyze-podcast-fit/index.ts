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
    const body = await req.json()

    // Support both old format (from clientPortal.ts) and new format (from googleSheets.ts)
    const podcastId = body.podcastId || body.podcastName // Use name as fallback ID
    const podcastName = body.podcastName
    const podcastDescription = body.podcastDescription || ''
    const podcastUrl = body.podcastUrl || ''
    const publisherName = body.publisherName || body.hostName || ''
    const itunesRating = body.itunesRating
    const episodeCount = body.episodeCount
    const audienceSize = body.audienceSize
    const clientId = body.clientId || 'legacy' // Legacy calls don't have clientId
    const clientName = body.clientName || ''
    const clientBio = body.clientBio || ''

    console.log('[Analyze Podcast Fit] Received params:', {
      podcastId,
      podcastName,
      clientId,
      clientBio: clientBio ? `${clientBio.substring(0, 100)}...` : 'EMPTY',
      hasBio: !!clientBio
    })

    if (!podcastName) {
      throw new Error('podcastName is required')
    }

    // Use a default bio if none provided
    const effectiveBio = clientBio || 'Business professional and thought leader seeking to share expertise with podcast audiences.'

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

    const prompt = `You are a podcast booking strategist analyzing why a specific podcast would be an excellent fit for a client.

## PODCAST INFORMATION
${podcastContext}

## CLIENT/PROSPECT INFORMATION
Name: ${clientName || 'Client'}
Bio: ${effectiveBio}

## YOUR TASK
Analyze why this podcast is a great match for this specific client based on their background, expertise, and what they could offer the podcast's audience. Think deeply about:

1. **Audience Alignment**: How does the podcast's audience overlap with people who would benefit from the client's expertise?
2. **Content Synergy**: What specific topics or themes from the client's background would resonate with this podcast's focus?
3. **Value Exchange**: What unique insights, stories, or perspectives can the client bring that would genuinely help the podcast's listeners?
4. **Credibility Match**: How does the client's experience and credentials align with the podcast's typical guest profile?

## RESPONSE FORMAT
Return a JSON object with:
- "clean_description": A clear, concise description of what the podcast is about (1-2 sentences, no HTML)
- "fit_reasons": An array of 3-4 detailed reasons why this is a great fit. Each reason should be 1-2 sentences explaining the specific connection between the client's background and the podcast's audience/topics. Be specific - reference actual elements from the client's bio.
- "pitch_angles": An array of 3 specific episode topic ideas. Each should have:
  - "title": A compelling episode title (5-8 words)
  - "description": A 2-3 sentence pitch explaining what the episode would cover and why it would resonate with listeners. Reference the client's specific expertise.

Return ONLY valid JSON, no markdown code blocks or other text.`

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
        max_tokens: 2000,
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
