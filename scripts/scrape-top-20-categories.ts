import { createClient } from '@supabase/supabase-js'

// Supabase setup
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Podscan API setup
const PODSCAN_API_URL = 'https://podscan.fm/api/v1'
const PODSCAN_TOKEN = 'tg7ZSteB27RqyNUqlIKtBK4gNAj8Hcm7z3oSzeYmd7421590'

// Top 20 most popular categories (ALL)
const TOP_20_CATEGORIES = [
  // Top 10 (already scraped, but will get more)
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

  // Next 10 (11-20)
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

// Calculate date 100 days ago
function get100DaysAgo(): string {
  const date = new Date()
  date.setDate(date.getDate() - 100)
  return date.toISOString().split('T')[0]
}

// Search podcasts from Podscan API
async function searchPodcasts(page: number = 1): Promise<PodscanSearchResponse> {
  const params = new URLSearchParams({
    category_ids: TOP_20_CATEGORIES.join(','),
    language: 'en',
    min_audience_size: '1500', // Lowered even more to get more results
    min_last_episode_posted_at: get100DaysAgo(),
    per_page: '50',
    order_by: 'audience_size',
    order_dir: 'desc',
    page: page.toString()
  })

  console.log(`🔍 Fetching page ${page} from Podscan API...`)

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

// Insert podcasts into database
async function insertPodcasts(podcasts: any[]) {
  console.log(`💾 Inserting ${podcasts.length} podcasts into database...`)

  const { data, error } = await supabase
    .from('podcasts')
    .upsert(podcasts, {
      onConflict: 'podscan_id',
      ignoreDuplicates: false
    })

  if (error) {
    console.error('❌ Database error:', error)
    throw error
  }

  console.log(`✅ Successfully inserted/updated podcasts`)
  return data
}

// Main scraping function
async function scrapePodcasts() {
  console.log('🚀 Starting podcast scraping - TOP 20 CATEGORIES')
  console.log(`📅 Filtering podcasts posted within last 100 days (since ${get100DaysAgo()})`)
  console.log(`🎯 Target: 1000-1500 podcasts from top 20 categories`)
  console.log(`📊 Filters: English, min 1500 audience size`)
  console.log(`📂 Categories: Business, News, Culture, Society, Technology, Education, Comedy,`)
  console.log(`   Arts, History, Government, Sports, TV, Film, Leisure, Religion,`)
  console.log(`   Spirituality, Science, True Crime, Health, Fitness\n`)

  let totalScraped = 0
  let page = 1
  const targetCount = 1500
  const allPodcasts: any[] = []

  try {
    while (totalScraped < targetCount) {
      const response = await searchPodcasts(page)

      console.log(`📦 Page ${page}: Found ${response.podcasts.length} podcasts`)

      if (response.podcasts.length === 0) {
        console.log('⚠️  No more podcasts found')
        break
      }

      // Map and collect podcasts (filter out any without IDs)
      const mappedPodcasts = response.podcasts
        .filter(p => p.podcast_id && p.podcast_name) // Ensure podcast has required fields
        .map(mapPodcastToDb)

      if (mappedPodcasts.length < response.podcasts.length) {
        console.log(`   ⚠️  Skipped ${response.podcasts.length - mappedPodcasts.length} podcasts without IDs`)
      }

      allPodcasts.push(...mappedPodcasts)

      totalScraped += mappedPodcasts.length

      console.log(`   Progress: ${totalScraped}/${targetCount} podcasts collected`)

      // Stop if we've reached our target
      if (totalScraped >= targetCount) {
        console.log(`🎯 Target reached! Collected ${totalScraped} podcasts`)
        break
      }

      // Stop if we've reached the last page
      if (response.podcasts.length < 50) {
        console.log('📄 Reached last page')
        break
      }

      page++

      // Rate limiting: wait 1 second between requests
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // Insert all collected podcasts
    if (allPodcasts.length > 0) {
      console.log(`\n💾 Inserting ${allPodcasts.length} podcasts into database...`)
      await insertPodcasts(allPodcasts)

      console.log('\n✨ Scraping complete!')
      console.log(`📊 Final Stats:`)
      console.log(`   - Total podcasts scraped: ${allPodcasts.length}`)
      console.log(`   - Pages fetched: ${page}`)
      console.log(`   - API calls made: ${page}`)
    } else {
      console.log('⚠️  No podcasts found matching criteria')
    }

  } catch (error) {
    console.error('❌ Error during scraping:', error)
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
