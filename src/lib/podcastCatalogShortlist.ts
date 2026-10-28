import { repairableExternalUrl } from '@/lib/externalUrl'
import { categoryNames } from '@/lib/podcastCatalogDisplay'
import type { ClientShortlistPodcastInput } from '@/services/clientShortlist'
import type { ProspectShortlistPodcastInput } from '@/services/prospectDashboards'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

/*
 * What a catalogue row becomes when it is added somewhere. The row button,
 * the details dialog and the bulk bar all add through these, so the same show
 * lands as the same shortlist entry whichever was used.
 */

function shortlistCategories(podcast: WorkspacePodcastCatalogItem) {
  return categoryNames(podcast).map((categoryName) => ({
    category_id: `catalog-${categoryName.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')}`.slice(0, 200),
    category_name: categoryName.slice(0, 200),
  }))
}

export function toShortlistPodcast(podcast: WorkspacePodcastCatalogItem): ClientShortlistPodcastInput {
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
    podcast_categories: shortlistCategories(podcast),
    language: podcast.language,
    region: podcast.region,
    // This field feeds Podscan metadata during catalog merge. The direct
    // contact remains in its own global record and is read by the pitch flow.
    podcast_email: podcast.free_podscan_email,
    rss_feed: podcast.rss_feed,
  }
}

/*
 * The prospect shortlist takes a narrower row than a client's: no contact
 * address, no feed, no language or region. That is the point of the two shapes
 * — a prospect page is something you send to someone who has not signed
 * anything yet, so the things worth protecting are not gathered for it.
 */
export function toProspectPodcast(podcast: WorkspacePodcastCatalogItem): ProspectShortlistPodcastInput {
  return {
    podcast_id: podcast.podcast_id,
    podcast_name: podcast.podcast_name,
    podcast_description: podcast.podcast_description,
    // The prospect endpoint validates both of these, because the dashboard it
    // builds is public. The catalogue holds websites typed without a scheme —
    // simplecast.com, www.AngelInvestorsNetwork.com — so passing them straight
    // through failed the whole batch on one row's untidy address.
    podcast_image_url: repairableExternalUrl(podcast.podcast_image_url),
    podcast_url: repairableExternalUrl(podcast.podcast_url),
    publisher_name: podcast.publisher_name,
    itunes_rating: podcast.itunes_rating,
    episode_count: podcast.episode_count,
    audience_size: podcast.audience_size,
    last_posted_at: podcast.last_posted_at,
    podcast_categories: shortlistCategories(podcast),
  }
}
