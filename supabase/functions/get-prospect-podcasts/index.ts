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

interface CachedPodcast {
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
  ai_clean_description: string | null
  ai_fit_reasons: string[] | null
  ai_pitch_angles: Array<{ title: string; description: string }> | null
  demographics: Record<string, unknown> | null
}

interface FitAnalysis {
  clean_description: string
  fit_reasons: string[]
  pitch_angles: Array<{ title: string; description: string }>
}

/**
 * Call Claude API to analyze podcast fit
 */
async function analyzePodcastFit(
  podcast: { name: string; description: string | null; url: string | null; publisher: string | null; rating: number | null; episodes: number | null; audience: number | null },
  prospectName: string,
  prospectBio: string
): Promise<FitAnalysis | null> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!anthropicApiKey) {
    console.error('[AI Analysis] ANTHROPIC_API_KEY not configured')
    return null
  }

  const podcastContext = [
    `- **Name**: ${podcast.name}`,
    podcast.description ? `- **Description**: ${podcast.description}` : null,
    podcast.url ? `- **URL**: ${podcast.url}` : null,
    podcast.publisher ? `- **Publisher/Host**: ${podcast.publisher}` : null,
    podcast.rating ? `- **iTunes Rating**: ${podcast.rating}/5` : null,
    podcast.episodes ? `- **Episode Count**: ${podcast.episodes}` : null,
    podcast.audience ? `- **Audience Size**: ${podcast.audience.toLocaleString()}` : null,
  ].filter(Boolean).join('\n')

  const prompt = `You are a podcast booking strategist analyzing why a specific podcast would be an excellent fit for a client.

## PODCAST INFORMATION
${podcastContext}

## CLIENT/PROSPECT INFORMATION
Name: ${prospectName}
Bio: ${prospectBio}

## YOUR TASK
Analyze why this podcast is a great match for this specific client.

## RESPONSE FORMAT
Return a JSON object with:
- "clean_description": A clear, concise description of what the podcast is about (1-2 sentences, no HTML)
- "fit_reasons": An array of 3-4 detailed reasons why this is a great fit (1-2 sentences each)
- "pitch_angles": An array of 3 specific episode topic ideas, each with "title" (5-8 words) and "description" (2-3 sentences)

Return ONLY valid JSON, no markdown code blocks.`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      console.error('[AI Analysis] Claude API error:', await response.text())
      return null
    }

    const data = await response.json()
    let text = ''
    for (const block of data.content) {
      if (block.type === 'text') text += block.text
    }

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    return JSON.parse(jsonMatch[0]) as FitAnalysis
  } catch (error) {
    console.error('[AI Analysis] Error:', error)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { spreadsheetId, prospectDashboardId, prospectName, prospectBio } = body

    if (!spreadsheetId) {
      return new Response(
        JSON.stringify({ error: 'Spreadsheet ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Get Prospect Podcasts] Starting for dashboard:', prospectDashboardId)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get Google access token and fetch podcast IDs from sheet
    const accessToken = await getGoogleAccessToken()
    const sheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!E:E`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )

    if (!sheetResponse.ok) {
      throw new Error(`Failed to read Google Sheet: ${await sheetResponse.text()}`)
    }

    const sheetData = await sheetResponse.json()
    const rows = sheetData.values || []
    const podcastIds: string[] = rows
      .slice(1)
      .map((row: string[]) => row[0])
      .filter((id: string) => id && id.trim() !== '')

    console.log('[Get Prospect Podcasts] Found', podcastIds.length, 'podcast IDs in sheet')

    if (podcastIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, podcasts: [], total: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check cache for existing podcasts
    let cachedPodcasts: CachedPodcast[] = []
    const cachedPodcastIds = new Set<string>()

    if (prospectDashboardId) {
      const { data: cached } = await supabase
        .from('prospect_dashboard_podcasts')
        .select('*')
        .eq('prospect_dashboard_id', prospectDashboardId)
        .in('podcast_id', podcastIds)

      if (cached && cached.length > 0) {
        cachedPodcasts = cached
        cached.forEach((p: CachedPodcast) => cachedPodcastIds.add(p.podcast_id))
        console.log('[Get Prospect Podcasts] Found', cached.length, 'cached podcasts')
      }
    }

    // Find podcasts that need to be fetched
    const missingPodcastIds = podcastIds.filter(id => !cachedPodcastIds.has(id))
    console.log('[Get Prospect Podcasts] Need to fetch', missingPodcastIds.length, 'new podcasts')

    // Fetch missing podcasts from Podscan + AI analysis
    const newPodcasts: CachedPodcast[] = []

    if (missingPodcastIds.length > 0) {
      const podscanApiKey = Deno.env.get('PODSCAN_API_KEY')
      if (!podscanApiKey) {
        throw new Error('PODSCAN_API_KEY not configured')
      }

      const BATCH_SIZE = 3 // Smaller batches for AI analysis
      for (let i = 0; i < missingPodcastIds.length; i += BATCH_SIZE) {
        const batch = missingPodcastIds.slice(i, i + BATCH_SIZE)

        const batchResults = await Promise.all(
          batch.map(async (podcastId): Promise<CachedPodcast | null> => {
            try {
              // 1. Fetch from Podscan
              console.log('[Get Prospect Podcasts] Fetching from Podscan:', podcastId)
              const podscanRes = await fetch(
                `https://podscan.fm/api/v1/podcasts/${podcastId}`,
                { headers: { 'Authorization': `Bearer ${podscanApiKey}` } }
              )

              if (!podscanRes.ok) {
                console.error('[Get Prospect Podcasts] Podscan error for', podcastId)
                return null
              }

              const podscanData = await podscanRes.json()
              const podcast = podscanData.podcast || podscanData

              const podcastData: CachedPodcast = {
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
                ai_clean_description: null,
                ai_fit_reasons: null,
                ai_pitch_angles: null,
                demographics: null,
              }

              // 2. Fetch demographics from Podscan
              try {
                console.log('[Get Prospect Podcasts] Fetching demographics for:', podcastData.podcast_name)
                const demoRes = await fetch(
                  `https://podscan.fm/api/v1/podcasts/${podcastId}/demographics`,
                  { headers: { 'Authorization': `Bearer ${podscanApiKey}` } }
                )
                if (demoRes.ok) {
                  const demoData = await demoRes.json()
                  if (demoData && demoData.episodes_analyzed) {
                    podcastData.demographics = demoData
                    console.log('[Get Prospect Podcasts] Demographics loaded:', demoData.episodes_analyzed, 'episodes')
                  }
                }
              } catch (demoErr) {
                console.log('[Get Prospect Podcasts] No demographics available')
              }

              // 3. Get AI analysis if we have prospect info
              if (prospectName && prospectBio) {
                console.log('[Get Prospect Podcasts] Getting AI analysis for:', podcastData.podcast_name)
                const analysis = await analyzePodcastFit(
                  {
                    name: podcastData.podcast_name,
                    description: podcastData.podcast_description,
                    url: podcastData.podcast_url,
                    publisher: podcastData.publisher_name,
                    rating: podcastData.itunes_rating,
                    episodes: podcastData.episode_count,
                    audience: podcastData.audience_size,
                  },
                  prospectName,
                  prospectBio
                )

                if (analysis) {
                  podcastData.ai_clean_description = analysis.clean_description
                  podcastData.ai_fit_reasons = analysis.fit_reasons
                  podcastData.ai_pitch_angles = analysis.pitch_angles
                }
              }

              // 4. Save to cache
              if (prospectDashboardId) {
                const { error: insertError } = await supabase
                  .from('prospect_dashboard_podcasts')
                  .upsert({
                    prospect_dashboard_id: prospectDashboardId,
                    podcast_id: podcastId,
                    podcast_name: podcastData.podcast_name,
                    podcast_description: podcastData.podcast_description,
                    podcast_image_url: podcastData.podcast_image_url,
                    podcast_url: podcastData.podcast_url,
                    publisher_name: podcastData.publisher_name,
                    itunes_rating: podcastData.itunes_rating,
                    episode_count: podcastData.episode_count,
                    audience_size: podcastData.audience_size,
                    podcast_categories: podcastData.podcast_categories,
                    ai_clean_description: podcastData.ai_clean_description,
                    ai_fit_reasons: podcastData.ai_fit_reasons,
                    ai_pitch_angles: podcastData.ai_pitch_angles,
                    ai_analyzed_at: podcastData.ai_clean_description ? new Date().toISOString() : null,
                    demographics: podcastData.demographics,
                  }, { onConflict: 'prospect_dashboard_id,podcast_id' })

                if (insertError) {
                  console.error('[Get Prospect Podcasts] Cache insert error:', insertError)
                } else {
                  console.log('[Get Prospect Podcasts] Cached:', podcastData.podcast_name)
                }
              }

              return podcastData
            } catch (error) {
              console.error('[Get Prospect Podcasts] Error processing:', podcastId, error)
              return null
            }
          })
        )

        newPodcasts.push(...batchResults.filter((p): p is CachedPodcast => p !== null))
      }
    }

    // Combine cached + new podcasts, maintain order from sheet
    const allPodcastsMap = new Map<string, CachedPodcast>()
    cachedPodcasts.forEach(p => allPodcastsMap.set(p.podcast_id, p))
    newPodcasts.forEach(p => allPodcastsMap.set(p.podcast_id, p))

    const orderedPodcasts = podcastIds
      .map(id => allPodcastsMap.get(id))
      .filter((p): p is CachedPodcast => p !== undefined)

    console.log('[Get Prospect Podcasts] Returning', orderedPodcasts.length, 'podcasts (' + cachedPodcasts.length + ' cached, ' + newPodcasts.length + ' new)')

    return new Response(
      JSON.stringify({
        success: true,
        podcasts: orderedPodcasts,
        total: orderedPodcasts.length,
        cached: cachedPodcasts.length,
        fetched: newPodcasts.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Get Prospect Podcasts] Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
