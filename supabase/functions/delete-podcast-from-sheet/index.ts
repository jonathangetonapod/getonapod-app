import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Generate Google Access Token from Service Account with write access
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

  // Request full spreadsheet access for write operations
  const jwtPayload = base64UrlEncode(JSON.stringify({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now,
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
    const { spreadsheetId, podcastId } = await req.json()

    if (!spreadsheetId || !podcastId) {
      return new Response(
        JSON.stringify({ error: 'spreadsheetId and podcastId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Delete Podcast] Deleting podcast:', podcastId, 'from sheet:', spreadsheetId)

    const accessToken = await getGoogleAccessToken()

    // First, get the sheet metadata to find the sheet ID
    const metadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text()
      console.error('[Delete Podcast] Failed to get sheet metadata:', errorText)
      throw new Error(`Failed to get sheet metadata: ${errorText}`)
    }

    const metadata = await metadataResponse.json()
    const sheetId = metadata.sheets?.[0]?.properties?.sheetId ?? 0
    const sheetName = metadata.sheets?.[0]?.properties?.title ?? 'Sheet1'

    console.log('[Delete Podcast] Using sheet:', sheetName, 'with ID:', sheetId)

    // Read column E (Podscan Podcast ID) to find the row
    const sheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!E:E`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!sheetResponse.ok) {
      const errorText = await sheetResponse.text()
      console.error('[Delete Podcast] Failed to read sheet:', errorText)
      throw new Error(`Failed to read Google Sheet: ${errorText}`)
    }

    const sheetData = await sheetResponse.json()
    const rows = sheetData.values || []

    // Find the row index (0-based) that contains the podcast ID
    let rowIndex = -1
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === podcastId) {
        rowIndex = i
        break
      }
    }

    if (rowIndex === -1) {
      console.log('[Delete Podcast] Podcast ID not found in sheet:', podcastId)
      return new Response(
        JSON.stringify({ success: false, error: 'Podcast ID not found in sheet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    console.log('[Delete Podcast] Found podcast at row:', rowIndex + 1)

    // Delete the row using batchUpdate
    const deleteResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
        }),
      }
    )

    if (!deleteResponse.ok) {
      const errorText = await deleteResponse.text()
      console.error('[Delete Podcast] Failed to delete row:', errorText)
      throw new Error(`Failed to delete row: ${errorText}`)
    }

    console.log('[Delete Podcast] Successfully deleted row:', rowIndex + 1)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted podcast from row ${rowIndex + 1}`,
        deletedPodcastId: podcastId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Delete Podcast] Error:', error)
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
