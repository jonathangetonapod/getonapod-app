import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAdminWorkspaceView,
  listAdminWorkspaces,
  type AdminWorkspace,
  type AdminWorkspaceView,
} from '@/services/adminWorkspaces'
import type { WorkspaceClient } from '@/services/clients'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { from } }))

const workspaceId = 'a1111111-1111-4111-8111-11111111111a'
const otherWorkspaceId = 'b2222222-2222-4222-8222-22222222222b'
const workspace: AdminWorkspaceView['workspace'] = {
  id: workspaceId,
  name: 'Acme Workspace',
  slug: 'acme',
  status: 'active',
  is_default: false,
}
const ownerRow = {
  workspace_id: workspaceId,
  email_normalized: 'owner@acme.example',
  full_name: 'Acme Owner',
  role: 'owner' as const,
  status: 'active',
}
const clients: WorkspaceClient[] = [{
  id: 'c3333333-3333-4333-8333-33333333333c',
  workspace_id: workspaceId,
  name: 'Acme Client',
  email: null,
  contact_person: null,
  linkedin_url: null,
  website: null,
  status: 'active',
  notes: null,
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
}]

describe('listAdminWorkspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only active private workspaces with an active owner', async () => {
    const invitedWorkspaceId = 'e5555555-5555-4555-8555-55555555555e'
    const workspaces: AdminWorkspace[] = [
      workspace,
      {
        id: invitedWorkspaceId,
        name: 'Invited Workspace',
        slug: 'invited',
        status: 'active',
        is_default: false,
      },
    ]
    const workspaceResult = Promise.resolve({ data: workspaces, error: null })
    const workspaceBuilder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    workspaceBuilder.select.mockReturnValue(workspaceBuilder)
    workspaceBuilder.eq.mockReturnValue(workspaceBuilder)
    workspaceBuilder.order
      .mockReturnValueOnce(workspaceBuilder)
      .mockReturnValueOnce(workspaceResult)

    const membershipResult = Promise.resolve({
      data: [{ workspace_id: workspaceId }],
      error: null,
    })
    const membershipBuilder = {
      select: vi.fn(),
      in: vi.fn(),
      eq: vi.fn(),
    }
    membershipBuilder.select.mockReturnValue(membershipBuilder)
    membershipBuilder.in.mockReturnValue(membershipBuilder)
    membershipBuilder.eq
      .mockReturnValueOnce(membershipBuilder)
      .mockReturnValueOnce(membershipResult)

    from.mockImplementation((table: string) => (
      table === 'workspaces' ? workspaceBuilder : membershipBuilder
    ))

    await expect(listAdminWorkspaces()).resolves.toEqual([workspace])
    expect(membershipBuilder.in).toHaveBeenCalledWith(
      'workspace_id',
      [workspaceId, invitedWorkspaceId],
    )
    expect(membershipBuilder.eq).toHaveBeenNthCalledWith(1, 'role', 'owner')
    expect(membershipBuilder.eq).toHaveBeenNthCalledWith(2, 'status', 'active')
  })
})

function makeWorkspaceBuilder(data: AdminWorkspaceView['workspace'] | null) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    abortSignal: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.abortSignal.mockReturnValue(builder)
  return builder
}

function makeViewerBuilder(data: typeof ownerRow | null) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    abortSignal: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.limit.mockReturnValue(builder)
  builder.abortSignal.mockReturnValue(builder)
  return builder
}

function makeClientsBuilder(data: WorkspaceClient[]) {
  const abortSignal = vi.fn()
  const terminalQuery = Object.assign(
    Promise.resolve({ data, error: null }),
    { abortSignal },
  )
  abortSignal.mockReturnValue(terminalQuery)

  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
  }
  builder.select.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order
    .mockReturnValueOnce(builder)
    .mockReturnValueOnce(terminalQuery)
  return { builder, abortSignal }
}

interface ArrangeOptions {
  workspaceData?: AdminWorkspaceView['workspace'] | null
  viewerData?: typeof ownerRow | null
  clientsData?: WorkspaceClient[]
}

function arrange(options: ArrangeOptions = {}) {
  const workspaceBuilder = makeWorkspaceBuilder(
    options.workspaceData === undefined ? workspace : options.workspaceData,
  )
  const viewerBuilder = makeViewerBuilder(
    options.viewerData === undefined ? ownerRow : options.viewerData,
  )
  const { builder: clientsBuilder, abortSignal: clientsAbortSignal } = makeClientsBuilder(
    options.clientsData === undefined ? clients : options.clientsData,
  )

  from.mockImplementation((table: string) => {
    if (table === 'workspaces') return workspaceBuilder
    if (table === 'workspace_memberships') return viewerBuilder
    return clientsBuilder
  })

  return { workspaceBuilder, viewerBuilder, clientsBuilder, clientsAbortSignal }
}

