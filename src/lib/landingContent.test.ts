import { describe, expect, it } from 'vitest'

import { CLIENT_NAMES, initials, startingLine } from './landingContent'

describe('startingLine', () => {
  it('names the two quarters that begin four months out', () => {
    // The design wrote "Starting in September means your Q1–Q2 2027 calendar."
    expect(startingLine(new Date(2026, 8, 12))).toBe(
      "Starting in September means your Q1–Q2 2027 calendar. That's the reason to start now, not a reason to wait.",
    )
    expect(startingLine(new Date(2026, 2, 1))).toMatch(/^Starting in March means your Q3–Q4 2026 calendar\./u)
  })

  it('spells both years when the window straddles one', () => {
    expect(startingLine(new Date(2026, 5, 30))).toMatch(/^Starting in June means your Q4 2026–Q1 2027 calendar\./u)
  })
})

describe('initials', () => {
  it('skips articles and stops at two letters', () => {
    expect(initials('The SaaS Podcast')).toBe('SP')
    expect(initials('Everyone Hates Marketers')).toBe('EH')
    expect(initials('Chief events')).toBe('CE')
    expect(initials('TEDx stages')).toBe('TS')
  })
})

describe('CLIENT_NAMES', () => {
  it('stays empty until there are real clients to name', () => {
    // The design's marquee scrolled invented companies. Nothing invented ships.
    expect(CLIENT_NAMES).toEqual([])
  })
})
