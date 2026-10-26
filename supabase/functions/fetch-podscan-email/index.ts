import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  createAdminClient,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requirePlatformAdmin,
} from '../_shared/workspaceAuth.ts'
import { isPodscanId, podscanFetch, podscanPodcastPayload } from '../_shared/podscan.ts'

const METHODS = ['POST'] as const
const NEGATIVE_CACHE_DAYS = 30

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }
    await requirePlatformAdmin(req)
    const body = await parseJsonObject(req)
    // The id goes into the Podscan URL path, so it must be a bare id and not
    // something like "../" that reaches a different endpoint.
    if (!isPodscanId(body.podcast_id)) {
      throw new HttpError(400, 'INVALID_FIELD', 'podcast_id is invalid')
    }
    const podcast_id = body.podcast_id

    const supabase = createAdminClient()

    // The canonical catalog is the primary free-email cache. The legacy table
    // remains during the transition and is reflected back into the catalog.
    const [catalogResult, legacyCacheResult] = await Promise.all([
      supabase
        .from('podcasts')
        .select('id,podscan_id,podcast_name,podscan_email,podscan_last_fetched_at')
        .eq('podscan_id', podcast_id)
        .maybeSingle(),
      supabase
        .from('podcast_emails')
        .select('email,fetched_at')
        .eq('podcast_id', podcast_id)
        .maybeSingle(),
    ])
    if (catalogResult.error) throw catalogResult.error
    if (legacyCacheResult.error) throw legacyCacheResult.error


    const canonicalEmail = optionalText(catalogResult.data?.podscan_email)
    if (canonicalEmail) {
      console.log('[Fetch Podscan Email] Free Podscan email found in global catalog')
      return jsonResponse(req, METHODS, 200, {
        success: true,
        email: canonicalEmail,
        podcast_id,
        cached: true,
        global: true,
        contact_type: 'podscan_free',
        fetched_at: catalogResult.data?.podscan_last_fetched_at,
      })
    }

    const legacyEmail = optionalText(legacyCacheResult.data?.email)
    if (legacyEmail && catalogResult.data?.id) {
      const { error: syncError } = await supabase
        .from('podcasts')
        .update({ podscan_email: legacyEmail.toLowerCase(), updated_at: new Date().toISOString() })
        .eq('id', catalogResult.data.id)
      if (syncError) throw syncError
      return jsonResponse(req, METHODS, 200, {
        success: true,
        email: legacyEmail,
        podcast_id,
        cached: true,
        global: true,
        contact_type: 'podscan_free',
        fetched_at: legacyCacheResult.data?.fetched_at,
      })
    }

    const negativeFetchedAt = legacyCacheResult.data?.fetched_at
      ? new Date(legacyCacheResult.data.fetched_at)
      : null
    if (
      legacyCacheResult.data
      && !legacyEmail
      && negativeFetchedAt
      && !Number.isNaN(negativeFetchedAt.getTime())
      && Date.now() - negativeFetchedAt.getTime() < NEGATIVE_CACHE_DAYS * 24 * 60 * 60 * 1_000
    ) {
      return jsonResponse(req, METHODS, 200, {
        success: true,
        email: null,
        podcast_id,
        cached: true,
        global: true,
        contact_type: 'podscan_free',
        fetched_at: legacyCacheResult.data.fetched_at,
      })
    }

    // Not in cache, fetch from Podscan API
    const { data } = await podscanFetch(`/podcasts/${encodeURIComponent(podcast_id)}`, { retries: 1 })
    const podcast = podscanPodcastPayload(data)

    // Extract email from reach.email field
    const reach = podcast.reach && typeof podcast.reach === 'object' && !Array.isArray(podcast.reach)
      ? podcast.reach as Record<string, unknown>
      : {}
    const email = optionalText(reach.email)?.toLowerCase() || null

    console.log('[Fetch Podscan Email] Email fetched from API:', email ? 'Yes' : 'No')

    const now = new Date().toISOString()
    let canonicalPodcastId = catalogResult.data?.id || null
    if (canonicalPodcastId) {
      const { error: updateError } = await supabase
        .from('podcasts')
        .update({
          podscan_email: email,
          podscan_last_fetched_at: now,
          updated_at: now,
        })
        .eq('id', canonicalPodcastId)
      if (updateError) throw updateError
    } else {
      const podcastName = optionalText(podcast.podcast_name)
        || optionalText(podcast.name)
        || optionalText(podcast.title)
      if (!podcastName) throw new HttpError(502, 'PODSCAN_INVALID_RESPONSE', 'Podscan returned a podcast without a name')
      const { data: insertedPodcast, error: insertPodcastError } = await supabase
        .from('podcasts')
        .upsert({
          podscan_id: podcast_id,
          podcast_name: podcastName,
          podcast_description: optionalText(podcast.podcast_description) || optionalText(podcast.description),
          podcast_image_url: optionalText(podcast.podcast_image_url) || optionalText(podcast.image_url),
          podcast_url: optionalText(podcast.podcast_url) || optionalText(podcast.url),
          publisher_name: optionalText(podcast.publisher_name) || optionalText(podcast.publisher),
          host_name: optionalText(podcast.host_name),
          podscan_email: email,
          rss_url: optionalText(podcast.rss_url),
          podscan_last_fetched_at: now,
          updated_at: now,
        }, { onConflict: 'podscan_id' })
        .select('id')
        .single()
      if (insertPodcastError || !insertedPodcast) throw insertPodcastError || new Error('Podcast could not be added to the global catalog')
      canonicalPodcastId = insertedPodcast.id
    }

    const { error: cacheError } = await supabase
      .from('podcast_emails')
      .upsert({
        podcast_id,
        email,
        source: 'podscan',
        fetched_at: now,
        updated_at: now,
      }, { onConflict: 'podcast_id' })
    if (cacheError) throw cacheError

    console.log('[Fetch Podscan Email] Free email saved to the global catalog')

    return jsonResponse(req, METHODS, 200, {
      success: true,
      email,
      podcast_id,
      cached: false,
      global: true,
      contact_type: 'podscan_free',
    })
  } catch (error) {
    // Same { success: false, error } body as before, now with the real status
    // (a Podscan outage is a 502, not a bad request) and a code. Database
    // errors are logged, not echoed.
    if (error instanceof HttpError) {
      console.error('[Fetch Podscan Email] Error:', error.code)
      return jsonResponse(req, METHODS, error.status, { success: false, error: error.message, code: error.code })
    }
    console.error('[Fetch Podscan Email] Unexpected error')
    return jsonResponse(req, METHODS, 500, {
      success: false,
      error: 'Something went wrong on our side. Try again in a moment',
      code: 'INTERNAL_ERROR',
    })
  }
})
