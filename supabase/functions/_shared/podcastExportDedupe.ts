export interface PodcastExportIdentity {
  podcast_id?: string | null
  podscan_podcast_id?: string | null
  podcast_name: string
}

export interface PodcastExportPartition<T> {
  newPodcasts: T[]
  duplicatePodcastIds: string[]
  missingIdentityPodcastNames: string[]
}

export function partitionPodcastExports<T extends PodcastExportIdentity>(
  podcasts: T[],
  existingPodcastIds: Iterable<string>,
): PodcastExportPartition<T> {
  const existingIds = new Set(
    Array.from(existingPodcastIds, (podcastId) => podcastId.trim().toLowerCase()).filter(Boolean),
  )
  const requestIds = new Set<string>()
  const duplicatePodcastIds = new Set<string>()
  const missingIdentityPodcastNames: string[] = []
  const newPodcasts: T[] = []

  podcasts.forEach((podcast) => {
    const podcastId = (podcast.podscan_podcast_id || podcast.podcast_id || '').trim()
    if (!podcastId) {
      missingIdentityPodcastNames.push(podcast.podcast_name)
      return
    }

    const canonicalPodcastId = podcastId.toLowerCase()
    if (existingIds.has(canonicalPodcastId) || requestIds.has(canonicalPodcastId)) {
      duplicatePodcastIds.add(podcastId)
      return
    }

    requestIds.add(canonicalPodcastId)
    newPodcasts.push(podcast)
  })

  return {
    newPodcasts,
    duplicatePodcastIds: Array.from(duplicatePodcastIds),
    missingIdentityPodcastNames,
  }
}
