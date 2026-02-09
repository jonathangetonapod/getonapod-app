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
  podscan_email: string | null
  podcast_categories: PodcastCategory[] | null
  ai_clean_description: string | null
  ai_fit_reasons: string[] | null
  ai_pitch_angles: Array<{ title: string; description: string }> | null
  ai_analyzed_at: string | null
  demographics: Record<string, unknown> | null
  compatibility_score: number | null
  compatibility_reasoning: string | null
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

    // FAST PATH: For cacheOnly mode, try to skip Google Sheets and return cached data directly
    if (cacheOnly && prospectDashboardId) {
      console.log('[Get Prospect Podcasts] FAST PATH - querying cache directly')

      // First, check prospect_podcast_analyses for AI-analyzed podcasts
      const { data: analyses, error: analysisError } = await supabase
        .from('prospect_podcast_analyses')
        .select(`
          *,
          podcasts!inner(
            podscan_id,
            podcast_name,
            podcast_description,
            podcast_image_url,
            podcast_url,
            publisher_name,
            itunes_rating,
            episode_count,
            audience_size,
            podcast_categories,
            last_posted_at,
            demographics
          )
        `)
        .eq('prospect_dashboard_id', prospectDashboardId)

      if (analysisError) {
        console.error('[Get Prospect Podcasts] Analysis query error:', analysisError)
        throw analysisError
      }

      // If we have analyses, return them with full podcast data
      if (analyses && analyses.length > 0) {
        console.log('[Get Prospect Podcasts] FAST PATH - returning', analyses.length, 'analyzed podcasts')

        // Map to expected format
        const podcasts = analyses.map((a: any) => ({
          podcast_id: a.podcasts.podscan_id,
          podcast_name: a.podcasts.podcast_name,
          podcast_description: a.podcasts.podcast_description,
          podcast_image_url: a.podcasts.podcast_image_url,
          podcast_url: a.podcasts.podcast_url,
          publisher_name: a.podcasts.publisher_name,
          itunes_rating: a.podcasts.itunes_rating,
          episode_count: a.podcasts.episode_count,
          audience_size: a.podcasts.audience_size,
          podcast_categories: a.podcasts.podcast_categories,
          last_posted_at: a.podcasts.last_posted_at,
          demographics: a.podcasts.demographics,
          ai_clean_description: a.ai_clean_description,
          ai_fit_reasons: a.ai_fit_reasons,
          ai_pitch_angles: a.ai_pitch_angles,
          ai_analyzed_at: a.ai_analyzed_at,
        }))

        return new Response(
          JSON.stringify({
            success: true,
            podcasts,
            total: podcasts.length,
            cached: podcasts.length,
            missing: 0,
            fastPath: true,
            hasAiAnalysis: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // NO ANALYSES YET - Fall back to Google Sheet + central cache
      console.log('[Get Prospect Podcasts] FAST PATH - no analyses found, falling back to Sheet + central cache')

      // Get access token and read Google Sheet
      const accessToken = await getGoogleAccessToken()

      // Get sheet metadata
      const metaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )
      if (!metaRes.ok) {
        console.error('[Get Prospect Podcasts] Sheet metadata error:', await metaRes.text())
        return new Response(
          JSON.stringify({ error: 'Spreadsheet not found or not accessible' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const meta = await metaRes.json()
      const sheetName = meta.sheets[0]?.properties?.title || 'Sheet1'

      // Read podcast IDs + compatibility scores from columns E:G
      const sheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!E:G`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      )
      if (!sheetRes.ok) {
        throw new Error(`Failed to read Google Sheet: ${await sheetRes.text()}`)
      }
      const sheetData = await sheetRes.json()
      const sheetRows = (sheetData.values || []).slice(1)
      const podcastIds: string[] = sheetRows
        .map((row: string[]) => row[0])
        .filter((id: string) => id && id.trim() !== '')
      const sheetScores = new Map<string, { score: number | null; reasoning: string | null }>()
      for (const row of sheetRows) {
        const id = row[0]?.trim()
        if (id) {
          sheetScores.set(id, {
            score: row[1] ? parseInt(row[1], 10) || null : null,
            reasoning: row[2] || null,
          })
        }
      }

      console.log('[Get Prospect Podcasts] FAST PATH - found', podcastIds.length, 'podcast IDs in sheet')

      if (podcastIds.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            podcasts: [],
            total: 0,
            cached: 0,
            missing: 0,
            fastPath: true,
            hasAiAnalysis: false,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Query central podcasts table
      const { data: centralPodcasts, error: centralError } = await supabase
        .from('podcasts')
        .select('*')
        .in('podscan_id', podcastIds)

      if (centralError) {
        console.error('[Get Prospect Podcasts] Central cache query error:', centralError)
        throw centralError
      }

      // Map to expected format (no AI analysis)
      const podcastMap = new Map((centralPodcasts || []).map((p: any) => [p.podscan_id, p]))
      const podcasts = podcastIds
        .map(id => podcastMap.get(id))
        .filter((p): p is any => p !== undefined)
        .map((p: any) => ({
          podcast_id: p.podscan_id,
          podcast_name: p.podcast_name,
          podcast_description: p.podcast_description,
          podcast_image_url: p.podcast_image_url,
          podcast_url: p.podcast_url,
          publisher_name: p.publisher_name,
          itunes_rating: p.itunes_rating,
          episode_count: p.episode_count,
          audience_size: p.audience_size,
          podcast_categories: p.podcast_categories,
          last_posted_at: p.last_posted_at,
          demographics: p.demographics,
          ai_clean_description: null,
          ai_fit_reasons: null,
          ai_pitch_angles: null,
          ai_analyzed_at: null,
        }))

      console.log('[Get Prospect Podcasts] FAST PATH - returning', podcasts.length, 'podcasts from central cache (no AI yet)')

      return new Response(
        JSON.stringify({
          success: true,
          podcasts,
          total: podcasts.length,
          cached: podcasts.length,
          missing: podcastIds.length - podcasts.length,
          fastPath: true,
          hasAiAnalysis: false,
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
      console.error('[Get Prospect Podcasts] Sheet metadata error:', await metadataResponse.text())
      return new Response(
        JSON.stringify({ error: 'Spreadsheet not found or not accessible' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const metadata = await metadataResponse.json()
    const firstSheetName = metadata.sheets[0]?.properties?.title || 'Sheet1'

    console.log('[Get Prospect Podcasts] First sheet name:', firstSheetName)

    // Read columns E:G (Podcast ID, Compatibility Score, Compatibility Reasoning)
    const range = `${firstSheetName}!E:G`
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
    const dataRows = rows.slice(1)
    const podcastIds: string[] = dataRows
      .map((row: string[]) => row[0])
      .filter((id: string) => id && id.trim() !== '')
    const sheetScores = new Map<string, { score: number | null; reasoning: string | null }>()
    for (const row of dataRows) {
      const id = row[0]?.trim()
      if (id) {
        sheetScores.set(id, {
          score: row[1] ? parseInt(row[1], 10) || null : null,
          reasoning: row[2] || null,
        })
      }
    }

    console.log('[Get Prospect Podcasts] Found', podcastIds.length, 'podcast IDs in sheet')

    // Clean up stale cache entries (podcasts no longer in sheet)
    if (prospectDashboardId && podcastIds.length >= 0) {
      // Get all cached podcast IDs for this dashboard from central podcasts table via analyses
      const { data: allCached } = await supabase
        .from('prospect_podcast_analyses')
        .select('podcast_id, podcasts!inner(podscan_id)')
        .eq('prospect_dashboard_id', prospectDashboardId)

      if (allCached && allCached.length > 0) {
        const sheetPodcastIds = new Set(podcastIds)
        const staleEntries = allCached
          .filter((entry: any) => !sheetPodcastIds.has(entry.podcasts.podscan_id))

        if (staleEntries.length > 0) {
          console.log('[Get Prospect Podcasts] Removing', staleEntries.length, 'stale podcast analyses')

          const staleAnalysisIds = staleEntries.map((entry: any) => entry.podcast_id)

          // Delete stale analyses
          const { error: deleteError } = await supabase
            .from('prospect_podcast_analyses')
            .delete()
            .eq('prospect_dashboard_id', prospectDashboardId)
            .in('podcast_id', staleAnalysisIds)

          if (deleteError) {
            console.error('[Get Prospect Podcasts] Error deleting stale analyses:', deleteError)
          } else {
            console.log('[Get Prospect Podcasts] Deleted stale analysis entries')
          }

          // Also delete stale feedback
          const { error: feedbackDeleteError } = await supabase
            .from('prospect_podcast_feedback')
            .delete()
            .eq('prospect_dashboard_id', prospectDashboardId)
            .in('podcast_id', staleAnalysisIds)

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

    // Check CENTRAL podcasts cache (shared across all clients and prospects!)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 [CACHE CHECK] Checking central podcasts database...')
    console.log('   Requested podcasts:', podcastIds.length)
    console.log('   For prospect:', prospectDashboardId?.substring(0, 8) + '...')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const { cached: centralCached, missing: centralMissing } = await getCachedPodcasts(supabase, podcastIds, 7)

    // Map central cache to CachedPodcast format for compatibility
    let cachedPodcasts: CachedPodcast[] = centralCached.map((p: any) => {
      const scores = sheetScores.get(p.podscan_id)
      return {
        podcast_id: p.podscan_id,
        podcast_name: p.podcast_name,
        podcast_description: p.podcast_description,
        podcast_image_url: p.podcast_image_url,
        podcast_url: p.podcast_url,
        publisher_name: p.publisher_name,
        itunes_rating: p.itunes_rating,
        episode_count: p.episode_count,
        audience_size: p.audience_size,
        podcast_categories: p.podcast_categories,
        demographics: p.demographics,
        ai_clean_description: null,  // Will load from prospect_podcast_analyses if needed
        ai_fit_reasons: null,
        ai_pitch_angles: null,
        ai_analyzed_at: null,
        compatibility_score: scores?.score ?? null,
        compatibility_reasoning: scores?.reasoning ?? null,
      }
    })

    const cachedPodcastIds = new Set<string>(centralCached.map((p: any) => p.podscan_id))

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ [CACHE HIT] Found in central database:', centralCached.length, 'podcasts')
    console.log('⏩ [CACHE BENEFIT] Skipped Podscan API calls:', centralCached.length * 2)
    console.log('💰 [COST SAVINGS] Estimated savings: $' + (centralCached.length * 2 * 0.01).toFixed(2))
    console.log('🌍 [PUBLIC BENEFIT] These podcasts available for ALL prospects!')
    if (centralCached.length > 0) {
      console.log('📋 [CACHED PODCASTS]:', centralCached.map((p: any) => p.podcast_name).slice(0, 5).join(', ') + (centralCached.length > 5 ? '...' : ''))
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Load AI analyses from prospect_podcast_analyses table (prospect-specific)
    if (prospectDashboardId && cachedPodcasts.length > 0) {
      const { data: analyses } = await supabase
        .from('prospect_podcast_analyses')
        .select('*')
        .eq('prospect_dashboard_id', prospectDashboardId)
        .in('podcast_id', centralCached.map((p: any) => p.id))

      if (analyses && analyses.length > 0) {
        console.log('[Get Prospect Podcasts] Loaded', analyses.length, 'AI analyses from prospect_podcast_analyses')
        const analysisMap = new Map(analyses.map((a: any) => [a.podcast_id, a]))

        cachedPodcasts = cachedPodcasts.map(p => {
          const centralPodcast = centralCached.find((cp: any) => cp.podscan_id === p.podcast_id)
          const analysis = centralPodcast ? analysisMap.get(centralPodcast.id) : null

          if (analysis) {
            return {
              ...p,
              ai_clean_description: analysis.ai_clean_description,
              ai_fit_reasons: analysis.ai_fit_reasons,
              ai_pitch_angles: analysis.ai_pitch_angles,
              ai_analyzed_at: analysis.ai_analyzed_at,
            }
          }
          return p
        })
      }
    }

    // Find podcasts that need to be fetched from Podscan
    const missingPodcastIds = centralMissing

    if (missingPodcastIds.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🔄 [PODSCAN API] Need to fetch from Podscan:', missingPodcastIds.length, 'podcasts')
      console.log('   These podcasts are NOT in cache yet')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    } else {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🎉 [100% CACHE HIT] All podcasts served from cache!')
      console.log('   No Podscan API calls needed!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    }

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
          podcastIds: podcastIds, // Return array of IDs for frontend cache check
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
      // Validate required fields for AI analysis
      if (!prospectName || !prospectBio || prospectBio.trim() === '') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Prospect name and bio are required for AI analysis. Please add a bio to the prospect profile.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const startTime = Date.now()
      const MAX_RUNTIME_MS = 50000
      let stoppedEarly = false

      // Find cached podcasts without AI analysis (check ai_analyzed_at to prevent re-analyzing)
      const podcastsNeedingAi = cachedPodcasts.filter(p => !p.ai_analyzed_at)
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

      // Pre-fetch all podcast UUIDs in one query (instead of N individual SELECTs)
      const { data: podcastIdRows } = await supabase
        .from('podcasts')
        .select('id, podscan_id')
        .in('podscan_id', podcastsNeedingAi.map(p => p.podcast_id))

      const uuidMap = new Map<string, string>(
        (podcastIdRows || []).map((p: any) => [p.podscan_id, p.id])
      )
      console.log('[Get Prospect Podcasts] Pre-fetched', uuidMap.size, 'podcast UUIDs for AI analysis')

      const BATCH_SIZE = 10 // Process 10 podcasts per batch
      const CONCURRENT_BATCHES = 3 // Run 3 batches concurrently = 30 podcasts at a time
      let analyzedCount = 0

      for (let i = 0; i < podcastsNeedingAi.length; i += BATCH_SIZE * CONCURRENT_BATCHES) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          console.log('[Get Prospect Podcasts] AI Analysis stopping early, analyzed', analyzedCount, 'of', podcastsNeedingAi.length)
          stoppedEarly = true
          break
        }

        // Create multiple batches to run concurrently
        const batchPromises: Promise<void>[] = []

        for (let b = 0; b < CONCURRENT_BATCHES; b++) {
          const startIdx = i + (b * BATCH_SIZE)
          if (startIdx >= podcastsNeedingAi.length) break

          const batch = podcastsNeedingAi.slice(startIdx, startIdx + BATCH_SIZE)

          const batchPromise = Promise.all(
            batch.map(async (podcast) => {
              try {
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

                // Get central podcast ID from pre-fetched map
                const centralPodcastId = uuidMap.get(podcast.podcast_id)

                if (!centralPodcastId) {
                  console.error('[Get Prospect Podcasts] Central podcast not found for:', podcast.podcast_id)
                  return
                }

                // Save AI analysis to prospect_podcast_analyses table
                const updateData: any = {
                  prospect_dashboard_id: prospectDashboardId,
                  podcast_id: centralPodcastId,
                  ai_analyzed_at: new Date().toISOString(),
                }

                if (analysis) {
                  updateData.ai_clean_description = analysis.clean_description
                  updateData.ai_fit_reasons = analysis.fit_reasons
                  updateData.ai_pitch_angles = analysis.pitch_angles
                }

                const { error: updateError } = await supabase
                  .from('prospect_podcast_analyses')
                  .upsert(updateData, { onConflict: 'prospect_dashboard_id,podcast_id' })

                if (!updateError) {
                  analyzedCount++
                  if (analysis) {
                    stats.aiAnalysesGenerated++
                  }
                  console.log('[Get Prospect Podcasts] ✅ AI analysis saved to prospect_podcast_analyses:', podcast.podcast_name)
                } else {
                  console.error('[Get Prospect Podcasts] Failed to save AI analysis:', podcast.podcast_name, updateError)
                }
              } catch (error) {
                console.error('[Get Prospect Podcasts] Error analyzing podcast:', podcast.podcast_name, error)
                // Mark as analyzed even on error to prevent infinite retries
                const centralPodcastId = uuidMap.get(podcast.podcast_id)

                if (centralPodcastId) {
                  await supabase
                    .from('prospect_podcast_analyses')
                    .upsert({
                      prospect_dashboard_id: prospectDashboardId,
                      podcast_id: centralPodcastId,
                      ai_analyzed_at: new Date().toISOString(),
                    }, { onConflict: 'prospect_dashboard_id,podcast_id' })
                }
                analyzedCount++
              }
            })
          ).then(() => {})

          batchPromises.push(batchPromise)
        }

        // Wait for all concurrent batches to complete
        await Promise.all(batchPromises)

        console.log('[Get Prospect Podcasts] Completed concurrent batch processing, analyzed', analyzedCount, 'so far')
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
              // 1. Fetch podcast data + demographics from Podscan in parallel
              console.log('[Get Prospect Podcasts] Fetching from Podscan:', podcastId)
              const [podscanRes, demoRes] = await Promise.all([
                fetch(
                  `https://podscan.fm/api/v1/podcasts/${podcastId}`,
                  { headers: { 'Authorization': `Bearer ${podscanApiKey}` } }
                ),
                fetch(
                  `https://podscan.fm/api/v1/podcasts/${podcastId}/demographics`,
                  { headers: { 'Authorization': `Bearer ${podscanApiKey}` } }
                ).catch(() => null),
              ])

              if (!podscanRes.ok) {
                console.error('[Get Prospect Podcasts] Podscan error for', podcastId)
                return null
              }

              stats.podscanFetched++
              const podscanData = await podscanRes.json()
              const podcast = podscanData.podcast || podscanData

              // Process demographics response
              let demographics: Record<string, unknown> | null = null
              if (demoRes && demoRes.ok) {
                try {
                  const demoData = await demoRes.json()
                  if (demoData && demoData.episodes_analyzed) {
                    demographics = demoData
                    stats.demographicsFetched++
                    console.log('[Get Prospect Podcasts] Demographics loaded:', demoData.episodes_analyzed, 'episodes')
                  }
                } catch {
                  console.log('[Get Prospect Podcasts] No demographics available')
                }
              }

              const podcastScores = sheetScores.get(podcastId)
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
                podscan_email: podcast.reach?.email || null,
                podcast_categories: podcast.podcast_categories || null,
                ai_clean_description: null,
                ai_fit_reasons: null,
                ai_pitch_angles: null,
                ai_analyzed_at: null,
                demographics,
                compatibility_score: podcastScores?.score ?? null,
                compatibility_reasoning: podcastScores?.reasoning ?? null,
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

      // Batch save all new podcasts to central cache (single upsert instead of N individual ones)
      if (newPodcasts.length > 0) {
        const cacheDataBatch: PodcastCacheData[] = newPodcasts.map(p => ({
          podscan_id: p.podcast_id,
          podcast_name: p.podcast_name,
          podcast_description: p.podcast_description || undefined,
          podcast_image_url: p.podcast_image_url || undefined,
          podcast_url: p.podcast_url || undefined,
          publisher_name: p.publisher_name || undefined,
          itunes_rating: p.itunes_rating ? parseFloat(p.itunes_rating as any) : undefined,
          episode_count: p.episode_count || undefined,
          audience_size: p.audience_size || undefined,
          podscan_email: p.podscan_email || undefined,
          podcast_categories: p.podcast_categories || undefined,
          demographics: p.demographics || undefined,
          demographics_episodes_analyzed: (p.demographics as any)?.episodes_analyzed,
        }))

        const { success: batchSuccess, count: batchCount } = await batchUpsertPodcastCache(supabase, cacheDataBatch)
        if (batchSuccess) {
          console.log('💾 [BATCH SAVED TO CENTRAL DB]', batchCount, 'podcasts → Now available for ALL prospects!')
        } else {
          console.error('❌ [BATCH CACHE SAVE FAILED]')
        }

        // Batch save AI analyses to prospect_podcast_analyses (single upsert)
        if (prospectDashboardId) {
          const podcastsWithAi = newPodcasts.filter(p => p.ai_clean_description || p.ai_fit_reasons || p.ai_pitch_angles)

          if (podcastsWithAi.length > 0) {
            // Get UUID mappings for all new podcasts in one query
            const { data: newPodcastIdRows } = await supabase
              .from('podcasts')
              .select('id, podscan_id')
              .in('podscan_id', podcastsWithAi.map(p => p.podcast_id))

            const newUuidMap = new Map<string, string>(
              (newPodcastIdRows || []).map((p: any) => [p.podscan_id, p.id])
            )

            const analysisRows = podcastsWithAi
              .filter(p => newUuidMap.has(p.podcast_id))
              .map(p => ({
                prospect_dashboard_id: prospectDashboardId,
                podcast_id: newUuidMap.get(p.podcast_id)!,
                ai_clean_description: p.ai_clean_description,
                ai_fit_reasons: p.ai_fit_reasons,
                ai_pitch_angles: p.ai_pitch_angles,
                ai_analyzed_at: new Date().toISOString(),
              }))

            if (analysisRows.length > 0) {
              const { error: analysisError } = await supabase
                .from('prospect_podcast_analyses')
                .upsert(analysisRows, { onConflict: 'prospect_dashboard_id,podcast_id' })

              if (analysisError) {
                console.error('❌ [BATCH AI ANALYSIS SAVE FAILED]', analysisError)
              } else {
                console.log('🤖 [BATCH SAVED AI ANALYSES]', analysisRows.length, 'for prospect:', prospectName?.substring(0, 30))
              }
            }
          }
        }
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
    const cacheHitRate = podcastIds.length > 0 ? ((cachedPodcasts.length / podcastIds.length) * 100).toFixed(1) : '0'
    const apiCallsSaved = cachedPodcasts.length * 2
    const costSavings = (apiCallsSaved * 0.01).toFixed(2)

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 [FINAL SUMMARY] Request complete!')
    console.log('   Total podcasts returned:', orderedPodcasts.length)
    console.log('   ✅ From cache:', cachedPodcasts.length, `(${cacheHitRate}%)`)
    console.log('   🆕 Newly fetched:', newPodcasts.length)
    console.log('   💰 API calls saved:', apiCallsSaved)
    console.log('   💵 Cost savings: $' + costSavings)
    console.log('   🌍 PUBLIC DASHBOARD: Cache benefits all prospects!')
    if (stoppedEarly) {
      console.log('   ⏸️  Stopped early:', remaining, 'remaining')
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    return new Response(
      JSON.stringify({
        success: true,
        podcasts: orderedPodcasts,
        total: orderedPodcasts.length,
        cached: cachedPodcasts.length,
        fetched: newPodcasts.length,
        stoppedEarly,
        remaining: stoppedEarly ? remaining : 0,
        cachePerformance: {
          cacheHitRate: parseFloat(cacheHitRate),
          apiCallsSaved: apiCallsSaved,
          costSavings: parseFloat(costSavings),
        },
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
