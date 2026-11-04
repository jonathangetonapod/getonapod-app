import { describe, expect, it } from 'vitest'
import { displayClientWebsite, normalizeClientWebsite } from './clientWebsite'

describe('normalizeClientWebsite', () => {
  it('saves every typed form of an address as one shape', () => {
    expect(normalizeClientWebsite('missioninbox.com')).toBe('https://missioninbox.com')
    expect(normalizeClientWebsite('www.theexporter.ca ')).toBe('https://www.theexporter.ca')
    expect(normalizeClientWebsite('https://dura-foam.com/')).toBe('https://dura-foam.com')
    expect(normalizeClientWebsite('https://example.com/about')).toBe('https://example.com/about')
  })
  it('keeps text that is not an address, and empties to null', () => {
    expect(normalizeClientWebsite('coming soon')).toBe('coming soon')
    expect(normalizeClientWebsite('  ')).toBeNull()
  })
})

describe('displayClientWebsite', () => {
  it('reads as the plain domain', () => {
    expect(displayClientWebsite('https://www.drdds.com/')).toBe('drdds.com')
    expect(displayClientWebsite('missioninbox.com')).toBe('missioninbox.com')
    expect(displayClientWebsite('https://example.com/about/')).toBe('example.com/about')
  })
})
