# Podcast Cache System

## Overview

The podcast cache system provides intelligent metadata sharing across all clients and prospects while maintaining personalized AI analysis per entity. This dramatically reduces Podscan API costs by reusing universal podcast data.

## Architecture

### Cache Sources (Priority Order)

1. **Client Dashboard Podcasts** (`client_dashboard_podcasts`)
   - Highest priority
   - Contains full metadata + demographics
   - Personalized AI analysis per client

2. **Prospect Dashboard Podcasts** (`prospect_dashboard_podcasts`)
   - Medium priority
   - Contains full metadata
   - Personalized AI analysis per prospect

3. **Bookings** (`bookings`)
   - Lowest priority
   - Contains partial metadata
   - No AI analysis

### What's Shared vs. Personalized

#### ✅ Shared (Universal Metadata)
- Podcast name, description, image, URL
- Publisher name
- iTunes rating and review count
- Episode count
- Audience size
- Categories
- Last posted date
- **Demographics** (listener data is universal)
- RSS URL

#### ❌ NOT Shared (Personalized)
- `ai_clean_description` - Claude-generated cleaned description
- `ai_fit_reasons` - Why this podcast fits the client/prospect
- `ai_pitch_angles` - Suggested pitch approaches
- `ai_analyzed_at` - Timestamp of AI analysis

**Why?** AI analysis is based on the client's bio and expertise, so it must be generated fresh for each client.

## Service Functions

### `findCachedPodcastMetadata(podcastId: string)`

Searches for a single podcast across all cache sources.

**Returns:** `UniversalPodcastCache | null`

**Example:**
```typescript
const cached = await findCachedPodcastMetadata('podcast-123')

if (cached) {
  console.log(`Found in ${cached.source}`)
  console.log(`Audience: ${cached.audience_size}`)
  // AI fields are NOT included
}
```

### `findCachedPodcastsMetadata(podcastIds: string[])`

Batch search for multiple podcasts.

**Returns:** `Map<string, UniversalPodcastCache>`

**Example:**
```typescript
const podcastIds = ['id1', 'id2', 'id3']
const cached = await findCachedPodcastsMetadata(podcastIds)

const missing = podcastIds.filter(id => !cached.has(id))
console.log(`Need to fetch: ${missing.length}`)
```

### `getClientCacheStatus(clientId: string, podcastIds: string[])`

Get detailed cache breakdown for a client's podcast list.

**Returns:**
```typescript
{
  total: number                    // Total podcasts in list
  cached_in_client: number         // Already in this client's cache
  cached_in_other_clients: number  // In other clients' caches
  cached_in_prospects: number      // In prospect dashboards
  cached_in_bookings: number       // In booking records
  needs_fetch: number              // Not cached anywhere
  cache_map: Map<string, UniversalPodcastCache>
}
```

### `getCacheStatistics()`

Get global cache statistics.

**Returns:**
```typescript
{
  total_cached: number
  by_source: {
    client_dashboards: number
    prospect_dashboards: number
    bookings: number
  }
  estimated_credits_saved: number  // Approx Podscan API calls saved
}
```

## Workflow

### Client Dashboard: Fetch & Cache Podcasts

```
1. User clicks "Fetch & Cache Metadata"
   ↓
2. Get podcast IDs from Google Sheet
   ↓
3. Search all cache sources (findCachedPodcastsMetadata)
   ↓
4. Copy cached metadata to client_dashboard_podcasts
   - Set AI fields to NULL
   - Copy demographics if available
   ↓
5. Fetch ONLY missing podcasts from Podscan API
   ↓
6. Result: All metadata cached, no AI analysis yet
```

### Client Dashboard: Run AI Analysis

```
1. User clicks "Run AI Analysis"
   ↓
2. For each podcast in client_dashboard_podcasts:
   - Read client bio
   - Call Claude API with client context
   - Generate personalized fit reasons
   - Generate pitch angles
   ↓
3. Update client_dashboard_podcasts with AI data
   ↓
4. Result: Client-specific AI analysis complete
```

## Database Schema

### SQL Functions

```sql
-- Count unique podcasts across all sources
CREATE FUNCTION count_unique_cached_podcasts() RETURNS INTEGER

-- Get detailed statistics
CREATE FUNCTION get_cache_statistics() RETURNS JSON
```

## UI Components

