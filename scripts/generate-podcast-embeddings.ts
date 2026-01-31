import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const BATCH_SIZE = 50 // Process 50 podcasts at a time
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

interface Podcast {
  id: string
  podscan_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_categories: any
  publisher_name: string | null
  host_name: string | null
  language: string | null
  region: string | null
}

// Create text representation of podcast for embedding
function createPodcastText(podcast: Podcast): string {
  const parts: string[] = []

  // Podcast name (most important)
  if (podcast.podcast_name) {
    parts.push(`Title: ${podcast.podcast_name}`)
  }

  // Description
  if (podcast.podcast_description) {
    // Truncate very long descriptions
    const desc = podcast.podcast_description.substring(0, 500)
    parts.push(`Description: ${desc}`)
  }

  // Categories
  if (Array.isArray(podcast.podcast_categories)) {
    const categories = podcast.podcast_categories
      .map((c: any) => c.category_name)
      .filter(Boolean)
      .join(', ')
    if (categories) {
      parts.push(`Categories: ${categories}`)
    }
  }

  // Host/Publisher
  if (podcast.host_name) {
    parts.push(`Host: ${podcast.host_name}`)
  }
  if (podcast.publisher_name) {
    parts.push(`Publisher: ${podcast.publisher_name}`)
  }

  // Language/Region
  if (podcast.language) {
    parts.push(`Language: ${podcast.language}`)
  }
  if (podcast.region) {
    parts.push(`Region: ${podcast.region}`)
  }

  return parts.join('. ')
}

// Generate embedding for a single text
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS
  })

  return response.data[0].embedding
}

// Process a batch of podcasts
async function processBatch(podcasts: Podcast[]): Promise<void> {
  console.log(`\n📦 Processing batch of ${podcasts.length} podcasts...`)

  for (const podcast of podcasts) {
    try {
      // Create text representation
      const text = createPodcastText(podcast)

      if (!text || text.trim().length < 10) {
        console.log(`⚠️  Skipping ${podcast.podcast_name} - insufficient text`)
        continue
      }

      // Generate embedding
      const embedding = await generateEmbedding(text)

      // Update database
      const { error } = await supabase
        .from('podcasts')
        .update({
          embedding: embedding,
          embedding_generated_at: new Date().toISOString(),
          embedding_model: EMBEDDING_MODEL,
          embedding_text_length: text.length
        })
        .eq('id', podcast.id)

      if (error) {
        console.error(`❌ Failed to update ${podcast.podcast_name}:`, error.message)
      } else {
        console.log(`✅ ${podcast.podcast_name} (${text.length} chars)`)
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 50))

    } catch (error: any) {
      console.error(`❌ Error processing ${podcast.podcast_name}:`, error.message)

      // If rate limited, wait longer
      if (error.message?.includes('rate_limit')) {
        console.log('⏳ Rate limited, waiting 60 seconds...')
        await new Promise(resolve => setTimeout(resolve, 60000))
      }
    }
  }
}

// Main function
async function generateAllEmbeddings() {
  console.log('🚀 Starting Podcast Embedding Generation')
  console.log(`📊 Model: ${EMBEDDING_MODEL}`)
  console.log(`📏 Dimensions: ${EMBEDDING_DIMENSIONS}`)
  console.log(`📦 Batch Size: ${BATCH_SIZE}\n`)

  // Check API key
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set!')
    console.log('\nPlease set your OpenAI API key:')
    console.log('export OPENAI_API_KEY="sk-..."')
    process.exit(1)
  }

  // Check if already has embeddings
  const { count: embeddedCount } = await supabase
    .from('podcasts')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null)

  console.log(`📊 Current status: ${embeddedCount || 0} podcasts already have embeddings`)

  // Get all podcasts without embeddings
  const { data: podcasts, error } = await supabase
    .from('podcasts')
    .select('id, podscan_id, podcast_name, podcast_description, podcast_categories, publisher_name, host_name, language, region')
    .is('embedding', null)
    .order('audience_size', { ascending: false, nullsFirst: false })

  if (error) {
    console.error('❌ Failed to fetch podcasts:', error)
    process.exit(1)
  }

  if (!podcasts || podcasts.length === 0) {
    console.log('✅ All podcasts already have embeddings!')
    process.exit(0)
  }

  console.log(`\n📝 Found ${podcasts.length} podcasts to process`)
  console.log(`⏱️  Estimated time: ~${Math.ceil(podcasts.length / BATCH_SIZE)} minutes\n`)

  // Process in batches
  const totalBatches = Math.ceil(podcasts.length / BATCH_SIZE)
  let processedCount = 0

  for (let i = 0; i < podcasts.length; i += BATCH_SIZE) {
    const batch = podcasts.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1

    console.log(`\n📦 Batch ${batchNum}/${totalBatches}`)
    console.log('─'.repeat(50))

    await processBatch(batch)

    processedCount += batch.length
    const progress = ((processedCount / podcasts.length) * 100).toFixed(1)
    console.log(`\n✨ Progress: ${processedCount}/${podcasts.length} (${progress}%)`)

    // Delay between batches
    if (i + BATCH_SIZE < podcasts.length) {
      console.log('⏳ Waiting 5 seconds before next batch...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }

  // Final stats
  console.log('\n' + '='.repeat(50))
  console.log('🎉 EMBEDDING GENERATION COMPLETE!')
  console.log('='.repeat(50))

  const { count: finalCount } = await supabase
    .from('podcasts')
    .select('*', { count: 'exact', head: true })
    .not('embedding', 'is', null)

  console.log(`\n✅ Total podcasts with embeddings: ${finalCount}`)
  console.log(`📊 Newly embedded: ${processedCount}`)
  console.log(`\n💡 Next steps:`)
  console.log(`   1. Test semantic search with a prospect profile`)
  console.log(`   2. Create a matching function for your app`)
  console.log(`   3. Build a UI to display matched podcasts`)
}

// Run it
generateAllEmbeddings()
  .then(() => {
    console.log('\n✨ All done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error)
    process.exit(1)
  })
