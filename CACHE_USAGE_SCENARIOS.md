# 🎯 Centralized Cache Usage Scenarios

This document lists all the places where the app now checks the centralized `podcasts` cache **before** calling the Podscan API.

---

## 📋 All Scenarios (In Priority Order)

### ✅ SCENARIO 1: Client Dashboard - View Podcasts
**Edge Function:** `get-client-podcasts`
**User Action:** Admin views a client's dashboard
**Cache Flow:**
1. ✅ Checks central `podcasts` table first
2. ✅ Only fetches from Podscan if missing or stale (>7 days)
3. ✅ Saves new podcasts to central cache
4. ✅ Saves AI analysis to `client_podcast_analyses`
5. ✅ Increments `cache_hit_count` for cached podcasts

**How to Test:**
- Go to: Admin Dashboard → Clients → Select any client → View Podcasts
- Expected: Podcasts load quickly (from cache if previously fetched)
- Check logs: Should see `[Podcast Cache] ✅ Cache hits: X`

---

### ✅ SCENARIO 2: Prospect Dashboard - View Podcasts
**Edge Function:** `get-prospect-podcasts`
**User Action:** Anyone views a public prospect dashboard
**Cache Flow:**
1. ✅ Checks central `podcasts` table first
2. ✅ Only fetches from Podscan if missing or stale (>7 days)
3. ✅ Saves new podcasts to central cache
4. ✅ Saves AI analysis to `prospect_podcast_analyses`
5. ✅ Increments `cache_hit_count` for cached podcasts

**How to Test:**
- Go to: Any prospect dashboard URL (e.g., `https://getonapod.com/prospect/PROSPECT_ID`)
- Expected: Podcasts load quickly (from cache if previously fetched)
- Check logs: Should see `[Podcast Cache] ✅ Cache hits: X`

**Public Access:** This is the scenario most likely to show cache benefits since:
- Multiple prospects may recommend same podcasts
- Same podcasts shared across multiple prospect dashboards
- High reuse = high cache hit rate

---

### ✅ SCENARIO 3: Outreach List - Import from Google Sheets
**Edge Function:** `read-outreach-list`
**User Action:** Admin imports podcasts from a Google Sheet outreach list
**Cache Flow:**
1. ✅ Checks central `podcasts` table first for all podcast IDs
2. ✅ Only fetches missing/stale podcasts from Podscan
3. ✅ Batch saves new podcasts to central cache
4. ✅ Increments `cache_hit_count` for cached podcasts

**How to Test:**
- Go to: Admin Dashboard → Outreach → Import from Google Sheets
- Or: Use an existing outreach list that references podcast IDs
- Expected: Import is faster for podcasts already in cache
- Check logs: Should see `[Podcast Cache] Cached: X, Missing: Y`

**High Cache Benefit:** If multiple clients target similar podcasts, most will be cached

---

### ✅ SCENARIO 4: Outreach Podcasts V2 - Fetch Podcasts
**Edge Function:** `get-outreach-podcasts-v2`
**User Action:** System fetches podcasts for outreach campaigns (v2 endpoint)
**Cache Flow:**
1. ✅ Checks central `podcasts` table first
2. ✅ Only fetches missing/stale podcasts from Podscan
3. ✅ Saves new podcasts to central cache individually
4. ✅ Increments `cache_hit_count` for cached podcasts

**How to Test:**
- This is likely called programmatically or via admin tools
- Check: Admin Dashboard → Outreach → Any v2 workflow
- Expected: Faster processing for cached podcasts
- Check logs: Should see `[Podcast Cache] ✅ Cache hits: X`

---

### ⚠️ SCENARIO 5: Client Outreach Podcasts (NOT UPDATED YET)
**Edge Function:** `get-client-outreach-podcasts`
**User Action:** Fetch outreach podcasts for a specific client
**Cache Flow:**
- ❌ **NOT USING CENTRALIZED CACHE YET**
- Still using old client_dashboard_podcasts table
- **Opportunity for optimization**

**Status:** Not updated in this deployment (can update later if needed)

---

### ⚠️ SCENARIO 6: Analyze Podcast Fit (NOT UPDATED YET)
**Edge Function:** `analyze-podcast-fit`
**User Action:** AI analyzes if a podcast is a good fit for a client
**Cache Flow:**
- ❌ **NOT USING CENTRALIZED CACHE YET**
- May make direct Podscan API calls
- **Opportunity for optimization**

**Status:** Not updated in this deployment (can update later if needed)

---

### ⚠️ SCENARIO 7: Fetch Podscan Email (PARTIAL CACHE)
**Edge Function:** `fetch-podscan-email`
**User Action:** Fetch podcast host email for outreach
**Cache Flow:**
- 🔶 **COULD USE CENTRAL CACHE**
- Central `podcasts.email` field available
- Not currently integrated
- **Opportunity for optimization**

**Status:** Could leverage central cache's `email` field in future

---

## 🎯 Priority Testing Order

### Phase 1: Core Functionality (Test First) ✅
1. **Client Dashboard** - Most common admin workflow
2. **Prospect Dashboard** - Most common public workflow
3. **Outreach List Import** - Batch operations benefit most from cache

