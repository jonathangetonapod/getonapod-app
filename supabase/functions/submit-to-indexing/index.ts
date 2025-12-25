import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers
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
    const { url, postId } = await req.json()

    // Validation
    if (!url || !postId) {
      throw new Error('url and postId are required')
    }

    // Get Google Indexing API token
    const googleIndexingToken = Deno.env.get('GOOGLE_INDEXING_TOKEN')

    if (!googleIndexingToken) {
      throw new Error('GOOGLE_INDEXING_TOKEN not configured')
    }

    // Submit to Google Indexing API
    const googleResponse = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${googleIndexingToken}`,
      },
      body: JSON.stringify({
        url: url,
        type: 'URL_UPDATED',
      }),
    })

    const googleResponseData = await googleResponse.json()
    const isSuccess = googleResponse.ok

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Log the indexation attempt to database
    const { error: logError } = await supabase
      .from('blog_indexing_log')
      .insert({
        post_id: postId,
        url: url,
        service: 'google',
        action: 'submit',
        status: isSuccess ? 'success' : 'failed',
        response_data: googleResponseData,
        error_message: isSuccess ? null : (googleResponseData.error?.message || 'Unknown error'),
      })

    if (logError) {
      console.error('Failed to log indexation attempt:', logError)
    }

    // Update post's submitted_to_google_at timestamp
    if (isSuccess) {
      const { error: updateError } = await supabase
        .from('blog_posts')
        .update({
          submitted_to_google_at: new Date().toISOString(),
          google_indexing_status: 'submitted',
        })
        .eq('id', postId)

      if (updateError) {
        console.error('Failed to update post indexing status:', updateError)
      }
    }

    // Return response
    return new Response(
      JSON.stringify({
        success: isSuccess,
        message: isSuccess
          ? 'Successfully submitted to Google Indexing API'
          : 'Failed to submit to Google Indexing API',
        data: googleResponseData,
      }),
      {
        status: isSuccess ? 200 : 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (error) {
    console.error('Error in submit-to-indexing function:', error)

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
