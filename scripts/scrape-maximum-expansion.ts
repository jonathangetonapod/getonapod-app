import { createClient } from '@supabase/supabase-js'

// Supabase setup
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

// Podscan API setup
const PODSCAN_API_URL = 'https://podscan.fm/api/v1'
const PODSCAN_TOKEN = 'tg7ZSteB27RqyNUqlIKtBK4gNAj8Hcm7z3oSzeYmd7421590'

// COMPREHENSIVE category coverage - ALL major categories
const ALL_CATEGORIES = [
  // Business & Entrepreneurship
  'ct_o9mjlawxowkdy3rp',  // Business
  'ct_6olr4e5ek5b7yj2a',  // Education
  'ct_3krv4dnrrqn79l6o',  // Technology

  // News & Current Events
  'ct_2v89gony7jnrqj3d',  // News
  'ct_8kgrblw8aoneo36z',  // Government

  // Culture & Society
  'ct_ox4amd5d9pweyq2r',  // Culture
  'ct_akrev35bm4w4ypql',  // Society
  'ct_zqbe76njpnyjx432',  // Arts

  // Entertainment
  'ct_z9majpn4r5o73bx8',  // Comedy
  'ct_rzemq35lz4w9x27d',  // TV
  'ct_akrev35bv9w4ypql',  // Film
  'ct_6zvjgq5arjw8drle',  // Leisure

  // Knowledge & Learning
  'ct_rzemq35l4n9x27dy',  // History
  'ct_3pk7q259ebwvr4bx',  // Science

  // Lifestyle & Wellness
  'ct_akrev35b8454ypql',  // Health
  'ct_ox4amd5dkpneyq2r',  // Fitness
  'ct_6zvjgq5avj58drle',  // Spirituality
  'ct_vy2zbpn3lgnq3m7g',  // Religion

  // Sports & Recreation
  'ct_6vqzjd529vn8xlep',  // Sports

  // True Crime
  'ct_lxbp9dwoak5aeom7',  // True Crime
]

