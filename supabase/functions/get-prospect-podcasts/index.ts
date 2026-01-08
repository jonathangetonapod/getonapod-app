import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Generate Google Access Token from Service Account (no domain-wide delegation needed)
 * Works for public sheets or sheets shared with the service account
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

  // No "sub" claim - service account authenticates as itself
  // This works for public sheets or sheets shared with the service account
  const jwtPayload = base64UrlEncode(JSON.stringify({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
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

interface PodcastCategory {
  category_id: string
  category_name: string
}

interface OutreachPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  itunes_rating: number | null
  episode_count: number | null
  audience_size: number | null
  podcast_categories: PodcastCategory[] | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { spreadsheetId } = await req.json() as { spreadsheetId: string }

    if (!spreadsheetId) {
      return new Response(
        JSON.stringify({ error: 'Spreadsheet ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Get Prospect Podcasts] Fetching from spreadsheet:', spreadsheetId)

    // Get access token
    const accessToken = await getGoogleAccessToken()

    // Read podcast IDs from column E (Podscan Podcast ID)
    const sheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!E:E`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    )

    if (!sheetResponse.ok) {
      const errorText = await sheetResponse.text()
      console.error('[Get Prospect Podcasts] Failed to read sheet:', errorText)
      throw new Error(`Failed to read Google Sheet: ${errorText}`)
    }

    const sheetData = await sheetResponse.json()
    const rows = sheetData.values || []

    // Skip header row and extract podcast IDs
    const podcastIds: string[] = rows
      .slice(1)
      .map((row: string[]) => row[0])
      .filter((id: string) => id && id.trim() !== '')

    console.log('[Get Prospect Podcasts] Found', podcastIds.length, 'podcast IDs')

    if (podcastIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, podcasts: [], total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch podcast details from Podscan API
    const podscanApiKey = Deno.env.get('PODSCAN_API_KEY')
    if (!podscanApiKey) {
      throw new Error('PODSCAN_API_KEY not configured')
    }

    const podcasts: OutreachPodcast[] = []
    const BATCH_SIZE = 5

    for (let i = 0; i < podcastIds.length; i += BATCH_SIZE) {
      const batch = podcastIds.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.all(
        batch.map(async (podcastId): Promise<OutreachPodcast | null> => {
          try {
            const response = await fetch(
              `https://podscan.fm/api/v1/podcasts/${podcastId}`,
              {
                headers: {
                  'Authorization': `Bearer ${podscanApiKey}`,
                },
              }
            )

            if (response.ok) {
              const data = await response.json()
              const podcast = data.podcast || data

              return {
                podcast_id: podcastId,
                podcast_name: podcast.podcast_name || 'Unknown Podcast',
                podcast_description: podcast.podcast_description || null,
                podcast_image_url: podcast.podcast_image_url || podcast.thumbnail || null,
                podcast_url: podcast.podcast_url || null,
                publisher_name: podcast.publisher_name || null,
                itunes_rating: podcast.reach?.itunes?.itunes_rating_average || podcast.rating || null,
                episode_count: podcast.episode_count || null,
                audience_size: podcast.reach?.audience_size || podcast.audience_size || null,
                podcast_categories: podcast.podcast_categories || null,
              }
            }
            return null
          } catch (error) {
            console.error('[Get Prospect Podcasts] Error fetching podcast:', podcastId, error)
            return null
          }
        })
      )

      podcasts.push(...batchResults.filter((p): p is OutreachPodcast => p !== null))

      // Small delay between batches
      if (i + BATCH_SIZE < podcastIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    console.log('[Get Prospect Podcasts] Successfully fetched', podcasts.length, 'podcasts')

    return new Response(
      JSON.stringify({
        success: true,
        podcasts,
        total: podcasts.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Get Prospect Podcasts] Error:', error)
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
