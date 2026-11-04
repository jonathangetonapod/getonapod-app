import type { ClientShortlistEpisodeMetadata } from '@/services/clientShortlist'

/** Same window as EPISODE_FRESHNESS_MS in supabase/functions/_shared/podcastEpisodes.ts. */
export const EPISODE_REUSE_DAYS = 30
const DAY_MS = 86_400_000

const formatDay = (time: number) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(time))

/**
 * What research works from, in plain words: the Podscan data saved on this
 * podcast, when it was saved, and when it will be fetched again. Research and
 * Regenerate reuse it; only a stale copy or "Refresh now" calls Podscan.
 */
export function researchSourceSummary(metadata: ClientShortlistEpisodeMetadata, now = Date.now()): { saved: string; reuse: string } | null {
  const fetchedAt = metadata.episodes_fetched_at ? Date.parse(metadata.episodes_fetched_at) : Number.NaN
  if (Number.isNaN(fetchedAt)) return null
  const count = metadata.episodes.length
  const episodes = `${count} recent ${count === 1 ? 'episode' : 'episodes'}`
  const transcript = metadata.has_transcript
    ? `the transcript of ${metadata.transcript_episode_title ? `“${metadata.transcript_episode_title}”` : 'the newest one'}`
    : 'no transcript yet'
  const refreshAt = fetchedAt + EPISODE_REUSE_DAYS * DAY_MS
  return {
    saved: `Podscan data saved ${formatDay(fetchedAt)}: ${episodes} and ${transcript}.`,
    reuse: refreshAt > now
      ? `Research and Regenerate reuse it until ${formatDay(refreshAt)}, then fetch it again.`
      : 'Older than 30 days, so the next research run fetches it again.',
  }
}
