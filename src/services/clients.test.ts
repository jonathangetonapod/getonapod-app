import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getClients, getWorkspaceResearchContext } from '@/services/clients'

const { from, invoke } = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from,
    functions: { invoke },
  },
}))

describe('getClients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies the selected workspace before returning active research clients', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const terminalQuery = Promise.resolve({ data: [], error: null, count: 0 })
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.order.mockReturnValue(terminalQuery)
    from.mockReturnValue(builder)

    await expect(getClients({ workspaceId, status: 'active' })).resolves.toEqual({
      clients: [],
      total: 0,
    })
    expect(from).toHaveBeenCalledWith('clients')
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'status', 'active')
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'workspace_id', workspaceId)
  })

  it('fails closed if a workspace-scoped response contains another workspace', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const terminalQuery = Promise.resolve({
      data: [{ id: 'client-1', workspace_id: '22222222-2222-4222-8222-222222222222' }],
      error: null,
      count: 1,
    })
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.order.mockReturnValue(terminalQuery)
    from.mockReturnValue(builder)

    await expect(getClients({ workspaceId, status: 'active' })).rejects.toThrow(
      'The selected workspace response did not match the client scope.',
    )
  })
})

describe('getWorkspaceResearchContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads one client through the workspace-bound function contract', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    const context = {
      workspace: {
        id: workspaceId,
        name: 'Agency',
        slug: 'agency',
        status: 'active',
        is_default: false,
        logo_path: null,
        logo_updated_at: null,
      },
      client: {
        id: clientId,
        workspace_id: workspaceId,
        name: 'Client',
        email: 'client@example.com',
        website: null,
        status: 'active',
        bio: 'Approved client profile',
        photo_url: null,
        google_sheet_configured: true,
        updated_at: '2026-07-23T00:00:00.000Z',
      },
      existing_podcast_ids: ['podcast-one', 'podcast-two'],
    }
    invoke.mockResolvedValue({ data: context, error: null })

    await expect(getWorkspaceResearchContext(workspaceId.toUpperCase(), clientId.toUpperCase())).resolves.toEqual(context)
    expect(invoke).toHaveBeenCalledWith('workspace-clients', {
      body: {
        action: 'research-get',
        workspace_id: workspaceId,
        client_id: clientId,
      },
    })
  })

  it('keeps older research responses usable with an empty history', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    invoke.mockResolvedValue({
      data: {
        workspace: { id: workspaceId },
        client: { id: clientId, workspace_id: workspaceId, status: 'active' },
      },
      error: null,
    })

    await expect(getWorkspaceResearchContext(workspaceId, clientId)).resolves.toMatchObject({
      existing_podcast_ids: [],
    })
  })

  it('rejects malformed client podcast history instead of weakening dedupe', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    invoke.mockResolvedValue({
      data: {
        workspace: { id: workspaceId },
        client: { id: clientId, workspace_id: workspaceId, status: 'active' },
        existing_podcast_ids: ['valid-id', ''],
      },
      error: null,
    })

    await expect(getWorkspaceResearchContext(workspaceId, clientId)).rejects.toThrow(
      'The podcast research history response was invalid.',
    )
  })

  it('rejects a client response from another workspace', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const clientId = '22222222-2222-4222-8222-222222222222'
    invoke.mockResolvedValue({
      data: {
        workspace: { id: workspaceId },
        client: {
          id: clientId,
          workspace_id: '33333333-3333-4333-8333-333333333333',
          status: 'active',
        },
      },
      error: null,
    })

    await expect(getWorkspaceResearchContext(workspaceId, clientId)).rejects.toThrow(
      'The podcast research context did not match the workspace client address.',
    )
  })
})
