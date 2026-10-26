import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts'
import { fetchPodcastHosts, fetchRecentEpisodes, type StoredEpisode, transcriptEpisodeTitle } from './podcastEpisodes.ts'

function episode(title: string, extra: Partial<StoredEpisode> = {}): StoredEpisode {
  return {
    episode_id: title,
    title,
    description: '',
    posted_at: null,
    url: null,
    audio_url: null,
    image_url: null,
    duration_seconds: null,
    word_count: null,
    has_guests: false,
    hosts: [],
    guests: [],
    summary: null,
    keywords: [],
    topics: [],
    ...extra,
  }
}

Deno.test('the transcript is attributed to the episode it came from', () => {
  // Podscan returns episodes whether or not transcription has finished, so the
  // newest episode is the likeliest to have none. The one that supplied the
  // transcript carries the flag.
  const episodes = [
    episode('Newest, still processing'),
    episode('Earlier, transcribed', { transcript_source: true }),
    episode('Older still'),
  ]
  assertEquals(transcriptEpisodeTitle(episodes), 'Earlier, transcribed')
})

Deno.test('a capture written before the flag falls back to the newest episode', () => {
  const episodes = [episode('Newest'), episode('Earlier')]
  assertEquals(transcriptEpisodeTitle(episodes), 'Newest')
})

Deno.test('no episodes means nothing to attribute', () => {
  assertEquals(transcriptEpisodeTitle([]), null)
})

function recordingFetch(response: () => Response) {
  const urls: URL[] = []
  const fetchImpl = ((input: URL | Request | string) => {
    urls.push(new URL(String(input)))
    return Promise.resolve(response())
  }) as typeof fetch
  return { fetchImpl, urls }
}

const noWait = () => Promise.resolve()

Deno.test('asks for the newest episodes with no one-year cutoff and plain transcripts', async () => {
  const { fetchImpl, urls } = recordingFetch(() => Response.json({ episodes: [] }))
  const episodes = await fetchRecentEpisodes('pd_abc', { apiKey: 'k', fetchImpl })
  assertEquals(episodes, [])
  assertEquals(urls[0].pathname, '/api/v1/podcasts/pd_abc/episodes')
  // Podscan only looks back a year by default; a show that paused for
  // thirteen months must not read as having no episodes.
  assertEquals(urls[0].searchParams.get('since'), '2000-01-01 00:00:00')
  assertEquals(urls[0].searchParams.get('transcript_formatter'), 'plain_text')
  assertEquals(urls[0].searchParams.get('order_by'), 'posted_at')
})

Deno.test('a provider failure is "could not tell" (null), never "no episodes"', async () => {
  const { fetchImpl } = recordingFetch(() => new Response('{}', { status: 503 }))
  assertEquals(await fetchRecentEpisodes('pd_abc', { apiKey: 'k', fetchImpl, sleep: noWait }), null)
})

Deno.test('reads hosts without a role and guests with their occupation', async () => {
  const { fetchImpl } = recordingFetch(() => Response.json({
    episodes: [{
      episode_id: 'ep_1',
      episode_title: 'Scaling calmly',
      metadata: {
        hosts: [{ host_name: 'Ana Host', host_company: 'Pod Co' }],
        guests: [{ guest_name: 'Gus Guest', guest_company: 'Acme', guest_occupation: 'Founder' }],
      },
    }],
  }))
  const [episode] = (await fetchRecentEpisodes('pd_abc', { apiKey: 'k', fetchImpl }))!
  assertEquals(episode.hosts, [{ name: 'Ana Host', company: 'Pod Co', role: null }])
  assertEquals(episode.guests, [{ name: 'Gus Guest', company: 'Acme', role: 'Founder' }])
})

Deno.test('host names come from the analysis endpoint, and a failure is an empty list', async () => {
  const ok = recordingFetch(() => Response.json({ hosts: [{ name: ' Ana Host ' }, { name: '' }] }))
  assertEquals(await fetchPodcastHosts('pd_abc', { apiKey: 'k', fetchImpl: ok.fetchImpl }), ['Ana Host'])
  assertEquals(ok.urls[0].pathname, '/api/v1/podcasts/pd_abc/analysis')
  const failing = recordingFetch(() => new Response('{}', { status: 500 }))
  assertEquals(await fetchPodcastHosts('pd_abc', { apiKey: 'k', fetchImpl: failing.fetchImpl, sleep: noWait }), [])
})

Deno.test('an id that is not a bare Podscan id is never requested', async () => {
  const { fetchImpl, urls } = recordingFetch(() => Response.json({ episodes: [] }))
  assertEquals(await fetchRecentEpisodes('../search', { apiKey: 'k', fetchImpl }), null)
  assertEquals(urls.length, 0)
})
