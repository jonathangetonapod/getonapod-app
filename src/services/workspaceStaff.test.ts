import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  inviteWorkspaceStaff,
  listWorkspaceStaff,
  mutateWorkspaceStaff,
  updateWorkspaceStaffRole,
  type WorkspaceStaffMember,
  type WorkspaceStaffView,
} from '@/services/workspaceStaff'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'
const ownerId = '33333333-3333-4333-8333-333333333333'
const staffId = '44444444-4444-4444-8444-444444444444'
const invitedAt = '2026-07-22T00:00:00.000Z'

const owner: WorkspaceStaffMember = {
  id: ownerId,
  email: 'owner@example.com',
  full_name: 'Workspace Owner',
  role: 'owner',
  status: 'active',
  invited_at: invitedAt,
  invite_expires_at: null,
  accepted_at: '2026-07-22T00:10:00.000Z',
  suspended_at: null,
  pending_review: false,
  allowed_actions: [],
}

const admin: WorkspaceStaffMember = {
  id: staffId,
  email: 'admin@example.com',
  full_name: 'Agency Admin',
  role: 'admin',
  status: 'active',
  invited_at: invitedAt,
  invite_expires_at: null,
  accepted_at: '2026-07-22T00:20:00.000Z',
  suspended_at: null,
  pending_review: false,
  allowed_actions: ['update_role', 'transfer_owner', 'suspend', 'revoke'],
}

function ownerView(overrides: Partial<WorkspaceStaffView> = {}): WorkspaceStaffView {
  return {
    workspace: { id: workspaceId, name: 'Acme Workspace', status: 'active' },
    capabilities: {
      read_only: false,
      invite_roles: ['admin', 'member'],
      can_update_roles: true,
      can_transfer_owner: true,
    },
    members: [owner, admin],
    ...overrides,
  }
}

