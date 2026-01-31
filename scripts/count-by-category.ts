import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function countByCategory() {
  // Get all podcasts with categories
  const { data: podcasts, error } = await supabase
    .from('podcasts')
    .select('podcast_categories')
    .not('podcast_categories', 'is', null)

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  // Count categories
  const categoryCount = new Map<string, number>()

  podcasts?.forEach(podcast => {
    if (Array.isArray(podcast.podcast_categories)) {
      podcast.podcast_categories.forEach((cat: any) => {
        if (cat.category_name) {
          const name = cat.category_name
          categoryCount.set(name, (categoryCount.get(name) || 0) + 1)
        }
      })
    }
  })

  // Sort by count descending
  const sorted = Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1])

  console.log(`📊 Podcast Distribution Across Categories\n`)
  console.log(`Total unique categories: ${sorted.length}`)
  console.log(`Total podcasts analyzed: ${podcasts?.length}\n`)

  // Show top 30
  console.log('Top 30 Categories:')
  console.log('─'.repeat(50))
  sorted.slice(0, 30).forEach(([category, count], index) => {
    const bar = '█'.repeat(Math.floor(count / 10))
    console.log(`${(index + 1).toString().padStart(2)}. ${category.padEnd(25)} ${count.toString().padStart(4)} ${bar}`)
  })

  // Show our target 20 categories specifically
  console.log('\n\n🎯 Our Top 20 Target Categories:')
  console.log('─'.repeat(50))
  const targetCategories = [
    'business', 'entrepreneurship', 'technology', 'true crime', 'comedy',
    'news', 'self-improvement', 'health', 'investing', 'marketing',
    'sports', 'entertainment', 'education', 'interviews', 'fitness',
    'personal-development', 'mental-health', 'politics', 'science', 'productivity'
  ]

  targetCategories.forEach((cat, index) => {
    const count = categoryCount.get(cat) || 0
    const bar = '█'.repeat(Math.floor(count / 10))
    console.log(`${(index + 1).toString().padStart(2)}. ${cat.padEnd(25)} ${count.toString().padStart(4)} ${bar}`)
  })
}

countByCategory()
