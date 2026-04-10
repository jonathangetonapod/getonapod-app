import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientName, clientBio, clientTitle, clientLinkedin, clientWebsite } = await req.json()

    if (!clientName || !clientBio) {
      return new Response(
        JSON.stringify({ success: false, error: 'clientName and clientBio are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const firstName = clientName.split(' ')[0]

    const prompt = `You are writing a sample 4-email outreach sequence for a podcast guest booking agency. This sequence will be shown to the CLIENT (${clientName}) so they can see the tone, structure, and quality of emails that will be sent to podcast hosts on their behalf.

CLIENT DETAILS:
- Name: ${clientName}
- Title: ${clientTitle || 'Not specified'}
- Bio: ${clientBio}
- LinkedIn: ${clientLinkedin || 'Not provided'}
- Website: ${clientWebsite || 'Not provided'}

Write a 4-email sequence that pitches ${firstName} as a podcast guest. Use a FICTIONAL but realistic podcast as the example (invent a plausible podcast name, host name, and recent episode topic that fits ${firstName}'s expertise).

Return ONLY a JSON array with exactly 4 objects. No markdown, no code fences, just raw JSON:

[
  {
    "label": "Email 1",
    "timing": "Day 1 · Initial Outreach",
    "body": "The full email body, ready to read. Start with 'Hey [host_first_name],' — use the fictional host's first name."
  },
  {
    "label": "Email 2",
    "timing": "Day 4 · Follow-Up",
    "body": "..."
  },
  {
    "label": "Email 3",
    "timing": "Day 8 · New Angle",
    "body": "..."
  },
  {
    "label": "Email 4",
    "timing": "Day 14 · Gentle Close",
    "body": "..."
  }
]

EMAIL WRITING RULES:

**Email 1 — Initial Outreach:**
- Open with "Hey [host_first_name],"
- 2-3 sentence opening that references a specific (fictional) recent episode with a genuine insight
- Introduce ${firstName} with CONCRETE accomplishments from their bio — specific numbers, outcomes, roles
- 3-5 topic bullets that show what ${firstName} could discuss, framed as audience value
- End with: "Would you be open to seeing some more info about ${firstName}?"
- No text after the CTA

**Email 2 — Follow-Up:**
- Short — 3-4 sentences max
- Add a NEW angle or detail about ${firstName} not mentioned in Email 1
- Offer to send a media kit
- Conversational, not pushy

**Email 3 — New Angle:**
- Lead with a specific, timely topic ${firstName} can speak to
- Frame it as "your listeners would get [specific value]"
- End with a soft ask: "Worth a conversation?"

**Email 4 — Gentle Close:**
- Respectful, acknowledges the host is busy
- Mentions topics are evergreen and happy to revisit
- No guilt, no pressure — leave the door open

TONE RULES:
- Conversational but professional
- NO hype words: avoid "revolutionizing," "game-changing," "transforming," "incredible"
- NO links in any email
- NO em dashes — use regular dashes (-) or commas
- Use only the host's first name, never full name
- Each email should feel like it was written by a real person, not a template
- The sequence should make ${firstName} feel confident these emails would get responses`

    console.log('[Generate Sequence] Generating for:', clientName)

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      throw new Error(`Claude API error: ${error}`)
    }

    const claudeData = await claudeResponse.json()
    let rawText = ''
    for (const block of claudeData.content) {
      if (block.type === 'text') {
        rawText = block.text.trim()
        break
      }
    }

    rawText = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
    if (!rawText) throw new Error('Empty response from Claude')

    const sequence = JSON.parse(rawText)

    console.log('[Generate Sequence] Generated', sequence.length, 'emails for', clientName)

    return new Response(
      JSON.stringify({ success: true, sequence }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Generate Sequence] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