### Client Detail Page (`/admin/clients/:id`)

**Cache Status Widget:**
- Shows total podcasts in sheet
- Shows how many need fetching
- Breakdown by source (client/prospects/bookings)
- Visual indicators for each source
- Info alert explaining shared vs personalized

**Action Buttons:**
1. "Check Cache Status" - Scans all sources
2. "Fetch & Cache Metadata" - Smart copy + fetch
3. "Run AI Analysis" - Personalized for this client

### Global Cache Stats Component

Can be added to admin dashboard:
```tsx
import { GlobalCacheStats } from '@/components/admin/GlobalCacheStats'

<GlobalCacheStats />
```

Shows:
- Total unique podcasts cached
- Breakdown by source
- Estimated Podscan credits saved

## Benefits

### Cost Savings
- **Before:** Every client fetches all podcasts = N × M API calls
- **After:** Podcasts cached once, shared across clients = M API calls
- **Savings:** (N - 1) × M API calls where N = clients, M = podcasts

### Example Calculation
- 10 clients
- Each with 50 podcasts
- **Without cache:** 10 × 50 = 500 API calls
- **With cache:** 50 + (few new) = ~60 API calls
- **Savings:** 88% reduction in API costs

### Performance
- Instant metadata for cached podcasts
- Only AI analysis needs to be generated
- Claude API calls are personalized, can't be cached

## Error Handling

### Missing Podcasts
If a podcast doesn't exist in any cache:
- Falls back to Podscan API fetch
- Stores in client's cache for future use

### Failed API Calls
If Podscan fetch fails:
- Error is surfaced to user
- Partial success: cached podcasts still available
- Retry logic can be added

## Future Enhancements

### Global Podcasts Table (Optional)
Create a centralized `podcasts` table:
```sql
CREATE TABLE podcasts (
  id UUID PRIMARY KEY,
  podcast_id TEXT UNIQUE,
  -- Universal metadata
  podcast_name TEXT,
  podcast_description TEXT,
  -- etc.
  last_fetched_at TIMESTAMPTZ,
  fetch_count INTEGER
)
```

Benefits:
- Single source of truth
- Cache freshness tracking
- Automatic stale data refresh

### Cache Warming
- Pre-fetch popular podcasts
- Background job to refresh stale cache entries
- Predictive caching based on trends

### Analytics
- Track most frequently cached podcasts
- Identify podcasts that need refreshing
- Monitor cache hit rate

## Testing

### Manual Testing
1. Create client with Google Sheet
2. Click "Check Cache Status" - should show breakdown
3. Click "Fetch & Cache Metadata" - should copy from other sources
4. Verify toast messages show correct counts
5. Click "Run AI Analysis" - should generate personalized content

### Verification Queries
```sql
-- Check cache distribution
SELECT
  'client_dashboards' as source,
  COUNT(*) as count
FROM client_dashboard_podcasts
UNION ALL
SELECT
  'prospect_dashboards',
  COUNT(*)
FROM prospect_dashboard_podcasts
UNION ALL
SELECT
  'bookings',
  COUNT(*)
FROM bookings
WHERE podcast_id IS NOT NULL;

-- Check AI analysis coverage
SELECT
  client_id,
  COUNT(*) as total_podcasts,
  COUNT(ai_analyzed_at) as with_ai,
  COUNT(*) - COUNT(ai_analyzed_at) as missing_ai
FROM client_dashboard_podcasts
GROUP BY client_id;
```

## Troubleshooting

### Cache Status Shows 0
**Issue:** No podcasts found in Google Sheet
**Solution:** Verify spreadsheet URL is correct and sheet has data

### Fetch Fails Silently
**Issue:** Backend function not receiving podcast IDs
**Solution:** Check `checkStatusOnly` parameter and ensure backend handles it

### AI Analysis Not Working
**Issue:** Metadata cached but AI is NULL
**Solution:** This is expected - AI must be generated separately per client

### Wrong Source Priority
**Issue:** Booking data used instead of client cache
**Solution:** Check priority order in `findCachedPodcastsMetadata` function

## Support

For issues or questions about the cache system:
1. Check backend logs for Podscan API errors
2. Verify Supabase RLS policies allow writes
3. Ensure service role key is used for database updates
4. Test with `/health` endpoint: `https://your-service.railway.app/health`
