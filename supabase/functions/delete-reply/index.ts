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

    const bisonApiToken = Deno.env.get('EMAIL_BISON_API_TOKEN')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch the reply to get the bison_reply_id
    const { data: reply, error: fetchError } = await supabase
      .from('campaign_replies')
      .select('id, bison_reply_id, email, name')
      .eq('id', reply_id)
      .single()

    if (fetchError || !reply) {
      throw new Error(`Reply not found: ${reply_id}`)
    }

    console.log(`[Delete Reply] Deleting reply ${reply_id} (Bison #${reply.bison_reply_id}) from ${reply.email}`)

    // Delete from Bison if we have a bison_reply_id
    let bisonDeleted = false
    if (reply.bison_reply_id && bisonApiToken) {
      const bisonRes = await fetch(
        `https://send.leadgenjay.com/api/replies/${reply.bison_reply_id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${bisonApiToken}`,
            Accept: 'application/json',
          },
        }
      )

      if (bisonRes.ok) {
        bisonDeleted = true
        console.log(`[Delete Reply] Deleted from Bison: ${reply.bison_reply_id}`)
      } else {
        const errorText = await bisonRes.text()
        console.warn(`[Delete Reply] Bison delete failed (${bisonRes.status}): ${errorText}`)
      }
    }

    // Delete from our database
    const { error: deleteError } = await supabase
      .from('campaign_replies')
      .delete()
      .eq('id', reply_id)

    if (deleteError) {
      throw new Error(`Database delete failed: ${deleteError.message}`)
    }

    console.log(`[Delete Reply] Deleted from database: ${reply_id}`)

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          reply_id,
          bison_deleted: bisonDeleted,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Delete Reply] Error:', error)

    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
