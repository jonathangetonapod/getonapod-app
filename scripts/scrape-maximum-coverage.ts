import { createClient } from '@supabase/supabase-js'

// Supabase setup
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Podscan API setup
const PODSCAN_API_URL = 'https://podscan.fm/api/v1'
const PODSCAN_TOKEN = 'tg7ZSteB27RqyNUqlIKtBK4gNAj8Hcm7z3oSzeYmd7421590'

// EXPANDED: Top 40+ categories for maximum coverage
const ALL_MAJOR_CATEGORIES = [
  // Original Top 20
  'ct_o9mjlawxowkdy3rp',  // Business
  'ct_2v89gony7jnrqj3d',  // News
  'ct_ox4amd5d9pweyq2r',  // Culture
  'ct_akrev35bm4w4ypql',  // Society
  'ct_3krv4dnrrqn79l6o',  // Technology
  'ct_6olr4e5ek5b7yj2a',  // Education
  'ct_z9majpn4r5o73bx8',  // Comedy
  'ct_zqbe76njpnyjx432',  // Arts
  'ct_rzemq35l4n9x27dy',  // History
  'ct_8kgrblw8aoneo36z',  // Government
  'ct_6vqzjd529vn8xlep',  // Sports
  'ct_rzemq35lz4w9x27d',  // TV
  'ct_akrev35bv9w4ypql',  // Film
  'ct_6zvjgq5arjw8drle',  // Leisure
  'ct_vy2zbpn3lgnq3m7g',  // Religion
  'ct_6zvjgq5avj58drle',  // Spirituality
  'ct_3pk7q259ebwvr4bx',  // Science
  'ct_lxbp9dwoak5aeom7',  // True Crime
  'ct_akrev35b8454ypql',  // Health
  'ct_ox4amd5dkpneyq2r',  // Fitness

  // Additional 20+ popular categories for broader coverage
  'ct_akrev35bvmw4ypql',  // Music
  'ct_6zvjgq5arlg8drle',  // Self-Improvement
  'ct_lxbp9dwo3x5aeom7',  // Kids & Family
  'ct_zqbe76njpdyjx432',  // Food
  'ct_rzemq35l4no927dy',  // Design
  'ct_ox4amd5d9pzwyq2r',  // Entrepreneurship
  'ct_3krv4dnrrq879l6o',  // Investing
  'ct_akrev35b84g4ypql',  // Medicine
  'ct_6zvjgq5arjz8drle',  // Fashion & Beauty
  'ct_o9mjlawxowady3rp',  // Marketing
  'ct_2v89gony7jdrqj3d',  // Politics
  'ct_lxbp9dwo3xgaeom7',  // Relationships
  'ct_zqbe76njpdwjx432',  // Travel
  'ct_rzemq35l4nx927dy',  // Gaming
  'ct_ox4amd5d9pmwyq2r',  // Mental Health
  'ct_3krv4dnrrqo79l6o',  // Nutrition
  'ct_akrev35b847ypql',   // Parenting
  'ct_6zvjgq5arjy8drle',  // Personal Finance
  'ct_o9mjlawxowa3y3rp',  // Social Sciences
  'ct_2v89gony7jnqj3d',   // Philosophy
]

interface PodscanPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description?: string
  podcast_guid?: string
  podcast_image_url?: string
  podcast_url?: string
  podcast_itunes_id?: string
  podcast_spotify_id?: string
  rss_url?: string
  podcast_categories?: Array<{
    category_id: string
    category_name: string
  }>
  language?: string
  region?: string
  episode_count?: number
  last_posted_at?: string
  is_active?: boolean
  podcast_has_guests?: boolean
  podcast_has_sponsors?: boolean
  publisher_name?: string
  host_name?: string
  podcast_reach_score?: number
  reach?: {
    itunes?: {
      itunes_rating_average?: string
      itunes_rating_count?: string
      itunes_rating_count_bracket?: string
    }
    spotify?: {
      spotify_rating_average?: string
      spotify_rating_count?: string
      spotify_rating_count_bracket?: string
    }
    audience_size?: number
    reach_score?: number
    email?: string
    website?: string
    social_links?: Array<{
      platform: string
      url: string
    }>
  }
}

interface PodscanSearchResponse {
  podcasts: PodscanPodcast[]
  page: number
  per_page: number
  total_count: number
}

