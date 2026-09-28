import { describe, expect, it } from 'vitest'
import {
  clientPitchHref,
  clientShortlistHref,
  selectedWorkspaceBaseHref,
  workspaceModuleFromPath,
  workspaceModuleHref,
} from '@/lib/workspaceRoutes'

describe('workspace routes', () => {
  it('builds the same module address for a selected workspace', () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    expect(workspaceModuleHref(selectedWorkspaceBaseHref(workspaceId), 'onboarding')).toBe(
      `/app/workspaces/${workspaceId}/onboarding`,
    )
  })

  it('preserves podcast research without carrying a client across workspaces', () => {
    expect(workspaceModuleFromPath(
      '/app/workspaces/11111111-1111-4111-8111-111111111111/clients/22222222-2222-4222-8222-222222222222/podcast-finder',
    )).toBe('podcast-finder')
  })

  it('preserves the shared Podcast Database while switching workspaces', () => {
    expect(workspaceModuleFromPath('/app/podcast-database')).toBe('podcast-database')
    expect(workspaceModuleHref('/app', 'podcast-database')).toBe('/app/podcast-database')
  })

  it.each(['client-campaigns', 'relationships', 'master-inbox', 'mailboxes'] as const)(
    'preserves the %s module while switching workspaces',
    (module) => {
      expect(workspaceModuleFromPath(`/app/workspaces/11111111-1111-4111-8111-111111111111/${module}`)).toBe(module)
      expect(workspaceModuleHref('/app', module)).toBe(`/app/${module}`)
    },
  )

  it('preserves the Client Podcast System while switching workspaces', () => {
    expect(workspaceModuleFromPath('/app/client-podcast-system')).toBe('client-podcast-system')
    expect(workspaceModuleHref('/app', 'client-podcast-system')).toBe('/app/client-podcast-system')
  })

  it('preserves Prospect Studio while switching workspaces', () => {
    expect(workspaceModuleFromPath('/app/prospects')).toBe('prospects')
    expect(workspaceModuleHref('/app', 'prospects')).toBe('/app/prospects')
    expect(workspaceModuleFromPath('/app/prospect-dashboards')).toBe('prospects')
  })

  it('returns a client campaign detail to the campaign index when switching workspaces', () => {
    expect(workspaceModuleFromPath(
      '/app/workspaces/11111111-1111-4111-8111-111111111111/client-campaigns/22222222-2222-4222-8222-222222222222',
    )).toBe('client-campaigns')
  })

  it('keeps nested billing inside Settings navigation', () => {
    expect(workspaceModuleFromPath('/app/settings/billing')).toBe('settings')
  })

  it('falls back to clients outside a workspace module', () => {
    expect(workspaceModuleFromPath('/app/manage-workspaces')).toBe('clients')
    expect(workspaceModuleFromPath('/admin/dashboard')).toBe('clients')
  })

  it('keeps the retired admin prospect address in Prospect Studio', () => {
    expect(workspaceModuleFromPath('/admin/prospect-dashboards')).toBe('prospects')
  })

  it('addresses a shortlisted podcast\u2019s pitch page inside the workspace being viewed', () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    const podcastId = '33333333-3333-4333-8333-333333333333'
    expect(clientPitchHref('/app', clientId, podcastId)).toBe(
      `/app/clients/${clientId}/podcasts/${podcastId}/pitch`,
    )
    expect(clientPitchHref(selectedWorkspaceBaseHref(workspaceId), clientId, podcastId)).toBe(
      `/app/workspaces/${workspaceId}/clients/${clientId}/podcasts/${podcastId}/pitch`,
    )
    expect(clientShortlistHref('/app', clientId)).toBe(`/app/clients/${clientId}?tab=shortlist`)
    // Deep inside a client, the sidebar still highlights Clients.
    expect(workspaceModuleFromPath(`/app/clients/${clientId}/podcasts/${podcastId}/pitch`)).toBe('clients')
  })
})