// MASSIVE keyword search covering all possible niches
const COMPREHENSIVE_SEARCH_QUERIES = [
  // Business & Marketing (expanded)
  'marketing', 'digital marketing', 'social media marketing', 'content marketing',
  'email marketing', 'SEO', 'growth hacking', 'brand building', 'advertising',
  'sales', 'B2B sales', 'sales training', 'sales leadership', 'business development',
  'entrepreneurship', 'startup', 'founder', 'small business', 'solopreneur',
  'franchise', 'business strategy', 'business growth', 'scaling business',

  // Finance & Investing (expanded)
  'investing', 'real estate investing', 'stock market', 'trading', 'cryptocurrency',
  'bitcoin', 'blockchain', 'DeFi', 'personal finance', 'financial planning',
  'retirement planning', 'wealth building', 'financial independence', 'FIRE',
  'value investing', 'index funds', 'dividend investing', 'options trading',
  'day trading', 'swing trading', 'commercial real estate', 'multifamily investing',
  'syndication', 'crowdfunding', 'venture capital', 'private equity',
  'financial analysis', 'accounting', 'CFO', 'financial literacy',

  // Technology (expanded)
  'software development', 'programming', 'coding', 'web development',
  'app development', 'mobile development', 'DevOps', 'cloud computing',
  'AWS', 'Azure', 'artificial intelligence', 'machine learning', 'AI',
  'data science', 'data analytics', 'big data', 'cybersecurity',
  'information security', 'infosec', 'network security', 'ethical hacking',
  'penetration testing', 'privacy', 'data privacy', 'GDPR',
  'SaaS', 'product management', 'agile', 'scrum', 'project management',
  'CTO', 'engineering leadership', 'tech leadership', 'software architecture',

  // E-commerce & Online Business
  'e-commerce', 'ecommerce', 'online business', 'shopify', 'amazon FBA',
  'amazon seller', 'dropshipping', 'print on demand', 'etsy', 'ebay',
  'DTC', 'direct to consumer', 'online retail', 'digital products',

  // Content Creation & Media
  'content creation', 'YouTube', 'podcasting', 'blogging', 'writing',
  'copywriting', 'video production', 'photography', 'videography',
  'streaming', 'influencer', 'creator economy', 'monetization',

  // Leadership & Management
  'leadership', 'management', 'executive coaching', 'CEO', 'executive leadership',
  'team building', 'organizational culture', 'change management',
  'servant leadership', 'authentic leadership', 'women in leadership',

  // Personal Development (expanded)
  'personal development', 'self improvement', 'self help', 'motivation',
  'mindset', 'habits', 'productivity', 'time management', 'goal setting',
  'success', 'performance', 'peak performance', 'high performance',
  'discipline', 'focus', 'morning routine', 'life coaching',

  // Health & Wellness (expanded)
  'health', 'wellness', 'nutrition', 'diet', 'weight loss', 'keto',
  'paleo', 'vegan', 'plant based', 'intermittent fasting', 'carnivore',
  'fitness', 'workout', 'strength training', 'bodybuilding', 'powerlifting',
  'crossfit', 'yoga', 'pilates', 'running', 'marathon', 'triathlon',
  'mental health', 'therapy', 'psychology', 'anxiety', 'depression',
  'mindfulness', 'meditation', 'stress management', 'burnout',
  'sleep', 'longevity', 'biohacking', 'functional medicine', 'holistic health',

  // Relationships & Family
  'relationships', 'dating', 'marriage', 'parenting', 'motherhood',
  'fatherhood', 'family', 'divorce', 'co-parenting', 'single parent',

  // Career & Professional Development
  'career', 'career development', 'job search', 'resume', 'interview',
  'networking', 'personal branding', 'LinkedIn', 'remote work',
  'freelancing', 'consulting', 'side hustle', 'passive income',

  // Creative & Arts
  'music', 'art', 'design', 'graphic design', 'UX design', 'UI design',
  'interior design', 'fashion', 'beauty', 'creativity', 'writing',

  // Science & Education
  'science', 'physics', 'chemistry', 'biology', 'astronomy', 'space',
  'research', 'academic', 'teaching', 'education', 'homeschool',

  // News & Politics
  'politics', 'political commentary', 'conservative', 'liberal', 'progressive',
  'current events', 'world news', 'journalism', 'investigative journalism',

  // Sports & Athletics
  'sports', 'football', 'basketball', 'baseball', 'soccer', 'hockey',
  'golf', 'tennis', 'MMA', 'boxing', 'UFC', 'sports betting', 'fantasy sports',

  // Entertainment & Pop Culture
  'movies', 'film', 'television', 'TV shows', 'pop culture', 'celebrity',
  'entertainment news', 'music industry', 'gaming', 'video games', 'esports',

  // Food & Cooking
  'cooking', 'recipes', 'food', 'chef', 'culinary', 'baking', 'wine',
  'beer', 'coffee', 'restaurant', 'food business',

  // Travel & Adventure
  'travel', 'adventure', 'backpacking', 'digital nomad', 'van life',
  'expat', 'travel hacking', 'points and miles',

  // Hobbies & Interests
  'gardening', 'DIY', 'home improvement', 'woodworking', 'crafts',
  'knitting', 'sewing', 'cars', 'automotive', 'motorcycles',

  // Sustainability & Environment
  'sustainability', 'climate change', 'environment', 'ESG', 'green energy',
  'renewable energy', 'solar', 'electric vehicles', 'zero waste',
  'circular economy', 'conservation',

  // Legal & Law
  'law', 'legal', 'attorney', 'lawyer', 'family law', 'criminal law',
  'business law', 'intellectual property', 'patents', 'contracts',

  // Real Estate & Property
  'real estate', 'property', 'house flipping', 'wholesaling', 'landlord',
  'property management', 'Airbnb', 'short term rental', 'BRRRR',

  // Supply Chain & Operations
  'supply chain', 'logistics', 'operations', 'manufacturing', 'procurement',
  'inventory management', 'warehouse', 'distribution', 'lean manufacturing',

  // HR & Recruiting
  'human resources', 'HR', 'recruiting', 'talent acquisition', 'hiring',
  'employee engagement', 'workplace culture', 'diversity and inclusion',

  // Nonprofit & Social Impact
  'nonprofit', 'social impact', 'charity', 'philanthropy', 'social enterprise',
  'volunteering', 'activism', 'social justice',

  // Spirituality & Religion
  'Christianity', 'Christian', 'faith', 'Bible', 'prayer', 'church',
  'ministry', 'theology', 'Islam', 'Muslim', 'Buddhism', 'meditation',
  'spirituality', 'consciousness', 'awakening',

  // History & Culture
  'history', 'historical', 'ancient history', 'world war', 'military history',
  'archaeology', 'anthropology', 'philosophy', 'mythology',

  // Crime & Mystery
  'true crime', 'murder', 'serial killer', 'detective', 'investigation',
  'forensics', 'cold case', 'mystery', 'unsolved',

  // Parenting & Kids
  'parenting advice', 'positive parenting', 'gentle parenting', 'toddler',
  'baby', 'pregnancy', 'fertility', 'adoption', 'foster care',

  // Medical & Healthcare
  'medicine', 'doctor', 'physician', 'nursing', 'healthcare', 'medical',
  'pediatrics', 'cardiology', 'mental healthcare', 'public health',

  // Comedy & Humor
  'comedy', 'stand up comedy', 'improv', 'humor', 'funny', 'jokes',

  // Interviews & Storytelling
  'interviews', 'storytelling', 'memoir', 'biography', 'life stories',
  'oral history', 'documentary', 'investigative',

  // Niche Business Types
  'restaurant business', 'food truck', 'cafe', 'retail business',
  'salon', 'spa', 'fitness studio', 'gym business', 'coaching business',
  'agency', 'marketing agency', 'creative agency', 'dental practice',
  'medical practice', 'law firm',

  // Specialized Tech
  'web3', 'NFT', 'metaverse', 'VR', 'AR', 'IoT', 'robotics',
  'quantum computing', 'tech news', 'tech trends',

  // Mental Performance
  'cognitive enhancement', 'brain health', 'memory', 'learning',
  'accelerated learning', 'speed reading', 'note taking',

  // Extreme/Adventure
  'extreme sports', 'skydiving', 'rock climbing', 'mountaineering',
  'survival', 'wilderness', 'hunting', 'fishing', 'outdoor',

  // Money & Economics
  'economics', 'macroeconomics', 'economic policy', 'inflation',
  'federal reserve', 'monetary policy', 'recession', 'economic news',
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

// Calculate date 180 days ago (expanded from 100)
function get180DaysAgo(): string {
  const date = new Date()
  date.setDate(date.getDate() - 180)
  return date.toISOString().split('T')[0]
}

// Search by categories
async function searchByCategories(page: number = 1): Promise<PodscanSearchResponse> {
  const params = new URLSearchParams({
    category_ids: ALL_CATEGORIES.join(','),
    language: 'en',
    min_audience_size: '300', // Very low threshold to capture more podcasts
    min_last_episode_posted_at: get180DaysAgo(),
    per_page: '50',
    order_by: 'audience_size',
    order_dir: 'desc',
    page: page.toString()
  })

  console.log(`  🔍 Fetching by categories (page ${page})...`)

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

// Search by keyword
async function searchByKeyword(query: string, page: number = 1): Promise<PodscanSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    language: 'en',
    min_audience_size: '300', // Very low threshold
    min_last_episode_posted_at: get180DaysAgo(),
    per_page: '50',
    order_by: 'audience_size',
    order_dir: 'desc',
    page: page.toString()
  })

  console.log(`  🔍 Searching "${query}" (page ${page})...`)

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

