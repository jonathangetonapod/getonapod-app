# Centralized Podcast Cache Migration Guide

This guide shows how to update edge functions to use the new centralized `podcasts` table, which will save **60-80% on Podscan API calls**.

## Overview

**Before:** Each client/prospect cache table stores duplicate podcast metadata
**After:** One central `podcasts` table shared across all clients/prospects

**Benefits:**
- 60-80% reduction in Podscan API calls
- Faster response times (fewer API calls)
- Better data consistency
- Automatic cache hit tracking
- Built-in staleness detection

## Migration Steps

### 1. Run the Database Migration

```bash
# The migration will:
# - Drop old "Podcasts" table
# - Create new "podcasts" table
# - Backfill from existing caches
# - Add helper functions

# Migration is already in: supabase/migrations/20260125_centralized_podcasts_database.sql
```

### 2. Update Edge Functions

Here's how to update `get-client-podcasts/index.ts` (same pattern for `get-prospect-podcasts`):

#### OLD CODE (Lines 607-712):

```typescript
// 1. Fetch from Podscan
const podscanRes = await fetch(
  `https://podscan.fm/api/v1/podcasts/${podcastId}`,
  { headers: { 'Authorization': `Bearer ${podscanApiKey}` } }
)

const podcast = podscanData.podcast || podscanData

const podcastData: CachedPodcast = {
  podcast_id: podcastId,
  podcast_name: podcast.podcast_name || 'Unknown Podcast',
  // ... extract all fields
}

// 2. Fetch demographics
const demoRes = await fetch(
  `https://podscan.fm/api/v1/podcasts/${podcastId}/demographics`,
  // ...
)

// 4. Save to client_dashboard_podcasts cache
await supabase
  .from('client_dashboard_podcasts')
  .upsert({
    client_id: clientId,
    podcast_id: podcastId,
    // ... all podcast fields
  })
```

#### NEW CODE (Centralized Cache):

```typescript
import { getCachedPodcasts, upsertPodcastCache } from '../_shared/podcastCache.ts'

// STEP 1: Check central cache FIRST (before any Podscan calls)
const { cached, missing, stale } = await getCachedPodcasts(
  supabase,
  missingPodcastIds,
  7 // 7-day staleness threshold
)

// STEP 2: Only fetch missing/stale podcasts from Podscan
const podcastsToFetch = [...missing, ...stale]

for (const podcastId of podcastsToFetch) {
  // 1. Fetch from Podscan (ONLY if not cached or stale)
  const podscanRes = await fetch(
    `https://podscan.fm/api/v1/podcasts/${podcastId}`,
    { headers: { 'Authorization': `Bearer ${podscanApiKey}` } }
  )

  const podcast = podscanData.podcast || podscanData

  // 2. Fetch demographics
  let demographics = null
  try {
    const demoRes = await fetch(
      `https://podscan.fm/api/v1/podcasts/${podcastId}/demographics`,
      { headers: { 'Authorization': `Bearer ${podscanApiKey}` } }
    )
    if (demoRes.ok) {
      demographics = await demoRes.json()
    }
  } catch (e) {
    console.log('No demographics available')
  }

  // 3. Save to CENTRAL podcasts table
  await upsertPodcastCache(supabase, {
    podscan_id: podcastId,
    podcast_name: podcast.podcast_name || 'Unknown Podcast',
    podcast_description: podcast.podcast_description,
    podcast_image_url: podcast.podcast_image_url || podcast.thumbnail,
    podcast_url: podcast.podcast_url,
    publisher_name: podcast.publisher_name,
    host_name: podcast.publisher_name, // or host if available
    podcast_categories: podcast.podcast_categories,
    language: podcast.language,
    region: podcast.region,
    episode_count: podcast.episode_count,
    last_posted_at: podcast.last_posted_at,
    is_active: podcast.is_active,
    podcast_has_guests: podcast.podcast_has_guests,
    podcast_has_sponsors: podcast.podcast_has_sponsors,
    itunes_rating: podcast.reach?.itunes?.itunes_rating_average,
    itunes_rating_count: podcast.reach?.itunes?.itunes_rating_count,
    audience_size: podcast.reach?.audience_size || podcast.audience_size,
    podcast_reach_score: podcast.podcast_reach_score,
    email: podcast.reach?.email,
    website: podcast.reach?.website,
    rss_url: podcast.rss_url,
    demographics: demographics,
    demographics_episodes_analyzed: demographics?.episodes_analyzed,
  })

  stats.podscanFetched++
}

// STEP 4: Fetch AI analysis for ALL podcasts (both cached and new)
// AI analysis is client-specific, so it stays separate
const allPodcasts = [...cached, ...newlyFetched]

for (const podcast of allPodcasts) {
  if (clientName && clientBio && !skipAiAnalysis) {
    const analysis = await analyzePodcastFit(
      {
        name: podcast.podcast_name,
        description: podcast.podcast_description,
        // ... podcast data
      },
      clientName,
      clientBio
    )

    // Save AI analysis to client_podcast_analyses table (NEW TABLE)
    if (analysis) {
      await supabase
        .from('client_podcast_analyses')
        .upsert({
          client_id: clientId,
          podcast_id: podcast.id,  // FK to central podcasts table
          ai_clean_description: analysis.clean_description,
          ai_fit_reasons: analysis.fit_reasons,
          ai_pitch_angles: analysis.pitch_angles,
          ai_analyzed_at: new Date().toISOString(),
        }, { onConflict: 'client_id,podcast_id' })
    }
  }
}
```

### 3. Create Client/Prospect Analysis Tables

Add these migrations to separate AI analyses from podcast metadata:

```sql
-- Migration: 20260125_podcast_analyses_tables.sql

