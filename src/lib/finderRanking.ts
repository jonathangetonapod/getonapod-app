/*
 * Ordering for the Podcast Finder: which found podcasts are worth paying to
 * score, how scored results are ranked, and how the finished list can be
 * narrowed without scanning again.
 */

export interface RankablePodcast {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  publisher_name?: string | null
  podcast_categories?: Array<{ category_name: string }> | null
  audience_size?: number | null
  last_posted_at?: string | null
  podcast_email?: string | null
  source: 'database' | 'podscan'
}

export interface RankedResult<P extends RankablePodcast = RankablePodcast> {
  podcast: P
  score: number | null
  reasoning: string | null
  estimated: boolean
}

const STOP_WORDS = new Set([
  'about', 'after', 'also', 'been', 'being', 'business', 'company', 'could', 'from', 'have', 'helps', 'into',
  'more', 'most', 'over', 'podcast', 'show', 'their', 'them', 'they', 'this', 'through', 'using', 'what',
  'when', 'where', 'which', 'while', 'with', 'work', 'years', 'your', 'episode', 'episodes', 'interviews',
])

function tokens(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[a-z][a-z0-9-]{3,}/gu) || []).filter((token) => !STOP_WORDS.has(token)))
}

function daysSince(value: string | null | undefined, now: number): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? Math.max(0, (now - time) / 86_400_000) : null
}

/**
 * Cheap evidence of fit, before anything is paid for. A show several queries
 * found is about the client's subject from more than one angle; words it
 * shares with the profile, recent activity and a shared-database match each
 * count a little. Only order is used, so the weights only need to be sensible
 * relative to each other.
 */
export function preRankScore(
  podcast: RankablePodcast,
  queryHits: number,
  profileTokens: Set<string>,
  now: number,
): number {
  const podcastTokens = tokens([
    podcast.podcast_name,
    podcast.publisher_name,
    podcast.podcast_description,
    podcast.podcast_categories?.map((category) => category.category_name).join(' '),
  ].filter(Boolean).join(' '))
  let overlap = 0
  podcastTokens.forEach((token) => { if (profileTokens.has(token)) overlap += 1 })
  const age = daysSince(podcast.last_posted_at, now)
  const recency = age === null ? 0 : age <= 30 ? 2 : age <= 90 ? 1 : 0
  return queryHits * 3 + Math.min(overlap, 5) + recency + (podcast.source === 'database' ? 1 : 0)
}

/** The candidates in the order they should be scored; ties keep discovery order. */
export function preRankCandidates<P extends RankablePodcast>(
  candidates: P[],
  queryHits: Map<string, number>,
  profileText: string,
  now = Date.now(),
): P[] {
  const profileTokens = tokens(profileText)
  return candidates
    .map((podcast, index) => ({
      podcast,
      index,
      score: preRankScore(podcast, queryHits.get(podcast.podcast_id.toLowerCase()) ?? 1, profileTokens, now),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.podcast)
}

/** Model scores first, then keyword estimates, then the unscored; each by score. */
export function compareResults(left: RankedResult, right: RankedResult): number {
  const tier = (result: RankedResult) => (result.score === null ? 2 : result.estimated ? 1 : 0)
  return tier(left) - tier(right) || (right.score ?? -1) - (left.score ?? -1)
}

export type ResultSort = 'fit' | 'audience' | 'recent'

export interface ResultView {
  minScore: number
  sort: ResultSort
  hideEstimated: boolean
  emailOnly: boolean
}

export const DEFAULT_RESULT_VIEW: ResultView = { minScore: 0, sort: 'fit', hideEstimated: false, emailOnly: false }

export const MIN_SCORE_OPTIONS = [
  { value: 0, label: 'Any fit' },
  { value: 60, label: '60+ fit' },
  { value: 70, label: '70+ fit' },
  { value: 80, label: '80+ fit' },
]

export const SORT_OPTIONS: Array<{ value: ResultSort; label: string }> = [
  { value: 'fit', label: 'Best fit' },
  { value: 'audience', label: 'Largest audience' },
  { value: 'recent', label: 'Most recent episode' },
]

/** The finished list, narrowed and ordered without scanning again. */
export function viewResults<R extends RankedResult>(results: R[], view: ResultView): R[] {
  const shown = results.filter((result) => {
    if (view.minScore > 0 && (result.score === null || result.score < view.minScore)) return false
    if (view.hideEstimated && result.estimated) return false
    if (view.emailOnly && !result.podcast.podcast_email) return false
    return true
  })
  if (view.sort === 'audience') {
    return [...shown].sort((left, right) => (right.podcast.audience_size ?? -1) - (left.podcast.audience_size ?? -1) || compareResults(left, right))
  }
  if (view.sort === 'recent') {
    const time = (result: R) => Date.parse(result.podcast.last_posted_at ?? '') || 0
    return [...shown].sort((left, right) => time(right) - time(left) || compareResults(left, right))
  }
  return [...shown].sort(compareResults)
}

export function isDefaultView(view: ResultView): boolean {
  return view.minScore === 0 && view.sort === 'fit' && !view.hideEstimated && !view.emailOnly
}

/**
 * How long a scan should take, from what it is about to do: up to three
 * paced index pages per query, the shared-database lookups, and one scoring
 * request per twenty podcasts.
 */
export function scanDurationLabel(queryCount: number): string {
  const seconds = queryCount * 4.5 + 5 * 8 + 5
  if (seconds < 60) return 'Under a minute.'
  const minutes = Math.round(seconds / 60)
  return minutes <= 1 ? 'About a minute.' : `About ${minutes} minutes.`
}

/** "today", "3 days ago", "5 months ago": when a show last published. */
export function postedAgo(value: string | null | undefined, now = Date.now()): string | null {
  const days = daysSince(value, now)
  if (days === null) return null
  if (days < 1) return 'today'
  if (days < 2) return 'yesterday'
  if (days < 45) return `${Math.floor(days)} days ago`
  const months = Math.round(days / 30)
  return months < 18 ? `${months} months ago` : `${Math.round(days / 365)} years ago`
}
