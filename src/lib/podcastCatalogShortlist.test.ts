import { describe, expect, it } from 'vitest'
import { toShortlistPodcast } from './podcastCatalogShortlist'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

describe('catalog email provenance when adding to a shortlist', () => {
  it('passes only the Podscan inbox as podcast metadata', () => {
    const podcast = { free_podscan_email: 'public@example.com', direct_email: 'host@example.com' } as WorkspacePodcastCatalogItem
    expect(toShortlistPodcast(podcast).podcast_email).toBe('public@example.com')
    expect(toShortlistPodcast({ ...podcast, free_podscan_email: null }).podcast_email).toBeNull()
  })
})
