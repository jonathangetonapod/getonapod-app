import { describe, expect, it } from 'vitest'
import { DEFAULT_CATALOG_PARAMS, MAX_EXCLUDE_TERMS, parseExcludeTerms, readCatalogParams } from '@/hooks/usePodcastCatalogParams'

describe('readCatalogParams lists', () => {
  it('reads several categories, excluded categories and excluded words', () => {
    const params = readCatalogParams(new URLSearchParams('category=business,health|fitness&not_category=religion|spirituality&exclude=crypto,true%20crime'))
    expect(params.categories).toEqual(['business', 'health|fitness'])
    expect(params.excludeCategories).toEqual(['religion|spirituality'])
    expect(params.excludeTerms).toEqual(['crypto', 'true crime'])
  })

  // An address from before the lists named one category, sometimes as the catalogue spelled it.
  it('reads an older single category as a list of one', () => {
    expect(readCatalogParams(new URLSearchParams('category=Business')).categories).toEqual(['business'])
    expect(readCatalogParams(new URLSearchParams('category=all')).categories).toEqual([])
    expect(readCatalogParams(new URLSearchParams('')).categories).toEqual(DEFAULT_CATALOG_PARAMS.categories)
  })
})

describe('readCatalogParams tag filters', () => {
  it('reads B2B fit, listeners, formats and junk, dropping unknown keys', () => {
    const params = readCatalogParams(new URLSearchParams('fit=good&listeners=founders,pirates,marketers&format=interview&junk=show'))
    expect(params.b2bFit).toBe('good')
    expect(params.listeners).toEqual(['founders', 'marketers'])
    expect(params.formats).toEqual(['interview'])
    expect(params.junk).toBe('show')
  })

  it('hides junk and accepts any fit by default', () => {
    const params = readCatalogParams(new URLSearchParams('fit=huge&junk=maybe'))
    expect(params.b2bFit).toBe('all')
    expect(params.junk).toBe('hide')
  })
})

describe('parseExcludeTerms', () => {
  it('trims, lower-cases, collapses spaces and drops empties and repeats', () => {
    expect(parseExcludeTerms(' Crypto ,, true   CRIME, crypto ,')).toEqual(['crypto', 'true crime'])
  })

  it('keeps at most the number the catalogue accepts', () => {
    const many = Array.from({ length: 30 }, (_, index) => `word${index}`).join(',')
    expect(parseExcludeTerms(many)).toHaveLength(MAX_EXCLUDE_TERMS)
  })
})
