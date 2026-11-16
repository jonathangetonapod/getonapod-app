// An agency's brand colour as the portal's theme colour.
//
// The portal used the agency's colour for the logo tile and the active tab
// only; every button, link and chart stayed the product's own indigo, so a
// white-label portal was two brands at once. The design tokens are HSL
// triplets, so the colour is converted and handed to the same variables the
// whole component library already reads.

const HEX_COLOR = /^#[0-9a-f]{6}$/iu

/** Lightness is held in a band where white text on the colour stays readable
 * and the colour itself stays readable as link text on a white page. */
const MIN_LIGHTNESS = 22
const MAX_LIGHTNESS = 48

/**
 * "#1E3A8A" as the "H S% L%" triplet a design token holds, or null for
 * anything that is not a plain six-digit hex colour.
 */
export function brandColorToken(hex: string | null | undefined): string | null {
  if (!hex || !HEX_COLOR.test(hex)) return null
  const red = parseInt(hex.slice(1, 3), 16) / 255
  const green = parseInt(hex.slice(3, 5), 16) / 255
  const blue = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const lightness = (max + min) / 2
  let hue = 0
  let saturation = 0
  if (delta > 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1))
    if (max === red) hue = ((green - blue) / delta) % 6
    else if (max === green) hue = (blue - red) / delta + 2
    else hue = (red - green) / delta + 4
    hue = Math.round(hue * 60)
    if (hue < 0) hue += 360
  }
  const clamped = Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, Math.round(lightness * 100)))
  return `${hue} ${Math.round(saturation * 100)}% ${clamped}%`
}

const THEMED_TOKENS = ['--primary', '--ring'] as const

/**
 * Theme the document with a brand colour and return the undo. Set on the root
 * element, not a wrapper: dialogs and menus render outside the page tree and
 * would otherwise keep the default colour.
 */
export function applyBrandTheme(hex: string | null | undefined, root: HTMLElement = document.documentElement): () => void {
  const token = brandColorToken(hex)
  if (!token) return () => {}
  const previous = THEMED_TOKENS.map((name) => root.style.getPropertyValue(name))
  for (const name of THEMED_TOKENS) root.style.setProperty(name, token)
  root.style.setProperty('--primary-foreground', '0 0% 100%')
  return () => {
    THEMED_TOKENS.forEach((name, index) => {
      if (previous[index]) root.style.setProperty(name, previous[index])
      else root.style.removeProperty(name)
    })
    root.style.removeProperty('--primary-foreground')
  }
}
