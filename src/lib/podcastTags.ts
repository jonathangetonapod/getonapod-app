/*
 * The tags Jev gives each catalogue show (podcasts.jev_*), as the catalogue
 * function accepts them. Kept apart from the service so pages and filters can
 * read the lists without loading it.
 */

/** Who a show is made for; several can apply. */
export const PODCAST_LISTENER_KEYS = ['founders', 'executives', 'marketers', 'sales', 'investors', 'technical', 'healthcare', 'consumers'] as const
/** How a show's episodes are usually made; one per show. */
export const PODCAST_FORMAT_KEYS = ['interview', 'panel', 'solo', 'cohosts', 'news', 'narrative', 'brand', 'other'] as const

export type WorkspacePodcastListener = typeof PODCAST_LISTENER_KEYS[number]
export type WorkspacePodcastFormat = typeof PODCAST_FORMAT_KEYS[number]
