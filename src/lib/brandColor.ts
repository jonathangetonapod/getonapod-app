const HEX_COLOR = /^#[0-9A-F]{6}$/iu

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
  return channels
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
}

/** Dark or white text, whichever reads on the given background. */
export function readableColor(background: string): string {
  const color = HEX_COLOR.test(background) ? background : '#0D1B2A'
  return relativeLuminance(color) > 0.42 ? '#102033' : '#FFFFFF'
}

export const isHexColor = (value: string) => HEX_COLOR.test(value)

/**
 * A colour as people type it, in the one form the server stores: with or
 * without the #, three digits or six, any case. Null when it is not a colour.
 */
export function normalizeHexColor(input: string): string | null {
  const digits = input.trim().replace(/^#/u, '')
  if (/^[0-9a-f]{3}$/iu.test(digits)) {
    return `#${digits.split('').map((digit) => digit + digit).join('')}`.toUpperCase()
  }
  return /^[0-9a-f]{6}$/iu.test(digits) ? `#${digits}`.toUpperCase() : null
}

/** WCAG 2 contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

/** WCAG AA for body text. */
export const MIN_TEXT_CONTRAST = 4.5
