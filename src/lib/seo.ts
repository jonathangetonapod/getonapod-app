export const SITE_NAME = 'Get On A Pod'
export const DEFAULT_SITE_URL = 'https://getonapod.com'
/**
 * The version query makes link previews and the CDN fetch the card again when
 * its image changes; bump it whenever scripts/build-social-cards.py is rerun.
 */
export const DEFAULT_OG_IMAGE_PATH = '/og-image.png?v=2'
export const DEFAULT_OG_IMAGE_ALT =
  'Get On A Pod: get booked on the podcasts your buyers already listen to. Done-for-you podcast guesting, you approve every show, 5 clips from every episode.'
/** The site's ink, the colour of the announcement bar every marketing page opens with. */
export const DEFAULT_THEME_COLOR = '#121212'

export function getSiteUrl() {
  return (import.meta.env.VITE_APP_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
}

export function toAbsoluteUrl(path = '/') {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getSiteUrl()}${normalizedPath}`
}
