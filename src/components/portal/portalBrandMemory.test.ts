import { beforeEach, describe, expect, it } from 'vitest'
import { portalLoginPath, readPortalBrand, rememberPortalBrand } from '@/components/portal/portalBrandMemory'

describe('portalBrandMemory', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('builds a bare sign-in path when nothing is remembered', () => {
    expect(readPortalBrand()).toBeNull()
    expect(portalLoginPath()).toBe('/portal/login')
  })

  it('merges what is learned later into the same agency', () => {
    rememberPortalBrand({ slug: 'Dallas-Fontaine-a0fd', name: 'Northstar' })
    rememberPortalBrand({ name: 'Northstar Advisory', logo_url: 'https://cdn.example.com/l.png', primary_color: '#16324F' })

    expect(readPortalBrand()).toEqual({
      slug: 'dallas-fontaine-a0fd',
      name: 'Northstar Advisory',
      logo_url: 'https://cdn.example.com/l.png',
      primary_color: '#16324F',
    })
    expect(portalLoginPath()).toBe('/portal/login?b=dallas-fontaine-a0fd')
  })

  it('replaces the brand outright when a different agency link arrives', () => {
    rememberPortalBrand({ slug: 'first-agency-link', name: 'First Agency', logo_url: 'https://cdn.example.com/1.png' })
    rememberPortalBrand({ slug: 'second-agency-link' })

    expect(readPortalBrand()).toEqual({ slug: 'second-agency-link', name: null, logo_url: null, primary_color: null })
  })

  it('ignores tampered storage and unsafe values', () => {
    window.sessionStorage.setItem('client_portal_brand', '{"slug":"../evil","name":"","primary_color":"red"}')
    expect(readPortalBrand()).toBeNull()
    window.sessionStorage.setItem('client_portal_brand', 'not json')
    expect(readPortalBrand()).toBeNull()
    expect(portalLoginPath('bad slug')).toBe('/portal/login')
  })

  it('stays apart from the portal session keys', () => {
    rememberPortalBrand({ slug: 'agency-link', name: 'Agency' })
    expect(Object.keys(window.sessionStorage)).toEqual(['client_portal_brand'])
  })
})
