import { describe, expect, it } from 'vitest'
import { contrastRatio, normalizeHexColor, readableColor } from '@/lib/brandColor'

describe('normalizeHexColor', () => {
  it('takes a colour with or without the #, in any case, and stores it one way', () => {
    expect(normalizeHexColor('2b4c7e')).toBe('#2B4C7E')
    expect(normalizeHexColor(' #2b4c7e ')).toBe('#2B4C7E')
    expect(normalizeHexColor('#FA0')).toBe('#FFAA00')
    expect(normalizeHexColor('fa0')).toBe('#FFAA00')
  })

  it('refuses what is not a colour', () => {
    for (const value of ['', '#12', '#12345', '#1234567', 'blue', '#GGGGGG']) {
      expect(normalizeHexColor(value)).toBeNull()
    }
  })
})

describe('contrastRatio', () => {
  it('matches the WCAG figures at the ends and in between', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    // #767676 is the familiar lightest grey that passes AA on white.
    expect(contrastRatio('#FFFFFF', '#767676')).toBeCloseTo(4.54, 2)
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(contrastRatio('#FFFFFF', '#000000'))
  })

  it('flags the default accent as too light for white text', () => {
    expect(contrastRatio('#FFFFFF', '#C7794F')).toBeLessThan(4.5)
    expect(contrastRatio('#FFFFFF', '#0D1B2A')).toBeGreaterThan(4.5)
  })
})

describe('readableColor', () => {
  it('puts dark text on light colours and white on dark ones', () => {
    expect(readableColor('#FFAA00')).toBe('#102033')
    expect(readableColor('#0D1B2A')).toBe('#FFFFFF')
  })
})
