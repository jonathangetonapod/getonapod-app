import { describe, expect, it } from 'vitest'

import { plural } from './plural'

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'view')).toBe('1 view')
    expect(plural(1, 'match', 'matches')).toBe('1 match')
  })

  it('uses the plural for zero and many', () => {
    expect(plural(0, 'view')).toBe('0 views')
    expect(plural(12, 'match', 'matches')).toBe('12 matches')
    expect(plural(null, 'episode')).toBe('0 episodes')
  })
})
