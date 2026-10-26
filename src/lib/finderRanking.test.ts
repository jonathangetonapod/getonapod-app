import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESULT_VIEW,
  compareResults,
  postedAgo,
  preRankCandidates,
  scanDurationLabel,
  viewResults,
  type RankablePodcast,
  type RankedResult,
} from '@/lib/finderRanking'

const now = Date.parse('2026-10-26T12:00:00Z')
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString()

function podcast(id: string, extra: Partial<RankablePodcast> = {}): RankablePodcast {
  return { podcast_id: id, podcast_name: `Show ${id}`, source: 'podscan', ...extra }
}

function result(id: string, score: number | null, extra: Partial<RankedResult> = {}, podcastExtra: Partial<RankablePodcast> = {}): RankedResult {
  return { podcast: podcast(id, podcastExtra), score, reasoning: null, estimated: false, ...extra }
}

describe('preRankCandidates', () => {
  it('puts shows several queries found ahead of one-off matches', () => {
    const ranked = preRankCandidates(
      [podcast('once'), podcast('thrice')],
      new Map([['once', 1], ['thrice', 3]]),
      '',
      now,
    )
    expect(ranked.map((entry) => entry.podcast_id)).toEqual(['thrice', 'once'])
  })

  it('weighs profile overlap and recent activity when hits are equal', () => {
    const ranked = preRankCandidates(
      [
        podcast('stale', { last_posted_at: daysAgo(200) }),
        podcast('saas', { podcast_description: 'Bootstrapped SaaS founders on pricing', last_posted_at: daysAgo(5) }),
      ],
      new Map(),
      'Taylor helps bootstrapped SaaS founders with pricing.',
      now,
    )
    expect(ranked[0].podcast_id).toBe('saas')
  })

  it('keeps discovery order when nothing tells the shows apart', () => {
    const ranked = preRankCandidates([podcast('a'), podcast('b'), podcast('c')], new Map(), '', now)
    expect(ranked.map((entry) => entry.podcast_id)).toEqual(['a', 'b', 'c'])
  })
})

describe('result ordering and views', () => {
  const results = [
    result('estimated-high', 90, { estimated: true }, { podcast_email: 'host@example.com' }),
    result('ai-mid', 72, {}, { audience_size: 50_000, last_posted_at: daysAgo(40) }),
    result('unscored', null),
    result('ai-high', 88, {}, { audience_size: 2_000, last_posted_at: daysAgo(2), podcast_email: 'hi@example.com' }),
  ]

  it('ranks model scores above keyword estimates, and the unscored last', () => {
    expect([...results].sort(compareResults).map((entry) => entry.podcast.podcast_id))
      .toEqual(['ai-high', 'ai-mid', 'estimated-high', 'unscored'])
  })

  it('narrows by fit, estimates and email without scanning again', () => {
    expect(viewResults(results, { ...DEFAULT_RESULT_VIEW, minScore: 80 }).map((entry) => entry.podcast.podcast_id))
      .toEqual(['ai-high', 'estimated-high'])
    expect(viewResults(results, { ...DEFAULT_RESULT_VIEW, hideEstimated: true }).map((entry) => entry.podcast.podcast_id))
      .toEqual(['ai-high', 'ai-mid', 'unscored'])
    expect(viewResults(results, { ...DEFAULT_RESULT_VIEW, emailOnly: true }).map((entry) => entry.podcast.podcast_id))
      .toEqual(['ai-high', 'estimated-high'])
  })

  it('sorts by audience or by the latest episode', () => {
    expect(viewResults(results, { ...DEFAULT_RESULT_VIEW, sort: 'audience' })[0].podcast.podcast_id).toBe('ai-mid')
    expect(viewResults(results, { ...DEFAULT_RESULT_VIEW, sort: 'recent' })[0].podcast.podcast_id).toBe('ai-high')
  })
})

describe('labels', () => {
  it('estimates scan time from the queries it will run', () => {
    expect(scanDurationLabel(1)).toBe('Under a minute.')
    expect(scanDurationLabel(6)).toBe('About a minute.')
    expect(scanDurationLabel(20)).toBe('About 2 minutes.')
    expect(scanDurationLabel(40)).toBe('About 4 minutes.')
  })

  it('says when a show last published', () => {
    expect(postedAgo(daysAgo(0.5), now)).toBe('today')
    expect(postedAgo(daysAgo(3), now)).toBe('3 days ago')
    expect(postedAgo(daysAgo(120), now)).toBe('4 months ago')
    expect(postedAgo(null, now)).toBeNull()
  })
})
