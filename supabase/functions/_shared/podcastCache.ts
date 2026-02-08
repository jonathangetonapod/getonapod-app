/**
 * Centralized Podcast Cache Management
 *
 * This module provides utilities for managing the centralized podcasts database.
 * Saves 60-80% on Podscan API calls by deduplicating podcast data across clients/prospects.
 * Automatically generates OpenAI embeddings for new podcasts to enable vector search.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Build text representation of a podcast for embedding generation.
 * Matches the format used by scripts/generate-podcast-embeddings.ts
 */
export function createPodcastEmbeddingText(podcast: PodcastCacheData): string {
  const parts: string[] = [];

  if (podcast.podcast_name) {
    parts.push(`Title: ${podcast.podcast_name}`);
  }
  if (podcast.podcast_description) {
    parts.push(`Description: ${podcast.podcast_description.substring(0, 500)}`);
  }
  if (Array.isArray(podcast.podcast_categories)) {
    const categories = podcast.podcast_categories
      .map((c: any) => c.category_name)
      .filter(Boolean)
      .join(', ');
    if (categories) {
      parts.push(`Categories: ${categories}`);
    }
  }
  if (podcast.host_name) {
    parts.push(`Host: ${podcast.host_name}`);
  }
  if (podcast.publisher_name) {
    parts.push(`Publisher: ${podcast.publisher_name}`);
  }
  if (podcast.language) {
    parts.push(`Language: ${podcast.language}`);
  }
  if (podcast.region) {
    parts.push(`Region: ${podcast.region}`);
  }

  return parts.join('. ');
}

/**
 * Generate embeddings for podcasts that don't have one yet.
 * Runs as fire-and-forget after upsert operations.
 */
export async function generateMissingEmbeddings(
  supabaseClient: any,
  podscanIds: string[]
): Promise<number> {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    console.warn('[Podcast Cache] OPENAI_API_KEY not set, skipping embedding generation');
    return 0;
  }

  // Find podcasts that were just upserted but have no embedding
  const { data: needsEmbedding, error } = await supabaseClient
    .from('podcasts')
    .select('id, podscan_id, podcast_name, podcast_description, podcast_categories, publisher_name, host_name, language, region')
    .in('podscan_id', podscanIds)
    .is('embedding', null);

  if (error || !needsEmbedding || needsEmbedding.length === 0) {
    return 0;
  }

  console.log(`[Podcast Cache] 🔮 Generating embeddings for ${needsEmbedding.length} new podcasts...`);

  let generated = 0;
  for (const podcast of needsEmbedding) {
    const text = createPodcastEmbeddingText(podcast);
    if (!text || text.trim().length < 10) continue;

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text,
          dimensions: EMBEDDING_DIMENSIONS
        })
      });

      if (!response.ok) {
        console.error(`[Podcast Cache] Embedding API error for ${podcast.podcast_name}:`, await response.text());
        continue;
      }

      const embeddingData = await response.json();
      const embedding = embeddingData.data[0].embedding;

      const { error: updateError } = await supabaseClient
        .from('podcasts')
        .update({
          embedding,
          embedding_generated_at: new Date().toISOString(),
          embedding_model: EMBEDDING_MODEL,
          embedding_text_length: text.length,
        })
        .eq('id', podcast.id);

      if (updateError) {
        console.error(`[Podcast Cache] Failed to save embedding for ${podcast.podcast_name}:`, updateError);
      } else {
        generated++;
      }
    } catch (err) {
      console.error(`[Podcast Cache] Embedding error for ${podcast.podcast_name}:`, err);
    }
  }

  console.log(`[Podcast Cache] 🔮 Generated ${generated}/${needsEmbedding.length} embeddings`);
  return generated;
}

export interface PodcastCacheData {
  podscan_id: string;
  podcast_name: string;
  podcast_description?: string;
  podcast_image_url?: string;
  podcast_url?: string;
  publisher_name?: string;
  host_name?: string;
  podcast_categories?: any;
  language?: string;
  region?: string;
  episode_count?: number;
  last_posted_at?: string;
  is_active?: boolean;
  podcast_has_guests?: boolean;
  podcast_has_sponsors?: boolean;
  itunes_rating?: number;
  itunes_rating_count?: number;
  audience_size?: number;
  podcast_reach_score?: number;
  podscan_email?: string;
  website?: string;
  rss_url?: string;
  demographics?: any;
  demographics_episodes_analyzed?: number;
}

