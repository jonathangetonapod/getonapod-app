import { createClient } from '@supabase/supabase-js'

// Supabase setup
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Podscan API setup
const PODSCAN_API_URL = 'https://podscan.fm/api/v1'
const PODSCAN_TOKEN = 'tg7ZSteB27RqyNUqlIKtBK4gNAj8Hcm7z3oSzeYmd7421590'

// Rate limits
const MAX_REQUESTS_PER_DAY = 2000
const MAX_REQUESTS_PER_MINUTE = 120
const MAX_CONCURRENT = 10

// Comprehensive search queries (top performing niches)
const SEARCH_QUERIES = [
  // Business & Marketing (high value)
  'marketing', 'business', 'entrepreneur', 'startup', 'sales', 'leadership',
  'CEO', 'founder', 'small business', 'digital marketing', 'social media marketing',
  'content marketing', 'brand', 'branding', 'growth', 'scaling',

  // Finance & Investing
  'investing', 'real estate', 'stock market', 'trading', 'cryptocurrency',
  'bitcoin', 'personal finance', 'financial planning', 'wealth', 'money',
  'real estate investing', 'syndication', 'value investing', 'retirement',

  // Technology
  'technology', 'software', 'AI', 'artificial intelligence', 'machine learning',
  'data science', 'programming', 'coding', 'cybersecurity', 'SaaS',
  'product management', 'CTO', 'engineering leadership', 'web development',

  // E-commerce
  'ecommerce', 'shopify', 'amazon FBA', 'dropshipping', 'online business',
  'DTC', 'direct to consumer',

  // Health & Wellness
  'health', 'fitness', 'nutrition', 'wellness', 'mental health', 'mindfulness',
  'weight loss', 'workout', 'yoga', 'meditation', 'therapy', 'psychology',

  // Personal Development
  'personal development', 'self improvement', 'motivation', 'productivity',
  'success', 'mindset', 'habits', 'goals', 'life coaching',

  // Leadership & Career
  'executive coaching', 'career', 'professional development', 'management',
  'team building', 'communication', 'networking', 'personal branding',

  // Specialized Business
  'franchise', 'consulting', 'freelancing', 'agency', 'coaching business',
  'restaurant', 'retail', 'B2B', 'SaaS business',

  // Operations & Supply Chain
  'supply chain', 'logistics', 'operations', 'manufacturing', 'lean',

  // Legal & Professional Services
  'law', 'attorney', 'legal', 'family law', 'divorce', 'business law',

  // Creative & Media
  'content creation', 'YouTube', 'podcasting', 'video', 'social media',
  'influencer', 'creator economy', 'photography', 'design',

  // Real Estate Specific
  'property management', 'landlord', 'Airbnb', 'house flipping', 'BRRRR',

  // Tech Specialties
  'web3', 'blockchain', 'NFT', 'cloud computing', 'DevOps',
  'data analytics', 'product design', 'UX',

  // Lifestyle & Interest
  'travel', 'food', 'cooking', 'parenting', 'family', 'relationships',
  'sustainability', 'ESG', 'climate',

  // Sports & Entertainment
  'sports', 'fitness business', 'gym', 'sports business', 'entertainment',

  // Niche Professional
  'medical', 'healthcare', 'doctor', 'nursing', 'dental', 'veterinary',
  'accounting', 'financial advisor', 'insurance', 'CFO',

  // Additional High-Value
  'innovation', 'strategy', 'transformation', 'change management',
  'customer experience', 'customer success', 'user experience',
  'analytics', 'metrics', 'KPIs', 'ROI', 'growth hacking',
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

// Calculate date 2 years ago
function get2YearsAgo(): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 2)
  return date.toISOString().split('T')[0]
}

