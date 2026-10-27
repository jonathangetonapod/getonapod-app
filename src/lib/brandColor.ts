const HEX_COLOR = /^#[0-9A-F]{6}$/iu

/** Dark or white text, whichever reads on the given background. */
export function readableColor(background: string): string {
  const color = HEX_COLOR.test(background) ? background.slice(1) : '0D1B2A'
  const channels = [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255)
  const luminance = channels
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
  return luminance > 0.42 ? '#102033' : '#FFFFFF'
}

export const isHexColor = (value: string) => HEX_COLOR.test(value)
