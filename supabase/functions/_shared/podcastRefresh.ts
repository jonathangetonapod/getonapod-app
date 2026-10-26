/**
 * What a Podscan podcast record changes on a catalogue row.
 *
 * The scheduled refresh updates rows that already exist, so a field Podscan
 * leaves out keeps the value the row had: an empty answer is not evidence the
 * show lost its email or its rating. Numbers arrive as strings as often as
 * numbers ("4.8", "1,204"), and anything that does not parse is left out too.
 */

export type PodcastRefreshFields = Record<string, string | number | boolean | unknown[] | Record<string, unknown>>

function text(value: unknown, max = 20_000): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string'
    ? Number(value.replace(/,/gu, ''))
    : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

function integer(value: unknown): number | undefined {
  const parsed = number(value)
  return parsed === undefined ? undefined : Math.round(parsed)
}

/** A star rating, or nothing: 0 means "no ratings", not a zero-star show. */
function rating(value: unknown): number | undefined {
  const parsed = number(value)
  return parsed !== undefined && parsed > 0 && parsed <= 5 ? parsed : undefined
}

function timestamp(value: unknown): string | undefined {
  const raw = text(value, 64)
  if (!raw) return undefined
  const time = Date.parse(raw)
  return Number.isNaN(time) ? undefined : new Date(time).toISOString()
}

/** An empty list is not evidence the show lost its categories or links. */
function nonEmptyArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : undefined
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export function catalogFieldsFromPodscan(podcast: Record<string, unknown>): PodcastRefreshFields {
  const reach = record(podcast.reach) ?? {}
  const itunes = record(reach.itunes) ?? {}
  const spotify = record(reach.spotify) ?? {}
  const candidates: Record<string, unknown> = {
    podcast_name: text(podcast.podcast_name, 500),
    podcast_description: text(podcast.podcast_description),
    podcast_image_url: text(podcast.podcast_image_url, 2_000),
    podcast_url: text(podcast.podcast_url, 2_000),
    publisher_name: text(podcast.publisher_name, 500),
    rss_url: text(podcast.rss_url, 2_000),
    // As sent, like every other writer: the legacy admin region filter
    // matches the stored value exactly ("US"), so lower-casing would split it.
    language: text(podcast.language, 16),
    region: text(podcast.region, 16),
    podcast_itunes_id: text(podcast.podcast_itunes_id, 64),
    podcast_spotify_id: text(podcast.podcast_spotify_id, 64),
    podcast_categories: nonEmptyArray(podcast.podcast_categories),
    episode_count: integer(podcast.episode_count),
    last_posted_at: timestamp(podcast.last_posted_at),
    is_active: typeof podcast.is_active === 'boolean' ? podcast.is_active : undefined,
    podcast_has_guests: typeof podcast.podcast_has_guests === 'boolean' ? podcast.podcast_has_guests : undefined,
    podcast_has_sponsors: typeof podcast.podcast_has_sponsors === 'boolean' ? podcast.podcast_has_sponsors : undefined,
    podcast_reach_score: integer(podcast.podcast_reach_score),
    audience_size: integer(reach.audience_size ?? podcast.audience_size),
    itunes_rating: rating(itunes.itunes_rating_average),
    itunes_rating_count: integer(itunes.itunes_rating_count),
    itunes_rating_count_bracket: text(itunes.itunes_rating_count_bracket, 64),
    spotify_rating: rating(spotify.spotify_rating_average),
    spotify_rating_count: integer(spotify.spotify_rating_count),
    spotify_rating_count_bracket: text(spotify.spotify_rating_count_bracket, 64),
    podscan_email: text(reach.email, 320),
    website: text(reach.website, 2_000),
    social_links: nonEmptyArray(reach.social_links),
  }
  return Object.fromEntries(
    Object.entries(candidates).filter(([, value]) => value !== undefined),
  ) as PodcastRefreshFields
}
