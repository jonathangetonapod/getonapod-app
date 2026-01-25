-- =====================================================
-- QUICK VERIFICATION TESTS
-- Run these to verify the deployment is working
-- =====================================================

-- TEST 1: Verify trigger is installed correctly
SELECT
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trigger_auto_increment_fetch_count';

-- TEST 2: Check current cache statistics (baseline)
SELECT
  total_podcasts,
  total_cache_hits,
  estimated_api_calls_saved,
  total_podscan_fetches,
  avg_cache_hits_per_podcast,
  ROUND((total_cache_hits::decimal / NULLIF(total_cache_hits + total_podscan_fetches, 0) * 100), 2) as cache_hit_rate_percentage
FROM podcast_cache_statistics;

-- TEST 3: Check recent podcast activity
SELECT
  podcast_name,
  publisher_name,
  podscan_fetch_count,
  cache_hit_count,
  podscan_last_fetched_at,
  created_at
FROM podcasts
ORDER BY podscan_last_fetched_at DESC NULLS LAST
LIMIT 10;

-- TEST 4: Check if client analyses have ai_analyzed_at field
SELECT
  c.name as client_name,
  p.podcast_name,
  cpa.ai_analyzed_at IS NOT NULL as has_analyzed_timestamp,
  cpa.ai_clean_description IS NOT NULL as has_description,
  cpa.created_at
FROM client_podcast_analyses cpa
JOIN podcasts p ON p.id = cpa.podcast_id
JOIN clients c ON c.id = cpa.client_id
ORDER BY cpa.created_at DESC
LIMIT 10;

-- TEST 5: Check for podcasts with missing data (should be minimal)
SELECT
  COUNT(*) as total_podcasts,
  COUNT(*) FILTER (WHERE podcast_name IS NULL OR podcast_name = 'Unknown Podcast') as missing_name,
  COUNT(*) FILTER (WHERE podcast_description IS NULL) as missing_description,
  COUNT(*) FILTER (WHERE demographics IS NOT NULL) as with_demographics
FROM podcasts;

-- TEST 6: Get detailed cache performance metrics
SELECT
  COUNT(*) as total_podcasts,
  COUNT(*) FILTER (WHERE cache_hit_count > 0) as podcasts_used_from_cache,
  COUNT(*) FILTER (WHERE podscan_fetch_count > 1) as podcasts_fetched_multiple_times,
  MAX(cache_hit_count) as max_cache_hits_single_podcast,
  MAX(podscan_fetch_count) as max_fetch_count_single_podcast,
  ROUND(AVG(cache_hit_count), 2) as avg_cache_hits,
  ROUND(AVG(podscan_fetch_count), 2) as avg_fetch_count
FROM podcasts;

-- =====================================================
-- EXPECTED RESULTS
-- =====================================================

/*
TEST 1: Should show 1-2 rows (one per event type: INSERT, UPDATE)
  trigger_name: trigger_auto_increment_fetch_count
  event_object_table: podcasts

TEST 2: Cache statistics summary
  total_podcasts: ~1,201 or more
  All other values will increase as system is used

TEST 3: Recent podcast activity
  Shows most recently fetched/cached podcasts
  podscan_last_fetched_at should have recent timestamps

TEST 4: AI analyses with timestamps
  All rows should have has_analyzed_timestamp = true
  This confirms ai_analyzed_at field is working

TEST 5: Data quality check
  missing_name and missing_description should be low (< 5%)
  After bug fixes, new podcasts should have complete data

TEST 6: Performance metrics
  podcasts_used_from_cache: How many podcasts have been served from cache
  podcasts_fetched_multiple_times: How many have been updated from Podscan
  Higher values = more cache utilization = more savings
*/
