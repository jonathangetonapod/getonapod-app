import { afterEach, describe, expect, it, vi } from 'vitest'

import { decodeHtmlEntities, dedupeShows, normalizeShowText } from './showText'

describe('decodeHtmlEntities', () => {
  it('decodes named, numeric and double-encoded entities', () => {
    expect(decodeHtmlEntities('Self-Awareness &amp; Mindset')).toBe('Self-Awareness & Mindset')
    expect(decodeHtmlEntities('Founder&#39;s Journey')).toBe("Founder's Journey")
    expect(decodeHtmlEntities('Rock &#x26; Roll')).toBe('Rock & Roll')
    expect(decodeHtmlEntities('Q&amp;amp;A Hour')).toBe('Q&A Hour')
  })

  it('leaves text without entities alone', () => {
    expect(decodeHtmlEntities('AT&T &unknown; stays')).toBe('AT&T &unknown; stays')
    expect(decodeHtmlEntities(null)).toBeNull()
  })
})

describe('dedupeShows', () => {
  afterEach(() => vi.restoreAllMocks())

  it('normalizes case, punctuation and whitespace', () => {
    expect(normalizeShowText('You Turn Podcast w/ Ashley Stahl')).toBe(normalizeShowText('you turn  podcast w ashley stahl!'))
  })

  it('keeps the larger feed in the first copy\'s place and logs the duplicate', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const shows = dedupeShows([
      { id: 'small', podcast_name: 'You Turn Podcast w/ Ashley Stahl', publisher_name: 'Ashley Stahl', audience_size: 100 },
      { id: 'other', podcast_name: 'Other Show', publisher_name: null, audience_size: 10 },
      { id: 'large', podcast_name: 'You Turn Podcast w/ Ashley Stahl', publisher_name: 'Ashley Stahl', audience_size: 600 },
    ])
    expect(shows.map((show) => show.id)).toEqual(['large', 'other'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('treats an encoded and a decoded title as the same show', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const shows = dedupeShows([
      { podcast_name: 'Mind &amp; Body', publisher_name: 'X', audience_size: 5 },
      { podcast_name: 'Mind & Body', publisher_name: 'X', audience_size: 1 },
    ])
    expect(shows).toHaveLength(1)
  })

  it('keeps shows with different publishers', () => {
    expect(dedupeShows([
      { podcast_name: 'The Daily', publisher_name: 'One' },
      { podcast_name: 'The Daily', publisher_name: 'Two' },
    ])).toHaveLength(2)
  })
})
