import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ResearchSourceNote } from './ResearchSourceNote'
import { researchSourceSummary } from '@/lib/researchSource'

const NOW = Date.parse('2026-11-04T12:00:00Z')
const metadata = {
  episodes: [{ title: 'Ep 801', description: null, posted_at: null }, { title: 'Ep 800', description: null, posted_at: null }, { title: 'Ep 799', description: null, posted_at: null }],
  last_posted_at: '2026-11-01T00:00:00Z',
  episodes_fetched_at: '2026-11-02T12:00:00Z',
  has_transcript: true,
  transcript_episode_title: 'Ep 801',
}

describe('researchSourceSummary', () => {
  it('says what is saved and until when it is reused', () => {
    expect(researchSourceSummary(metadata, NOW)).toEqual({
      saved: 'Podscan data saved Nov 2, 2026: 3 recent episodes and the transcript of “Ep 801”.',
      reuse: 'Research and Regenerate reuse it until Dec 2, 2026, then fetch it again.',
    })
  })
  it('says when the saved copy is past its window, or has no transcript', () => {
    const old = researchSourceSummary({ ...metadata, episodes_fetched_at: '2026-09-01T00:00:00Z', has_transcript: false }, NOW)
    expect(old?.saved).toMatch(/and no transcript yet\.$/)
    expect(old?.reuse).toBe('Older than 30 days, so the next research run fetches it again.')
  })
  it('has nothing to say before anything was fetched', () => {
    expect(researchSourceSummary({ ...metadata, episodes_fetched_at: null }, NOW)).toBeNull()
  })
})

describe('ResearchSourceNote', () => {
  it('offers a refresh to people who can run it', () => {
    const onRefresh = vi.fn()
    render(<ResearchSourceNote metadata={metadata} loading={false} onRefresh={onRefresh} refreshing={false} />)
    expect(screen.getByText(/Podscan data saved/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh now' }))
    expect(onRefresh).toHaveBeenCalled()
  })
})
