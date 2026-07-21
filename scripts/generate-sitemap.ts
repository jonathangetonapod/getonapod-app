import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL =
  process.env.PODCASTS_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ''

const SUPABASE_KEY =
  process.env.PODCASTS_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
const STRICT_DATABASE = process.env.SITEMAP_REQUIRE_DATABASE === 'true'

function resolveBaseUrl(): string {
  try {
    const parsed = new URL(process.env.VITE_APP_URL || 'https://getonapod.com')
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.origin
  } catch {
    // Use the production canonical origin below.
  }
  return 'https://getonapod.com'
}

const BASE_URL = resolveBaseUrl()

interface BlogPost {
  slug: string
  updated_at: string
  published_at: string
}

async function generateSitemap() {
  console.log('🗺️  Generating sitemap...')

  let posts: BlogPost[] = []
  if (SUPABASE_URL && SUPABASE_KEY) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data, error } = await supabase
      .from('blog_posts')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })

    if (error) {
      if (STRICT_DATABASE) throw new Error('Sitemap database query failed')
      console.warn('⚠️  Blog index unavailable; generating a static-only sitemap')
    } else {
      posts = (data || []).filter(
        (post): post is BlogPost => typeof post?.slug === 'string' && post.slug.length > 0,
      )
    }
  } else if (STRICT_DATABASE) {
    throw new Error('Sitemap database credentials are required in strict mode')
  } else {
    console.warn('⚠️  No sitemap database credentials; generating static pages only')
  }

  console.log(`📝 Found ${posts.length} published posts`)

  // Static pages
  const staticPages = [
    { url: '', priority: '1.0', changefreq: 'daily' },
    { url: '/blog', priority: '0.9', changefreq: 'daily' },
    { url: '/resources', priority: '0.8', changefreq: 'weekly' },
    { url: '/course', priority: '0.8', changefreq: 'monthly' },
    { url: '/what-to-expect', priority: '0.8', changefreq: 'monthly' },
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
${posts
  .map(
    (post: BlogPost) => `  <url>
    <loc>${BASE_URL}/blog/${encodeURIComponent(post.slug)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
    <lastmod>${safeDate(post.updated_at || post.published_at)}</lastmod>
  </url>`
  )
  .join('\n')}
</urlset>
`

  // Write to public directory
  const sitemapPath = resolve(process.cwd(), 'public', 'sitemap.xml')
  writeFileSync(sitemapPath, sitemap, 'utf-8')

  console.log(`✅ Sitemap generated: ${sitemapPath}`)
  console.log(`📊 Total URLs: ${staticPages.length + posts.length}`)
}

function safeDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().split('T')[0]
    : date.toISOString().split('T')[0]
}

generateSitemap().catch((error) => {
  console.error('❌ Failed to generate sitemap:', error)
  process.exit(1)
})
