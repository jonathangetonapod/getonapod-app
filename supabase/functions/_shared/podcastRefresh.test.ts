import { assertEquals } from 'jsr:@std/assert@1'

import { catalogFieldsFromPodscan } from './podcastRefresh.ts'

Deno.test('maps a Podscan record onto catalogue columns', () => {
  const fields = catalogFieldsFromPodscan({
    podcast_name: ' Founder Stories ',
    language: 'EN',
    region: 'US',
    episode_count: '412',
    last_posted_at: '2026-10-26 08:00:00',
    is_active: true,
    podcast_reach_score: 72,
    reach: {
      audience_size: '48,500',
      email: 'booking@founderstories.fm',
      itunes: { itunes_rating_average: '4.8', itunes_rating_count: '1,204' },
      spotify: { spotify_rating_average: '4.9', spotify_rating_count: 310 },
    },
  })
  assertEquals(fields.podcast_name, 'Founder Stories')
  // Kept as sent, like every other writer of these columns.
  assertEquals(fields.language, 'EN')
  assertEquals(fields.region, 'US')
  assertEquals(fields.episode_count, 412)
  assertEquals(fields.audience_size, 48500)
  assertEquals(fields.itunes_rating, 4.8)
  assertEquals(fields.itunes_rating_count, 1204)
  assertEquals(fields.spotify_rating, 4.9)
  assertEquals(fields.podscan_email, 'booking@founderstories.fm')
  assertEquals(typeof fields.last_posted_at, 'string')
})

// A refresh updates an existing row; a field Podscan leaves out keeps its value.
Deno.test('leaves out what Podscan did not send or sent unusable', () => {
  const fields = catalogFieldsFromPodscan({
    podcast_name: '',
    last_posted_at: 'not a date',
    podcast_categories: [],
    reach: { itunes: { itunes_rating_average: '0' }, email: null, social_links: [] },
  })
  assertEquals(fields, {})
})

Deno.test('keeps an explicit inactive flag', () => {
  assertEquals(catalogFieldsFromPodscan({ is_active: false }), { is_active: false })
})
