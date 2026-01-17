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
    const { spreadsheetId, prospectDashboardId, prospectName, prospectBio, cacheOnly, skipAiAnalysis, aiAnalysisOnly, checkStatusOnly } = body

    if (!spreadsheetId) {
      return new Response(
        JSON.stringify({ error: 'Spreadsheet ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[Get Prospect Podcasts] Starting for dashboard:', prospectDashboardId, cacheOnly ? '(cache only)' : '', skipAiAnalysis ? '(skip AI)' : '')
    console.log('[Get Prospect Podcasts] Prospect name:', prospectName, '| Bio length:', prospectBio?.length || 0)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // FAST PATH: For cacheOnly mode, skip Google Sheets entirely and return cached data directly
    if (cacheOnly && prospectDashboardId) {
      console.log('[Get Prospect Podcasts] FAST PATH - querying cache directly, skipping Google Sheets')
      const { data: cached, error: cacheError } = await supabase
        .from('prospect_dashboard_podcasts')
        .select('*')
        .eq('prospect_dashboard_id', prospectDashboardId)

      if (cacheError) {
        console.error('[Get Prospect Podcasts] Cache query error:', cacheError)
        throw cacheError
      }

      console.log('[Get Prospect Podcasts] FAST PATH - returning', cached?.length || 0, 'cached podcasts')
      return new Response(
        JSON.stringify({
          success: true,
          podcasts: cached || [],
          total: cached?.length || 0,
          cached: cached?.length || 0,
          missing: 0,
          fastPath: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get Google access token and fetch podcast IDs from sheet
    const accessToken = await getGoogleAccessToken()

    // First, get the sheet metadata to find the first sheet's name (dynamic detection)
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

    console.log('[Get Prospect Podcasts] First sheet name:', firstSheetName)

    // Read column E (Podcast ID) - using dynamic sheet name
    const range = `${firstSheetName}!E:E`
    console.log('[Get Prospect Podcasts] Reading range:', range)

    const sheetResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
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

    // Clean up stale cache entries (podcasts no longer in sheet)
    if (prospectDashboardId && podcastIds.length >= 0) {
      // Get all cached podcast IDs for this dashboard
      const { data: allCached } = await supabase
        .from('prospect_dashboard_podcasts')
        .select('podcast_id')
        .eq('prospect_dashboard_id', prospectDashboardId)

      if (allCached && allCached.length > 0) {
        const sheetPodcastIds = new Set(podcastIds)
        const staleIds = allCached
          .map(p => p.podcast_id)
          .filter(id => !sheetPodcastIds.has(id))

        if (staleIds.length > 0) {
          console.log('[Get Prospect Podcasts] Removing', staleIds.length, 'stale podcasts from cache')

          // Delete stale podcasts from cache
          const { error: deleteError } = await supabase
            .from('prospect_dashboard_podcasts')
            .delete()
            .eq('prospect_dashboard_id', prospectDashboardId)
            .in('podcast_id', staleIds)

          if (deleteError) {
            console.error('[Get Prospect Podcasts] Error deleting stale cache:', deleteError)
          } else {
            console.log('[Get Prospect Podcasts] Deleted stale cache entries')
          }

          // Also delete stale feedback
          const { error: feedbackDeleteError } = await supabase
            .from('prospect_podcast_feedback')
            .delete()
            .eq('prospect_dashboard_id', prospectDashboardId)
            .in('podcast_id', staleIds)

          if (feedbackDeleteError) {
            console.error('[Get Prospect Podcasts] Error deleting stale feedback:', feedbackDeleteError)
          }
        }
      }
    }

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

    // Stats tracking
    const stats = {
      podscanFetched: 0,
      demographicsFetched: 0,
      aiAnalysesGenerated: 0,
      cachedWithAi: cachedPodcasts.filter(p => p.ai_fit_reasons && p.ai_fit_reasons.length > 0).length,
      cachedWithDemographics: cachedPodcasts.filter(p => p.demographics).length,
    }

    // Check Status Only mode - just report stats, don't fetch anything
    if (checkStatusOnly) {
      console.log('[Get Prospect Podcasts] Check Status Only mode')
      return new Response(
        JSON.stringify({
          success: true,
          status: {
            totalInSheet: podcastIds.length,
            cached: cachedPodcasts.length,
            missing: missingPodcastIds.length,
            withAi: stats.cachedWithAi,
            withoutAi: cachedPodcasts.length - stats.cachedWithAi,
            withDemographics: stats.cachedWithDemographics,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If cacheOnly mode, return cached data (publishing controlled by content_ready flag in DB)
    if (cacheOnly) {
      // Return cached podcasts - admin controls publishing via content_ready flag
      const orderedPodcasts = podcastIds
        .map(id => cachedPodcasts.find(p => p.podcast_id === id))
        .filter((p): p is CachedPodcast => p !== undefined)

      console.log('[Get Prospect Podcasts] Cache only - returning', orderedPodcasts.length, 'of', podcastIds.length, 'podcasts')
      return new Response(
        JSON.stringify({
          success: true,
          podcasts: orderedPodcasts,
          total: orderedPodcasts.length,
          cached: cachedPodcasts.length,
          missing: missingPodcastIds.length,
          stats: {
            fromSheet: podcastIds.length,
            fromCache: cachedPodcasts.length,
            cachedWithAi: stats.cachedWithAi,
            cachedWithDemographics: stats.cachedWithDemographics,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // AI Analysis Only mode - run AI on cached podcasts that don't have it
    if (aiAnalysisOnly) {
      const startTime = Date.now()
      const MAX_RUNTIME_MS = 50000
      let stoppedEarly = false

      // Find cached podcasts without AI analysis
      const podcastsNeedingAi = cachedPodcasts.filter(p => !p.ai_fit_reasons || p.ai_fit_reasons.length === 0)
      console.log('[Get Prospect Podcasts] AI Analysis Only - need to analyze', podcastsNeedingAi.length, 'podcasts')

      if (podcastsNeedingAi.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            aiComplete: true,
            analyzed: 0,
            remaining: 0,
            total: cachedPodcasts.length,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const BATCH_SIZE = 5
      let analyzedCount = 0

      for (let i = 0; i < podcastsNeedingAi.length; i += BATCH_SIZE) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          console.log('[Get Prospect Podcasts] AI Analysis stopping early, analyzed', analyzedCount, 'of', podcastsNeedingAi.length)
          stoppedEarly = true
          break
        }

        const batch = podcastsNeedingAi.slice(i, i + BATCH_SIZE)

        await Promise.all(
          batch.map(async (podcast) => {
            if (!prospectName || !prospectBio) return

            console.log('[Get Prospect Podcasts] Running AI analysis for:', podcast.podcast_name)
            const analysis = await analyzePodcastFit(
              {
                name: podcast.podcast_name,
                description: podcast.podcast_description,
                url: podcast.podcast_url,
                publisher: podcast.publisher_name,
                rating: podcast.itunes_rating,
                episodes: podcast.episode_count,
                audience: podcast.audience_size,
              },
              prospectName,
              prospectBio
            )

            if (analysis) {
              // Update the cache with AI analysis
              const { error: updateError } = await supabase
                .from('prospect_dashboard_podcasts')
                .update({
                  ai_clean_description: analysis.clean_description,
                  ai_fit_reasons: analysis.fit_reasons,
                  ai_pitch_angles: analysis.pitch_angles,
                  ai_analyzed_at: new Date().toISOString(),
                })
                .eq('prospect_dashboard_id', prospectDashboardId)
                .eq('podcast_id', podcast.podcast_id)

              if (!updateError) {
                analyzedCount++
                stats.aiAnalysesGenerated++
                console.log('[Get Prospect Podcasts] AI analysis saved for:', podcast.podcast_name)
              }
            }
          })
        )
      }

      const remaining = podcastsNeedingAi.length - analyzedCount
      return new Response(
        JSON.stringify({
          success: true,
          aiComplete: !stoppedEarly && remaining === 0,
          stoppedEarly,
          analyzed: analyzedCount,
          remaining,
          total: cachedPodcasts.length,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch missing podcasts from Podscan (+ AI analysis if not skipping)
    const newPodcasts: CachedPodcast[] = []
    const startTime = Date.now()
    const MAX_RUNTIME_MS = 50000 // 50 seconds max to avoid timeout
    let stoppedEarly = false

    if (missingPodcastIds.length > 0) {
      const podscanApiKey = Deno.env.get('PODSCAN_API_KEY')
      if (!podscanApiKey) {
        throw new Error('PODSCAN_API_KEY not configured')
      }

      const BATCH_SIZE = 5 // Process 5 podcasts in parallel
      const CONCURRENT_BATCHES = 3 // Run 3 batches concurrently = 15 podcasts at a time

      for (let i = 0; i < missingPodcastIds.length; i += BATCH_SIZE * CONCURRENT_BATCHES) {
        // Check if we're approaching timeout
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          console.log('[Get Prospect Podcasts] Stopping early to avoid timeout, processed', newPodcasts.length, 'of', missingPodcastIds.length)
          stoppedEarly = true
          break
        }

        // Create multiple batches to run concurrently
        const batchPromises: Promise<(CachedPodcast | null)[]>[] = []

        for (let b = 0; b < CONCURRENT_BATCHES; b++) {
          const startIdx = i + (b * BATCH_SIZE)
          if (startIdx >= missingPodcastIds.length) break

          const batch = missingPodcastIds.slice(startIdx, startIdx + BATCH_SIZE)

          const batchPromise = Promise.all(
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

              stats.podscanFetched++
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
                    stats.demographicsFetched++
                    console.log('[Get Prospect Podcasts] Demographics loaded:', demoData.episodes_analyzed, 'episodes')
                  }
                }
              } catch (demoErr) {
                console.log('[Get Prospect Podcasts] No demographics available')
              }

              // 3. Get AI analysis if we have prospect info (and not skipping)
              if (prospectName && prospectBio && !skipAiAnalysis) {
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
                  stats.aiAnalysesGenerated++
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

          batchPromises.push(batchPromise)
        }

        // Wait for all concurrent batches to complete
        const allBatchResults = await Promise.all(batchPromises)
        for (const batchResults of allBatchResults) {
          newPodcasts.push(...batchResults.filter((p): p is CachedPodcast => p !== null))
        }

        console.log('[Get Prospect Podcasts] Processed batch, total so far:', newPodcasts.length)
      }
    }

    // Combine cached + new podcasts, maintain order from sheet
    const allPodcastsMap = new Map<string, CachedPodcast>()
    cachedPodcasts.forEach(p => allPodcastsMap.set(p.podcast_id, p))
    newPodcasts.forEach(p => allPodcastsMap.set(p.podcast_id, p))

    const orderedPodcasts = podcastIds
      .map(id => allPodcastsMap.get(id))
      .filter((p): p is CachedPodcast => p !== undefined)

    const remaining = missingPodcastIds.length - newPodcasts.length
    console.log('[Get Prospect Podcasts] Returning', orderedPodcasts.length, 'podcasts (' + cachedPodcasts.length + ' cached, ' + newPodcasts.length + ' new)', stoppedEarly ? `- stopped early, ${remaining} remaining` : '')
    console.log('[Get Prospect Podcasts] Stats:', stats)

    return new Response(
      JSON.stringify({
        success: true,
        podcasts: orderedPodcasts,
        total: orderedPodcasts.length,
        cached: cachedPodcasts.length,
        fetched: newPodcasts.length,
        stoppedEarly,
        remaining: stoppedEarly ? remaining : 0,
        stats: {
          fromSheet: podcastIds.length,
          fromCache: cachedPodcasts.length,
          podscanFetched: stats.podscanFetched,
          aiAnalysesGenerated: stats.aiAnalysesGenerated,
          demographicsFetched: stats.demographicsFetched,
          cachedWithAi: stats.cachedWithAi,
          cachedWithDemographics: stats.cachedWithDemographics,
        },
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
