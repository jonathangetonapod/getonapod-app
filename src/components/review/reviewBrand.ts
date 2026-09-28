import { createContext, useContext, type CSSProperties } from 'react'

/*
 * The agency's colours, applied to the review surface as CSS variables.
 *
 * Sheets and dialogs render through a portal, outside the page element that
 * carries the variables, so a variable set on the page root never reaches
 * them. The context carries the brand through the React tree instead, and
 * every portalled component applies the variables to its own content element.
 */

export interface ReviewBrand {
  primary: string
  accent: string
}

export const DEFAULT_REVIEW_BRAND: ReviewBrand = { primary: '#0D1B2A', accent: '#C7794F' }

export function normalizedBrandColor(value: string | null | undefined, fallback: string): string {
  const color = value?.trim().toUpperCase() || ''
  return /^#[0-9A-F]{6}$/u.test(color) ? color : fallback
}

/** Ink that stays readable on the given background. */
export function readableBrandColor(background: string): string {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(background.slice(offset, offset + 2), 16) / 255)
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ))
  const luminance = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722)
  return luminance > 0.42 ? '#102033' : '#FFFFFF'
}

export function reviewBrandFrom(primary: string | null | undefined, accent: string | null | undefined): ReviewBrand {
  return {
    primary: normalizedBrandColor(primary, DEFAULT_REVIEW_BRAND.primary),
    accent: normalizedBrandColor(accent, DEFAULT_REVIEW_BRAND.accent),
  }
}

export function reviewBrandStyle(brand: ReviewBrand): CSSProperties {
  return {
    '--campaign-primary': brand.primary,
    '--campaign-primary-foreground': readableBrandColor(brand.primary),
    '--campaign-accent': brand.accent,
    '--campaign-accent-foreground': readableBrandColor(brand.accent),
  } as CSSProperties
}

export const ReviewBrandContext = createContext<ReviewBrand>(DEFAULT_REVIEW_BRAND)

export function useReviewBrand(): ReviewBrand {
  return useContext(ReviewBrandContext)
}

/** The variables for a portalled element, read from the nearest provider. */
export function useReviewBrandStyle(): CSSProperties {
  return reviewBrandStyle(useReviewBrand())
}
