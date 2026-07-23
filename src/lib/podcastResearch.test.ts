import { describe, expect, it } from 'vitest'
import type { PodcastData } from '@/services/podscan'
import {
  calculateOutreachPriority,
  getResearchTier,
  mergeResearchResults,
  normalizeChartCategories,
  normalizePodscanQuery,
} from '@/lib/podcastResearch'

function podcast(overrides: Partial<PodcastData> = {}): PodcastData {
  return {
    podcast_id: 'pd_123',
    podcast_name: 'The Growth Show',
    podcast_url: 'https://example.com/show',
    ...overrides,
  }
}

describe('podcast research utilities', () => {
  it('normalizes legacy single-quoted phrases to Podscan exact-phrase syntax', () => {
    expect(normalizePodscanQuery("'B2B marketing' OR 'growth * stories'"))
      .toBe('"B2B marketing" OR "growth * stories"')
  })

  it('deduplicates discoveries while preserving source evidence and richer fields', () => {
    const first = mergeResearchResults([], [podcast({ podcast_description: 'Original' })], 'AI search', 'growth')
    const merged = mergeResearchResults(first, [podcast({ reach: { email: 'host@example.com' } })], 'Charts')

    expect(merged).toHaveLength(1)
    expect(merged[0].sources).toEqual(['AI search', 'Charts'])
    expect(merged[0].matchedQueries).toEqual(['growth'])
    expect(merged[0].podcast.podcast_description).toBe('Original')
    expect(merged[0].podcast.reach?.email).toBe('host@example.com')
  })

  it('rewards contactable, active guest shows without treating audience as the only priority', () => {
    const priority = calculateOutreachPriority(podcast({
      reach: { email: 'host@example.com', audience_size: 20_000 },
      podcast_has_guests: true,
      last_posted_at: '2026-07-10T00:00:00.000Z',
      episode_count: 80,
    }), new Date('2026-07-23T00:00:00.000Z'))

    expect(priority.score).toBe(100)
    expect(priority.factors.map((factor) => factor.label)).toEqual([
      'Contactability',
      'Activity',
      'Guest format',
      'Attainability',
      'Consistency',
    ])
  })

  it('keeps unscored shows in review and uses relevance plus outreach readiness for tiers', () => {
    expect(getResearchTier(null, 95)).toBe('review')
    expect(getResearchTier(86, 82)).toBe('a')
    expect(getResearchTier(72, 61)).toBe('b')
    expect(getResearchTier(52, 25)).toBe('c')
    expect(getResearchTier(91, 90, undefined, true)).toBe('excluded')
  })

  it('flattens Apple chart category hierarchies without losing subcategories', () => {
    expect(normalizeChartCategories({
      business: {
        slug: 'business',
        name: 'Business',
        subcategories: {
          entrepreneurship: { slug: 'entrepreneurship', name: 'Entrepreneurship' },
        },
      },
    })).toEqual([
      { id: 'business', name: 'Business' },
      { id: 'entrepreneurship', name: 'Entrepreneurship' },
    ])
  })
})
