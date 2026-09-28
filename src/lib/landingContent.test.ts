import { describe, expect, it } from 'vitest'

import { CLIENT_NAMES, CLIENT_QUOTES, initials } from './landingContent'

describe('initials', () => {
  it('skips articles and stops at two letters', () => {
    expect(initials('The SaaS Podcast')).toBe('SP')
    expect(initials('Everyone Hates Marketers')).toBe('EH')
    expect(initials('Chief events')).toBe('CE')
  })
})

describe('CLIENT_NAMES', () => {
  it('names only clients who are quoted on the page', () => {
    // The design's marquee scrolled invented companies. Nothing invented
    // ships: every name here belongs to someone quoted, by name, further down.
    expect(CLIENT_NAMES.length).toBeGreaterThan(0)
    for (const name of CLIENT_NAMES) {
      expect(CLIENT_QUOTES.some((quote) => quote.role.endsWith(`, ${name}`))).toBe(true)
    }
    expect(new Set(CLIENT_NAMES).size).toBe(CLIENT_NAMES.length)
  })
})
