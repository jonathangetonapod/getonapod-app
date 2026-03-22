import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// Fetch full thread from Bison and return messages + thread context string
async function fetchThread(
  bisonApiToken: string,
  bisonReplyId: number
): Promise<{ messages: any[]; contextText: string }> {
  try {
    const res = await fetch(
      `https://send.leadgenjay.com/api/replies/${bisonReplyId}/conversation-thread`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${bisonApiToken}`,
          Accept: 'application/json',
        },
      }
    )

    if (!res.ok) return { messages: [], contextText: '' }

    const data = await res.json()
    const thread = data.data

    const messages = [
      ...(thread.older_messages || []).reverse(),
      thread.current_reply,
      ...(thread.newer_messages || []),
    ].filter(Boolean)

    const contextText = messages
      .map((msg: any) => {
        const from = msg.from_name || msg.from_email_address || 'Unknown'
        const body = msg.text_body || (msg.html_body ? stripHtml(msg.html_body) : '')
        const subject = msg.subject || ''
        return `--- From: ${from} | Subject: ${subject} ---\n${body}`
      })
      .join('\n\n')

    return { messages, contextText }
  } catch (err) {
    console.warn(`[Thread] Fetch failed for ${bisonReplyId}:`, err)
    return { messages: [], contextText: '' }
  }
}

// Determine who sent the last message in the thread
// Returns { awaiting_reply: true } if the lead replied last (we owe them)
// Returns { awaiting_reply: false } if we replied last (waiting on them)
function checkLastReply(
  messages: any[],
  leadEmail: string
): {
  awaiting_reply: boolean
  last_reply_from: string | null
  thread_message_count: number
} {
  if (messages.length === 0) {
    return { awaiting_reply: true, last_reply_from: null, thread_message_count: 0 }
  }

  const lastMsg = messages[messages.length - 1]
  const lastFrom = (lastMsg.from_email_address || '').toLowerCase()
  const lead = leadEmail.toLowerCase()

  // If the last message is FROM the lead's email, we owe a reply
  // If it's from anyone else (our sender emails), we're waiting on them
  const awaiting = lastFrom === lead

  return {
    awaiting_reply: awaiting,
    last_reply_from: lastMsg.from_name || lastMsg.from_email_address || null,
    thread_message_count: messages.length,
  }
}

// Classify using Claude Haiku
async function classifyWithAI(
  anthropicApiKey: string,
  threadContext: string,
  reply: {
    campaign_name: string | null
    name: string | null
    email: string
    company: string | null
    reply_content: string | null
  }
): Promise<{ classification: string; confidence: string; reason: string }> {
  const context = threadContext || reply.reply_content || 'No content available'

  const prompt = `You are an email reply classifier for GOAP (Get On A Podcast), a podcast booking agency.

GOAP runs two types of email campaigns:
1. SALES campaigns: Outreach to potential clients who might want to hire GOAP to book them on podcasts.
2. FULFILLMENT campaigns: Pitching podcast hosts/producers on behalf of existing GOAP clients.

Classify this email thread:

SALES - Reply from a prospect responding to GOAP's sales outreach:
- Discussing pricing, services, or hiring GOAP
- Asking about how podcast booking works
- Interest in being booked on podcasts as a client

FULFILLMENT - Reply from a podcast host/producer responding to a guest pitch:
- Scheduling a recording/interview
- Accepting or declining a guest pitch
- Asking about the guest's topic, expertise, or media kit
- Booking confirmations or calendar links

OTHER - Out-of-office, auto-replies, unsubscribes, bounces, spam, irrelevant.

Campaign name: ${reply.campaign_name || 'Unknown'}
Reply from: ${reply.name || 'Unknown'} <${reply.email}>
Company: ${reply.company || 'Unknown'}

Email thread:
${context}

Respond with EXACTLY this JSON (no other text):
{"classification": "SALES" or "FULFILLMENT" or "OTHER", "confidence": "high" or "medium" or "low", "reason": "one-sentence explanation"}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Haiku error: ${res.status} - ${errorText}`)
  }

  const data = await res.json()
  const text = data.content[0].text.trim()

  try {
    const parsed = JSON.parse(text)
    const rawClass = (parsed.classification || '').toUpperCase()
    return {
      classification: rawClass === 'SALES' ? 'sales' : rawClass === 'FULFILLMENT' ? 'fulfillment' : 'other',
      confidence: parsed.confidence || 'medium',
      reason: parsed.reason || '',
    }
  } catch {
    const upper = text.toUpperCase()
    return {
      classification: upper.includes('SALES') ? 'sales' : upper.includes('FULFILLMENT') ? 'fulfillment' : 'other',
      confidence: 'low',
      reason: 'Could not parse AI response',
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const bisonApiToken = Deno.env.get('EMAIL_BISON_API_TOKEN')
    if (!bisonApiToken) throw new Error('EMAIL_BISON_API_TOKEN not configured')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('[Fetch & Classify] Fetching interested replies from Bison...')

    // Fetch all interested replies from Bison
    const bisonRes = await fetch(
      'https://send.leadgenjay.com/api/replies?status=interested&folder=inbox',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${bisonApiToken}`,
          Accept: 'application/json',
        },
      }
    )

    if (!bisonRes.ok) {
      const errorText = await bisonRes.text()
      throw new Error(`Bison API error: ${bisonRes.status} - ${errorText}`)
    }

    const bisonData = await bisonRes.json()
    const interestedReplies = bisonData.data || []

    console.log(`[Fetch & Classify] Found ${interestedReplies.length} interested replies`)

    let newCount = 0
    let classifiedCount = 0
    let skippedCount = 0
    const results: any[] = []

    for (const bisonReply of interestedReplies) {
      const bisonReplyId = bisonReply.id
      const email = bisonReply.from_email_address
      const name = bisonReply.from_name || null
      const replyContent = bisonReply.text_body || bisonReply.html_body || null
      const receivedAt = bisonReply.date_received
      const subject = bisonReply.subject || null

      // Check if already in our DB
      const { data: existing } = await supabase
        .from('campaign_replies')
        .select('id, lead_type, ai_classified_at')
        .eq('bison_reply_id', bisonReplyId)
        .single()

      if (existing && existing.ai_classified_at) {
        // Already classified — just update thread status
        const { messages } = await fetchThread(bisonApiToken, bisonReplyId)
        const threadStatus = checkLastReply(messages, email)

        await supabase
          .from('campaign_replies')
          .update({
            awaiting_reply: threadStatus.awaiting_reply,
            last_reply_from: threadStatus.last_reply_from,
            thread_checked_at: new Date().toISOString(),
            thread_message_count: threadStatus.thread_message_count,
          })
          .eq('id', existing.id)

        skippedCount++
        continue
      }

      // Fetch thread once — used for both classification and last-reply check
      const { messages, contextText } = await fetchThread(bisonApiToken, bisonReplyId)
      const threadStatus = checkLastReply(messages, email)

      if (existing && !existing.ai_classified_at) {
        // Exists but not classified yet
        console.log(`[Fetch & Classify] Classifying existing reply ${bisonReplyId}...`)

        const result = await classifyWithAI(anthropicApiKey, contextText, {
          campaign_name: subject,
          name,
          email,
          company: null,
          reply_content: replyContent,
        })

        await supabase
          .from('campaign_replies')
          .update({
            lead_type: result.classification,
            ai_confidence: result.confidence,
            ai_classified_at: new Date().toISOString(),
            awaiting_reply: threadStatus.awaiting_reply,
            last_reply_from: threadStatus.last_reply_from,
            thread_checked_at: new Date().toISOString(),
            thread_message_count: threadStatus.thread_message_count,
            ai_reason: result.reason,
          })
          .eq('id', existing.id)

        classifiedCount++
        results.push({
          id: existing.id,
          email,
          classification: result.classification,
          confidence: result.confidence,
          awaiting_reply: threadStatus.awaiting_reply,
          reason: result.reason,
        })
        continue
      }

      // Brand new reply — insert + classify
      console.log(`[Fetch & Classify] New interested reply from ${email} (Bison #${bisonReplyId})`)

      const { data: inserted, error: insertError } = await supabase
        .from('campaign_replies')
        .insert({
          email,
          name,
          reply_content: replyContent,
          campaign_name: subject,
          received_at: receivedAt,
          bison_reply_id: bisonReplyId,
          status: 'new',
          read: false,
        })
        .select('id')
        .single()

      if (insertError) {
        console.error(`[Fetch & Classify] Insert error:`, insertError)
        continue
      }

      newCount++

      // Classify
      console.log(`[Fetch & Classify] Classifying new reply ${bisonReplyId}...`)

      const result = await classifyWithAI(anthropicApiKey, contextText, {
        campaign_name: subject,
        name,
        email,
        company: null,
        reply_content: replyContent,
      })

      await supabase
        .from('campaign_replies')
        .update({
          lead_type: result.classification,
          ai_confidence: result.confidence,
          ai_classified_at: new Date().toISOString(),
          awaiting_reply: threadStatus.awaiting_reply,
          last_reply_from: threadStatus.last_reply_from,
          thread_checked_at: new Date().toISOString(),
          thread_message_count: threadStatus.thread_message_count,
          notes: `[AI] ${result.reason}`,
        })
        .eq('id', inserted.id)

      classifiedCount++
      results.push({
        id: inserted.id,
        email,
        classification: result.classification,
        confidence: result.confidence,
        awaiting_reply: threadStatus.awaiting_reply,
        reason: result.reason,
      })
    }

    console.log(`[Fetch & Classify] Done — New: ${newCount}, Classified: ${classifiedCount}, Skipped: ${skippedCount}`)

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          total_interested: interestedReplies.length,
          new_replies: newCount,
          classified: classifiedCount,
          skipped: skippedCount,
          results,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Fetch & Classify] Error:', error)

    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
