import { describe, expect, it } from 'vitest'
import { possessive } from '@/lib/clientName'

describe('possessive', () => {
  it('adds an apostrophe s, or the apostrophe alone after an s', () => {
    expect(possessive('Jim D. Shields')).toBe('Jim D. Shields’')
    expect(possessive('Dana Lee')).toBe('Dana Lee’s')
    expect(possessive('  Acme  ')).toBe('Acme’s')
    expect(possessive('')).toBe('')
  })
})
