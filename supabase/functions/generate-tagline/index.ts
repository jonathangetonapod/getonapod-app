import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { prospectName, prospectBio, podcastCount, dashboardId } = body

    if (!prospectName || !prospectBio || !podcastCount) {
      return new Response(
        JSON.stringify({ success: false, error: 'prospectName, prospectBio, and podcastCount are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Generate Tagline] Generating for:', prospectName)

    // Call Claude API
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const prompt = `You are a copywriter creating a personalized, compelling one-liner for a podcast booking dashboard.

## PROSPECT INFO
Name: ${prospectName}
Bio: ${prospectBio}
Number of podcasts curated: ${podcastCount}

## YOUR TASK
Create a single, personalized tagline that:
1. References their specific goal, mission, or objective from their bio
2. Is warm and exciting
3. Mentions the number of podcasts (${podcastCount})
4. Is 10-20 words max
5. Starts with "We've curated ${podcastCount} podcasts perfect for..."

## EXAMPLES (for inspiration only - create something unique):
- "We've curated 12 podcasts perfect for spreading your message on sustainable investing"
- "We've curated 8 podcasts perfect for your campaign to revolutionize healthcare"
- "We've curated 15 podcasts perfect for sharing your expertise in AI ethics"
- "We've curated 9 podcasts perfect for amplifying your mission to empower entrepreneurs"

## IMPORTANT
- Focus on THEIR objective, not generic expertise
- Be specific to what makes them unique
- Return ONLY the tagline, nothing else`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 100,
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
      console.error('[Generate Tagline] Claude API error:', error)
      throw new Error(`Claude API error: ${error}`)
    }

    const claudeData = await claudeResponse.json()
    let tagline = ''

    for (const block of claudeData.content) {
      if (block.type === 'text') {
        tagline = block.text.trim()
        break
      }
    }

    // Clean up the tagline - remove quotes if present
    tagline = tagline.replace(/^["']|["']$/g, '').trim()

    console.log('[Generate Tagline] Generated:', tagline)

    // Save to database if dashboardId provided
    if (dashboardId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      const { error: updateError } = await supabase
        .from('prospect_dashboards')
        .update({ personalized_tagline: tagline })
        .eq('id', dashboardId)

      if (updateError) {
        console.error('[Generate Tagline] Failed to save tagline:', updateError)
      } else {
        console.log('[Generate Tagline] Saved to database')
      }
    }

    return new Response(
      JSON.stringify({ success: true, tagline }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Generate Tagline] Error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
