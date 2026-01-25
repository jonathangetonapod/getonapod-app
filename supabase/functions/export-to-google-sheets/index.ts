import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PodcastExportData {
  podcast_id?: string  // Podscan ID
  podscan_podcast_id?: string  // Alias
  podcast_name: string
  publisher_name?: string | null
  podcast_description?: string | null
  audience_size?: number | null
  episode_count?: number | null
  itunes_rating?: number | null
  podcast_url?: string | null
  podcast_email?: string | null
  rss_feed?: string | null
  compatibility_score?: number | null
  compatibility_reasoning?: string | null
  podcast_image_url?: string | null
  podcast_categories?: Array<{ category_id: string; category_name: string }> | null
  language?: string | null
  region?: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientId, podcasts } = await req.json() as {
      clientId: string
      podcasts: PodcastExportData[]
    }

    if (!clientId || !podcasts || podcasts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Client ID and podcasts array are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get client's Google Sheet URL
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('google_sheet_url, name')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!client.google_sheet_url) {
      return new Response(
        JSON.stringify({ error: 'No Google Sheet URL configured for this client. Please add one in client settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract spreadsheet ID from URL
    // URL format: https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit...
    const spreadsheetIdMatch = client.google_sheet_url.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!spreadsheetIdMatch) {
      return new Response(
        JSON.stringify({ error: 'Invalid Google Sheet URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const spreadsheetId = spreadsheetIdMatch[1]

    // Get Google Service Account credentials from environment (same as indexing function)
    const googleCredentials = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!googleCredentials) {
      return new Response(
        JSON.stringify({ error: 'Google Service Account credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let credentials
    try {
      credentials = JSON.parse(googleCredentials)
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid Google Service Account credentials format' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate JWT for Google API authentication
    const now = Math.floor(Date.now() / 1000)

    // Base64 URL encode helper
    const base64UrlEncode = (data: string) =>
      btoa(data)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')

    // Get user email for domain-wide delegation
    const userEmail = Deno.env.get('GOOGLE_WORKSPACE_USER_EMAIL')
    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_WORKSPACE_USER_EMAIL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const jwtHeader = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const jwtClaim = base64UrlEncode(JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
      sub: userEmail,  // Domain-wide delegation: impersonate this user
    }))

    // Import private key for signing (same approach as submit-to-indexing function)
    const privateKeyPem = credentials.private_key
    const pemHeader = '-----BEGIN PRIVATE KEY-----'
    const pemFooter = '-----END PRIVATE KEY-----'
    const pemContents = privateKeyPem
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '')

    // Decode base64 private key
    const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))

    // Import the key
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryDer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    )

    // Sign the JWT
    const encoder = new TextEncoder()
    const signatureInput = `${jwtHeader}.${jwtClaim}`
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      encoder.encode(signatureInput)
    )

    const jwtSignature = base64UrlEncode(
      String.fromCharCode(...new Uint8Array(signature))
    )

    const jwt = `${signatureInput}.${jwtSignature}`

    // Exchange JWT for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Token exchange failed:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Google' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { access_token } = await tokenResponse.json()

    // Prepare rows to append - matching template columns:
    // Column A: Podcast Name
    // Column B: Description
    // Column C: Ratings
    // Column D: Episode Count
    // Column E: Podscan Podcast ID
    const rows = podcasts.map(podcast => [
      podcast.podcast_name || '',
      podcast.podcast_description || '',
      podcast.itunes_rating?.toString() || '',
      podcast.episode_count?.toString() || '',
      podcast.podscan_podcast_id || podcast.podcast_id || '',
    ])

    // Check if sheet has headers, if not add them
    const sheetMetadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!sheetMetadataResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to access Google Sheet. Make sure the sheet is shared with the service account.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Append data to the sheet
    const appendResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: rows,
        }),
      }
    )

    if (!appendResponse.ok) {
      const errorText = await appendResponse.text()
      console.error('Append failed:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to write to Google Sheet' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await appendResponse.json()

    // ============================================
    // CACHE OPTIMIZATION: Save podcasts to central database
    // ============================================
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('💾 [CACHE SAVE] Saving podcasts to central database...')
    console.log(`   Client: ${client.name}`)
    console.log(`   Podcasts to cache: ${podcasts.length}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    let savedCount = 0
    let skippedCount = 0
    let errorCount = 0

    for (const podcast of podcasts) {
      const podcastId = podcast.podscan_podcast_id || podcast.podcast_id

      if (!podcastId) {
        console.warn('⚠️  [SKIP] No podcast ID for:', podcast.podcast_name?.substring(0, 50))
        skippedCount++
        continue
      }

      try {
        // Upsert podcast to central database
        const { error: upsertError } = await supabase
          .from('podcasts')
          .upsert({
            podscan_id: podcastId,
            podcast_name: podcast.podcast_name,
            podcast_description: podcast.podcast_description || null,
            podcast_image_url: podcast.podcast_image_url || null,
            podcast_url: podcast.podcast_url || null,
            publisher_name: podcast.publisher_name || null,
            episode_count: podcast.episode_count || null,
            itunes_rating: podcast.itunes_rating || null,
            audience_size: podcast.audience_size || null,
            language: podcast.language || null,
            region: podcast.region || null,
            podcast_email: podcast.podcast_email || null,
            rss_feed: podcast.rss_feed || null,
            podcast_categories: podcast.podcast_categories || null,
            // Mark as saved from podcast finder export
            podscan_last_fetched_at: new Date().toISOString(),
          }, {
            onConflict: 'podscan_id',
            ignoreDuplicates: false, // Update if exists
          })

        if (upsertError) {
          console.error('❌ [ERROR] Failed to save podcast:', podcast.podcast_name?.substring(0, 50), upsertError.message)
          errorCount++
        } else {
          console.log(`💾 [SAVED] ${podcast.podcast_name?.substring(0, 50)} → Central DB`)
          savedCount++
        }
      } catch (error) {
        console.error('❌ [ERROR] Exception saving podcast:', podcast.podcast_name?.substring(0, 50), error)
        errorCount++
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ [CACHE SAVE COMPLETE]')
    console.log(`   💾 Saved to central DB: ${savedCount}`)
    console.log(`   ⏩ Skipped (no ID): ${skippedCount}`)
    console.log(`   ❌ Errors: ${errorCount}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🚀 [BENEFIT] These podcasts now available for ALL future fetches!')
    console.log('   Next time you fetch from this sheet → 100% cache hit!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return new Response(
      JSON.stringify({
        success: true,
        rowsAdded: podcasts.length,
        updatedRange: result.updates.updatedRange,
        cacheSaved: savedCount,
        cacheSkipped: skippedCount,
        cacheErrors: errorCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
