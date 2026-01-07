import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PodcastExportData {
  podcast_name: string
  publisher_name?: string | null
  podcast_description?: string | null
  audience_size?: number | null
  episode_count?: number | null
  itunes_rating?: number | null
  podcast_url?: string | null
  podscan_podcast_id?: string | null
  podcast_id?: string | null
  compatibility_score?: number | null
  compatibility_reasoning?: string | null
}

/**
 * Generate Google Access Token from Service Account with Domain-Wide Delegation
 */
async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')

  if (!serviceAccountJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  }

  const serviceAccount = JSON.parse(serviceAccountJson)
  const { client_email, private_key } = serviceAccount

  if (!client_email || !private_key) {
    throw new Error('Invalid service account credentials')
  }

  const now = Math.floor(Date.now() / 1000)
  const expiry = now + 3600

  const base64UrlEncode = (data: string) =>
    btoa(data)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')

  const jwtHeader = base64UrlEncode(JSON.stringify({
    alg: 'RS256',
    typ: 'JWT',
  }))

  const userEmail = Deno.env.get('GOOGLE_WORKSPACE_USER_EMAIL')
  if (!userEmail) {
    throw new Error('GOOGLE_WORKSPACE_USER_EMAIL not configured')
  }

  const jwtPayload = base64UrlEncode(JSON.stringify({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
    sub: userEmail,
  }))

  const pemHeader = '-----BEGIN PRIVATE KEY-----'
  const pemFooter = '-----END PRIVATE KEY-----'
  const pemContents = private_key
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )

  const encoder = new TextEncoder()
  const signatureInput = `${jwtHeader}.${jwtPayload}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signatureInput)
  )

  const signatureEncoded = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  )

  const jwt = `${signatureInput}.${signatureEncoded}`

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

  const tokenData = await tokenResponse.json()

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenData.error_description || tokenData.error}`)
  }

  return tokenData.access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { dashboardId, podcasts } = await req.json() as {
      dashboardId: string
      podcasts: PodcastExportData[]
    }

    if (!dashboardId) {
      return new Response(
        JSON.stringify({ error: 'Dashboard ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!podcasts || podcasts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one podcast must be selected for export' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Append Prospect Sheet] Dashboard ID:', dashboardId)
    console.log('[Append Prospect Sheet] Podcasts to export:', podcasts.length)

    // Get the dashboard record to find the spreadsheet
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: dashboard, error: dbError } = await supabase
      .from('prospect_dashboards')
      .select('*')
      .eq('id', dashboardId)
      .single()

    if (dbError || !dashboard) {
      console.error('[Append Prospect Sheet] Dashboard not found:', dbError)
      return new Response(
        JSON.stringify({ error: 'Dashboard not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const spreadsheetId = dashboard.spreadsheet_id
    const spreadsheetUrl = dashboard.spreadsheet_url

    console.log('[Append Prospect Sheet] Found spreadsheet:', spreadsheetId)

    // Get access token
    const accessToken = await getGoogleAccessToken()
    console.log('[Append Prospect Sheet] Access token obtained')

    // Prepare rows to append - matching template columns
    const rows = podcasts.map(podcast => [
      podcast.podcast_name || '',
      podcast.podcast_description || '',
      podcast.itunes_rating?.toString() || '',
      podcast.episode_count?.toString() || '',
      podcast.podscan_podcast_id || podcast.podcast_id || '',
    ])

    // Append data to the sheet
    const appendResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1:append?valueInputOption=RAW`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: rows,
        }),
      }
    )

    if (!appendResponse.ok) {
      const errorText = await appendResponse.text()
      console.error('[Append Prospect Sheet] Append failed:', errorText)
      throw new Error(`Failed to write to Google Sheet: ${errorText}`)
    }

    const appendResult = await appendResponse.json()
    console.log('[Append Prospect Sheet] Data exported successfully')

    return new Response(
      JSON.stringify({
        success: true,
        spreadsheetUrl,
        rowsAdded: podcasts.length,
        updatedRange: appendResult.updates?.updatedRange || 'Sheet1',
        message: `Added ${podcasts.length} podcasts to "${dashboard.prospect_name}"'s sheet`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Append Prospect Sheet] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
