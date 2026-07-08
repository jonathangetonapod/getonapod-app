import { Helmet } from 'react-helmet-async'
import { DEFAULT_OG_IMAGE_ALT, DEFAULT_OG_IMAGE_PATH, SITE_NAME, getSiteUrl, toAbsoluteUrl } from '@/lib/seo'
import type { BlogPost } from '@/services/blog'

interface BlogSEOProps {
  post: BlogPost
  isPreview?: boolean
}

export function BlogSEO({ post, isPreview = false }: BlogSEOProps) {
  const baseUrl = getSiteUrl()
  const postUrl = isPreview ? `${baseUrl}/blog/preview` : `${baseUrl}/blog/${post.slug}`

  // Use featured image or fallback
  const ogImage = post.featured_image_url || toAbsoluteUrl(DEFAULT_OG_IMAGE_PATH)

  // Build keywords
  const keywords = [
    post.focus_keyword,
    ...(post.tags || []),
  ].filter(Boolean).join(', ')

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{post.title} | Get On A Pod</title>
      <meta name="description" content={post.meta_description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="author" content={post.author_name} />
      <link rel="canonical" href={postUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="article" />
      <meta property="og:url" content={postUrl} />
      <meta property="og:title" content={post.title} />
      <meta property="og:description" content={post.meta_description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:alt" content={post.title || DEFAULT_OG_IMAGE_ALT} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content={SITE_NAME} />
      {post.published_at && (
        <meta property="article:published_time" content={post.published_at} />
      )}
      {post.updated_at && (
        <meta property="article:modified_time" content={post.updated_at} />
      )}
      <meta property="article:author" content={post.author_name} />
      {post.blog_categories && (
        <meta property="article:section" content={post.blog_categories.name} />
      )}
      {post.tags?.map((tag) => (
        <meta key={tag} property="article:tag" content={tag} />
      ))}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={postUrl} />
      <meta name="twitter:title" content={post.title} />
      <meta name="twitter:description" content={post.meta_description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content={post.title || DEFAULT_OG_IMAGE_ALT} />

      {/* Additional SEO */}
      <meta name="robots" content={isPreview ? 'noindex, nofollow' : 'index, follow'} />
      <meta name="googlebot" content={isPreview ? 'noindex, nofollow' : 'index, follow'} />

      {/* Schema.org Structured Data */}
      {post.schema_markup && (
        <script type="application/ld+json">
          {JSON.stringify(post.schema_markup)}
        </script>
      )}
    </Helmet>
  )
}
