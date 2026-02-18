import { createClient } from '@supabase/supabase-js'

// Supabase setup
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Podscan API setup
const PODSCAN_API_URL = 'https://podscan.fm/api/v1'
const PODSCAN_TOKEN = 'tg7ZSteB27RqyNUqlIKtBK4gNAj8Hcm7z3oSzeYmd7421590'

// Underserved niches with search queries
const UNDERSERVED_NICHES = [
  {
    niche: 'Supply Chain / Logistics',
    queries: [
      'supply chain',
      'logistics',
      'operations management',
      'manufacturing',
      'warehouse',
      'inventory management',
      'procurement'
    ],
    targetPerQuery: 20
  },
  {
    niche: 'Financial Analysis / SEC Filings',
    queries: [
      'financial analysis',
      'stock market analysis',
      'investing research',
      'SEC filings',
      'equity research',
      'financial reporting',
      'value investing'
    ],
    targetPerQuery: 20
  },
  {
    niche: 'CTO / Tech Leadership',
    queries: [
      'CTO',
      'engineering leadership',
      'tech leadership',
      'software architecture',
      'engineering management',
      'VP engineering',
      'technical leadership'
    ],
    targetPerQuery: 20
  },
  {
    niche: 'Fitness Business / Gym Ownership',
    queries: [
      'fitness business',
      'gym owner',
      'gym management',
      'fitness entrepreneur',
      'personal training business',
      'fitness studio',
      'crossfit business'
    ],
    targetPerQuery: 20
  },
  {
    niche: 'Sustainability / ESG',
    queries: [
      'sustainability',
      'ESG',
      'climate change',
      'environmental',
      'renewable energy',
      'green business',
      'circular economy'
    ],
    targetPerQuery: 20
  },
  {
    niche: 'Law / Family Law',
    queries: [
      'family law',
      'divorce',
      'legal',
      'attorney',
      'lawyer podcast',
      'legal advice',
      'law practice'
    ],
    targetPerQuery: 20
  },
  {
    niche: 'Cybersecurity / Data Privacy',
    queries: [
      'cybersecurity',
      'infosec',
      'data privacy',
      'information security',
      'cyber threats',
      'network security',
      'privacy'
    ],
    targetPerQuery: 25
  },
  {
    niche: 'E-commerce / DTC',
    queries: [
      'e-commerce',
      'DTC',
      'direct to consumer',
      'shopify',
      'amazon FBA',
      'online retail',
      'dropshipping'
    ],
    targetPerQuery: 25
  }
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

// Search podcasts by query from Podscan API
async function searchPodcastsByQuery(query: string, page: number = 1): Promise<PodscanSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    language: 'en',
    min_audience_size: '500', // Lower threshold for niche topics
    min_last_episode_posted_at: get100DaysAgo(),
    per_page: '50',
    order_by: 'audience_size',
    order_dir: 'desc',
    page: page.toString()
  })

  console.log(`  🔍 Searching for "${query}" (page ${page})...`)

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
  if (podcasts.length === 0) return

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

  return data
}

// Main scraping function
async function scrapeUnderservedNiches() {
  console.log('🚀 Starting targeted scraping for UNDERSERVED NICHES')
  console.log(`📅 Filtering podcasts posted within last 100 days (since ${get100DaysAgo()})`)
  console.log(`📊 Filters: English, min 500 audience size, active podcasts\n`)

  let totalScraped = 0
  let totalNew = 0
  const allPodcasts = new Map<string, any>() // Use Map to deduplicate by podcast_id

  try {
    for (const nicheGroup of UNDERSERVED_NICHES) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`📂 NICHE: ${nicheGroup.niche}`)
      console.log(`${'='.repeat(60)}`)

      let nicheCount = 0

      for (const query of nicheGroup.queries) {
        let queryCount = 0
        let page = 1

        // Try to get target number of podcasts per query
        while (queryCount < nicheGroup.targetPerQuery) {
          try {
            const response = await searchPodcastsByQuery(query, page)

            if (response.podcasts.length === 0) {
              console.log(`     ℹ️  No more results for "${query}"`)
              break
            }

            // Map and collect podcasts
            const mappedPodcasts = response.podcasts
              .filter(p => p.podcast_id && p.podcast_name)
              .map(mapPodcastToDb)

            // Add to deduplicated collection
            let newInQuery = 0
            mappedPodcasts.forEach(podcast => {
              if (!allPodcasts.has(podcast.podscan_id)) {
                allPodcasts.set(podcast.podscan_id, podcast)
                newInQuery++
              }
            })

            queryCount += newInQuery
            nicheCount += newInQuery

            console.log(`     📦 Found ${mappedPodcasts.length} podcasts (${newInQuery} new) - Query total: ${queryCount}/${nicheGroup.targetPerQuery}`)

            // Stop if we've reached target for this query
            if (queryCount >= nicheGroup.targetPerQuery) {
              break
            }

            // Stop if no more pages
            if (response.podcasts.length < 50) {
              break
            }

            page++

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000))

          } catch (error) {
            console.error(`     ❌ Error searching "${query}":`, error)
            break
          }
        }
      }

      console.log(`  ✅ ${nicheGroup.niche}: Collected ${nicheCount} unique podcasts`)
    }

    // Insert all collected podcasts
    const podcastsToInsert = Array.from(allPodcasts.values())

    if (podcastsToInsert.length > 0) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`💾 Inserting ${podcastsToInsert.length} unique podcasts into database...`)

      // Insert in batches of 100
      const batchSize = 100
      for (let i = 0; i < podcastsToInsert.length; i += batchSize) {
        const batch = podcastsToInsert.slice(i, i + batchSize)
        await insertPodcasts(batch)
        console.log(`   ✓ Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(podcastsToInsert.length / batchSize)}`)
      }

      console.log(`\n✨ Scraping complete!`)
      console.log(`📊 Final Stats:`)
      console.log(`   - Total unique podcasts scraped: ${podcastsToInsert.length}`)
      console.log(`   - Niches covered: ${UNDERSERVED_NICHES.length}`)

      console.log(`\n📋 Breakdown by niche:`)
      UNDERSERVED_NICHES.forEach(niche => {
        console.log(`   - ${niche.niche}: ${niche.queries.length} queries × ${niche.targetPerQuery} target = ${niche.queries.length * niche.targetPerQuery} target podcasts`)
      })

    } else {
      console.log('⚠️  No new podcasts found')
    }

  } catch (error) {
    console.error('❌ Error during scraping:', error)
    throw error
  }
}

// Run the scraper
scrapeUnderservedNiches()
  .then(() => {
    console.log('\n🎉 All done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error)
    process.exit(1)
  })