describe('getAdminWorkspaceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the exact active owner and client projection with one canonical workspace ID', async () => {
    const { workspaceBuilder, viewerBuilder, clientsBuilder, clientsAbortSignal } = arrange()
    const controller = new AbortController()

    const result = await getAdminWorkspaceView(workspaceId.toUpperCase(), controller.signal)

    expect(from.mock.calls.map(([table]) => table)).toEqual([
      'workspaces',
      'workspace_memberships',
      'clients',
    ])
    expect(workspaceBuilder.select).toHaveBeenCalledWith('id,name,slug,status,is_default')
    expect(workspaceBuilder.eq).toHaveBeenNthCalledWith(1, 'id', workspaceId)
    expect(workspaceBuilder.eq).toHaveBeenNthCalledWith(2, 'is_default', false)
    expect(viewerBuilder.select).toHaveBeenCalledWith(
      'workspace_id,email_normalized,full_name,role,status',
    )
    expect(viewerBuilder.eq).toHaveBeenNthCalledWith(1, 'workspace_id', workspaceId)
    expect(viewerBuilder.eq).toHaveBeenNthCalledWith(2, 'role', 'owner')
    expect(viewerBuilder.eq).toHaveBeenNthCalledWith(3, 'status', 'active')
    expect(viewerBuilder.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(viewerBuilder.limit).toHaveBeenCalledWith(1)
    expect(clientsBuilder.select).toHaveBeenCalledWith(
      'id,workspace_id,name,email,contact_person,linkedin_url,website,status,notes,created_at,updated_at',
    )
    expect(clientsBuilder.eq).toHaveBeenCalledWith('workspace_id', workspaceId)
    expect(workspaceBuilder.abortSignal).toHaveBeenCalledWith(controller.signal)
    expect(viewerBuilder.abortSignal).toHaveBeenCalledWith(controller.signal)
    expect(clientsAbortSignal).toHaveBeenCalledWith(controller.signal)
    expect(result).toEqual({
      workspace,
      viewer: {
        workspace_id: workspaceId,
        email: 'owner@acme.example',
        full_name: 'Acme Owner',
        role: 'owner',
      },
      clients,
    })
  })

  it.each<{
    label: string
    workspaceData: AdminWorkspaceView['workspace']
    expectedMessage: string
  }>([
    {
      label: 'default',
      workspaceData: { ...workspace, is_default: true },
      expectedMessage: 'The workspace preview response did not match the selected workspace.',
    },
    {
      label: 'inactive',
      workspaceData: { ...workspace, status: 'suspended' },
      expectedMessage: 'This client workspace is unavailable or no longer active.',
    },
    {
      label: 'mismatched',
      workspaceData: { ...workspace, id: otherWorkspaceId },
      expectedMessage: 'The workspace preview response did not match the selected workspace.',
    },
  ])('rejects a $label workspace before querying owner or client rows', async ({ workspaceData, expectedMessage }) => {
    const { viewerBuilder, clientsBuilder } = arrange({ workspaceData })

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(expectedMessage)
    expect(viewerBuilder.select).not.toHaveBeenCalled()
    expect(clientsBuilder.select).not.toHaveBeenCalled()
  })

  it('does not query owner or client rows when the selected workspace is unavailable', async () => {
    const { viewerBuilder, clientsBuilder } = arrange({ workspaceData: null })

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(
      'This client workspace is unavailable or no longer active.',
    )
    expect(viewerBuilder.select).not.toHaveBeenCalled()
    expect(clientsBuilder.select).not.toHaveBeenCalled()
  })

  it('requires an active owner bound to the selected workspace', async () => {
    const { clientsBuilder } = arrange({
      viewerData: { ...ownerRow, workspace_id: otherWorkspaceId },
    })

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(
      'This client workspace does not have an active owner to preview.',
    )
    expect(clientsBuilder.select).not.toHaveBeenCalled()
  })

  it('rejects client rows outside the selected workspace', async () => {
    const mismatchedClients = clients.map((client) => ({
      ...client,
      workspace_id: otherWorkspaceId,
    }))
    arrange({ clientsData: mismatchedClients })

    await expect(getAdminWorkspaceView(workspaceId)).rejects.toThrow(
      'The workspace preview response did not match the selected workspace.',
    )
  })
})