export interface CachedPodcast extends PodcastCacheData {
  id: string;
  podscan_last_fetched_at: string;
  podscan_fetch_count: number;
  cache_hit_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Get podcasts from central cache
 * Returns cached podcasts and identifies which ones are missing/stale
 */
export async function getCachedPodcasts(
  supabaseClient: any,
  podcastIds: string[],
  staleDays: number = 7
): Promise<{
  cached: CachedPodcast[];
  missing: string[];
  stale: string[];
}> {
  // Fetch from central cache
  const { data: cachedPodcasts, error } = await supabaseClient
    .from('podcasts')
    .select('*')
    .in('podscan_id', podcastIds);

  if (error) {
    console.error('[Podcast Cache] Error fetching cached podcasts:', error);
    return { cached: [], missing: podcastIds, stale: [] };
  }

  const cached = cachedPodcasts || [];
  const cachedIds = new Set(cached.map((p: CachedPodcast) => p.podscan_id));

  // Identify missing podcasts
  const missing = podcastIds.filter(id => !cachedIds.has(id));

  // Identify stale podcasts (older than staleDays)
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - staleDays);

  const stale = cached
    .filter((p: CachedPodcast) => {
      const lastFetched = new Date(p.podscan_last_fetched_at);
      return lastFetched < staleThreshold;
    })
    .map((p: CachedPodcast) => p.podscan_id);

  // Increment cache hit counters for successfully cached items
  const hitIds = cached
    .filter((p: CachedPodcast) => {
      const lastFetched = new Date(p.podscan_last_fetched_at);
      return lastFetched >= staleThreshold;  // Not stale = cache hit
    })
    .map((p: CachedPodcast) => p.podscan_id);

  if (hitIds.length > 0) {
    // Batch increment cache hit counters (single UPDATE instead of N RPCs)
    supabaseClient.rpc('batch_increment_podcast_cache_hits', { p_podscan_ids: hitIds })
      .then(() => console.log(`[Podcast Cache] ✅ Cache hits: ${hitIds.length}`))
      .catch((err: any) => console.error('[Podcast Cache] Error incrementing cache hits:', err));
  }

  console.log(`[Podcast Cache] 📊 Cached: ${cached.length}, Missing: ${missing.length}, Stale: ${stale.length}`);

  return { cached, missing, stale };
}

/**
 * Upsert podcast data into central cache
 * Creates new entry or updates existing one
 *
 * Note: podscan_fetch_count is automatically incremented by database trigger
 * when podscan_last_fetched_at is updated (see migration 20260125_auto_increment_fetch_count.sql)
 */
export async function upsertPodcastCache(
  supabaseClient: any,
  podcastData: PodcastCacheData
): Promise<{ success: boolean; podcast_id?: string; error?: any }> {
  const { data, error } = await supabaseClient
    .from('podcasts')
    .upsert({
      podscan_id: podcastData.podscan_id,
      podcast_name: podcastData.podcast_name,
      podcast_description: podcastData.podcast_description,
      podcast_image_url: podcastData.podcast_image_url,
      podcast_url: podcastData.podcast_url,
      publisher_name: podcastData.publisher_name,
      host_name: podcastData.host_name,
      podcast_categories: podcastData.podcast_categories,
      language: podcastData.language,
      region: podcastData.region,
      episode_count: podcastData.episode_count,
      last_posted_at: podcastData.last_posted_at,
      is_active: podcastData.is_active ?? true,
      podcast_has_guests: podcastData.podcast_has_guests,
      podcast_has_sponsors: podcastData.podcast_has_sponsors,
      itunes_rating: podcastData.itunes_rating,
      itunes_rating_count: podcastData.itunes_rating_count,
      audience_size: podcastData.audience_size,
      podcast_reach_score: podcastData.podcast_reach_score,
      podscan_email: podcastData.podscan_email,
      website: podcastData.website,
      rss_url: podcastData.rss_url,
      demographics: podcastData.demographics,
      demographics_episodes_analyzed: podcastData.demographics_episodes_analyzed,
      podscan_last_fetched_at: new Date().toISOString(),
    }, {
      onConflict: 'podscan_id',
      returning: 'representation'
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Podcast Cache] Error upserting podcast:', error);
    return { success: false, error };
  }

  console.log(`[Podcast Cache] ✅ Upserted podcast: ${podcastData.podcast_name} (${podcastData.podscan_id})`);

  // Fire-and-forget: generate embedding if this podcast doesn't have one
  generateMissingEmbeddings(supabaseClient, [podcastData.podscan_id])
    .then(count => { if (count > 0) console.log(`[Podcast Cache] 🔮 Auto-embedded: ${podcastData.podcast_name}`); })
    .catch(err => console.error('[Podcast Cache] Auto-embed error:', err));

  return { success: true, podcast_id: data?.id };
}

