import { describe, expect, it } from 'vitest'
import {
  formatAudience,
  formatDay,
  formatRelativeAge,
  podcastEmailStatus,
  podcastRating,
  shortClientName,
} from '@/lib/podcastCatalogDisplay'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

const base = {
  podcast_id: 'p1',
  podcast_name: 'Show',
  itunes_rating: null,
  spotify_rating: null,
  free_podscan_email: null,
  direct_email: null,
  direct_verified_at: null,
  catalog_updated_at: null,
} as unknown as WorkspacePodcastCatalogItem

const now = new Date('2026-10-23T12:00:00.000Z')

describe('podcastCatalogDisplay', () => {
  it('names the source of every rating it shows', () => {
    expect(podcastRating({ ...base, itunes_rating: 4.4, spotify_rating: 4.9 })?.label).toBe('Apple 4.4')
    expect(podcastRating({ ...base, spotify_rating: 4.75 })?.label).toBe('Spotify 4.8')
    expect(podcastRating({ ...base, itunes_rating: 0 })).toBeNull()
  })

  it('reads the three email states from the fields the catalog sends', () => {
    expect(podcastEmailStatus({ ...base, direct_email: 'a@x.com', free_podscan_email: 'b@x.com' }))
      .toMatchObject({ state: 'verified', email: 'a@x.com' })
    expect(podcastEmailStatus({ ...base, free_podscan_email: 'b@x.com' }))
      .toMatchObject({ state: 'public', email: 'b@x.com' })
    expect(podcastEmailStatus(base)).toMatchObject({ state: 'none', email: null })
  })

  it('says how long ago an episode came out in short words', () => {
    expect(formatRelativeAge('2026-10-23T08:00:00.000Z', now)).toBe('Today')
    expect(formatRelativeAge('2026-10-02T12:00:00.000Z', now)).toBe('3 wks ago')
    expect(formatRelativeAge('2026-02-03T12:00:00.000Z', now)).toBe('8 mo ago')
    expect(formatRelativeAge('2024-09-01T12:00:00.000Z', now)).toBe('2 yrs ago')
    expect(formatRelativeAge(null, now)).toBeNull()
  })

  it('formats a refresh date as a short day', () => {
    expect(formatDay('2026-02-03T12:00:00.000Z')).toBe('Feb 3, 2026')
    expect(formatDay(null)).toBeNull()
  })

  it('formats audience and client names for tight spaces', () => {
    expect(formatAudience(5_600_000)).toBe('5.6M')
    expect(formatAudience(977_600)).toBe('977.6K')
    expect(formatAudience(null)).toBeNull()
    expect(shortClientName('Dallas Fontaine')).toBe('Dallas')
  })
})
