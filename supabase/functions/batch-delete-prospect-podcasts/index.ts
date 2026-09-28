import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requirePlatformAdminOrService } from '../_shared/workspaceAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || 'https://getonapod.com',
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

/**
 * Delete every matching podcast row from the Google Sheet in one request.
 * Column E holds the Podscan podcast id. The rows are read once and deleted
 * bottom-up in a single batchUpdate, because deleting top-down (or in
 * parallel, as this used to) shifts every later index and removes rows nobody
 * asked for. Returns the ids that were found on the sheet.
 */
async function deletePodcastsFromSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  sheetName: string,
  podcastIds: string[]
): Promise<Set<string>> {
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
    throw new Error(`Failed to read Google Sheet: ${errorText}`)
  }

  const sheetData = await sheetResponse.json()
  const rows: string[][] = sheetData.values || []
  const wanted = new Set(podcastIds)
  const found = new Set<string>()
  const rowIndices: number[] = []
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i]?.[0]
    if (typeof id === 'string' && wanted.has(id)) {
      found.add(id)
      rowIndices.push(i)
    }
  }

  if (rowIndices.length === 0) {
    console.log('[Batch Delete] None of the podcast IDs were found in the sheet')
    return found
  }

  rowIndices.sort((left, right) => right - left)
  const deleteResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: rowIndices.map((rowIndex) => ({
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        })),
      }),
    }
  )

  if (!deleteResponse.ok) {
    const errorText = await deleteResponse.text()
    throw new Error(`Failed to delete rows: ${errorText}`)
  }

  console.log(`[Batch Delete] Deleted ${rowIndices.length} rows from the sheet`)
  return found
}

/**
 * Delete the sheet rows in one bottom-up batch, then the database rows.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    await requirePlatformAdminOrService(req)
    const { prospect_id, podcast_ids, spreadsheet_id } = await req.json()

    if (!prospect_id || !podcast_ids || !spreadsheet_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'prospect_id, podcast_ids, and spreadsheet_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!Array.isArray(podcast_ids) || podcast_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'podcast_ids must be a non-empty array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log(`[Batch Delete] Prospect: ${prospect_id}, Podcasts: ${podcast_ids.length}, Sheet: ${spreadsheet_id}`)

    const errors: string[] = []
    let deletedCount = 0

    // Get Google access token
    const accessToken = await getGoogleAccessToken()

    // Get sheet metadata (sheet ID and name)
    const metadataResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}?fields=sheets.properties`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text()
      console.error('[Batch Delete] Failed to get sheet metadata:', errorText)
      throw new Error(`Failed to get sheet metadata: ${errorText}`)
    }

    const metadata = await metadataResponse.json()
    const sheetId = metadata.sheets?.[0]?.properties?.sheetId ?? 0
    const sheetName = metadata.sheets?.[0]?.properties?.title ?? 'Sheet1'

    console.log(`[Batch Delete] Using sheet: ${sheetName} with ID: ${sheetId}`)

    // The sheet first, all rows in one request. A failure here is recorded
    // and the database rows are still removed, as before.
    try {
      await deletePodcastsFromSheet(accessToken, spreadsheet_id, sheetId, sheetName, podcast_ids)
    } catch (sheetError) {
      console.warn('[Batch Delete] Sheet delete failed:', sheetError)
      errors.push(`Sheet: ${sheetError instanceof Error ? sheetError.message : String(sheetError)}`)
    }

    const BATCH_SIZE = 5
    for (let i = 0; i < podcast_ids.length; i += BATCH_SIZE) {
      const batch = podcast_ids.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async (podcastId: string) => {
          const failures: string[] = []

          const { error: podcastError } = await supabase
            .from('prospect_dashboard_podcasts')
            .delete()
            .eq('prospect_dashboard_id', prospect_id)
            .eq('podcast_id', podcastId)
          if (podcastError) failures.push(`podcast: ${podcastError.message}`)

          const { error: feedbackError } = await supabase
            .from('prospect_podcast_feedback')
            .delete()
            .eq('prospect_dashboard_id', prospect_id)
            .eq('podcast_id', podcastId)
          if (feedbackError) failures.push(`feedback: ${feedbackError.message}`)

          const { error: analysisError } = await supabase
            .from('prospect_podcast_analyses')
            .delete()
            .eq('prospect_dashboard_id', prospect_id)
            .eq('podcast_id', podcastId)
          if (analysisError) failures.push(`analysis: ${analysisError.message}`)

          if (failures.length > 0) {
            throw new Error(`Failed to delete podcast ${podcastId}: ${failures.join('; ')}`)
          }
          return podcastId
        })
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          deletedCount++
        } else {
          errors.push(result.reason?.message || 'Unknown error')
        }
      }
    }

    console.log(`[Batch Delete] Complete. Deleted: ${deletedCount}/${podcast_ids.length}, Errors: ${errors.length}`)

    return new Response(
      JSON.stringify({
        success: true,
        total: podcast_ids.length,
        deleted: deletedCount,
        failed: errors.length,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('[Batch Delete] Error:', error)

    return new Response(
      JSON.stringify({
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
