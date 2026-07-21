import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPortalGuestResources } from '@/services/guestResources'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const clientId = '11111111-1111-4111-8111-111111111111'
const resource = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Guest checklist',
  description: 'A safe published resource.',
  content: '<p>Checklist content</p>',
  category: 'preparation',
  type: 'article',
  url: null,
  file_url: null,
  featured: true,
  display_order: 1,
  published_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
}

describe('getPortalGuestResources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoke.mockResolvedValue({
      data: { success: true, resources: [resource], total: 1, limit: 100, offset: 0 },
      error: null,
    })
  })

  it('sends the real portal bearer with the requested client ID', async () => {
    await expect(getPortalGuestResources({
      clientId,
      sessionToken: 'real-portal-session-token',
    })).resolves.toEqual([resource])

    expect(invoke).toHaveBeenCalledWith('get-guest-resources', {
      body: { clientId, sessionToken: 'real-portal-session-token', limit: 100, offset: 0 },
    })
  })

  it('accepts database-sized Unicode text without UTF-16 response poisoning', async () => {
    const unicodeResource = { ...resource, title: '😀'.repeat(150) }
    invoke.mockResolvedValueOnce({
      data: { success: true, resources: [unicodeResource], total: 1, limit: 100, offset: 0 },
      error: null,
    })

    await expect(getPortalGuestResources({
      clientId,
      sessionToken: 'real-portal-session-token',
    })).resolves.toEqual([unicodeResource])
  })

  it('omits the bearer only for an explicit platform-admin impersonation', async () => {
    await expect(getPortalGuestResources({
      clientId,
      platformAdminImpersonation: true,
    })).resolves.toEqual([resource])

    expect(invoke).toHaveBeenCalledWith('get-guest-resources', {
      body: { clientId, limit: 100, offset: 0 },
    })

    vi.clearAllMocks()
    await expect(getPortalGuestResources({ clientId })).rejects.toThrow(
      'A valid portal session is required',
    )
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects sensitive or malformed resource fields from the portal response', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        resources: [{ ...resource, workspace_id: '33333333-3333-4333-8333-333333333333' }],
        total: 1,
        limit: 100,
        offset: 0,
      },
      error: null,
    })

    await expect(getPortalGuestResources({
      clientId,
      sessionToken: 'real-portal-session-token',
    })).rejects.toThrow('The portal guest resource response was invalid.')
  })

  it('rejects published action resources without a usable target', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        resources: [{ ...resource, type: 'video', url: null }],
        total: 1,
        limit: 100,
        offset: 0,
      },
      error: null,
    })

    await expect(getPortalGuestResources({
      clientId,
      sessionToken: 'real-portal-session-token',
    })).rejects.toThrow('The portal guest resource response was invalid.')
  })

  it('rejects non-canonical content returned by the portal boundary', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        resources: [{ ...resource, content: '# Checklist' }],
        total: 1,
        limit: 100,
        offset: 0,
      },
      error: null,
    })

    await expect(getPortalGuestResources({
      clientId,
      sessionToken: 'real-portal-session-token',
    })).rejects.toThrow('The portal guest resource response was invalid.')
  })

  it('rejects a published article whose canonical HTML has no visible copy', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        resources: [{ ...resource, content: '<p><br></p>' }],
        total: 1,
        limit: 100,
        offset: 0,
      },
      error: null,
    })

    await expect(getPortalGuestResources({
      clientId,
      sessionToken: 'real-portal-session-token',
    })).rejects.toThrow('The portal guest resource response was invalid.')
  })

  it('loads every visible page instead of silently truncating the catalog', async () => {
    const resources = Array.from({ length: 101 }, (_, index) => ({
      ...resource,
      id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`,
      display_order: index,
    }))
    invoke
      .mockResolvedValueOnce({
        data: { success: true, resources: resources.slice(0, 100), total: 101, limit: 100, offset: 0 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { success: true, resources: resources.slice(100), total: 101, limit: 100, offset: 100 },
        error: null,
      })

    await expect(getPortalGuestResources({
      clientId,
      sessionToken: 'real-portal-session-token',
    })).resolves.toHaveLength(101)
    expect(invoke).toHaveBeenNthCalledWith(2, 'get-guest-resources', {
      body: { clientId, sessionToken: 'real-portal-session-token', limit: 100, offset: 100 },
    })
  })
})
