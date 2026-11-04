import { describe, expect, it } from 'vitest'
import { isCorporateFeed, isRecentlyActive, showQualityScore } from './showQuality'

const NOW = Date.parse('2026-11-04T00:00:00Z')

describe('isRecentlyActive', () => {
  it('uses the Finder’s 90-day window and admits it does not know without a date', () => {
    expect(isRecentlyActive('2026-10-08', NOW)).toBe(true)
    expect(isRecentlyActive('2025-12-08', NOW)).toBe(false)
    expect(isRecentlyActive(null, NOW)).toBeNull()
  })
})

describe('isCorporateFeed', () => {
  it('catches a company feed named after its publisher, and network roll-ups', () => {
    expect(isCorporateFeed({ podcast_name: 'Infosys', publisher_name: 'Infosys Ltd.' })).toBe(true)
    expect(isCorporateFeed({ podcast_name: 'Heavybit Podcast Network Master Feed', publisher_name: 'Heavybit' })).toBe(true)
  })
  it('leaves hosted shows alone, including ones a company publishes', () => {
    expect(isCorporateFeed({ podcast_name: 'The AI CEO with Seema Alexander', publisher_name: 'Seema Alexander' })).toBe(false)
    expect(isCorporateFeed({ podcast_name: 'Alternative Insight', publisher_name: 'Aztec Group' })).toBe(false)
    expect(isCorporateFeed({ podcast_name: 'The Digital Agency Growth Podcast', publisher_name: 'Sales Schema' })).toBe(false)
  })
})

describe('showQualityScore', () => {
  it('puts an active, sizeable, independent show ahead of a stale or corporate one', () => {
    const authority = showQualityScore({ podcast_name: 'Authority Hacker', publisher_name: 'Gael Breton', audience_size: 12_000, last_posted_at: '2026-10-08' }, NOW)
    const stale = showQualityScore({ podcast_name: 'LiveChat Factory', publisher_name: 'Karen Levett', audience_size: 100, last_posted_at: '2025-12-08' }, NOW)
    const corporate = showQualityScore({ podcast_name: 'Infosys', publisher_name: 'Infosys Ltd.', audience_size: 300, last_posted_at: '2026-09-30' }, NOW)
    expect(authority).toBeGreaterThan(corporate)
    expect(corporate).toBeGreaterThan(stale)
  })
  it('does not let one huge show outweigh being active and independent', () => {
    const huge = showQualityScore({ podcast_name: 'Huge', audience_size: 1_500_000, last_posted_at: '2025-01-01' }, NOW)
    const activeSmall = showQualityScore({ podcast_name: 'Small', audience_size: 1_000, last_posted_at: '2026-10-30' }, NOW)
    expect(activeSmall).toBeGreaterThan(huge)
  })
})
