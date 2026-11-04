import { describe, expect, it } from 'vitest'
import { podscanEmails } from './podscanEmails'

describe('podscanEmails', () => {
  it('splits a comma-separated Podscan field into each address', () => {
    expect(podscanEmails('troy@growasmallbusiness.com, courtney.pomerenke@employmenthero.com'))
      .toEqual(['troy@growasmallbusiness.com', 'courtney.pomerenke@employmenthero.com'])
  })

  it('drops junk and case-insensitive duplicates', () => {
    expect(podscanEmails('host@show.com; HOST@show.com n/a')).toEqual(['host@show.com'])
  })

  it('strips mailto and angle-bracket wrappers', () => {
    expect(podscanEmails('Host Name <host@show.com>, mailto:producer@show.com.')).toEqual(['host@show.com', 'producer@show.com'])
  })

  it('returns nothing for empty input', () => {
    expect(podscanEmails(null)).toEqual([])
    expect(podscanEmails('')).toEqual([])
  })
})
