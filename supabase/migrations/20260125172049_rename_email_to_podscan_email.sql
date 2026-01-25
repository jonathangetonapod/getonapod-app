-- Rename email column to podscan_email for clarity
-- This makes it explicit that the email comes from Podscan API

ALTER TABLE public.podcasts 
RENAME COLUMN email TO podscan_email;

-- Update the statistics view to use new column name
CREATE OR REPLACE VIEW public.podcast_cache_statistics AS
SELECT
  COUNT(*) as total_podcasts,
  COUNT(*) FILTER (WHERE demographics IS NOT NULL) as podcasts_with_demographics,
  COUNT(*) FILTER (WHERE podscan_email IS NOT NULL) as podcasts_with_email,
  COUNT(*) FILTER (WHERE is_active = true) as active_podcasts,
  COUNT(*) FILTER (WHERE is_podcast_stale(podscan_last_fetched_at, 7)) as stale_podcasts,
  AVG(audience_size)::INTEGER as avg_audience_size,
  MAX(audience_size) as max_audience_size,
  SUM(cache_hit_count) as total_cache_hits,
  AVG(cache_hit_count)::INTEGER as avg_cache_hits_per_podcast,
  SUM(podscan_fetch_count) as total_podscan_fetches,
  (SUM(cache_hit_count) * 2) as estimated_api_calls_saved,
  COUNT(DISTINCT language) as unique_languages,
  COUNT(DISTINCT region) as unique_regions
FROM public.podcasts;

-- Add comment to explain the column
COMMENT ON COLUMN public.podcasts.podscan_email IS 'Contact email extracted from Podscan API (reach.email field)';
