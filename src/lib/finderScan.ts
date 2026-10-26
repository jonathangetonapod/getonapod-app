/*
 * The pure half of the Podcast Finder scan: the shape both discovery sources
 * are normalized to, the conversions to a shortlist row and a stored scan,
 * and ranking. The scan loop itself lives in the page, where its state does.
 */
import type { ClientShortlistCatalogPodcast, ClientShortlistPodcastInput } from '@/services/clientShortlist'
import type { CompatibilityScore } from '@/services/compatibilityScoring'
import type { FinderScanResult } from '@/services/finderScans'
import type { PodcastData } from '@/services/podscan'
import { compareResults } from '@/lib/finderRanking'

// One normalized shape for both discovery sources: the shared internal
// catalog and live Podscan search.
export interface ScanPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  podcast_image_url?: string | null
  podcast_url?: string | null
  publisher_name?: string | null
  itunes_rating?: number | null
  episode_count?: number | null
  audience_size?: number | null
  last_posted_at?: string | null
  language?: string | null
  region?: string | null
  podcast_email?: string | null
  rss_feed?: string | null
  podcast_categories?: Array<{ category_id: string; category_name: string }> | null
  source: 'database' | 'podscan'
}

export interface ScanResult {
  podcast: ScanPodcast
  score: number | null
  reasoning: string | null
  /** The score is the server's keyword estimate, not the model's judgement. */
  estimated: boolean
}

export type ScanPhase = 'idle' | 'strategy' | 'search' | 'score' | 'done' | 'failed'

export interface ScanFailure {
  title: string
  reason: string
  credits: string
  /** Where the fix is, when it is not a retry. */
  action?: { label: string; href: string }
}

export const PROFILE_TOO_THIN_COPY = 'Not enough profile to draft a strategy. Add a bio, topics or talking points to the client, then try again.'

// Thrown inside the scan for a failure that gets the failure panel rather
// than a toast: the search itself broke, not the operator's input.
export class ScanFailedError extends Error {
  readonly failure: ScanFailure

  constructor(failure: ScanFailure) {
    super(failure.reason)
    this.failure = failure
  }
}

export const MAX_QUERIES = 6
export const PAGES_PER_QUERY = 3
export const MAX_SCORED = 100
// Matches the server's per-request cap; anything smaller costs extra credits.
export const SCORING_BATCH_SIZE = 20
export const SEARCH_SPACING_MS = 525
// The pause scoreCompatibilityBatch used to put between its own batches.
export const SCORING_SPACING_MS = 500

export function fromPodscan(podcast: PodcastData): ScanPodcast {
  return {
    podcast_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description ?? null,
    podcast_image_url: podcast.podcast_image_url ?? null,
    podcast_url: podcast.podcast_url ?? null,
    publisher_name: podcast.publisher_name ?? null,
    itunes_rating: podcast.reach?.itunes?.itunes_rating_average
      ? Number.parseFloat(podcast.reach.itunes.itunes_rating_average)
      : null,
    episode_count: podcast.episode_count ?? null,
    audience_size: podcast.reach?.audience_size ?? null,
    last_posted_at: podcast.last_posted_at ?? null,
    language: podcast.language ?? null,
    region: podcast.region ?? null,
    podcast_email: podcast.reach?.email ?? null,
    rss_feed: podcast.rss_url ?? null,
    podcast_categories: podcast.podcast_categories ?? null,
    source: 'podscan',
  }
}

export function fromCatalog(podcast: ClientShortlistCatalogPodcast): ScanPodcast {
  return {
    podcast_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description,
    podcast_image_url: podcast.podcast_image_url,
    podcast_url: podcast.podcast_url,
    publisher_name: podcast.publisher_name,
    itunes_rating: podcast.itunes_rating,
    episode_count: podcast.episode_count,
    audience_size: podcast.audience_size,
    last_posted_at: podcast.last_posted_at,
    language: podcast.language,
    region: podcast.region,
    podcast_email: podcast.podcast_email,
    rss_feed: podcast.rss_feed,
    podcast_categories: podcast.podcast_categories,
    source: 'database',
  }
}

export const phaseSteps: Array<{ id: Exclude<ScanPhase, 'idle' | 'done'>; label: string }> = [
  { id: 'strategy', label: 'Building the search strategy from the client profile' },
  { id: 'search', label: 'Searching the shared database and the live podcast index' },
  { id: 'score', label: 'Scoring every match against the client with AI' },
]

export function toShortlistInput(result: ScanResult): ClientShortlistPodcastInput {
  const podcast = result.podcast
  return {
    podcast_id: podcast.podcast_id,
    podscan_podcast_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description,
    podcast_image_url: podcast.podcast_image_url,
    podcast_url: podcast.podcast_url,
    publisher_name: podcast.publisher_name,
    episode_count: podcast.episode_count,
    itunes_rating: podcast.itunes_rating ?? undefined,
    audience_size: podcast.audience_size,
    last_posted_at: podcast.last_posted_at,
    language: podcast.language,
    region: podcast.region,
    podcast_email: podcast.podcast_email,
    rss_feed: podcast.rss_feed,
    podcast_categories: podcast.podcast_categories,
    compatibility_score: result.score === null ? null : result.score / 10,
    compatibility_reasoning: result.reasoning ?? undefined,
  }
}

// What a saved scan keeps of a result: the stored row shape, nulls explicit.
export function toStoredResult(result: ScanResult): FinderScanResult {
  const podcast = result.podcast
  return {
    podcast: {
      podcast_id: podcast.podcast_id,
      podcast_name: podcast.podcast_name,
      podcast_description: podcast.podcast_description ? podcast.podcast_description.slice(0, 600) : null,
      podcast_image_url: podcast.podcast_image_url ?? null,
      podcast_url: podcast.podcast_url ?? null,
      publisher_name: podcast.publisher_name ?? null,
      itunes_rating: podcast.itunes_rating ?? null,
      episode_count: podcast.episode_count ?? null,
      audience_size: podcast.audience_size ?? null,
      last_posted_at: podcast.last_posted_at ?? null,
      language: podcast.language ?? null,
      region: podcast.region ?? null,
      podcast_email: podcast.podcast_email ?? null,
      rss_feed: podcast.rss_feed ?? null,
      podcast_categories: podcast.podcast_categories ?? null,
      source: podcast.source,
    },
    score: result.score,
    reasoning: result.reasoning,
    estimated: result.estimated,
  }
}

/*
 * Ranks discovered candidates against whatever scores landed, normalizing the
 * 1-10 endpoint score to 0-100. Shared by the success path and the
 * partial-failure recovery so a scan is never silently discarded.
 */
export function rankCandidates(cands: ScanPodcast[], scores: CompatibilityScore[]): ScanResult[] {
  const scoreById = new Map(scores.map((score) => [score.podcast_id, score]))
  return cands
    .map((podcast): ScanResult => {
      const score = scoreById.get(podcast.podcast_id)
      return {
        podcast,
        score: score?.score == null ? null : Math.round(score.score * 10),
        reasoning: score?.reasoning ?? null,
        estimated: score?.source === 'deterministic',
      }
    })
    .sort(compareResults)
}
