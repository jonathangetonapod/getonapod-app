import type { ClientShortlistFitProfile, ClientShortlistPodcast } from '@/services/clientShortlist'

/**
 * Where a shortlist row's fit score stands against the client as they are now.
 *
 * - unscored: never scored.
 * - stale: scored against an older bio, brief or intake, by autopilot (which
 *   reads the bio alone), or only estimated from keywords.
 * - current: an AI score made against today's profile.
 */
export type ShortlistFitState = 'unscored' | 'stale' | 'current'

/** Strong 8+, possible 5 to 7.9, weak under 5: the Finder's own bands. */
export type ShortlistFitBand = 'strong' | 'possible' | 'weak'

export const WEAK_FIT_BELOW = 5
export const STRONG_FIT_FROM = 8

type FitFields = Pick<ClientShortlistPodcast, 'fit_score' | 'fit_source' | 'fit_profile_hash'>

export function fitState(podcast: FitFields, profile: ClientShortlistFitProfile | null): ShortlistFitState {
  if (typeof podcast.fit_score !== 'number') return 'unscored'
  if (podcast.fit_source !== 'ai') return 'stale'
  if (!podcast.fit_profile_hash || !profile || podcast.fit_profile_hash !== profile.hash) return 'stale'
  return 'current'
}

export function fitBand(score: number): ShortlistFitBand {
  if (score >= STRONG_FIT_FROM) return 'strong'
  if (score >= WEAK_FIT_BELOW) return 'possible'
  return 'weak'
}

export function fitScoreLabel(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

/**
 * The rows a "Score fit" run should send: visible shows that are unscored or
 * stale. Archived shows are out of the client's view and not worth a credit.
 */
export function rowsToScore(
  podcasts: ClientShortlistPodcast[],
  profile: ClientShortlistFitProfile | null,
): ClientShortlistPodcast[] {
  return podcasts.filter((podcast) => podcast.visibility === 'visible' && fitState(podcast, profile) !== 'current')
}

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let start = 0; start < items.length; start += size) batches.push(items.slice(start, start + size))
  return batches
}
