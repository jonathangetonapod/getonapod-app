import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('[Sync Replies] Starting sync process...')

    // Get Email Bison API token
    const bisonApiToken = Deno.env.get('EMAIL_BISON_API_TOKEN')
    if (!bisonApiToken) {
      throw new Error('EMAIL_BISON_API_TOKEN not configured')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get last sync time (check most recent reply in our database)
    const { data: lastReply } = await supabase
      .from('campaign_replies')
      .select('received_at')
      .order('received_at', { ascending: false })
      .limit(1)
      .single()

    // Fetch inbox replies from Email Bison API
    // Get replies from last 7 days to catch any missed ones
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    console.log('[Sync Replies] Fetching replies from Email Bison...')

    const bisonResponse = await fetch(
      'https://send.leadgenjay.com/api/replies?folder=inbox',
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${bisonApiToken}`,
          'Accept': 'application/json',
        },
      }
    )

    if (!bisonResponse.ok) {
      const errorText = await bisonResponse.text()
      console.error('[Sync Replies] Email Bison API error:', errorText)
      throw new Error(`Email Bison API error: ${bisonResponse.status}`)
    }

    const bisonData = await bisonResponse.json()
    const allReplies = bisonData.data || []

    console.log(`[Sync Replies] Found ${allReplies.length} replies from Email Bison`)

    // Filter to only replies received in last 7 days
    const recentReplies = allReplies.filter((reply: any) => {
      const replyDate = new Date(reply.date_received)
      return replyDate >= sevenDaysAgo
    })

    console.log(`[Sync Replies] Processing ${recentReplies.length} recent replies`)

    let newCount = 0
    let updatedCount = 0
    let skippedCount = 0

    // Process each reply
    for (const reply of recentReplies) {
      const bisonReplyId = reply.id
      const email = reply.from_email_address
      const name = reply.from_name || null
      const replyContent = reply.text_body || reply.html_body || null
      const receivedAt = reply.date_received
      const isRead = reply.read || false

      // Check if this reply already exists in our database
      const { data: existing } = await supabase
        .from('campaign_replies')
        .select('id, read, bison_reply_id')
        .eq('bison_reply_id', bisonReplyId)
        .single()

      if (existing) {
        // Reply exists - check if read status changed
        if (existing.read !== isRead) {
          await supabase
            .from('campaign_replies')
            .update({ read: isRead })
            .eq('id', existing.id)

          updatedCount++
          console.log(`[Sync Replies] Updated read status for reply ${bisonReplyId}`)
        } else {
          skippedCount++
        }
      } else {
        // New reply - insert it
        const { error: insertError } = await supabase
          .from('campaign_replies')
          .insert({
            email: email,
            name: name,
            reply_content: replyContent,
            received_at: receivedAt,
            bison_reply_id: bisonReplyId,
            status: 'new',
            read: false, // Mark as unread since it's new to us
          })

        if (insertError) {
          console.error(`[Sync Replies] Error inserting reply ${bisonReplyId}:`, insertError)
        } else {
          newCount++
          console.log(`[Sync Replies] Created new reply ${bisonReplyId} from ${email}`)
        }
      }
    }

    console.log(`[Sync Replies] Sync complete - New: ${newCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Sync completed successfully',
        data: {
          total_processed: recentReplies.length,
          new_replies: newCount,
          updated_replies: updatedCount,
          skipped_replies: skippedCount,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('[Sync Replies] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  }
})
