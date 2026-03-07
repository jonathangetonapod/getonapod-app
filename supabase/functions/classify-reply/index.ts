import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { reply_id } = await req.json()

    if (!reply_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'reply_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const bisonApiToken = Deno.env.get('EMAIL_BISON_API_TOKEN')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Classify Reply] Classifying reply ${reply_id}`)

    // Fetch the reply from database
    const { data: reply, error: fetchError } = await supabase
      .from('campaign_replies')
      .select('*')
      .eq('id', reply_id)
      .single()

    if (fetchError || !reply) {
      throw new Error(`Reply not found: ${reply_id}`)
    }

    // Build thread context
    let threadContext = ''

    // Try to fetch full email thread from Bison if we have the reply ID
    if (reply.bison_reply_id && bisonApiToken) {
      try {
        console.log(`[Classify Reply] Fetching thread for Bison reply ${reply.bison_reply_id}`)

        const threadResponse = await fetch(
          `https://send.leadgenjay.com/api/replies/${reply.bison_reply_id}/conversation-thread`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${bisonApiToken}`,
              'Accept': 'application/json',
            },
          }
        )

        if (threadResponse.ok) {
          const threadData = await threadResponse.json()
          const thread = threadData.data

          // Build thread text from older messages → current reply
          const allMessages = [
            ...(thread.older_messages || []).reverse(),
            thread.current_reply,
            ...(thread.newer_messages || []),
          ].filter(Boolean)

          threadContext = allMessages
            .map((msg: any) => {
              const from = msg.from_name || msg.from_email_address || 'Unknown'
              const body = msg.text_body || msg.html_body?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || ''
              const subject = msg.subject || ''
              return `--- From: ${from} | Subject: ${subject} ---\n${body}`
            })
            .join('\n\n')

          console.log(`[Classify Reply] Thread context built: ${allMessages.length} messages`)
        } else {
          console.warn(`[Classify Reply] Could not fetch thread: ${threadResponse.status}`)
        }
      } catch (threadErr) {
        console.warn(`[Classify Reply] Thread fetch failed, using reply content only:`, threadErr)
      }
    }

    // Fall back to just the reply content if no thread available
    if (!threadContext) {
      threadContext = reply.reply_content || 'No content available'
    }

    // Build classification prompt
    const classificationPrompt = `You are an email reply classifier for GOAP (Get On A Podcast), a podcast booking agency.

GOAP runs two types of email campaigns:
1. SALES campaigns: Outreach to potential clients who might want to hire GOAP to book them on podcasts. These are prospects who could become paying GOAP clients.
2. FULFILLMENT campaigns: Pitching podcast hosts/producers on behalf of existing GOAP clients. These are emails to podcasts asking them to have a GOAP client as a guest.

Classify the following email thread into one of these categories:

SALES - The reply is from a prospect responding to GOAP's sales outreach. Signs include:
- Discussing pricing, services, or hiring GOAP
- Asking about how podcast booking works
- Expressing interest in being booked on podcasts as a client
- Responding to sales pitches about GOAP's services

FULFILLMENT - The reply is from a podcast host/producer responding to a guest pitch. Signs include:
- Discussing scheduling a recording/interview
- Accepting or declining a guest pitch
- Asking for more info about the guest being pitched
- Booking confirmations or calendar links
- Questions about the guest's topic, expertise, or media kit

OTHER - The reply is none of the above. Signs include:
- Out-of-office/auto-reply messages
- Unsubscribe requests
- Bounce notifications
- Completely irrelevant or spam responses
- Generic "not interested" with no context

Campaign name: ${reply.campaign_name || 'Unknown'}
Reply from: ${reply.name || 'Unknown'} <${reply.email}>
Company: ${reply.company || 'Unknown'}

Email thread:
${threadContext}

Respond with EXACTLY this JSON format (no other text):
{"classification": "SALES" or "FULFILLMENT" or "OTHER", "confidence": "high" or "medium" or "low", "reason": "brief one-sentence explanation"}`

    console.log(`[Classify Reply] Calling Claude Haiku for classification`)

    const haikuResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [
          {
            role: 'user',
            content: classificationPrompt,
          },
        ],
      }),
    })

    if (!haikuResponse.ok) {
      const errorText = await haikuResponse.text()
      console.error('[Classify Reply] Haiku API error:', errorText)
      throw new Error(`Haiku API error: ${haikuResponse.status} - ${errorText}`)
    }

    const haikuData = await haikuResponse.json()
    const responseText = haikuData.content[0].text.trim()

    console.log(`[Classify Reply] Raw response: ${responseText}`)

    // Parse JSON response
    let classification = 'other'
    let confidence = 'low'
    let reason = ''

    try {
      const parsed = JSON.parse(responseText)
      const rawClass = (parsed.classification || '').toUpperCase()

      if (rawClass === 'SALES') classification = 'sales'
      else if (rawClass === 'FULFILLMENT') classification = 'fulfillment'
      else classification = 'other'

      confidence = parsed.confidence || 'medium'
      reason = parsed.reason || ''
    } catch {
      // Fallback: try to extract classification from plain text
      const upper = responseText.toUpperCase()
      if (upper.includes('SALES')) classification = 'sales'
      else if (upper.includes('FULFILLMENT')) classification = 'fulfillment'
      else classification = 'other'
      confidence = 'low'
    }

    console.log(`[Classify Reply] Result: ${classification} (${confidence}) - ${reason}`)

    // Update the reply with classification
    const { error: updateError } = await supabase
      .from('campaign_replies')
      .update({
        lead_type: classification,
        ai_confidence: confidence,
        ai_classified_at: new Date().toISOString(),
        ai_reason: reason,
      })
      .eq('id', reply_id)

    if (updateError) {
      console.error('[Classify Reply] DB update error:', updateError)
      throw updateError
    }

    console.log(`[Classify Reply] Reply ${reply_id} classified as: ${classification}`)

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reply_id,
          classification,
          confidence,
          reason,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Classify Reply] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
