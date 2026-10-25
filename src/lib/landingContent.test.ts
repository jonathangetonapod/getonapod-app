import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { CLIENT_NAMES, CLIENT_QUOTES, FAQ, HERO, initials } from './landingContent'

/** The JSON-LD blocks in index.html, which crawlers read for the homepage. */
const indexStructuredData = (): Array<Record<string, unknown>> => {
  const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8')
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gu)]
    .map((match) => JSON.parse(match[1]))
}

describe('initials', () => {
  it('skips articles and stops at two letters', () => {
    expect(initials('The SaaS Podcast')).toBe('SP')
    expect(initials('Everyone Hates Marketers')).toBe('EH')
    expect(initials('Chief events')).toBe('CE')
  })
})

describe('CLIENT_NAMES', () => {
  it('names only clients who are quoted on the page', () => {
    // The design's marquee scrolled invented companies. Nothing invented
    // ships: every name here belongs to someone quoted, by name, further down.
    expect(CLIENT_NAMES.length).toBeGreaterThan(0)
    for (const name of CLIENT_NAMES) {
      expect(CLIENT_QUOTES.some((quote) => quote.role.endsWith(`, ${name}`))).toBe(true)
    }
    expect(new Set(CLIENT_NAMES).size).toBe(CLIENT_NAMES.length)
  })
})

describe('homepage structured data in index.html', () => {
  // index.html is hand-written, but Google treats FAQ markup that does not
  // match the questions on the page as a structured-data violation. Changing
  // the FAQ or the hero means changing index.html in the same commit.
  it('carries exactly the FAQ the homepage shows', () => {
    const faqPage = indexStructuredData().find((block) => block['@type'] === 'FAQPage')
    const entities = (faqPage?.mainEntity ?? []) as Array<{ name: string; acceptedAnswer: { text: string } }>
    expect(entities.map((entity) => ({ q: entity.name, a: entity.acceptedAnswer.text }))).toEqual(FAQ)
  })

  it('describes the service with the hero copy', () => {
    const service = indexStructuredData().find((block) => block['@type'] === 'Service')
    expect(service?.description).toBe(HERO.lead)
  })

  it('names the site for search results', () => {
    const blocks = indexStructuredData()
    expect(blocks.find((block) => block['@type'] === 'WebSite')).toMatchObject({
      name: 'Get On A Pod',
      url: 'https://getonapod.com/',
    })
    expect(blocks.find((block) => block['@type'] === 'Organization')).toMatchObject({ name: 'Get On A Pod' })
  })
})
