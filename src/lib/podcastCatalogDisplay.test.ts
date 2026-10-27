import { describe, expect, it } from 'vitest'
import {
  emailDomain,
  formatAudience,
  formatDay,
  languageName,
  formatRelativeAge,
  podcastArtworkOriginal,
  podcastArtworkThumbnail,
  podcastEmailStatus,
  podcastRating,
  regionName,
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
    // Apple leads; the detail names both platforms either way.
    expect(podcastRating({ ...base, itunes_rating: 4.4, spotify_rating: 4.9 })?.detail).toBe('Apple Podcasts 4.4 · Spotify 4.9')
    expect(podcastRating({ ...base, spotify_rating: 4.75 })?.detail).toBe('No Apple Podcasts rating · Spotify 4.8')
  })

  it('names languages and regions instead of showing their codes', () => {
    expect(languageName('en')).toBe('English')
    expect(languageName('DE')).toBe('German')
    expect(regionName('us')).toBe('United States')
    expect(regionName('GB')).toBe('United Kingdom')
    expect(regionName(null)).toBeNull()
    expect(languageName('zz-invalid-code')).toBe('ZZ-INVALID-CODE')
  })

  it('takes the domain from an address', () => {
    expect(emailDomain('show@acme.fm')).toBe('acme.fm')
    expect(emailDomain(null)).toBeNull()
  })

  it('reads the three email states from the fields the catalog sends', () => {
    expect(podcastEmailStatus({ ...base, direct_email: 'a@x.com', free_podscan_email: 'b@x.com' }))
      .toMatchObject({ state: 'verified', email: 'a@x.com' })
    expect(podcastEmailStatus({ ...base, free_podscan_email: 'b@x.com' }))
      .toMatchObject({ state: 'public', email: 'b@x.com' })
    expect(podcastEmailStatus(base)).toMatchObject({ state: 'none', email: null })
  })

  // The public address reads by its mailbox check; a paid direct contact still leads.
  it('reads the mailbox check on the public address', () => {
    const show = { ...base, free_podscan_email: 'b@x.com' }
    expect(podcastEmailStatus({ ...show, email_verification: 'ok' })).toMatchObject({ state: 'deliverable', email: 'b@x.com' })
    expect(podcastEmailStatus({ ...show, email_verification: 'catch_all' })).toMatchObject({ state: 'catch_all' })
    expect(podcastEmailStatus({ ...show, email_verification: 'unknown' })).toMatchObject({ state: 'public' })
    expect(podcastEmailStatus({ ...show, email_verification: null })).toMatchObject({ state: 'public' })
    expect(podcastEmailStatus({ ...show, direct_email: 'a@x.com', email_verification: 'ok' })).toMatchObject({ state: 'verified', email: 'a@x.com' })
  })

  // Full-size covers are fetched as small WebP thumbnails at twice the display size.
  it('builds a resized thumbnail URL for a cover', () => {
    const url = podcastArtworkThumbnail('https://cdn.example.com/art/cover.png?v=2', 40)
    const parsed = new URL(url as string)
    expect(parsed.origin).toBe('https://wsrv.nl')
    expect(parsed.searchParams.get('url')).toBe('https://cdn.example.com/art/cover.png?v=2')
    expect(parsed.searchParams.get('w')).toBe('80')
    expect(parsed.searchParams.get('h')).toBe('80')
    expect(parsed.searchParams.get('output')).toBe('webp')
    // An http:// cover is served through the proxy too, so it loads on an https page.
    expect(podcastArtworkThumbnail('http://old.example.com/a.jpg', 48)).toContain('url=http%3A%2F%2Fold.example.com%2Fa.jpg')
    expect(podcastArtworkThumbnail(null, 40)).toBeNull()
    expect(podcastArtworkThumbnail('data:image/png;base64,xx', 40)).toBeNull()
  })

  it('falls back to the original cover only when it is https', () => {
    expect(podcastArtworkOriginal(' https://cdn.example.com/a.jpg ')).toBe('https://cdn.example.com/a.jpg')
    expect(podcastArtworkOriginal('http://old.example.com/a.jpg')).toBeNull()
    expect(podcastArtworkOriginal(null)).toBeNull()
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
