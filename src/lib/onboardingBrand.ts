export const DEFAULT_ONBOARDING_ACCENT = '#665CF2'

export function onboardingWorkspaceName(workspaceName: string): string {
  return workspaceName.trim() || 'Our team'
}

export function onboardingAccentColor(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? ''
  return /^#[0-9A-F]{6}$/u.test(normalized) ? normalized : DEFAULT_ONBOARDING_ACCENT
}

export function onboardingAccentHsl(value: string | null | undefined): string {
  const color = onboardingAccentColor(value)
  const red = Number.parseInt(color.slice(1, 3), 16) / 255
  const green = Number.parseInt(color.slice(3, 5), 16) / 255
  const blue = Number.parseInt(color.slice(5, 7), 16) / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const lightness = (maximum + minimum) / 2
  const delta = maximum - minimum
  let hue = 0
  let saturation = 0

  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1))
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6)
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2)
    else hue = 60 * ((red - green) / delta + 4)
  }

  if (hue < 0) hue += 360
  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`
}

export function renderOnboardingBrandText(value: string, workspaceName: string): string {
  const brand = onboardingWorkspaceName(workspaceName)
  return value
    .replace(/\{\{\s*workspace_name\s*\}\}/giu, brand)
    .replace(/\byour agency\b/giu, brand)
}

export function onboardingWorkspaceInitials(workspaceName: string): string {
  const initials = onboardingWorkspaceName(workspaceName)
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase()
  return initials || 'OT'
}

export function onboardingFaviconDataUrl(
  workspaceName: string,
  accentColor: string | null | undefined = DEFAULT_ONBOARDING_ACCENT,
): string {
  const initials = onboardingWorkspaceInitials(workspaceName)
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="' + onboardingAccentColor(accentColor) + '"/><text x="32" y="40" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="white">' + initials + '</text></svg>'
  return 'data:image/svg+xml,' + encodeURIComponent(svg)
}
