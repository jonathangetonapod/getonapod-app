import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
    const { replyId } = await req.json()

    // Validation
    if (!replyId) {
      throw new Error('replyId is required')
    }

    // Get Email Bison API token from environment
    const bisonApiToken = Deno.env.get('EMAIL_BISON_API_TOKEN')

    if (!bisonApiToken) {
      throw new Error('EMAIL_BISON_API_TOKEN not configured')
    }

    // Fetch conversation thread from Email Bison API
    console.log('[Fetch Email Thread] Fetching thread for reply ID:', replyId)

    const bisonResponse = await fetch(
      `https://send.leadgenjay.com/api/replies/${replyId}/conversation-thread`,
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
      console.error('[Fetch Email Thread] Email Bison API error:', errorText)
      throw new Error(`Email Bison API error: ${bisonResponse.status} ${errorText}`)
    }

    const threadData = await bisonResponse.json()

    console.log('[Fetch Email Thread] Successfully fetched thread')

    return new Response(
      JSON.stringify({
        success: true,
        data: threadData,
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
    console.error('[Fetch Email Thread] Error:', error)

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
