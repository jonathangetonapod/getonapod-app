/*
 * The agency a portal visitor arrived through, remembered for the tab.
 *
 * A client who opens the portal from an agency link (?b=<slug>) or signs in
 * and gets the agency's branding back should keep seeing that agency on every
 * later door: the sign-in after a session ends, the sign-in after signing
 * out. This is cosmetic and public (a name, a logo, a colour and the link's
 * slug), so it lives in sessionStorage under its own key, apart from the
 * session token, and every read and write tolerates storage being blocked.
 */

const STORAGE_KEY = 'client_portal_brand'
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i
const HEX_COLOR = /^#[0-9a-f]{6}$/i

export interface RememberedPortalBrand {
  slug: string | null
  name: string | null
  logo_url: string | null
  primary_color: string | null
}

export const isPortalBrandSlug = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 180 && SLUG_PATTERN.test(value)

const cleanString = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null

const normalize = (value: unknown): RememberedPortalBrand | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const brand: RememberedPortalBrand = {
    slug: isPortalBrandSlug(record.slug) ? record.slug.toLowerCase() : null,
    name: cleanString(record.name, 200),
    logo_url: cleanString(record.logo_url, 2048),
    primary_color: typeof record.primary_color === 'string' && HEX_COLOR.test(record.primary_color)
      ? record.primary_color
      : null,
  }
  return brand.slug || brand.name ? brand : null
}

export const readPortalBrand = (): RememberedPortalBrand | null => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    return raw ? normalize(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/**
 * Merges what is newly known over what was remembered. A slug from a
 * different agency replaces the old brand entirely, so one agency's name never
 * sits beside another agency's link.
 */
export const rememberPortalBrand = (update: Partial<RememberedPortalBrand>): void => {
  const previous = readPortalBrand()
  const updateSlug = isPortalBrandSlug(update.slug) ? update.slug.toLowerCase() : null
  const base = previous && (!updateSlug || !previous.slug || previous.slug === updateSlug) ? previous : null
  const next = normalize({
    slug: updateSlug ?? base?.slug ?? null,
    name: update.name ?? base?.name ?? null,
    logo_url: update.logo_url !== undefined ? update.logo_url : base?.logo_url ?? null,
    primary_color: update.primary_color !== undefined ? update.primary_color : base?.primary_color ?? null,
  })
  if (!next) return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage is optional; the neutral sign-in still works.
  }
}

/** The sign-in path that keeps the remembered agency's branding. */
export const portalLoginPath = (slug: string | null = readPortalBrand()?.slug ?? null): string =>
  isPortalBrandSlug(slug) ? `/portal/login?b=${encodeURIComponent(slug.toLowerCase())}` : '/portal/login'