describe('workspaceStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists only the narrow DTO for the explicitly addressed canonical workspace', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        ...ownerView(),
        workspace: { ...ownerView().workspace, id: workspaceId.toUpperCase(), slug: 'do-not-expose' },
        members: [
          { ...owner, user_id: 'auth-owner', workspace_id: workspaceId, workspace_access_not_before_epoch: 123 },
          { ...admin, user_id: 'auth-admin', provisioning_method: 'email_invite' },
        ],
      },
      error: null,
    })

    const result = await listWorkspaceStaff(workspaceId.toUpperCase())

    expect(invoke).toHaveBeenCalledWith('manage-workspace-staff', {
      body: { action: 'list', workspace_id: workspaceId },
    })
    expect(result).toEqual(ownerView())
    expect(result.workspace).not.toHaveProperty('slug')
    expect(result.members[0]).not.toHaveProperty('user_id')
    expect(result.members[0]).not.toHaveProperty('workspace_id')
  })

  it('fails closed on a mismatched workspace, invalid owner set, or contradictory capabilities', async () => {
    invoke
      .mockResolvedValueOnce({
        data: ownerView({ workspace: { id: otherWorkspaceId, name: 'Other', status: 'active' } }),
        error: null,
      })
      .mockResolvedValueOnce({ data: ownerView({ members: [admin] }), error: null })
      .mockResolvedValueOnce({
        data: ownerView({
          capabilities: {
            read_only: true,
            invite_roles: [],
            can_update_roles: false,
            can_transfer_owner: false,
          },
        }),
        error: null,
      })

    await expect(listWorkspaceStaff(workspaceId)).rejects.toThrow('workspace staff response was invalid')
    await expect(listWorkspaceStaff(workspaceId)).rejects.toThrow('workspace staff response was invalid')
    await expect(listWorkspaceStaff(workspaceId)).rejects.toThrow('workspace staff response was invalid')
  })

  it('normalizes an invitation and rejects a response for a different role', async () => {
    const invitedMember: WorkspaceStaffMember = {
      ...admin,
      role: 'member',
      status: 'invited',
      accepted_at: null,
      invite_expires_at: '2026-07-29T00:00:00.000Z',
      allowed_actions: ['revoke'],
    }
    invoke
      .mockResolvedValueOnce({ data: { success: true, member: invitedMember }, error: null })
      .mockResolvedValueOnce({ data: { success: true, member: { ...invitedMember, role: 'admin' } }, error: null })

    await expect(inviteWorkspaceStaff(workspaceId.toUpperCase(), {
      email: ' Staff@Example.COM ',
      full_name: ' Agency Member ',
      role: 'member',
    })).resolves.toEqual(invitedMember)
    expect(invoke).toHaveBeenNthCalledWith(1, 'manage-workspace-staff', {
      body: {
        action: 'invite',
        workspace_id: workspaceId,
        email: 'staff@example.com',
        full_name: 'Agency Member',
        role: 'member',
      },
    })

    await expect(inviteWorkspaceStaff(workspaceId, {
      email: 'staff@example.com',
      role: 'member',
    })).rejects.toThrow('workspace staff response was invalid')
  })

  it('updates only the explicit membership and verifies the returned role and identity', async () => {
    const member = { ...admin, role: 'member' as const }
    invoke
      .mockResolvedValueOnce({ data: { success: true, member }, error: null })
      .mockResolvedValueOnce({ data: { success: true, member: { ...member, id: ownerId } }, error: null })

    await expect(updateWorkspaceStaffRole(workspaceId, staffId.toUpperCase(), 'member')).resolves.toEqual(member)
    expect(invoke).toHaveBeenNthCalledWith(1, 'manage-workspace-staff', {
      body: {
        action: 'update_role',
        workspace_id: workspaceId,
        membership_id: staffId,
        role: 'member',
      },
    })
    await expect(updateWorkspaceStaffRole(workspaceId, staffId, 'member')).rejects.toThrow(
      'workspace staff response was invalid',
    )
  })

  it('validates lifecycle status transitions returned by the server', async () => {
    const suspended = {
      ...admin,
      status: 'suspended' as const,
      suspended_at: '2026-07-22T02:00:00.000Z',
      allowed_actions: ['update_role', 'reactivate', 'revoke'] as const,
    }
    const revoked = {
      ...admin,
      status: 'revoked' as const,
      allowed_actions: [] as const,
    }
    invoke
      .mockResolvedValueOnce({ data: { success: true, member: suspended }, error: null })
      .mockResolvedValueOnce({ data: { success: true, member: revoked }, error: null })
      .mockResolvedValueOnce({ data: { success: true, member: admin }, error: null })

    await expect(mutateWorkspaceStaff(workspaceId, staffId, 'suspend')).resolves.toEqual(suspended)
    await expect(mutateWorkspaceStaff(workspaceId, staffId, 'revoke')).resolves.toEqual(revoked)
    await expect(mutateWorkspaceStaff(workspaceId, staffId, 'suspend')).rejects.toThrow(
      'workspace staff response was invalid',
    )
    expect(invoke).toHaveBeenNthCalledWith(2, 'manage-workspace-staff', {
      body: { action: 'revoke', workspace_id: workspaceId, membership_id: staffId },
    })
  })

  it('accepts either ownership-transfer reauthentication outcome and requires the marker', async () => {
    const newOwner = { ...admin, role: 'owner' as const, allowed_actions: [] }
    const previousOwner = { ...owner, role: 'admin' as const }
    invoke
      .mockResolvedValueOnce({
        data: {
          success: true,
          reauthentication_required: true,
          owner: newOwner,
          previous_owner: previousOwner,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          reauthentication_required: false,
          owner: newOwner,
          previous_owner: previousOwner,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          owner: newOwner,
          previous_owner: previousOwner,
        },
        error: null,
      })

    await expect(mutateWorkspaceStaff(workspaceId, staffId, 'transfer_owner')).resolves.toEqual(newOwner)
    expect(invoke).toHaveBeenNthCalledWith(1, 'manage-workspace-staff', {
      body: { action: 'transfer_owner', workspace_id: workspaceId, membership_id: staffId },
    })
    await expect(mutateWorkspaceStaff(workspaceId, staffId, 'transfer_owner')).resolves.toEqual(newOwner)
    await expect(mutateWorkspaceStaff(workspaceId, staffId, 'transfer_owner')).rejects.toThrow(
      'workspace staff response was invalid',
    )
  })

  it('rejects invalid IDs, inputs, and runtime actions before invoking the backend', async () => {
    await expect(listWorkspaceStaff('not-a-workspace')).rejects.toThrow('Workspace ID is invalid.')
    await expect(inviteWorkspaceStaff(workspaceId, {
      email: 'not-an-email',
      role: 'member',
    })).rejects.toThrow('Enter a valid email address.')
    await expect(updateWorkspaceStaffRole(workspaceId, 'not-a-membership', 'member')).rejects.toThrow(
      'Staff membership ID is invalid.',
    )
    await expect(mutateWorkspaceStaff(workspaceId, staffId, 'not-an-action' as never)).rejects.toThrow(
      'Staff action is invalid.',
    )
    expect(invoke).not.toHaveBeenCalled()
  })
})
