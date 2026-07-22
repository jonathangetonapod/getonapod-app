import { describe, expect, it } from 'vitest'
import {
  onboardingAccentColor,
  onboardingAccentHsl,
  onboardingFaviconDataUrl,
  onboardingWorkspaceInitials,
  onboardingWorkspaceName,
  renderOnboardingBrandText,
} from '@/lib/onboardingBrand'

describe('onboarding white-label helpers', () => {
  it('renders workspace tokens and legacy agency wording with the workspace brand', () => {
    expect(renderOnboardingBrandText(
      'Your agency and {{ workspace_name }} will review this.',
      ' Iveth Gonzalez ',
    )).toBe('Iveth Gonzalez and Iveth Gonzalez will review this.')
  })

  it('uses a neutral fallback without exposing the platform brand', () => {
    expect(onboardingWorkspaceName('')).toBe('Our team')
    expect(onboardingWorkspaceInitials('')).toBe('OT')
  })

  it('creates a self-contained workspace favicon without embedding the full workspace name', () => {
    const favicon = onboardingFaviconDataUrl('Iveth Gonzalez', '#123456')
    expect(favicon).toMatch(/^data:image\/svg\+xml,/u)
    expect(decodeURIComponent(favicon)).toContain('IG')
    expect(decodeURIComponent(favicon)).toContain('#123456')
    expect(decodeURIComponent(favicon)).not.toContain('Iveth Gonzalez')
  })

  it('normalizes safe accent colors and exposes an HSL theme value', () => {
    expect(onboardingAccentColor('#12abef')).toBe('#12ABEF')
    expect(onboardingAccentColor('not-a-color')).toBe('#665CF2')
    expect(onboardingAccentHsl('#FF0000')).toBe('0 100% 50%')
  })
})
