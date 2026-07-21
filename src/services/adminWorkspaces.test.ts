import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { from } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'

describe('getAdminWorkspaceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries only the explicit non-default workspace and its client rows', async () => {
    const workspace = {
      id: workspaceId,
      name: 'Acme Workspace',
      slug: 'acme',
      status: 'active',
      is_default: false,
    }
    const workspaceBuilder = {} as {
      select: ReturnType<typeof vi.fn>
      eq: ReturnType<typeof vi.fn>
      maybeSingle: ReturnType<typeof vi.fn>
    }
    workspaceBuilder.select = vi.fn(() => workspaceBuilder)
    workspaceBuilder.eq = vi.fn(() => workspaceBuilder)
    workspaceBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: workspace, error: null })

    const clients = [{
      id: '22222222-2222-4222-8222-222222222222',
      workspace_id: workspaceId,
      name: 'Acme Client',
      email: null,
      contact_person: null,
      website: null,
      status: 'active',
    }]
    const clientBuilder = {} as {
      select: ReturnType<typeof vi.fn>
      eq: ReturnType<typeof vi.fn>
      order: ReturnType<typeof vi.fn>
    }
    clientBuilder.select = vi.fn(() => clientBuilder)
    clientBuilder.eq = vi.fn(() => clientBuilder)
    clientBuilder.order = vi.fn()
      .mockReturnValueOnce(clientBuilder)
      .mockResolvedValueOnce({ data: clients, error: null })

    from.mockImplementation((table: string) => (
      table === 'workspaces' ? workspaceBuilder : clientBuilder
    ))

    const result = await getAdminWorkspaceView(workspaceId)

    expect(workspaceBuilder.select).toHaveBeenCalledWith('id,name,slug,status,is_default')
    expect(workspaceBuilder.eq).toHaveBeenNthCalledWith(1, 'id', workspaceId)
    expect(workspaceBuilder.eq).toHaveBeenNthCalledWith(2, 'is_default', false)
    expect(clientBuilder.select).toHaveBeenCalledWith(
      'id,workspace_id,name,email,contact_person,website,status',
    )
    expect(clientBuilder.eq).toHaveBeenCalledWith('workspace_id', workspaceId)
    expect(result).toEqual({ workspace, clients })
  })

  it('does not query clients when the selected workspace is unavailable', async () => {
    const workspaceBuilder = {} as {
      select: ReturnType<typeof vi.fn>
      eq: ReturnType<typeof vi.fn>
      maybeSingle: ReturnType<typeof vi.fn>
    }
    workspaceBuilder.select = vi.fn(() => workspaceBuilder)
    workspaceBuilder.eq = vi.fn(() => workspaceBuilder)
    workspaceBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    from.mockReturnValue(workspaceBuilder)

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(
      'This client workspace is unavailable or no longer active.',
    )
    expect(from).toHaveBeenCalledTimes(1)
  })
})
