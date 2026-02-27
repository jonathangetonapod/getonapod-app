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
    // Auth check - verify user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authClient = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await authClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    const prompt = `Write a punchy tagline (MAX 6 words, under 45 characters) for ${prospectName}.

Bio: ${prospectBio}

STRICT RULES:
- MAX 6 words, MAX 45 characters. Shorter is better.
- Describe THEIR specific expertise or mission
- NEVER start with: Amplifying, Unlocking, Transforming, Empowering, Elevating, Connecting, Accelerating, Advancing
- NEVER mention: podcast, voice, strategic, visibility, platform, storytelling, leadership (unless it's their actual field)
- No periods at the end
- Be concrete and specific to their actual work

STYLE: Think magazine headline, not marketing copy.

Examples (note: short, punchy, specific):
- "SaaS Growth Through AI"
- "Cold Calling Mastery"
- "Grief to Courage"
- "Clean Energy Policy Wonk"
- "Fractional Real Estate Investing"
- "Speed Thinking for Innovation"
- "B2B Revenue at Scale"
- "Neurotech Pain Solutions"
- "Women in Beauty & Business"
- "Cross-Border Wealth Strategy"

Return ONLY the tagline, nothing else. Keep it SHORT.`

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
