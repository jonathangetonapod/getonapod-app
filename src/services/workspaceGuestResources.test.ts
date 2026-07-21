import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceGuestResource,
  deleteWorkspaceGuestResource,
  listWorkspaceGuestResources,
  updateWorkspaceGuestResource,
  type WorkspaceGuestResource,
  type WorkspaceGuestResourceInput,
} from '@/services/workspaceGuestResources'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'
const resourceId = '33333333-3333-4333-8333-333333333333'
const clientId = '44444444-4444-4444-8444-444444444444'

const resource: WorkspaceGuestResource = {
  id: resourceId,
  workspace_id: workspaceId,
  title: 'Preparation guide',
  description: 'Prepare for a great interview.',
  content: '<p>Helpful content</p>',
  category: 'preparation',
  type: 'article',
  url: null,
  file_url: null,
  featured: true,
  display_order: 2,
  status: 'published',
  visibility: 'selected_clients',
  client_ids: [clientId],
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
}

const input: WorkspaceGuestResourceInput = {
  title: ' Preparation guide ',
  description: ' Prepare for a great interview. ',
  content: ' <p>Helpful content</p> ',
  category: 'preparation',
  type: 'article',
  url: '',
  file_url: '',
  featured: true,
  display_order: 2,
  status: 'published',
  visibility: 'selected_clients',
  client_ids: [clientId],
}

describe('workspaceGuestResources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists resources with an explicit canonical workspace and rejects cross-workspace rows', async () => {
    invoke.mockResolvedValueOnce({ data: { resources: [resource] }, error: null })

    await expect(listWorkspaceGuestResources(workspaceId.toUpperCase())).resolves.toEqual([resource])
    expect(invoke).toHaveBeenCalledWith('workspace-guest-resources', {
      body: { action: 'list', workspace_id: workspaceId },
    })

    invoke.mockResolvedValueOnce({
      data: { resources: [{ ...resource, workspace_id: otherWorkspaceId }] },
      error: null,
    })
    await expect(listWorkspaceGuestResources(workspaceId)).rejects.toThrow(
      'The guest resource response was invalid.',
    )
  })

  it('accepts database-sized Unicode text without UTF-16 response poisoning', async () => {
    const unicodeResource = { ...resource, title: '😀'.repeat(150) }
    invoke.mockResolvedValueOnce({ data: { resources: [unicodeResource] }, error: null })

    await expect(listWorkspaceGuestResources(workspaceId)).resolves.toEqual([unicodeResource])
  })

  it('creates selected-client resources using only the workspace-scoped payload', async () => {
    invoke.mockResolvedValue({ data: { success: true, resource }, error: null })

    await expect(createWorkspaceGuestResource(workspaceId, input)).resolves.toEqual(resource)
    expect(invoke).toHaveBeenCalledWith('workspace-guest-resources', {
      body: {
        action: 'create',
        workspace_id: workspaceId,
        resource: {
          title: 'Preparation guide',
          description: 'Prepare for a great interview.',
          content: '<p>Helpful content</p>',
          category: 'preparation',
          type: 'article',
          url: null,
          file_url: null,
          featured: true,
          display_order: 2,
          status: 'published',
          visibility: 'selected_clients',
          client_ids: [clientId],
        },
      },
    })
  })

  it('updates and deletes only the explicitly addressed resource', async () => {
    invoke
      .mockResolvedValueOnce({ data: { success: true, resource }, error: null })
      .mockResolvedValueOnce({ data: { success: true, resource: null }, error: null })

    await expect(updateWorkspaceGuestResource(workspaceId, resourceId, input)).resolves.toEqual(resource)
    await expect(deleteWorkspaceGuestResource(workspaceId, resourceId)).resolves.toBeUndefined()

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-guest-resources', {
      body: expect.objectContaining({
        action: 'update',
        workspace_id: workspaceId,
        resource_id: resourceId,
      }),
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-guest-resources', {
      body: {
        action: 'delete',
        workspace_id: workspaceId,
        resource_id: resourceId,
      },
    })
  })

  it('fails closed on invalid visibility assignments before invoking the backend', async () => {
    await expect(createWorkspaceGuestResource(workspaceId, {
      ...input,
      visibility: 'selected_clients',
      client_ids: [],
    })).rejects.toThrow('Select at least one client')

    await expect(createWorkspaceGuestResource(workspaceId, {
      ...input,
      visibility: 'all_clients',
      client_ids: [clientId],
    })).rejects.toThrow('All-client resources cannot include selected client assignments.')

    expect(invoke).not.toHaveBeenCalled()
  })

  it('requires a usable action target before publishing linked resource types', async () => {
    await expect(createWorkspaceGuestResource(workspaceId, {
      ...input,
      type: 'video',
      url: '',
    })).rejects.toThrow('require a resource URL')

    await expect(createWorkspaceGuestResource(workspaceId, {
      ...input,
      type: 'download',
      file_url: '',
    })).rejects.toThrow('require a file URL')

    const draftVideo = { ...resource, type: 'video' as const, status: 'draft' as const, url: null }
    invoke.mockResolvedValueOnce({ data: { success: true, resource: draftVideo }, error: null })
    await expect(createWorkspaceGuestResource(workspaceId, {
      ...input,
      type: 'video',
      status: 'draft',
      url: '',
    })).resolves.toEqual(draftVideo)

    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('requires resource-editor HTML instead of ambiguous Markdown or plain text', async () => {
    await expect(createWorkspaceGuestResource(workspaceId, {
      ...input,
      content: '# Preparation',
    })).rejects.toThrow('Resource content must be formatted with the resource editor.')

    await expect(createWorkspaceGuestResource(workspaceId, {
      ...input,
      content: 'Plain text',
    })).rejects.toThrow('Resource content must be formatted with the resource editor.')

    expect(invoke).not.toHaveBeenCalled()
  })

  it('requires visible article copy before publishing', async () => {
    for (const content of [undefined, '', '<p></p>', '<p><br></p>', '<p>&nbsp;</p>']) {
      await expect(createWorkspaceGuestResource(workspaceId, {
        ...input,
        content,
      })).rejects.toThrow('Published article resources require meaningful content.')
    }

    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects a published article with visually empty content from the backend', async () => {
    invoke.mockResolvedValueOnce({
      data: { resources: [{ ...resource, content: '<p><br></p>' }] },
      error: null,
    })

    await expect(listWorkspaceGuestResources(workspaceId)).rejects.toThrow(
      'The guest resource response was invalid.',
    )
  })

  it('keeps an unassigned selected-client resource manageable after its final client is deleted', async () => {
    const unassigned = { ...resource, client_ids: [] }
    invoke.mockResolvedValueOnce({ data: { resources: [unassigned] }, error: null })

    await expect(listWorkspaceGuestResources(workspaceId)).resolves.toEqual([unassigned])
  })

  it('rejects malformed IDs before invoking the backend', async () => {
    await expect(listWorkspaceGuestResources('not-a-workspace')).rejects.toThrow('Workspace ID is invalid.')
    await expect(deleteWorkspaceGuestResource(workspaceId, 'not-a-resource')).rejects.toThrow('Guest resource ID is invalid.')
    expect(invoke).not.toHaveBeenCalled()
  })
})
