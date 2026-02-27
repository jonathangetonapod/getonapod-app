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
    // No user auth required — called from public prospect pages and admin pages alike.
    // Gateway-level apikey auth (Supabase anon key) is sufficient here.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const { prospectName, prospectBio, podcastCount, dashboardId } = body

    // Type validation
    if (typeof prospectName !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'prospectName must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (typeof prospectBio !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'prospectBio must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!prospectName || !prospectBio) {
      return new Response(
        JSON.stringify({ success: false, error: 'prospectName and prospectBio are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Generate Tagline] Generating for:', prospectName)

    // Call Claude API
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const prompt = `Write a one-sentence tagline for a curated podcast list built for ${prospectName}.

Bio: ${prospectBio}

FORMAT: Start with "We put together podcasts about" followed by 2-4 specific topics from their bio.

RULES:
- Always start with exactly: "We put together podcasts about"
- List the 2-4 most specific, concrete topics from their background
- Keep it under 15 words total
- No period at the end
- Be specific, not generic — use their actual domain/niche

EXAMPLES:
- "We put together podcasts about SaaS growth, product-led sales, and B2B marketing"
- "We put together podcasts about clean energy, climate policy, and sustainable investing"
- "We put together podcasts about e-commerce, DTC brands, and consumer retail"
- "We put together podcasts about real estate investing, wealth building, and financial freedom"
- "We put together podcasts about leadership, organizational culture, and executive coaching"

Return ONLY the tagline, nothing else.`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
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
