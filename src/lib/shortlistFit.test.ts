import { describe, expect, it } from 'vitest'
import type { ClientShortlistPodcast } from '@/services/clientShortlist'
import { chunk, fitBand, fitScoreLabel, fitState, rowsToScore } from '@/lib/shortlistFit'

const profile = { hash: 'current', ready: true }

function row(overrides: Partial<ClientShortlistPodcast>): ClientShortlistPodcast {
  return { id: 'r', podcast_id: 'p', podcast_name: 'Show', visibility: 'visible', ...overrides } as ClientShortlistPodcast
}

describe('shortlist fit', () => {
  it('a score is current only when the AI made it against today’s profile', () => {
    expect(fitState(row({}), profile)).toBe('unscored')
    expect(fitState(row({ fit_score: 8, fit_source: 'ai', fit_profile_hash: 'current' }), profile)).toBe('current')
    expect(fitState(row({ fit_score: 8, fit_source: 'ai', fit_profile_hash: 'older' }), profile)).toBe('stale')
    // Autopilot scores carry no hash: it judged the bio alone.
    expect(fitState(row({ fit_score: 8, fit_source: 'ai', fit_profile_hash: null }), profile)).toBe('stale')
    expect(fitState(row({ fit_score: 6, fit_source: 'estimate', fit_profile_hash: 'current' }), profile)).toBe('stale')
    expect(fitState(row({ fit_score: 8, fit_source: 'ai', fit_profile_hash: 'current' }), null)).toBe('stale')
  })

  it('bands scores the way the Finder does', () => {
    expect(fitBand(9.5)).toBe('strong')
    expect(fitBand(8)).toBe('strong')
    expect(fitBand(7.9)).toBe('possible')
    expect(fitBand(5)).toBe('possible')
    expect(fitBand(4.9)).toBe('weak')
    expect(fitScoreLabel(8)).toBe('8')
    expect(fitScoreLabel(7.5)).toBe('7.5')
  })

  it('scores only visible rows that are unscored or stale', () => {
    const rows = [
      row({ id: 'a' }),
      row({ id: 'b', fit_score: 8, fit_source: 'ai', fit_profile_hash: 'current' }),
      row({ id: 'c', fit_score: 8, fit_source: 'ai', fit_profile_hash: 'older' }),
      row({ id: 'd', visibility: 'archived' }),
    ]
    expect(rowsToScore(rows, profile).map((podcast) => podcast.id)).toEqual(['a', 'c'])
  })

  it('splits a run into request-sized batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 20)).toEqual([])
  })
})
