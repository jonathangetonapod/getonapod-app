import { SITE_NAME, getSiteUrl, toAbsoluteUrl } from '@/lib/seo'
import type { BlogPost } from '@/services/blog'

const ORGANIZATION_LOGO_PATH = '/icon-512.png'

/**
 * The post's BlogPosting and BreadcrumbList structured data, built from its
 * own fields on every render. The schema_markup column is not used: it was
 * written once when the post was created, so it goes stale when the post is
 * edited and still names the retired brand and images that no longer exist.
 */
export const buildBlogStructuredData = (post: BlogPost, postUrl: string, imageUrl: string) => {
  const siteUrl = getSiteUrl()
  const blogPosting: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.meta_description,
    image: [imageUrl],
    url: postUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl },
    author: { '@type': 'Person', name: post.author_name },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: siteUrl,
      logo: { '@type': 'ImageObject', url: toAbsoluteUrl(ORGANIZATION_LOGO_PATH) },
    },
    inLanguage: 'en',
  }
  if (post.published_at) blogPosting.datePublished = post.published_at
  if (post.updated_at || post.published_at) blogPosting.dateModified = post.updated_at || post.published_at
  if (post.blog_categories?.name) blogPosting.articleSection = post.blog_categories.name
  const keywords = [post.focus_keyword, ...(post.tags || [])].filter(Boolean)
  if (keywords.length) blogPosting.keywords = keywords.join(', ')
  if (post.read_time_minutes) blogPosting.timeRequired = `PT${post.read_time_minutes}M`

  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteUrl}/blog` },
      { '@type': 'ListItem', position: 3, name: post.title, item: postUrl },
    ],
  }
  return [blogPosting, breadcrumbs]
}
