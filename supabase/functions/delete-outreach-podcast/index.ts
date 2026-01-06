import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Generate Google Access Token from Service Account
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

  // Create JWT
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

  // Import private key
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

  // Sign JWT
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
    const error = await tokenResponse.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { clientId, podcastId } = await req.json()

    if (!clientId || !podcastId) {
      throw new Error('clientId and podcastId are required')
    }

    console.log('[Delete Outreach Podcast] Starting for client:', clientId, 'podcast:', podcastId)

    // Get client's Google Sheet URL from database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('google_sheet_url')
      .eq('id', clientId)
      .single()

    if (clientError || !client?.google_sheet_url) {
      throw new Error('Client Google Sheet not found')
    }

    // Extract spreadsheet ID from URL
    const sheetUrl = client.google_sheet_url
    const spreadsheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!spreadsheetIdMatch) {
      throw new Error('Invalid Google Sheet URL')
    }
    const spreadsheetId = spreadsheetIdMatch[1]

    console.log('[Delete Outreach Podcast] Spreadsheet ID:', spreadsheetId)

    // Get Google access token
    const accessToken = await getGoogleAccessToken()

    // First, get the sheet metadata to find the first sheet's name and ID
    const metadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!metadataResponse.ok) {
      const error = await metadataResponse.text()
      throw new Error(`Failed to get sheet metadata: ${error}`)
    }

    const metadata = await metadataResponse.json()
    const firstSheet = metadata.sheets[0]?.properties
    const sheetName = firstSheet?.title || 'Sheet1'
    const sheetId = firstSheet?.sheetId || 0

    console.log('[Delete Outreach Podcast] Sheet name:', sheetName, 'Sheet ID:', sheetId)

    // Read column E to find the row with this podcast ID
    const range = `${sheetName}!E:E`
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!sheetsResponse.ok) {
      const error = await sheetsResponse.text()
      throw new Error(`Failed to read sheet: ${error}`)
    }

    const sheetsData = await sheetsResponse.json()
    const rows = sheetsData.values || []

    console.log('[Delete Outreach Podcast] Found', rows.length, 'rows in column E')

    // Find the row index (0-based) containing the podcast ID
    let rowIndex = -1
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === podcastId) {
        rowIndex = i
        break
      }
    }

    if (rowIndex === -1) {
      throw new Error(`Podcast ID ${podcastId} not found in sheet`)
    }

    console.log('[Delete Outreach Podcast] Found podcast at row index:', rowIndex, '(row', rowIndex + 1, ')')

    // Delete the row using batchUpdate
    const deleteRequest = {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    }

    const deleteResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(deleteRequest),
      }
    )

    if (!deleteResponse.ok) {
      const error = await deleteResponse.text()
      throw new Error(`Failed to delete row: ${error}`)
    }

    console.log('[Delete Outreach Podcast] Successfully deleted row', rowIndex + 1)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted podcast from row ${rowIndex + 1}`,
        deletedRow: rowIndex + 1,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Delete Outreach Podcast] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete podcast from sheet',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
