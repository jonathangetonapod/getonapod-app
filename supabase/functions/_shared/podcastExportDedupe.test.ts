import { partitionPodcastExports } from './podcastExportDedupe.ts'

function assertEquals(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message)
}

Deno.test('podcast export dedupe excludes sheet history and repeated request IDs case-insensitively', () => {
  const result = partitionPodcastExports([
    { podcast_id: 'pod-existing', podcast_name: 'Existing' },
    { podcast_id: 'POD-NEW', podcast_name: 'New' },
    { podscan_podcast_id: 'pod-new', podcast_name: 'Repeated in request' },
  ], ['POD-EXISTING'])

  assertEquals(result.newPodcasts.map((podcast) => podcast.podcast_name), ['New'], 'new podcasts changed')
  assertEquals(result.duplicatePodcastIds, ['pod-existing', 'pod-new'], 'duplicate IDs changed')
  assertEquals(result.missingIdentityPodcastNames, [], 'valid IDs were treated as missing')
})

Deno.test('podcast export dedupe fails closed when a stable Podscan ID is missing', () => {
  const result = partitionPodcastExports([
    { podcast_name: 'Unknown identity' },
  ], [])

  assertEquals(result.newPodcasts, [], 'unidentifiable podcast was exportable')
  assertEquals(result.duplicatePodcastIds, [], 'unidentifiable podcast was treated as a duplicate')
  assertEquals(result.missingIdentityPodcastNames, ['Unknown identity'], 'missing identity was not reported')
})
