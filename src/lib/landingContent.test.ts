import { describe, expect, it } from 'vitest'

import { CLIENT_NAMES, initials } from './landingContent'

describe('initials', () => {
  it('skips articles and stops at two letters', () => {
    expect(initials('The SaaS Podcast')).toBe('SP')
    expect(initials('Everyone Hates Marketers')).toBe('EH')
    expect(initials('Chief events')).toBe('CE')
  })
})

describe('CLIENT_NAMES', () => {
  it('stays empty until there are real clients to name', () => {
    // The design's marquee scrolled invented companies. Nothing invented ships.
    expect(CLIENT_NAMES).toEqual([])
  })
})
