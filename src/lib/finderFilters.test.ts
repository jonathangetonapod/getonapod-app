import { describe, expect, it } from 'vitest'
import {
  CUSTOM_PRESET_ID,
  DEFAULT_FINDER_FILTERS,
  audiencePresetFor,
  audiencePresetValues,
  audienceRangeIsInverted,
  changedFilterCount,
  episodePresetFor,
  episodePresetValue,
  filterSummary,
} from '@/lib/finderFilters'

describe('finder filter presets', () => {
  // The presets write the same strings the scan reads, so a preset and the
  // same number typed into Custom send one identical request.
  it.each([
    ['any', { minAudience: '', maxAudience: '' }],
    ['1k', { minAudience: '1000', maxAudience: '' }],
    ['5k', { minAudience: '5000', maxAudience: '' }],
    ['25k', { minAudience: '25000', maxAudience: '' }],
    ['100k', { minAudience: '100000', maxAudience: '' }],
  ])('maps the %s audience preset to its bounds', (presetId, bounds) => {
    expect(audiencePresetValues(presetId)).toEqual(bounds)
    expect(audiencePresetFor(bounds)).toBe(presetId)
  })

  it.each([
    ['any', ''],
    ['10', '10'],
    ['25', '25'],
    ['50', '50'],
  ])('maps the %s episode preset to its minimum', (presetId, value) => {
    expect(episodePresetValue(presetId)).toBe(value)
    expect(episodePresetFor(value)).toBe(presetId)
  })

  it('has no values for Custom, which keeps what was typed', () => {
    expect(audiencePresetValues(CUSTOM_PRESET_ID)).toBeNull()
    expect(episodePresetValue(CUSTOM_PRESET_ID)).toBeNull()
  })

  it('reads typed values no preset matches, and any maximum, as Custom', () => {
    expect(audiencePresetFor({ minAudience: '2500', maxAudience: '' })).toBe(CUSTOM_PRESET_ID)
    expect(audiencePresetFor({ minAudience: '', maxAudience: '30000' })).toBe(CUSTOM_PRESET_ID)
    expect(audiencePresetFor({ minAudience: '5000', maxAudience: '30000' })).toBe(CUSTOM_PRESET_ID)
    expect(episodePresetFor('12')).toBe(CUSTOM_PRESET_ID)
  })
})

describe('finder filter summary', () => {
  it('names the defaults in one line', () => {
    expect(filterSummary(DEFAULT_FINDER_FILTERS)).toEqual(['English', 'Any region', 'Active last 90 days', 'Guest shows only'])
    expect(changedFilterCount(DEFAULT_FINDER_FILTERS)).toBe(0)
  })

  it('adds a chip for each setting moved off its default', () => {
    const filters = {
      ...DEFAULT_FINDER_FILTERS,
      region: 'GB',
      activityDays: 'any',
      guestsOnly: false,
      minAudience: '5000',
      maxAudience: '30000',
      minEpisodes: '10',
      customKeywords: ['bootstrapping'],
      includeAiStrategy: false,
    }
    expect(filterSummary(filters)).toEqual([
      'English',
      'United Kingdom',
      'Any activity',
      'All show formats',
      '5K to 30K listeners',
      '10+ episodes',
      '1 keyword',
      'AI strategy off',
    ])
    expect(changedFilterCount(filters)).toBe(8)
  })

  it('never uses an em dash', () => {
    const filters = { ...DEFAULT_FINDER_FILTERS, maxAudience: '2500' }
    expect(filterSummary(filters).join(' ')).not.toContain('—')
  })

  it('flags a minimum above the maximum', () => {
    expect(audienceRangeIsInverted({ minAudience: '50000', maxAudience: '1000' })).toBe(true)
    expect(audienceRangeIsInverted({ minAudience: '1000', maxAudience: '50000' })).toBe(false)
    expect(audienceRangeIsInverted({ minAudience: '50000', maxAudience: '' })).toBe(false)
  })
})
