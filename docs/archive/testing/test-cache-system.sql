-- =====================================================
-- TEST CENTRALIZED PODCASTS CACHE SYSTEM
-- Run these queries to verify bug fixes and cache performance
-- =====================================================

-- TEST 1: Check if podcasts table exists and has data
-- Expected: ~1,201 rows
SELECT
  COUNT(*) as total_podcasts,
  COUNT(*) FILTER (WHERE demographics IS NOT NULL) as with_demographics,
  COUNT(*) FILTER (WHERE cache_hit_count > 0) as with_cache_hits,
  COUNT(*) FILTER (WHERE podscan_fetch_count > 1) as fetched_multiple_times
FROM podcasts;

-- TEST 2: Check cache statistics view
-- Expected: All values > 0 after some usage
SELECT * FROM podcast_cache_statistics;

-- TEST 3: Check if auto-increment trigger is installed
-- Expected: 1 row with trigger_name 'trigger_auto_increment_fetch_count'
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'trigger_auto_increment_fetch_count';

-- TEST 4: Check most cached podcasts (cache hits > 0)
-- Expected: List of podcasts that have been reused from cache
SELECT
  podcast_name,
  publisher_name,
  cache_hit_count,
  podscan_fetch_count,
  podscan_last_fetched_at
FROM podcasts
WHERE cache_hit_count > 0
ORDER BY cache_hit_count DESC
LIMIT 20;

-- TEST 5: Check recently fetched podcasts
-- Expected: Recent timestamps, fetch counts incrementing
SELECT
  podcast_name,
  publisher_name,
  podscan_fetch_count,
  cache_hit_count,
  podscan_last_fetched_at,
  created_at
FROM podcasts
ORDER BY podscan_last_fetched_at DESC NULLS LAST
LIMIT 20;

-- TEST 6: Check client podcast analyses
-- Expected: Rows with ai_analyzed_at timestamps
SELECT
  c.name as client_name,
  p.podcast_name,
  cpa.ai_clean_description IS NOT NULL as has_clean_description,
  cpa.ai_fit_reasons IS NOT NULL as has_fit_reasons,
  cpa.ai_pitch_angles IS NOT NULL as has_pitch_angles,
  cpa.ai_analyzed_at,
  cpa.created_at
FROM client_podcast_analyses cpa
JOIN podcasts p ON p.id = cpa.podcast_id
JOIN clients c ON c.id = cpa.client_id
ORDER BY cpa.created_at DESC
LIMIT 20;

-- TEST 7: Check prospect podcast analyses
-- Expected: Rows with ai_analyzed_at timestamps
SELECT
  pd.prospect_name,
  p.podcast_name,
  ppa.ai_clean_description IS NOT NULL as has_clean_description,
  ppa.ai_fit_reasons IS NOT NULL as has_fit_reasons,
  ppa.ai_pitch_angles IS NOT NULL as has_pitch_angles,
  ppa.ai_analyzed_at,
  ppa.created_at
FROM prospect_podcast_analyses ppa
JOIN podcasts p ON p.id = ppa.podcast_id
JOIN prospect_dashboards pd ON pd.id = ppa.prospect_dashboard_id
ORDER BY ppa.created_at DESC
LIMIT 20;

-- TEST 8: Check for podcasts missing critical data (should be 0 after fixes)
-- Expected: 0 rows with null podcast_name after bug fixes
SELECT
  podscan_id,
  podcast_name,
  podcast_description,
  podcast_image_url,
  publisher_name,
  podscan_last_fetched_at
FROM podcasts
WHERE podcast_name IS NULL
   OR podcast_name = 'Unknown Podcast'
ORDER BY podscan_last_fetched_at DESC
LIMIT 20;

-- TEST 9: Calculate potential API savings
-- Expected: High estimated_api_calls_saved value
SELECT
  total_podcasts,
  total_cache_hits,
  estimated_api_calls_saved,
  total_podscan_fetches,
  CASE
    WHEN (total_cache_hits + total_podscan_fetches) > 0
    THEN ROUND((total_cache_hits::decimal / (total_cache_hits + total_podscan_fetches) * 100), 2)
    ELSE 0
  END as cache_hit_percentage,
  CASE
    WHEN total_podscan_fetches > 0
    THEN ROUND((estimated_api_calls_saved::decimal / total_podscan_fetches * 100), 2)
    ELSE 0
  END as api_call_reduction_percentage
FROM podcast_cache_statistics;

-- TEST 10: Check RLS policies are working
-- Expected: Multiple policies for authenticated and service_role
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename IN ('podcasts', 'client_podcast_analyses', 'prospect_podcast_analyses')
ORDER BY tablename, policyname;

-- =====================================================
-- INTERPRETATION GUIDE
-- =====================================================

/*
TEST 1: total_podcasts should be ~1,201 or more
        with_cache_hits should increase over time
        fetched_multiple_times shows podcasts refetched from Podscan

TEST 2: Cache statistics summary - all values should increase over time

TEST 3: If this returns 0 rows, you need to run the migration SQL

TEST 4: Shows which podcasts are being reused most from cache
        Higher cache_hit_count = more savings

TEST 5: Shows recent activity
        podscan_fetch_count > 1 means it was updated (refetched)
        cache_hit_count > 0 means it was served from cache

TEST 6 & 7: Verifies AI analyses are being saved correctly
            All rows should have ai_analyzed_at timestamps

TEST 8: Should be empty (0 rows) after bug fixes
        Any rows = podcasts with missing data (needs investigation)

TEST 9: Shows percentage-based metrics
        cache_hit_percentage = how often cache is used vs new fetches
        api_call_reduction_percentage = estimated API call savings

TEST 10: Verifies database security policies are in place
*/
