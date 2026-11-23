import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

export type SettingsSectionId = 'profile' | 'general' | 'branding' | 'integrations' | 'team' | 'billing'

/*
 * Other pages link to a setting by the id of the field or the old section
 * (/settings#client-contact-email). Each one still lands on the section that
 * holds it, and the field gets the cursor.
 */
const LEGACY_HASHES: Record<string, SettingsSectionId> = {
  'your-profile': 'profile',
  'sidebar-navigation': 'profile',
  'member-avatar': 'profile',
  'workspace-general': 'general',
  'workspace-name': 'general',
  'danger-zone': 'general',
  'client-branding': 'branding',
  'client-brand-name': 'branding',
  'client-contact-email': 'branding',
  'workspace-booking-link': 'branding',
  'workspace-logo': 'branding',
  'ai-keys': 'integrations',
  integrations: 'integrations',
  'workspace-access': 'team',
  billing: 'billing',
}

export const SETTINGS_SECTION_PARAM = 'section'

/**
 * Which settings section is on screen. It lives in ?section= so a link, a
 * refresh and the back button all land on the same one.
 */
export function useSettingsSection(available: SettingsSectionId[], ready: boolean) {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const requested = searchParams.get(SETTINGS_SECTION_PARAM) as SettingsSectionId | null
  const hash = decodeURIComponent(location.hash.slice(1))
  const fromHash = hash ? LEGACY_HASHES[hash] : undefined
  const candidate = requested ?? fromHash ?? null
  const active: SettingsSectionId | null = candidate && available.includes(candidate) ? candidate : available[0] ?? null

  // A field named in the hash gets the cursor once its section has drawn.
  useEffect(() => {
    if (!ready || !hash) return
    const element = document.getElementById(hash)
    if (!element) return
    const isField = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    element.scrollIntoView?.({ block: isField ? 'center' : 'start' })
    if (isField) element.focus({ preventScroll: true })
  }, [ready, hash, location.key])

  const hrefFor = useCallback((id: SettingsSectionId) => {
    const next = new URLSearchParams(searchParams)
    next.set(SETTINGS_SECTION_PARAM, id)
    return `${location.pathname}?${next.toString()}`
  }, [location.pathname, searchParams])

  const select = useCallback((id: SettingsSectionId) => navigate(hrefFor(id)), [hrefFor, navigate])

  return { active, hrefFor, select }
}