CREATE TABLE IF NOT EXISTS public.client_podcast_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,

  -- AI Analysis (Client-Specific)
  ai_clean_description TEXT,
  ai_fit_reasons TEXT[],
  ai_pitch_angles JSONB,
  ai_analyzed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_client_podcast_analysis UNIQUE (client_id, podcast_id)
);

CREATE INDEX idx_client_podcast_analyses_client ON client_podcast_analyses(client_id);
CREATE INDEX idx_client_podcast_analyses_podcast ON client_podcast_analyses(podcast_id);

CREATE TABLE IF NOT EXISTS public.prospect_podcast_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_dashboard_id UUID NOT NULL REFERENCES prospect_dashboards(id) ON DELETE CASCADE,
  podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,

  -- AI Analysis (Prospect-Specific)
  ai_clean_description TEXT,
  ai_fit_reasons JSONB,
  ai_pitch_angles JSONB,
  ai_analyzed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_prospect_podcast_analysis UNIQUE (prospect_dashboard_id, podcast_id)
);

CREATE INDEX idx_prospect_podcast_analyses_dashboard ON prospect_podcast_analyses(prospect_dashboard_id);
CREATE INDEX idx_prospect_podcast_analyses_podcast ON prospect_podcast_analyses(podcast_id);
```

### 4. Update Frontend Queries

Update TypeScript/React code to join podcasts with analyses:

```typescript
// OLD: Query client_dashboard_podcasts
const { data } = await supabase
  .from('client_dashboard_podcasts')
  .select('*')
  .eq('client_id', clientId)

// NEW: Join central podcasts with client analyses
const { data } = await supabase
  .from('podcasts')
  .select(`
    *,
    client_podcast_analyses!inner(
      ai_clean_description,
      ai_fit_reasons,
      ai_pitch_angles,
      ai_analyzed_at
    )
  `)
  .eq('client_podcast_analyses.client_id', clientId)
```

## Summary of Changes

| Component | Old Approach | New Approach |
|-----------|-------------|--------------|
| **Podcast Metadata** | Stored in `client_dashboard_podcasts` per client | Stored once in `podcasts` table |
| **Demographics** | Fetched per client | Stored once in `podcasts` table |
| **AI Analysis** | Stored in dashboard tables | Separate `*_podcast_analyses` tables |
| **Cache Check** | Check client table only | Check central `podcasts` first |
| **Podscan API Calls** | Every client fetches same podcast | Fetch once, reference everywhere |

## Expected Impact

### Before Centralization

```
Client A needs Podcast X → 2 Podscan API calls (data + demographics)
Client B needs Podcast X → 2 MORE Podscan API calls
Client C needs Podcast X → 2 MORE Podscan API calls

Total: 6 API calls for 1 podcast
```

### After Centralization

```
Client A needs Podcast X → 2 Podscan API calls (data + demographics)
Client B needs Podcast X → 0 API calls (fetch from central cache)
Client C needs Podcast X → 0 API calls (fetch from central cache)

Total: 2 API calls for 1 podcast
Savings: 66% reduction
```

## Monitoring Cache Performance

Check cache statistics:

```sql
SELECT * FROM podcast_cache_statistics;
```

Returns:
- `total_podcasts` - Total cached podcasts
- `podcasts_with_demographics` - Podcasts with demographic data
- `total_cache_hits` - Number of times cache was used instead of API
- `estimated_api_calls_saved` - Estimated API calls avoided (cache_hits × 2)
- `total_podscan_fetches` - Total times Podscan API was called
- `stale_podcasts` - Podcasts older than 7 days

## Cleanup Old Tables (Optional - After Migration)

Once you've confirmed everything works:

```sql
-- Optionally drop old cache columns from client_dashboard_podcasts
-- Keep the table but remove redundant podcast metadata
ALTER TABLE client_dashboard_podcasts
  DROP COLUMN podcast_name,
  DROP COLUMN podcast_description,
  DROP COLUMN podcast_image_url,
  -- ... etc
  ADD COLUMN podcast_id UUID REFERENCES podcasts(id);

-- Or keep both during transition period
```

## Files to Update

1. ✅ `supabase/migrations/20260125_centralized_podcasts_database.sql` - Created
2. ✅ `supabase/functions/_shared/podcastCache.ts` - Created
3. ⏳ `supabase/functions/get-client-podcasts/index.ts` - Update needed
4. ⏳ `supabase/functions/get-prospect-podcasts/index.ts` - Update needed
5. ⏳ `supabase/functions/read-outreach-list/index.ts` - Update needed
6. ⏳ `supabase/functions/get-outreach-podcasts/index.ts` - Update needed
7. ⏳ `src/services/podcastCache.ts` - Update frontend cache queries

## Testing Checklist

- [ ] Run migration successfully
- [ ] Verify backfill populated `podcasts` table
- [ ] Test `get-client-podcasts` with centralized cache
- [ ] Verify cache hits are incrementing
- [ ] Check `podcast_cache_statistics` view
- [ ] Confirm AI analyses still work
- [ ] Test prospect dashboard podcasts
- [ ] Monitor Podscan API usage (should decrease 60-80%)
