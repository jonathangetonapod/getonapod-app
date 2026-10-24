import { describe, expect, it } from 'vitest'

import { countdownLabel, isYouTubeUrl, SEVENTY_TWO_HOURS_MS } from './clipsContent'

describe('isYouTubeUrl', () => {
  it('accepts channels, episodes, shorts and short links', () => {
    for (const url of [
      'https://www.youtube.com/@danashow',
      'https://youtube.com/channel/UCabc',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      ' https://youtube.com/shorts/abc ',
      'http://youtube.com/@old',
    ]) expect(isYouTubeUrl(url), url).toBe(true)
  })

  it('refuses anything that is not YouTube, including look-alikes', () => {
    for (const url of [
      'https://vimeo.com/123',
      'https://notyoutube.com/@x',
      'https://youtube.com.evil.example/@x',
      'youtube.com/@noscheme',
      'javascript:alert(1)',
      '',
      'https://example.com/?u=https://youtube.com',
    ]) expect(isYouTubeUrl(url), url).toBe(false)
  })
})

describe('countdownLabel', () => {
  it('starts at 72:00:00 and never goes below zero', () => {
    const start = 1_000_000
    expect(countdownLabel(start, start)).toBe('72:00:00')
    expect(countdownLabel(start, start + 1000)).toBe('71:59:59')
    expect(countdownLabel(start, start + 61_000)).toBe('71:58:59')
    expect(countdownLabel(start, start + SEVENTY_TWO_HOURS_MS)).toBe('00:00:00')
    expect(countdownLabel(start, start + SEVENTY_TWO_HOURS_MS + 5000)).toBe('00:00:00')
  })
})