// Insert podcasts in batches
async function insertPodcastsBatch(podcasts: any[]) {
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

// Main expansion function
async function maximumExpansion() {
  console.log('🚀 MAXIMUM PODCAST DATABASE EXPANSION')
  console.log(`📅 Filtering podcasts posted within last 180 days (since ${get180DaysAgo()})`)
  console.log(`📊 Filters: English, min 300 audience size`)
  console.log(`🎯 Strategy: Category sweep + ${COMPREHENSIVE_SEARCH_QUERIES.length} keyword searches\n`)

  const allPodcasts = new Map<string, any>()
  let apiCallCount = 0

  try {
    // PHASE 1: Category-based search (deep pagination)
    console.log(`\n${'='.repeat(70)}`)
    console.log(`📂 PHASE 1: CATEGORY-BASED SEARCH (${ALL_CATEGORIES.length} categories)`)
    console.log(`${'='.repeat(70)}`)

    let page = 1
    const maxPagesPerCategory = 100 // Go deep into category results

    while (page <= maxPagesPerCategory) {
      try {
        const response = await searchByCategories(page)
        apiCallCount++

        if (response.podcasts.length === 0) {
          console.log(`  ✓ Exhausted category results at page ${page}`)
          break
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

        console.log(`  📦 Page ${page}: +${newCount} new podcasts (Total unique: ${allPodcasts.size})`)

        if (response.podcasts.length < 50) {
          console.log(`  ✓ Reached last page of category results`)
          break
        }

        page++
        await new Promise(resolve => setTimeout(resolve, 800))

      } catch (error) {
        console.error(`  ❌ Error on page ${page}:`, error)
        break
      }
    }

    console.log(`\n✅ Phase 1 Complete: ${allPodcasts.size} unique podcasts from categories`)

    // PHASE 2: Keyword-based search
    console.log(`\n${'='.repeat(70)}`)
    console.log(`📂 PHASE 2: KEYWORD SEARCH (${COMPREHENSIVE_SEARCH_QUERIES.length} queries)`)
    console.log(`${'='.repeat(70)}`)

    let queryCount = 0
    const maxPagesPerQuery = 3 // Get top 3 pages per keyword

    for (const query of COMPREHENSIVE_SEARCH_QUERIES) {
      queryCount++
      let newFromQuery = 0

      console.log(`\n[${queryCount}/${COMPREHENSIVE_SEARCH_QUERIES.length}] "${query}"`)

      for (let page = 1; page <= maxPagesPerQuery; page++) {
        try {
          const response = await searchByKeyword(query, page)
          apiCallCount++

          if (response.podcasts.length === 0) break

          const mapped = response.podcasts
            .filter(p => p.podcast_id && p.podcast_name)
            .map(mapPodcastToDb)

          let newCount = 0
          mapped.forEach(p => {
            if (!allPodcasts.has(p.podscan_id)) {
              allPodcasts.set(p.podscan_id, p)
              newCount++
              newFromQuery++
            }
          })

          if (newCount > 0) {
            console.log(`  📦 Page ${page}: +${newCount} new`)
          }

          if (response.podcasts.length < 50) break

          await new Promise(resolve => setTimeout(resolve, 800))

        } catch (error) {
          console.error(`  ❌ Error:`, error)
          break
        }
      }

      if (newFromQuery > 0) {
        console.log(`  ✅ "${query}": +${newFromQuery} new podcasts (Total: ${allPodcasts.size})`)
      }

      // Insert every 100 queries to avoid memory issues
      if (queryCount % 100 === 0) {
        console.log(`\n💾 Checkpoint: Inserting ${allPodcasts.size} podcasts...`)
        const podcastsArray = Array.from(allPodcasts.values())

        for (let i = 0; i < podcastsArray.length; i += 100) {
          const batch = podcastsArray.slice(i, i + 100)
          await insertPodcastsBatch(batch)
        }

        console.log(`✅ Checkpoint saved!\n`)
      }
    }

    // FINAL INSERT
    console.log(`\n${'='.repeat(70)}`)
    console.log(`💾 FINAL INSERT`)
    console.log(`${'='.repeat(70)}`)

    const finalPodcasts = Array.from(allPodcasts.values())
    console.log(`Inserting ${finalPodcasts.length} unique podcasts...`)

    for (let i = 0; i < finalPodcasts.length; i += 100) {
      const batch = finalPodcasts.slice(i, i + 100)
      await insertPodcastsBatch(batch)
      const batchNum = Math.floor(i / 100) + 1
      const totalBatches = Math.ceil(finalPodcasts.length / 100)
      console.log(`  ✓ Batch ${batchNum}/${totalBatches}`)
    }

    // SUMMARY
    console.log(`\n${'='.repeat(70)}`)
    console.log(`✨ EXPANSION COMPLETE`)
    console.log(`${'='.repeat(70)}`)
    console.log(`📊 Total unique podcasts: ${finalPodcasts.length}`)
    console.log(`🔢 API calls made: ${apiCallCount}`)
    console.log(`📂 Categories searched: ${ALL_CATEGORIES.length}`)
    console.log(`🔍 Keywords searched: ${COMPREHENSIVE_SEARCH_QUERIES.length}`)
    console.log(`📅 Time window: Last 180 days`)
    console.log(`👥 Min audience: 300`)

  } catch (error) {
    console.error('❌ Fatal error:', error)
    throw error
  }
}

// Run
maximumExpansion()
  .then(() => {
    console.log('\n🎉 Mission accomplished!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error)
    process.exit(1)
  })
