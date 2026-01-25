/**
 * Centralized Podcast Cache Management
 *
 * This module provides utilities for managing the centralized podcasts database.
 * Saves 60-80% on Podscan API calls by deduplicating podcast data across clients/prospects.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  email?: string;
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
    // Increment cache hit counter for each podcast (fire and forget)
    Promise.all(
      hitIds.map(podscanId =>
        supabaseClient.rpc('increment_podcast_cache_hit', { p_podscan_id: podscanId })
      )
    ).then(() => console.log(`[Podcast Cache] ✅ Cache hits: ${hitIds.length}`))
      .catch(err => console.error('[Podcast Cache] Error incrementing cache hits:', err));
  }

  console.log(`[Podcast Cache] 📊 Cached: ${cached.length}, Missing: ${missing.length}, Stale: ${stale.length}`);

  return { cached, missing, stale };
}

/**
 * Upsert podcast data into central cache
 * Creates new entry or updates existing one
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
      email: podcastData.email,
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

  return { success: true, podcast_id: data?.id };
}

/**
 * Batch upsert multiple podcasts
 * More efficient than individual upserts
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
    email: p.email,
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