### Phase 2: Secondary Workflows (Test After)
4. **Outreach Podcasts V2** - Background/automated workflows

### Phase 3: Future Optimization (Optional)
5. Get-client-outreach-podcasts - Update to use central cache
6. Analyze-podcast-fit - Integrate with central cache
7. Fetch-podscan-email - Use central cache's email field

---

## 📊 Where Cache Benefits Are Highest

### High Cache Hit Scenarios (60-80% savings expected)
1. ✅ **Prospect Dashboards** - Same popular podcasts recommended to multiple prospects
2. ✅ **Client Dashboards** - Multiple admins viewing same clients
3. ✅ **Outreach Lists** - Similar target podcasts across campaigns

### Medium Cache Hit Scenarios (40-60% savings)
4. ✅ **Outreach V2** - Depends on podcast overlap between campaigns

### Low Cache Hit Scenarios (need updates)
5. ❌ Client Outreach Podcasts - Not using cache yet
6. ❌ Analyze Podcast Fit - Not using cache yet

---

## 🧪 Testing Checklist

Use this checklist to verify each scenario:

### Scenario 1: Client Dashboard
- [ ] Navigate to client dashboard
- [ ] Load podcasts for a client
- [ ] Run cache statistics query (should see cache_hits increase)
- [ ] Check edge function logs for "Cache hits" message
- [ ] Reload same client (should be even faster)

### Scenario 2: Prospect Dashboard
- [ ] Open prospect dashboard URL
- [ ] View recommended podcasts
- [ ] Run cache statistics query
- [ ] Check edge function logs
- [ ] Open different prospect dashboard (may share same podcasts)

### Scenario 3: Outreach List Import
- [ ] Import podcasts from Google Sheet
- [ ] Run cache statistics query
- [ ] Check logs for "Cached: X, Missing: Y" message
- [ ] Re-import same list (should be much faster)

### Scenario 4: Outreach Podcasts V2
- [ ] Trigger v2 outreach workflow
- [ ] Run cache statistics query
- [ ] Check edge function logs

---

## 🔍 How to Verify Cache is Working

### Method 1: Check Cache Statistics (SQL)
```sql
SELECT
  total_podcasts,
  total_cache_hits,
  estimated_api_calls_saved,
  ROUND((total_cache_hits::decimal / NULLIF(total_cache_hits + total_podscan_fetches, 0) * 100), 2) as cache_hit_rate
FROM podcast_cache_statistics;
```

**Before action:** Note the values
**After action:** Values should increase

### Method 2: Check Edge Function Logs
```bash
# For client dashboard
supabase functions logs get-client-podcasts --limit 30

# For prospect dashboard
supabase functions logs get-prospect-podcasts --limit 30

# For outreach list
supabase functions logs read-outreach-list --limit 30
```

**Look for:**
- `[Podcast Cache] ✅ Cache hits: X` - Podcasts served from cache
- `[Podcast Cache] 📊 Cached: X, Missing: Y` - Cache lookup results
- `[Podcast Cache] ✅ Upserted podcast` - New podcasts saved to cache

### Method 3: Check Individual Podcast Stats
```sql
SELECT
  podcast_name,
  cache_hit_count,
  podscan_fetch_count,
  podscan_last_fetched_at
FROM podcasts
ORDER BY cache_hit_count DESC
LIMIT 20;
```

**Shows:** Which podcasts are being reused most from cache

---

## 💡 Expected Behavior

### First Time Loading a Podcast
1. Not in cache → Fetch from Podscan API
2. Save to central `podcasts` table
3. Save AI analysis to `client_podcast_analyses` or `prospect_podcast_analyses`
4. Return data to user
5. `podscan_fetch_count` = 1, `cache_hit_count` = 0

### Second Time Loading Same Podcast
1. Found in cache → Skip Podscan API
2. Load from central `podcasts` table
3. Load AI analysis from analysis table
4. Increment `cache_hit_count`
5. Return data to user (much faster!)
6. `cache_hit_count` increases

### Third+ Times
- Cache keeps getting reused
- `cache_hit_count` keeps increasing
- No Podscan API calls (unless stale)
- Significant cost savings

---

## 🎯 Success Indicators

### Immediate (Within 1 hour)
- ✅ `cache_hit_count` > 0 for some podcasts
- ✅ `total_cache_hits` increases with each test
- ✅ Edge function logs show cache hit messages
- ✅ No errors in logs

### Short Term (Within 1 day)
- ✅ Cache hit rate > 20%
- ✅ Multiple podcasts with `cache_hit_count` > 2
- ✅ Faster page load times for dashboards
- ✅ Less Podscan API usage

### Long Term (Within 1 week)
- ✅ Cache hit rate > 50%
- ✅ 60-80% reduction in Podscan API calls
- ✅ Significant cost savings
- ✅ Faster user experience across all workflows

---

## 🚀 Ready to Test!

**Start with Scenario 1:** Client Dashboard (easiest to test and most impactful)

Just navigate to a client dashboard in your admin panel and view their podcasts. Then check the cache statistics!
