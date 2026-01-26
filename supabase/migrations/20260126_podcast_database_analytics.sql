-- =====================================================
-- PODCAST DATABASE ANALYTICS VIEWS
-- Comprehensive analytics for cache performance, growth, and insights
-- =====================================================

-- 1. Growth Analytics (last 7 days, last 30 days)
CREATE OR REPLACE VIEW public.podcast_growth_stats AS
SELECT
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as added_last_7_days,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as added_last_30_days,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 day') as added_today
FROM public.podcasts;

-- 2. Top Cached Podcasts (most reused)
CREATE OR REPLACE VIEW public.top_cached_podcasts AS
SELECT
  id,
  podcast_name,
  host_name,
  audience_size,
  cache_hit_count,
  podscan_fetch_count,
  created_at
FROM public.podcasts
WHERE cache_hit_count > 0
ORDER BY cache_hit_count DESC
LIMIT 20;

-- 3. Recently Added Podcasts
CREATE OR REPLACE VIEW public.recently_added_podcasts AS
SELECT
  id,
  podcast_name,
  host_name,
  audience_size,
  itunes_rating,
  created_at
FROM public.podcasts
ORDER BY created_at DESC
LIMIT 20;

-- 4. Category Analytics
CREATE OR REPLACE VIEW public.podcast_category_stats AS
WITH category_expanded AS (
  SELECT
    jsonb_array_elements(podcast_categories) ->> 'category_name' as category_name,
    audience_size,
    id
  FROM public.podcasts
  WHERE podcast_categories IS NOT NULL
)
SELECT
  category_name,
  COUNT(*) as podcast_count,
  AVG(audience_size)::INTEGER as avg_audience_size,
  MAX(audience_size) as max_audience_size
FROM category_expanded
GROUP BY category_name
ORDER BY podcast_count DESC
LIMIT 30;

-- 5. Enhanced Cache Statistics with percentages
CREATE OR REPLACE VIEW public.podcast_cache_statistics_detailed AS
SELECT
  COUNT(*) as total_podcasts,
  COUNT(*) FILTER (WHERE demographics IS NOT NULL) as podcasts_with_demographics,
  ROUND(100.0 * COUNT(*) FILTER (WHERE demographics IS NOT NULL) / NULLIF(COUNT(*), 0), 1) as demographics_coverage_pct,
  COUNT(*) FILTER (WHERE podscan_email IS NOT NULL) as podcasts_with_email,
  ROUND(100.0 * COUNT(*) FILTER (WHERE podscan_email IS NOT NULL) / NULLIF(COUNT(*), 0), 1) as email_coverage_pct,
  COUNT(*) FILTER (WHERE is_active = true) as active_podcasts,
  COUNT(*) FILTER (WHERE is_podcast_stale(podscan_last_fetched_at, 7)) as stale_podcasts,
  AVG(audience_size)::INTEGER as avg_audience_size,
  MAX(audience_size) as max_audience_size,
  SUM(cache_hit_count) as total_cache_hits,
  AVG(cache_hit_count)::INTEGER as avg_cache_hits_per_podcast,
  SUM(podscan_fetch_count) as total_podscan_fetches,
  (SUM(cache_hit_count) * 2) as estimated_api_calls_saved,
  ROUND(100.0 * SUM(cache_hit_count) / NULLIF(SUM(cache_hit_count) + SUM(podscan_fetch_count), 0), 1) as cache_efficiency_pct,
  -- Estimated cost savings ($0.01 per API call as rough estimate)
  ROUND((SUM(cache_hit_count) * 2 * 0.01)::NUMERIC, 2) as estimated_money_saved_usd,
  COUNT(DISTINCT language) as unique_languages,
  COUNT(DISTINCT region) as unique_regions,
  -- Growth stats
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as added_last_7_days,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as added_last_30_days
FROM public.podcasts;

-- 6. Audience Distribution
CREATE OR REPLACE VIEW public.podcast_audience_distribution AS
SELECT
  COUNT(*) FILTER (WHERE audience_size < 1000) as under_1k,
  COUNT(*) FILTER (WHERE audience_size >= 1000 AND audience_size < 10000) as "1k_10k",
  COUNT(*) FILTER (WHERE audience_size >= 10000 AND audience_size < 50000) as "10k_50k",
  COUNT(*) FILTER (WHERE audience_size >= 50000 AND audience_size < 100000) as "50k_100k",
  COUNT(*) FILTER (WHERE audience_size >= 100000 AND audience_size < 500000) as "100k_500k",
  COUNT(*) FILTER (WHERE audience_size >= 500000) as over_500k
FROM public.podcasts
WHERE audience_size IS NOT NULL;

-- 7. Rating Distribution
CREATE OR REPLACE VIEW public.podcast_rating_distribution AS
SELECT
  COUNT(*) FILTER (WHERE itunes_rating >= 4.5) as excellent_45_plus,
  COUNT(*) FILTER (WHERE itunes_rating >= 4.0 AND itunes_rating < 4.5) as good_40_45,
  COUNT(*) FILTER (WHERE itunes_rating >= 3.5 AND itunes_rating < 4.0) as average_35_40,
  COUNT(*) FILTER (WHERE itunes_rating >= 3.0 AND itunes_rating < 3.5) as below_avg_30_35,
  COUNT(*) FILTER (WHERE itunes_rating < 3.0) as poor_under_30,
  COUNT(*) FILTER (WHERE itunes_rating IS NULL) as no_rating
FROM public.podcasts;

-- Grant access to all views
GRANT SELECT ON public.podcast_growth_stats TO authenticated, anon;
GRANT SELECT ON public.top_cached_podcasts TO authenticated, anon;
GRANT SELECT ON public.recently_added_podcasts TO authenticated, anon;
GRANT SELECT ON public.podcast_category_stats TO authenticated, anon;
GRANT SELECT ON public.podcast_cache_statistics_detailed TO authenticated, anon;
GRANT SELECT ON public.podcast_audience_distribution TO authenticated, anon;
GRANT SELECT ON public.podcast_rating_distribution TO authenticated, anon;

-- Add comments for documentation
COMMENT ON VIEW public.podcast_growth_stats IS 'Tracks podcast growth over time (daily, weekly, monthly)';
COMMENT ON VIEW public.top_cached_podcasts IS 'Top 20 most frequently reused podcasts from cache';
COMMENT ON VIEW public.recently_added_podcasts IS 'Last 20 podcasts added to the database';
COMMENT ON VIEW public.podcast_category_stats IS 'Category distribution and audience metrics';
COMMENT ON VIEW public.podcast_cache_statistics_detailed IS 'Comprehensive cache performance and coverage statistics';
COMMENT ON VIEW public.podcast_audience_distribution IS 'Distribution of podcasts by audience size brackets';
COMMENT ON VIEW public.podcast_rating_distribution IS 'Distribution of podcasts by iTunes rating';

-- ==================== COMPLETION MESSAGE ====================

DO $$
BEGIN
  RAISE NOTICE '✅ Podcast Database Analytics views created successfully!';
  RAISE NOTICE '📊 7 new analytics views available';
  RAISE NOTICE '📈 Growth tracking, cache performance, and distribution insights enabled';
END $$;
