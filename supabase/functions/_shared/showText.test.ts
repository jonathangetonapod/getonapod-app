import { assertEquals } from 'jsr:@std/assert@1'

import { decodeHtmlEntities, dedupeShows, normalizeShowText } from './showText.ts'

Deno.test('decodes named, numeric and double-encoded entities', () => {
  assertEquals(decodeHtmlEntities('Self-Awareness &amp; Mindset'), 'Self-Awareness & Mindset')
  assertEquals(decodeHtmlEntities('Founder&#39;s Journey'), "Founder's Journey")
  assertEquals(decodeHtmlEntities('Rock &#x26; Roll'), 'Rock & Roll')
  assertEquals(decodeHtmlEntities('Q&amp;amp;A Hour'), 'Q&A Hour')
  assertEquals(decodeHtmlEntities('AT&T &unknown; stays'), 'AT&T &unknown; stays')
  assertEquals(decodeHtmlEntities(null), null)
})

Deno.test('normalizes titles for comparison', () => {
  assertEquals(
    normalizeShowText('You Turn Podcast w/ Ashley Stahl'),
    normalizeShowText('you turn podcast   w ashley stahl!'),
  )
})

Deno.test('keeps the larger feed of a duplicated show in the first slot', () => {
  const { shows, duplicates } = dedupeShows([
    { id: 'a', podcast_name: 'You Turn Podcast w/ Ashley Stahl', publisher_name: 'Ashley Stahl', audience_size: 100 },
    { id: 'b', podcast_name: 'Other Show', publisher_name: null, audience_size: 50 },
    { id: 'c', podcast_name: 'You Turn Podcast w/ Ashley Stahl', publisher_name: 'Ashley Stahl', audience_size: 600 },
  ])
  assertEquals(shows.map((show) => show.id), ['c', 'b'])
  assertEquals(duplicates.map((pair) => [pair.kept.id, pair.dropped.id]), [['c', 'a']])
})

Deno.test('a different publisher is a different show', () => {
  const { shows } = dedupeShows([
    { podcast_name: 'The Daily', publisher_name: 'One', audience_size: 1 },
    { podcast_name: 'The Daily', publisher_name: 'Two', audience_size: 1 },
  ])
  assertEquals(shows.length, 2)
})