// Calculate date 180 days ago (6 months)
function get180DaysAgo(): string {
  const date = new Date()
  date.setDate(date.getDate() - 180)
  return date.toISOString().split('T')[0]
}

// Search podcasts from Podscan API with retry logic
async function searchPodcasts(page: number = 1, retryCount: number = 0): Promise<PodscanSearchResponse> {
  const MAX_RETRIES = 3
  const RETRY_DELAY = 5000 // 5 seconds

  const params = new URLSearchParams({
    category_ids: ALL_MAJOR_CATEGORIES.join(','),
    language: 'en',
    min_audience_size: '500', // LOWERED from 1500 for broader coverage
    min_last_episode_posted_at: get180DaysAgo(), // EXTENDED from 100 to 180 days
    per_page: '50',
    order_by: 'audience_size',
    order_dir: 'desc',
    page: page.toString()
  })

  console.log(`🔍 Fetching page ${page} from Podscan API...${retryCount > 0 ? ` (Retry ${retryCount}/${MAX_RETRIES})` : ''}`)

  try {
    const response = await fetch(`${PODSCAN_API_URL}/podcasts/search?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${PODSCAN_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Podscan API error: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  } catch (error: any) {
    // Check if it's a connection error and we haven't exceeded retries
    if ((error.message?.includes('ECONNRESET') || error.message?.includes('fetch failed')) && retryCount < MAX_RETRIES) {
      console.log(`⚠️  Connection error. Waiting ${RETRY_DELAY/1000}s before retry...`)
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      return searchPodcasts(page, retryCount + 1)
    }
    throw error
  }
}

// Map Podscan podcast to database schema
function mapPodcastToDb(podcast: PodscanPodcast) {
  return {
    podscan_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description || null,
    podcast_guid: podcast.podcast_guid || null,
    podcast_image_url: podcast.podcast_image_url || null,
    podcast_url: podcast.podcast_url || null,
    podcast_itunes_id: podcast.podcast_itunes_id || null,
    podcast_spotify_id: podcast.podcast_spotify_id || null,
    rss_url: podcast.rss_url || null,
    podcast_categories: podcast.podcast_categories || null,
    language: podcast.language || null,
    region: podcast.region || null,
    episode_count: podcast.episode_count || null,
    last_posted_at: podcast.last_posted_at || null,
    is_active: podcast.is_active ?? true,
    podcast_has_guests: podcast.podcast_has_guests || null,
    podcast_has_sponsors: podcast.podcast_has_sponsors || null,
    publisher_name: podcast.publisher_name || null,
    host_name: podcast.host_name || null,
    itunes_rating: podcast.reach?.itunes?.itunes_rating_average ? parseFloat(podcast.reach.itunes.itunes_rating_average) : null,
    itunes_rating_count: podcast.reach?.itunes?.itunes_rating_count ? parseInt(podcast.reach.itunes.itunes_rating_count) : null,
    itunes_rating_count_bracket: podcast.reach?.itunes?.itunes_rating_count_bracket || null,
    spotify_rating: podcast.reach?.spotify?.spotify_rating_average ? parseFloat(podcast.reach.spotify.spotify_rating_average) : null,
    spotify_rating_count: podcast.reach?.spotify?.spotify_rating_count ? parseInt(podcast.reach.spotify.spotify_rating_count) : null,
    spotify_rating_count_bracket: podcast.reach?.spotify?.spotify_rating_count_bracket || null,
    audience_size: podcast.reach?.audience_size || null,
    podcast_reach_score: podcast.podcast_reach_score || null,
    podscan_email: podcast.reach?.email || null,
    website: podcast.reach?.website || null,
    social_links: podcast.reach?.social_links || null,
    podscan_last_fetched_at: new Date().toISOString(),
    podscan_fetch_count: 1,
    cache_hit_count: 0
  }
}

// Insert podcasts into database in batches
async function insertPodcasts(podcasts: any[]) {
  const BATCH_SIZE = 100
  let inserted = 0
  let updated = 0

  console.log(`💾 Inserting ${podcasts.length} podcasts in batches of ${BATCH_SIZE}...`)

  for (let i = 0; i < podcasts.length; i += BATCH_SIZE) {
    const batch = podcasts.slice(i, i + BATCH_SIZE)

    const { data, error } = await supabase
      .from('podcasts')
      .upsert(batch, {
        onConflict: 'podscan_id',
        ignoreDuplicates: false
      })
      .select()

    if (error) {
      console.error(`❌ Database error on batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error)
      throw error
    }

    console.log(`   ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(podcasts.length / BATCH_SIZE)} complete`)

    // Small delay between batches to avoid overwhelming the database
    if (i + BATCH_SIZE < podcasts.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  console.log(`✅ Successfully inserted/updated all podcasts`)
}

// Main scraping function
async function scrapePodcasts() {
  console.log('🚀 MAXIMUM COVERAGE PODCAST SCRAPING')
  console.log('=' .repeat(60))
  console.log(`📅 Time window: Last 180 days (since ${get180DaysAgo()})`)
  console.log(`📊 Filters: English, min 500 audience size`)
  console.log(`📂 Categories: ${ALL_MAJOR_CATEGORIES.length} major categories`)
  console.log(`🎯 Target: 5,000-7,000+ podcasts`)
  console.log('=' .repeat(60))
  console.log('')

  let totalScraped = 0
  let page = 1
  const targetCount = 7000 // Ambitious target
  const allPodcasts: any[] = []
  const uniquePodcastIds = new Set<string>()

  try {
    while (totalScraped < targetCount) {
      const response = await searchPodcasts(page)

      console.log(`📦 Page ${page}: Found ${response.podcasts.length} podcasts (Total: ${response.total_count})`)

      if (response.podcasts.length === 0) {
        console.log('⚠️  No more podcasts found')
        break
      }

      // Map and collect podcasts (filter duplicates and missing data)
      const mappedPodcasts = response.podcasts
        .filter(p => {
          if (!p.podcast_id || !p.podcast_name) return false
          if (uniquePodcastIds.has(p.podcast_id)) return false
          uniquePodcastIds.add(p.podcast_id)
          return true
        })
        .map(mapPodcastToDb)

      if (mappedPodcasts.length < response.podcasts.length) {
        const skipped = response.podcasts.length - mappedPodcasts.length
        console.log(`   ⚠️  Skipped ${skipped} duplicates or invalid podcasts`)
      }

      allPodcasts.push(...mappedPodcasts)
      totalScraped += mappedPodcasts.length

      console.log(`   📈 Progress: ${totalScraped.toLocaleString()}/${targetCount.toLocaleString()} unique podcasts collected`)

      // Insert in batches every 500 podcasts to avoid memory issues
      if (allPodcasts.length >= 500) {
        console.log(`\n💾 Saving batch of ${allPodcasts.length} podcasts...`)
        await insertPodcasts(allPodcasts)
        allPodcasts.length = 0 // Clear array
        console.log(`✅ Batch saved! Continuing...\n`)
      }

      // Stop if we've reached the last page
      if (response.podcasts.length < 50) {
        console.log('📄 Reached last page of results')
        break
      }

      page++

      // Rate limiting: wait 2 seconds between requests to avoid overwhelming API
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // Insert any remaining podcasts
    if (allPodcasts.length > 0) {
      console.log(`\n💾 Saving final batch of ${allPodcasts.length} podcasts...`)
      await insertPodcasts(allPodcasts)
    }

    console.log('\n' + '='.repeat(60))
    console.log('✨ SCRAPING COMPLETE!')
    console.log('='.repeat(60))
    console.log(`📊 Final Stats:`)
    console.log(`   - Total unique podcasts scraped: ${totalScraped.toLocaleString()}`)
    console.log(`   - Pages fetched: ${page}`)
    console.log(`   - API calls made: ${page}`)
    console.log(`   - Categories covered: ${ALL_MAJOR_CATEGORIES.length}`)
    console.log('='.repeat(60))

  } catch (error) {
    console.error('❌ Error during scraping:', error)

    // Save any podcasts we collected before the error
    if (allPodcasts.length > 0) {
      console.log(`\n⚠️  Attempting to save ${allPodcasts.length} podcasts collected before error...`)
      try {
        await insertPodcasts(allPodcasts)
        console.log(`✅ Saved ${allPodcasts.length} podcasts before exit`)
      } catch (saveError) {
        console.error(`❌ Failed to save podcasts:`, saveError)
      }
    }

    throw error
  }
}

// Run the scraper
scrapePodcasts()
  .then(() => {
    console.log('\n🎉 All done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error)
    process.exit(1)
  })
