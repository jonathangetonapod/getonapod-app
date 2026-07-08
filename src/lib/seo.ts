export const SITE_NAME = 'Get On A Pod'
export const DEFAULT_SITE_URL = 'https://getonapod.com'
export const DEFAULT_OG_IMAGE_PATH = '/og-image.png'
export const DEFAULT_OG_IMAGE_ALT =
  'Get On A Pod social preview with podcast booking dashboard styling'
export const DEFAULT_THEME_COLOR = '#0d1b2a'

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
