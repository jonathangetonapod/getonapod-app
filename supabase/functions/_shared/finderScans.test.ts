import { assertEquals, assertThrows } from 'jsr:@std/assert@1'

import { HttpError } from './httpError.ts'
import { MAX_SCAN_RESULTS, scanFilters, scanInput } from './finderScans.ts'

const result = (id: string, extra: Record<string, unknown> = {}) => ({
  podcast: { podcast_id: id, podcast_name: `Show ${id}`, source: 'podscan', ...extra },
  score: 82,
  reasoning: 'Strong overlap.',
  estimated: false,
})

Deno.test('keeps a well-formed scan', () => {
  const scan = scanInput({
    queries: ['founder stories', 'founder stories', '  bootstrapping  '],
    filters: { language: 'en', minAudience: '5000', guestsOnly: true },
    found_count: 240,
    credits_used: 6,
    results: [result('pd-1', { audience_size: 12000, podcast_url: 'https://example.com/show' })],
  })
  assertEquals(scan.queries, ['founder stories', 'bootstrapping'])
  assertEquals(scan.found_count, 240)
  assertEquals(scan.results[0].podcast.audience_size, 12000)
  assertEquals(scan.results[0].podcast.podcast_url, 'https://example.com/show')
  assertEquals(scan.results[0].score, 82)
})

Deno.test('drops fields it does not know and unsafe links', () => {
  const scan = scanInput({
    queries: [],
    filters: {},
    results: [result('pd-1', { podcast_url: 'javascript:alert(1)', injected: 'x', podcast_description: 'd'.repeat(5_000) })],
  })
  const podcast = scan.results[0].podcast as unknown as Record<string, unknown>
  assertEquals(podcast.podcast_url, null)
  assertEquals('injected' in podcast, false)
  assertEquals((podcast.podcast_description as string).length, 600)
})

Deno.test('clamps scores to 0-100 and keeps unscored rows unscored', () => {
  const scan = scanInput({
    queries: [],
    results: [{ ...result('a'), score: 640 }, { ...result('b'), score: null }, { ...result('c'), estimated: true }],
  })
  assertEquals(scan.results.map((entry) => entry.score), [100, null, 82])
  assertEquals(scan.results[2].estimated, true)
})

Deno.test('refuses more results than one scan can produce', () => {
  const results = Array.from({ length: MAX_SCAN_RESULTS + 1 }, (_, index) => result(`pd-${index}`))
  assertThrows(() => scanInput({ queries: [], results }), HttpError, 'at most 100 results')
})

Deno.test('refuses a result without a podcast id', () => {
  assertThrows(
    () => scanInput({ queries: [], results: [{ podcast: { podcast_name: 'No id' } }] }),
    HttpError,
    'podcast id and name',
  )
})

Deno.test('falls back to the default filters for anything unexpected', () => {
  assertEquals(scanFilters({ language: '<script>', minAudience: '5k', guestsOnly: 'no', customKeywords: [1, ' b2b '] }), {
    language: 'en',
    region: 'any',
    activityDays: '90',
    guestsOnly: true,
    minAudience: '',
    maxAudience: '',
    minEpisodes: '',
    includeAiStrategy: true,
    customKeywords: ['b2b'],
  })
})
