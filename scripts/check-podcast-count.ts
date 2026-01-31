import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabase = createClient(supabaseUrl, supabaseKey)

async function checkCount() {
  const { count, error } = await supabase
    .from('podcasts')
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log(`✅ Total podcasts in database: ${count}`)

  // Get some sample data
  const { data: samples } = await supabase
    .from('podcasts')
    .select('podcast_name, audience_size, language, podcast_categories')
    .order('audience_size', { ascending: false })
    .limit(5)

  console.log('\n📊 Top 5 podcasts by audience size:')
  samples?.forEach((p, i) => {
    const categories = Array.isArray(p.podcast_categories)
      ? p.podcast_categories.map((c: any) => c.category_name).join(', ')
      : 'N/A'
    console.log(`${i + 1}. ${p.podcast_name} (${p.audience_size?.toLocaleString()} audience) - ${categories}`)
  })
}

checkCount()
