import { describe, expect, it } from 'vitest'

import { applyBrandTheme, brandColorToken } from '@/lib/brandTheme'

describe('brand theme', () => {
  it('converts a hex colour to a design token triplet', () => {
    expect(brandColorToken('#1E3A8A')).toBe('224 64% 33%')
  })

  it('refuses anything that is not a six-digit hex colour', () => {
    expect(brandColorToken('red')).toBeNull()
    expect(brandColorToken('#fff')).toBeNull()
    expect(brandColorToken('#12345g')).toBeNull()
    expect(brandColorToken('url(javascript:1)')).toBeNull()
    expect(brandColorToken(null)).toBeNull()
  })

  // A pale brand colour would make white button text and coloured links
  // unreadable; a near-black one would lose its hue altogether.
  it('holds lightness in a readable band', () => {
    expect(brandColorToken('#FDE68A')).toMatch(/ 48%$/u)
    expect(brandColorToken('#020617')).toMatch(/ 22%$/u)
    expect(brandColorToken('#808080')).toBe('0 0% 48%')
  })

  it('themes the root and restores it on undo', () => {
    const root = document.createElement('div')
    const undo = applyBrandTheme('#1E3A8A', root)
    expect(root.style.getPropertyValue('--primary')).toBe('224 64% 33%')
    expect(root.style.getPropertyValue('--ring')).toBe('224 64% 33%')
    undo()
    expect(root.style.getPropertyValue('--primary')).toBe('')
    expect(root.style.getPropertyValue('--primary-foreground')).toBe('')
  })

  it('leaves the root alone for an unusable colour', () => {
    const root = document.createElement('div')
    applyBrandTheme('nope', root)()
    expect(root.style.length).toBe(0)
  })
})
