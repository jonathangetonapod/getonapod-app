import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || ''
const BASE_URL = process.env.VITE_APP_URL || 'https://getonapod.com'

interface BlogPost {
  slug: string
  updated_at: string
  published_at: string
}

async function generateSitemap() {
  console.log('🗺️  Generating sitemap...')

  // Initialize Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Fetch all published blog posts
  const { data: posts, error } = await supabase
    .from('blog_posts')
    .select('slug, updated_at, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  if (error) {
    console.error('❌ Error fetching posts:', error)
    process.exit(1)
  }

  console.log(`📝 Found ${posts?.length || 0} published posts`)

  // Static pages
  const staticPages = [
    { url: '', priority: '1.0', changefreq: 'daily' },
    { url: '/blog', priority: '0.9', changefreq: 'daily' },
    { url: '/premium-placements', priority: '0.9', changefreq: 'weekly' },
    { url: '/resources', priority: '0.8', changefreq: 'weekly' },
    { url: '/course', priority: '0.8', changefreq: 'monthly' },
  ]

  // Generate XML
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${BASE_URL}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </url>`
  )
  .join('\n')}
${(posts || [])
  .map(
    (post: BlogPost) => `  <url>
    <loc>${BASE_URL}/blog/${post.slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
    <lastmod>${new Date(post.updated_at || post.published_at).toISOString().split('T')[0]}</lastmod>
  </url>`
  )
  .join('\n')}
</urlset>
`

  // Write to public directory
  const sitemapPath = resolve(process.cwd(), 'public', 'sitemap.xml')
  writeFileSync(sitemapPath, sitemap, 'utf-8')

  console.log(`✅ Sitemap generated: ${sitemapPath}`)
  console.log(`📊 Total URLs: ${staticPages.length + (posts?.length || 0)}`)
}

generateSitemap().catch((error) => {
  console.error('❌ Failed to generate sitemap:', error)
  process.exit(1)
})
