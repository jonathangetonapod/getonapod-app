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

Write a 3-email sequence that pitches ${firstName} as a podcast guest. Use a FICTIONAL but realistic podcast as the example (invent a plausible podcast name, host name, and recent episode topic that fits ${firstName}'s expertise).

Return ONLY a JSON array with exactly 3 objects. No markdown, no code fences, just raw JSON:

[
  {
    "label": "Email 1",
    "timing": "Day 1 · Initial Outreach",
    "body": "The full email body, ready to read."
  },
  {
    "label": "Email 2",
    "timing": "Day 4 · Follow-Up",
    "body": "..."
  },
  {
    "label": "Email 3",
    "timing": "Day 8 · Final Follow-Up",
    "body": "..."
  }
]

EMAIL WRITING RULES:

**Email 1 — Initial Outreach (120-150 words MAX):**
- Open with "Hey [host_first_name],"
- First sentence MUST be: "I had an idea about a potential guest you may want to interview if you're taking on guests."
- Then 1-2 more sentences referencing the (fictional) recent episode naturally
- Introduce ${firstName} with only 2-3 strongest credentials with specific numbers
- Exactly 3-4 topic bullets, one line each
- End with exactly: "Would you be open to seeing some more info about ${firstName}?"
- No text after the CTA

**Email 2 — Follow-Up (80-100 words MAX):**
- Open with "Hey [host_first_name],"
- Short, 3-4 sentences max
- Add a NEW angle or detail about ${firstName} not mentioned in Email 1
- Offer to send a media kit
- Conversational, not pushy

**Email 3 — Final Follow-Up (60-80 words MAX):**
- Open with "Hey [host_first_name],"
- Lead with a specific, timely topic ${firstName} can speak to
- Respectful, acknowledges the host is busy
- Leave the door open, no guilt, no pressure
- End with a soft ask

STRICT FORMATTING RULES:
- NO em dashes at all, anywhere, ever. Use commas, periods, or regular dashes (-) instead
- NO hype words: "revolutionizing," "game-changing," "transforming," "disrupting," "innovative," "incredible"
- NO formal phrases: "I am writing on behalf of," "specifically," "there is a," "in order to," "currently"
- NO links in any email
- NO signatures, no bold, no italic, no placeholder text
- Use only the host's first name, never full name
- Each email should feel like it was written by a real person, not a template
- The sequence should make ${firstName} feel confident these emails would get responses

CUTTING PATTERNS - DELETE THESE IF THEY APPEAR:
- "I am writing on behalf of" -> just introduce them
- "specifically" -> cut it
- "there is a" -> rewrite without it
- "in order to" -> use "to"
- "currently" -> usually unnecessary`

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
