import { describe, expect, it } from 'vitest'
import {
  categoryChoice,
  categoryDisplayNames,
  categoryFilterGroups,
  categoryFilterLabel,
} from '@/lib/podcastCategories'

describe('podcast categories', () => {
  // The catalogue stores Apple's categories split into lower-case codes.
  it('names codes properly and joins split categories into one choice', () => {
    expect(categoryChoice('society')).toEqual({ value: 'society|culture', label: 'Society & Culture', keys: ['society', 'culture'] })
    expect(categoryChoice('culture').value).toBe('society|culture')
    expect(categoryChoice('mental').label).toBe('Mental Health')
    expect(categoryChoice('self-improvement').label).toBe('Self-Improvement')
    expect(categoryChoice('artificial-intelligence').label).toBe('AI')
    // Anything unnamed still reads as words, not a code.
    expect(categoryChoice('machine-learning')).toEqual({ value: 'machine-learning', label: 'Machine Learning', keys: ['machine-learning'] })
    expect(categoryChoice(' Business ').value).toBe('business')
    expect(categoryChoice('Society &amp; Culture').label).toBe('Society &amp; Culture'.replace('&amp;', '&'))
  })

  it('offers professional categories first, then the rest alphabetically, each once', () => {
    const groups = categoryFilterGroups(['sports', 'culture', 'marketing', 'business', 'society', 'comedy', 'technology'])
    expect(groups.professional.map((choice) => choice.label)).toEqual(['Business', 'Marketing', 'Technology'])
    expect(groups.other.map((choice) => choice.label)).toEqual(['Comedy', 'Society & Culture', 'Sports'])
  })

  it('shows a show’s tags named, split categories once, professional first', () => {
    expect(categoryDisplayNames(['society', 'culture', 'health', 'fitness', 'mental', 'business']))
      .toEqual(['Business', 'Health & Fitness', 'Mental Health', 'Society & Culture'])
  })

  it('labels a filter value, including older single-code addresses', () => {
    expect(categoryFilterLabel('all')).toBe('Any category')
    expect(categoryFilterLabel('health|fitness')).toBe('Health & Fitness')
    expect(categoryFilterLabel('Business')).toBe('Business')
    expect(categoryFilterLabel('true crime')).toBe('True Crime')
  })
})
