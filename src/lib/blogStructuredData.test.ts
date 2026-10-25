import { describe, expect, it } from 'vitest'

import { buildBlogStructuredData } from './blogStructuredData'
import type { BlogPost } from '@/services/blog'

const post: BlogPost = {
  id: 'post-1',
  slug: 'pitch-podcast-hosts',
  title: 'How to pitch podcast hosts',
  meta_description: 'A pitch that gets a reply.',
  content: '<p>Body</p>',
  focus_keyword: 'pitch podcast hosts',
  tags: ['outreach'],
  status: 'published',
  published_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-15T10:00:00Z',
  created_at: '2026-08-30T10:00:00Z',
  view_count: 0,
  read_time_minutes: 6,
  author_name: 'Jonathan Garces',
  blog_categories: {
    id: 'cat-1',
    name: 'Pitching',
    slug: 'pitching',
    display_order: 1,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  // Written when the post was created; must never reach the page.
  schema_markup: { '@type': 'BlogPosting', publisher: { name: 'Authority Lab' } },
}

describe('buildBlogStructuredData', () => {
  const url = 'https://getonapod.com/blog/pitch-podcast-hosts'
  const image = 'https://getonapod.com/og-image.png'

  it('describes the post from its current fields under the current brand', () => {
    const [posting] = buildBlogStructuredData(post, url, image)
    expect(posting).toMatchObject({
      '@type': 'BlogPosting',
      headline: 'How to pitch podcast hosts',
      description: 'A pitch that gets a reply.',
      image: [image],
      mainEntityOfPage: { '@id': url },
      author: { '@type': 'Person', name: 'Jonathan Garces' },
      publisher: {
        '@type': 'Organization',
        name: 'Get On A Pod',
        logo: { url: 'https://getonapod.com/icon-512.png' },
      },
      datePublished: '2026-09-01T10:00:00Z',
      dateModified: '2026-09-15T10:00:00Z',
      articleSection: 'Pitching',
      keywords: 'pitch podcast hosts, outreach',
      timeRequired: 'PT6M',
    })
    expect(JSON.stringify(posting)).not.toMatch(/Authority/u)
  })

  it('adds a Home > Blog > post breadcrumb trail', () => {
    const [, breadcrumbs] = buildBlogStructuredData(post, url, image)
    expect(breadcrumbs).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Home', item: 'https://getonapod.com/' },
        { position: 2, name: 'Blog', item: 'https://getonapod.com/blog' },
        { position: 3, name: 'How to pitch podcast hosts', item: url },
      ],
    })
  })

  it('leaves out dates and keywords the post does not have', () => {
    const [posting] = buildBlogStructuredData(
      { ...post, published_at: undefined, updated_at: '', focus_keyword: undefined, tags: [] },
      url,
      image,
    )
    expect(posting).not.toHaveProperty('datePublished')
    expect(posting).not.toHaveProperty('dateModified')
    expect(posting).not.toHaveProperty('keywords')
  })
})