/**
 * Batch upsert multiple podcasts
 * More efficient than individual upserts
 *
 * Note: podscan_fetch_count is automatically incremented by database trigger
 * when podscan_last_fetched_at is updated (see migration 20260125_auto_increment_fetch_count.sql)
 */
export async function batchUpsertPodcastCache(
  supabaseClient: any,
  podcastsData: PodcastCacheData[]
): Promise<{ success: boolean; count: number; errors: any[] }> {
  const podcasts = podcastsData.map(p => ({
    podscan_id: p.podscan_id,
    podcast_name: p.podcast_name,
    podcast_description: p.podcast_description,
    podcast_image_url: p.podcast_image_url,
    podcast_url: p.podcast_url,
    publisher_name: p.publisher_name,
    host_name: p.host_name,
    podcast_categories: p.podcast_categories,
    language: p.language,
    region: p.region,
    episode_count: p.episode_count,
    last_posted_at: p.last_posted_at,
    is_active: p.is_active ?? true,
    podcast_has_guests: p.podcast_has_guests,
    podcast_has_sponsors: p.podcast_has_sponsors,
    itunes_rating: p.itunes_rating,
    itunes_rating_count: p.itunes_rating_count,
    audience_size: p.audience_size,
    podcast_reach_score: p.podcast_reach_score,
    podscan_email: p.podscan_email,
    website: p.website,
    rss_url: p.rss_url,
    demographics: p.demographics,
    demographics_episodes_analyzed: p.demographics_episodes_analyzed,
    podscan_last_fetched_at: new Date().toISOString(),
  }));

  const { data, error } = await supabaseClient
    .from('podcasts')
    .upsert(podcasts, { onConflict: 'podscan_id' });

  if (error) {
    console.error('[Podcast Cache] Batch upsert error:', error);
    return { success: false, count: 0, errors: [error] };
  }

  console.log(`[Podcast Cache] ✅ Batch upserted ${podcasts.length} podcasts`);

  // Fire-and-forget: generate embeddings for any new podcasts without one
  const podscanIds = podcastsData.map(p => p.podscan_id);
  generateMissingEmbeddings(supabaseClient, podscanIds)
    .then(count => { if (count > 0) console.log(`[Podcast Cache] 🔮 Auto-embedded ${count} new podcasts from batch`); })
    .catch(err => console.error('[Podcast Cache] Batch auto-embed error:', err));

  return { success: true, count: podcasts.length, errors: [] };
}

/**
 * Update demographics for a cached podcast
 */
export async function updatePodcastDemographics(
  supabaseClient: any,
  podscanId: string,
  demographics: any,
  episodesAnalyzed?: number
): Promise<{ success: boolean; error?: any }> {
  const { error } = await supabaseClient
    .from('podcasts')
    .update({
      demographics,
      demographics_episodes_analyzed: episodesAnalyzed,
      demographics_fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('podscan_id', podscanId);

  if (error) {
    console.error('[Podcast Cache] Error updating demographics:', error);
    return { success: false, error };
  }

  console.log(`[Podcast Cache] ✅ Updated demographics for: ${podscanId}`);

  return { success: true };
}

/**
 * Get cache statistics
 */
export async function getCacheStatistics(
  supabaseClient: any
): Promise<any> {
  const { data, error } = await supabaseClient
    .from('podcast_cache_statistics')
    .select('*')
    .single();

  if (error) {
    console.error('[Podcast Cache] Error fetching statistics:', error);
    return null;
  }

  return data;
}

/**
 * Clean up stale cache entries (optional maintenance function)
 */
export async function cleanupStaleCache(
  supabaseClient: any,
  staleDays: number = 30
): Promise<{ deletedCount: number }> {
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - staleDays);

  const { data, error } = await supabaseClient
    .from('podcasts')
    .delete()
    .lt('podscan_last_fetched_at', staleThreshold.toISOString());

  if (error) {
    console.error('[Podcast Cache] Error cleaning up stale cache:', error);
    return { deletedCount: 0 };
  }

  const deletedCount = data?.length || 0;
  console.log(`[Podcast Cache] 🧹 Cleaned up ${deletedCount} stale entries`);

  return { deletedCount };
}