// Search by keyword - NO FILTERS
async function searchByKeyword(query: string, page: number = 1): Promise<PodscanSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    language: 'en',
    // NO min_audience filter - get everything!
    min_last_episode_posted_at: get2YearsAgo(), // 2 years for max coverage
    per_page: '50',
    order_by: 'audience_size',
    order_dir: 'desc',
    page: page.toString()
  })

  const response = await fetch(`${PODSCAN_API_URL}/podcasts/search?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${PODSCAN_TOKEN}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`Podscan API error: ${response.status}`)
  }

  return await response.json()
}

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

async function insertBatch(podcasts: any[]) {
  if (podcasts.length === 0) return

  const { error } = await supabase
    .from('podcasts')
    .upsert(podcasts, {
      onConflict: 'podscan_id',
      ignoreDuplicates: false
    })

  if (error) throw error
}

// Rate limiter
class RateLimiter {
  private requestsThisMinute = 0
  private requestsToday = 0
  private minuteStart = Date.now()
  private activeRequests = 0

  async waitForSlot() {
    // Check daily limit
    if (this.requestsToday >= MAX_REQUESTS_PER_DAY) {
      throw new Error('Daily request limit reached (2000)')
    }

    // Reset minute counter if needed
    if (Date.now() - this.minuteStart > 60000) {
      this.requestsThisMinute = 0
      this.minuteStart = Date.now()
    }

    // Wait if at minute limit
    while (this.requestsThisMinute >= MAX_REQUESTS_PER_MINUTE) {
      const waitTime = 60000 - (Date.now() - this.minuteStart)
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
      this.requestsThisMinute = 0
      this.minuteStart = Date.now()
    }

    // Wait if at concurrent limit
    while (this.activeRequests >= MAX_CONCURRENT) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.requestsThisMinute++
    this.requestsToday++
    this.activeRequests++
  }

  release() {
    this.activeRequests--
  }

  getStats() {
    return {
      requestsToday: this.requestsToday,
      requestsThisMinute: this.requestsThisMinute,
      activeRequests: this.activeRequests
    }
  }
}

async function optimizedConcurrentScrape() {
  console.log('🚀 OPTIMIZED CONCURRENT PODCAST SCRAPER')
  console.log(`📅 Time window: Last 2 years`)
  console.log(`👥 Min audience: NONE (maximum coverage)`)
  console.log(`🔍 Search queries: ${SEARCH_QUERIES.length}`)
  console.log(`⚡ Max concurrent: ${MAX_CONCURRENT}`)
  console.log(`⏱️  Max per minute: ${MAX_REQUESTS_PER_MINUTE}`)
  console.log(`📊 Daily limit: ${MAX_REQUESTS_PER_DAY}`)
  console.log(`📄 Pages per query: 10 (500 podcasts max per query)\n`)

  const rateLimiter = new RateLimiter()
  const allPodcasts = new Map<string, any>()
  const tasks: Promise<void>[] = []

  try {
    let queryNum = 0

    for (const query of SEARCH_QUERIES) {
      queryNum++

      // Search up to 10 pages per query (500 podcasts)
      for (let page = 1; page <= 10; page++) {
        const task = (async () => {
          try {
            await rateLimiter.waitForSlot()

            const response = await searchByKeyword(query, page)

            if (response.podcasts.length === 0) {
              rateLimiter.release()
              return
            }

            const mapped = response.podcasts
              .filter(p => p.podcast_id && p.podcast_name)
              .map(mapPodcastToDb)

            let newCount = 0
            mapped.forEach(p => {
              if (!allPodcasts.has(p.podscan_id)) {
                allPodcasts.set(p.podscan_id, p)
                newCount++
              }
            })

            if (newCount > 0 && (allPodcasts.size % 100 === 0 || queryNum % 10 === 0)) {
              const stats = rateLimiter.getStats()
              console.log(`  [${queryNum}/${SEARCH_QUERIES.length}] "${query}" p${page}: +${newCount} | Total: ${allPodcasts.size} | Requests today: ${stats.requestsToday}/${MAX_REQUESTS_PER_DAY}`)
            }

            rateLimiter.release()

            // Stop pagination if less than full page
            if (response.podcasts.length < 50) {
              return
            }

          } catch (error) {
            rateLimiter.release()
            // Silently continue on errors
          }
        })()

        tasks.push(task)
      }

      // Auto-save every 20 queries
      if (queryNum % 20 === 0) {
        await Promise.all(tasks)
        tasks.length = 0

        console.log(`\n💾 AUTO-SAVE at query ${queryNum}...`)
        const arr = Array.from(allPodcasts.values())

        for (let i = 0; i < arr.length; i += 100) {
          await insertBatch(arr.slice(i, i + 100))
        }

        const stats = rateLimiter.getStats()
        console.log(`✅ Saved ${arr.length} podcasts | API calls: ${stats.requestsToday}/${MAX_REQUESTS_PER_DAY}\n`)

        // Stop if approaching daily limit
        if (stats.requestsToday >= MAX_REQUESTS_PER_DAY - 100) {
          console.log(`⚠️  Approaching daily limit (${stats.requestsToday}/${MAX_REQUESTS_PER_DAY})`)
          console.log(`Stopping to preserve requests for tomorrow...`)
          break
        }
      }
    }

    // Wait for remaining tasks
    await Promise.all(tasks)

    // FINAL SAVE
    console.log(`\n${'='.repeat(70)}`)
    console.log(`💾 FINAL SAVE`)
    console.log(`${'='.repeat(70)}`)

    const final = Array.from(allPodcasts.values())
    console.log(`Inserting ${final.length} unique podcasts...`)

    for (let i = 0; i < final.length; i += 100) {
      await insertBatch(final.slice(i, i + 100))
      if ((i / 100 + 1) % 10 === 0) {
        console.log(`  Batch ${i / 100 + 1}/${Math.ceil(final.length / 100)}`)
      }
    }

    const stats = rateLimiter.getStats()

    console.log(`\n${'='.repeat(70)}`)
    console.log(`✨ SCRAPING COMPLETE`)
    console.log(`${'='.repeat(70)}`)
    console.log(`📊 Total unique podcasts: ${final.length}`)
    console.log(`🔢 API calls used: ${stats.requestsToday}/${MAX_REQUESTS_PER_DAY}`)
    console.log(`🔍 Queries processed: ${queryNum}/${SEARCH_QUERIES.length}`)
    console.log(`📈 Average: ${(final.length / stats.requestsToday).toFixed(2)} podcasts per API call`)

  } catch (error) {
    console.error('❌ Error:', error)

    // Emergency save
    const final = Array.from(allPodcasts.values())
    if (final.length > 0) {
      console.log(`\n🚨 EMERGENCY SAVE: ${final.length} podcasts...`)
      for (let i = 0; i < final.length; i += 100) {
        await insertBatch(final.slice(i, i + 100))
      }
      console.log(`✅ Emergency save complete`)
    }

    throw error
  }
}

optimizedConcurrentScrape()
  .then(() => {
    console.log('\n🎉 DONE!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 FATAL:', error)
    process.exit(1)
  })
