import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { getCachedPodcasts, batchUpsertPodcastCache, type PodcastCacheData } from '../_shared/podcastCache.ts'

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
    const { clientId } = await req.json()

    if (!clientId) {
      return new Response(
        JSON.stringify({ success: false, error: 'clientId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[READ-OUTREACH-LIST] Starting for client:', clientId)
    console.log('[READ-OUTREACH-LIST] Version: FRESH-V1 - NEW FUNCTION')

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
      console.log('[READ-OUTREACH-LIST] No Google Sheet found for client')
      return new Response(
        JSON.stringify({ success: true, podcasts: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract spreadsheet ID from URL
    const sheetUrl = client.google_sheet_url
    const spreadsheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (!spreadsheetIdMatch) {
      throw new Error('Invalid Google Sheet URL')
    }
    const spreadsheetId = spreadsheetIdMatch[1]

    console.log('[READ-OUTREACH-LIST] Reading from spreadsheet:', spreadsheetId)

    // Get Google access token
    const accessToken = await getGoogleAccessToken()

    // First, get the sheet metadata to find the first sheet's name
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
    const firstSheetName = metadata.sheets[0]?.properties?.title || 'Sheet1'

    console.log('[READ-OUTREACH-LIST] First sheet name:', firstSheetName)

    // Read column E (Podscan Podcast ID) - assuming data starts at row 2 (skip header)
    const range = `${firstSheetName}!E2:E1000` // Read up to 1000 rows
    console.log('[READ-OUTREACH-LIST] Reading range:', range)

    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
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

    console.log('[READ-OUTREACH-LIST] Raw rows returned:', rows.length)
    console.log('[READ-OUTREACH-LIST] First few rows:', JSON.stringify(rows.slice(0, 5)))

    // Extract podcast IDs (column E), filter out empty values
    const podcastIds = rows
      .map((row: string[]) => row[0]) // Column E is index 0 in our range
      .filter((id: string) => id && id.trim() !== '')

    console.log('[READ-OUTREACH-LIST] Found', podcastIds.length, 'podcast IDs')
    console.log('[READ-OUTREACH-LIST] Sample IDs:', JSON.stringify(podcastIds.slice(0, 3)))

    if (podcastIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          podcasts: [],
          total: 0,
          version: 'v4.0-deployed',
          spreadsheetId,
          sheetName: firstSheetName,
          range,
          rowsCount: rows.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check central podcasts cache first (7 days freshness)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 [CACHE CHECK] Checking central podcasts database...')
    console.log('   📋 Found', podcastIds.length, 'podcast IDs in Google Sheet')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const { cached, missing } = await getCachedPodcasts(supabase, podcastIds, 7)

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ [CACHE HIT] Found in central database:', cached.length, 'podcasts')
    console.log('⏩ [CACHE BENEFIT] Skipped Podscan API calls:', cached.length * 2)
    console.log('💰 [COST SAVINGS] Estimated savings: $' + (cached.length * 2 * 0.01).toFixed(2))
    if (cached.length > 0) {
      console.log('📋 [CACHED PODCASTS]:', cached.map((p: any) => p.podcast_name).slice(0, 5).join(', ') + (cached.length > 5 ? `... +${cached.length - 5} more` : ''))
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    if (missing.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🔄 [PODSCAN API] Need to fetch from Podscan:', missing.length, 'podcasts')
      console.log('   These podcasts are NOT in cache yet')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    } else {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🎉 [100% CACHE HIT] All podcasts served from cache!')
      console.log('   No Podscan API calls needed for this outreach list!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    }

    // Convert cached podcasts to response format
    const cachedPodcasts = cached.map(p => ({
      podcast_id: p.podscan_id,
      podcast_name: p.podcast_name,
      podcast_description: p.podcast_description || null,
      podcast_image_url: p.podcast_image_url || null,
      podcast_url: p.podcast_url || null,
      publisher_name: p.publisher_name || null,
      itunes_rating: p.itunes_rating || null,
      episode_count: p.episode_count || null,
      audience_size: p.audience_size || null,
    }))

    // Fetch missing podcasts from Podscan API
    const newlyFetchedPodcasts = []

    if (missing.length > 0) {
      console.log('[READ-OUTREACH-LIST] Fetching', missing.length, 'missing podcasts from Podscan API...')

      const podscanApiKey = Deno.env.get('PODSCAN_API_KEY')
      if (!podscanApiKey) {
        throw new Error('PODSCAN_API_KEY not configured')
      }

      // Fetch podcasts in parallel (but limit concurrency to avoid rate limiting)
      const batchSize = 5
      const podcastsToCache: PodcastCacheData[] = []
      let fetchedCount = 0

      for (let i = 0; i < missing.length; i += batchSize) {
        const batch = missing.slice(i, i + batchSize)
        const batchNum = Math.floor(i / batchSize) + 1
        const totalBatches = Math.ceil(missing.length / batchSize)

        console.log(`⏳ [BATCH ${batchNum}/${totalBatches}] Fetching podcasts ${i + 1}-${Math.min(i + batchSize, missing.length)} of ${missing.length}...`)

        const batchPromises = batch.map(async (podcastId: string) => {
          try {
            const response = await fetch(
              `https://podscan.fm/api/v1/podcasts/${podcastId}`,
              {
                headers: {
                  'Authorization': `Bearer ${podscanApiKey}`,
                },
              }
            )

            if (!response.ok) {
              console.warn('[READ-OUTREACH-LIST] Failed to fetch podcast:', podcastId)
              return null
            }

            const podcast = await response.json()

            // Prepare data for cache
            const cacheData: PodcastCacheData = {
              podscan_id: podcastId,
              podcast_name: podcast.podcast_name || 'Unknown Podcast',
              podcast_description: podcast.podcast_description || null,
              podcast_image_url: podcast.podcast_image_url || podcast.thumbnail || null,
              podcast_url: podcast.podcast_url || null,
              publisher_name: podcast.publisher_name || null,
              itunes_rating: podcast.reach?.itunes?.itunes_rating_average || podcast.itunes_rating || null,
              episode_count: podcast.episode_count || null,
              audience_size: podcast.reach?.audience_size || podcast.audience_size || null,
              podscan_email: podcast.reach?.email || null,
            }

            podcastsToCache.push(cacheData)

            return {
              podcast_id: podcastId,
              podcast_name: podcast.podcast_name || 'Unknown Podcast',
              podcast_description: podcast.podcast_description || null,
              podcast_image_url: podcast.podcast_image_url || podcast.thumbnail || null,
              podcast_url: podcast.podcast_url || null,
              publisher_name: podcast.publisher_name || null,
              itunes_rating: podcast.reach?.itunes?.itunes_rating_average || podcast.itunes_rating || null,
              episode_count: podcast.episode_count || null,
              audience_size: podcast.reach?.audience_size || podcast.audience_size || null,
              podscan_email: podcast.reach?.email || null,
            }
          } catch (error) {
            console.error('[READ-OUTREACH-LIST] Error fetching podcast:', podcastId, error)
            return null
          }
        })

        const batchResults = await Promise.all(batchPromises)
        const validResults = batchResults.filter(p => p !== null)
        newlyFetchedPodcasts.push(...validResults)
        fetchedCount += validResults.length

        console.log(`✅ [BATCH ${batchNum}/${totalBatches}] Completed! Fetched ${validResults.length} podcasts (Total: ${fetchedCount}/${missing.length})`)
      }

      // Save newly fetched podcasts to central cache (BATCH SAVE!)
      if (podcastsToCache.length > 0) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('💾 [BATCH SAVE] Saving', podcastsToCache.length, 'podcasts to central database...')
        const saveResult = await batchUpsertPodcastCache(supabase, podcastsToCache)
        if (saveResult.success) {
          console.log('✅ [BATCH SAVE SUCCESS]', podcastsToCache.length, 'podcasts now in central database!')
          console.log('🌍 [CACHE BENEFIT] These podcasts available for ALL future outreach campaigns!')
        } else {
          console.error('❌ [BATCH SAVE FAILED] Some podcasts may not have been cached')
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      }
    }

    // Combine cached + newly fetched podcasts
    const podcasts = [...cachedPodcasts, ...newlyFetchedPodcasts]

    const cacheHitRate = podcastIds.length > 0 ? ((cached.length / podcastIds.length) * 100).toFixed(1) : '0'
    const apiCallsSaved = cached.length * 2
    const apiCallsMade = missing.length * 2
    const costSavings = (apiCallsSaved * 0.01).toFixed(2)
    const costSpent = (apiCallsMade * 0.01).toFixed(2)

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 [OUTREACH LIST] Import Complete!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 SUMMARY:')
    console.log('   📋 Total podcasts in sheet:', podcastIds.length)
    console.log('   ✅ Served from cache:', cached.length, `(${cacheHitRate}%)`)
    console.log('   🆕 Newly fetched:', missing.length)
    console.log('   💾 Total returned:', podcasts.length)
    console.log('')
    console.log('💰 COST ANALYSIS:')
    console.log('   ⏩ API calls saved:', apiCallsSaved)
    console.log('   💸 API calls made:', apiCallsMade)
    console.log('   💵 Money saved: $' + costSavings)
    console.log('   💳 Money spent: $' + costSpent)
    console.log('   📈 Cache efficiency: ' + cacheHitRate + '%')
    console.log('')
    console.log('🚀 NEXT IMPORT:')
    console.log('   If you import this list again, cache hit rate will be ~100%!')
    console.log('   If other campaigns use similar podcasts, they benefit too!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return new Response(
      JSON.stringify({
        success: true,
        podcasts,
        total: podcasts.length,
        cached: cached.length,
        fetched: missing.length,
        cachePerformance: {
          cacheHitRate: parseFloat(cacheHitRate),
          apiCallsSaved: apiCallsSaved,
          apiCallsMade: apiCallsMade,
          costSavings: parseFloat(costSavings),
          costSpent: parseFloat(costSpent),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[READ-OUTREACH-LIST] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch outreach podcasts',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
