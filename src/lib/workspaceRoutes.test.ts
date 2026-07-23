import { describe, expect, it } from 'vitest'
import {
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

  it('falls back to overview outside a workspace module', () => {
    expect(workspaceModuleFromPath('/app/manage-workspaces')).toBe('overview')
    expect(workspaceModuleFromPath('/admin/dashboard')).toBe('overview')
    expect(workspaceModuleFromPath('/admin/prospect-dashboards')).toBe('overview')
  })
})
