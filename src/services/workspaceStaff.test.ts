import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adjustWorkspaceCredits,
  createWorkspaceStaffTemporaryPassword,
  getWorkspaceCreditLedger,
  grantWorkspaceCredits,
  runSubscriptionAction,
  setWorkspaceMonthlyAllowance,
  testWorkspaceAiKey,
  inviteWorkspaceStaff,
  listWorkspaceStaff,
  mutateWorkspaceStaff,
  resetWorkspaceStaffTemporaryPassword,
  retryWorkspaceStaffTemporaryPassword,
  removeWorkspaceLogo,
  updateBillingPlanPrice,
  updateWorkspaceClientBranding,
  updateWorkspaceLogo,
  updateWorkspaceName,
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
const temporaryPassword = `Tmp-Aa2-${'b'.repeat(20)}`

const owner: WorkspaceStaffMember = {
  id: ownerId,
  email: 'owner@example.com',
  full_name: 'Workspace Owner',
  role: 'owner',
  status: 'active',
  setup_method: 'admin_temporary_password',
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
  setup_method: 'email_invite',
  invited_at: invitedAt,
  invite_expires_at: null,
  accepted_at: '2026-07-22T00:20:00.000Z',
  suspended_at: null,
  pending_review: false,
  allowed_actions: ['reset_password', 'update_role', 'transfer_owner', 'suspend', 'revoke'],
}

function ownerView(overrides: Partial<WorkspaceStaffView> = {}): WorkspaceStaffView {
  return {
    workspace: {
      id: workspaceId,
      name: 'Acme Workspace',
      updated_at: '2026-07-22T00:25:00.000Z',
      status: 'active',
      is_default: false,
      logo_path: null,
      logo_updated_at: null,
      client_brand_name: 'Acme Agency',
      client_brand_primary_color: '#0D1B2A',
      client_brand_accent_color: '#C7794F',
      booking_embed_url: null,
    client_brand_updated_at: '2026-07-22T00:30:00.000Z',
    client_contact_email: null,
    },
    capabilities: {
      read_only: false,
      invite_roles: ['admin', 'member'],
      can_generate_password: true,
      can_manage_branding: true,
      can_manage_client_branding: true,
      can_manage_workspace_name: true,
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

  it('keeps newer settings controls gated when an older backend omits the capabilities', async () => {
    const view = ownerView()
    const legacyCapabilities = {
      read_only: view.capabilities.read_only,
      invite_roles: view.capabilities.invite_roles,
      can_update_roles: view.capabilities.can_update_roles,
      can_transfer_owner: view.capabilities.can_transfer_owner,
    }
    invoke.mockResolvedValueOnce({
      data: { ...view, capabilities: legacyCapabilities },
      error: null,
    })

    const result = await listWorkspaceStaff(workspaceId)

    expect(result.capabilities.can_generate_password).toBe(false)
    expect(result.capabilities.can_manage_branding).toBe(false)
    expect(result.capabilities.can_manage_client_branding).toBe(false)
  })

  it('accepts the platform-owner-only password reset action on a workspace owner', async () => {
    const resettableOwner: WorkspaceStaffMember = { ...owner, allowed_actions: ['reset_password'] }
    invoke.mockResolvedValueOnce({
      data: ownerView({ members: [resettableOwner, admin] }),
      error: null,
    })

    await expect(listWorkspaceStaff(workspaceId)).resolves.toMatchObject({
      members: [
        { id: ownerId, allowed_actions: ['reset_password'] },
        { id: staffId },
      ],
    })
  })

  // The default workspace's own memberships were backfilled with a third
  // provisioning method no private workspace carries. The parser listed two of
  // them, so the settings page rejected the only roster it exists to serve.
  it('parses the platform workspace roster its memberships were bootstrapped with', async () => {
    const view = ownerView()
    invoke.mockResolvedValueOnce({
      data: {
        ...view,
        workspace: { ...view.workspace, is_default: true },
        members: [
          { ...owner, setup_method: 'platform_bootstrap', allowed_actions: [] },
          { ...admin, setup_method: 'platform_bootstrap', allowed_actions: [] },
        ],
        capabilities: {
          ...view.capabilities,
          invite_roles: [],
          can_update_roles: false,
          can_transfer_owner: false,
        },
      },
      error: null,
    })

    await expect(listWorkspaceStaff(workspaceId)).resolves.toMatchObject({
      workspace: { is_default: true },
      members: [
        { id: ownerId, setup_method: 'platform_bootstrap', allowed_actions: [] },
        { id: staffId, setup_method: 'platform_bootstrap', allowed_actions: [] },
      ],
    })
  })

  it('uploads and removes only the exact workspace logo state', async () => {
    const logoPath = `${workspaceId}/66666666-6666-4666-8666-666666666666.png`
    const updatedAt = '2026-07-22T01:00:00.000Z'
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const file = {
      type: 'image/png',
      size: bytes.byteLength,
      arrayBuffer: vi.fn().mockResolvedValue(bytes.buffer),
    } as unknown as File
    invoke
      .mockResolvedValueOnce({
        data: {
          success: true,
          workspace: { id: workspaceId, logo_path: logoPath, logo_updated_at: updatedAt },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          workspace: { id: workspaceId, logo_path: null, logo_updated_at: null },
        },
        error: null,
      })

    await expect(updateWorkspaceLogo(workspaceId.toUpperCase(), file, null)).resolves.toEqual({
      id: workspaceId,
      logo_path: logoPath,
      logo_updated_at: updatedAt,
    })
    expect(invoke).toHaveBeenNthCalledWith(1, 'manage-workspace-staff', {
      body: {
        action: 'update_logo',
        workspace_id: workspaceId,
        expected_logo_path: null,
        mime_type: 'image/png',
        image_base64: 'iVBORw0KGgo=',
      },
    })

    await expect(removeWorkspaceLogo(workspaceId, logoPath)).resolves.toEqual({
      id: workspaceId,
      logo_path: null,
      logo_updated_at: null,
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'manage-workspace-staff', {
      body: {
        action: 'remove_logo',
        workspace_id: workspaceId,
        expected_logo_path: logoPath,
      },
    })
  })

  it('updates only the explicitly addressed client-facing brand state', async () => {
    const updatedAt = '2026-07-22T01:00:00.000Z'
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        workspace: {
          id: workspaceId,
          client_brand_name: 'Northstar Advisory',
          client_brand_primary_color: '#16324F',
          client_brand_accent_color: '#E07A5F',
          client_brand_updated_at: updatedAt,
        },
      },
      error: null,
    })

    await expect(updateWorkspaceClientBranding(workspaceId, {
      client_brand_name: ' Northstar Advisory ',
      client_brand_primary_color: '#16324f',
      client_brand_accent_color: '#e07a5f',
      expected_brand_updated_at: invitedAt,
    })).resolves.toEqual({
      id: workspaceId,
      client_brand_name: 'Northstar Advisory',
      client_brand_primary_color: '#16324F',
      client_brand_accent_color: '#E07A5F',
      client_brand_updated_at: updatedAt,
      client_contact_email: null,
    })
    expect(invoke).toHaveBeenCalledWith('manage-workspace-staff', {
      body: {
        action: 'update_brand',
        workspace_id: workspaceId,
        expected_brand_updated_at: invitedAt,
        client_brand_name: 'Northstar Advisory',
        client_brand_primary_color: '#16324F',
        client_brand_accent_color: '#E07A5F',
      },
    })
  })

  it('updates only the explicitly addressed private workspace name', async () => {
    const updatedAt = '2026-07-22T01:02:00.000Z'
    invoke.mockResolvedValueOnce({
      data: {
        success: true,
        workspace: {
          id: workspaceId,
          name: 'Northstar Workspace',
          updated_at: updatedAt,
        },
      },
      error: null,
    })

    await expect(updateWorkspaceName(workspaceId, {
      name: ' Northstar Workspace ',
      expected_updated_at: invitedAt,
    })).resolves.toEqual({
      id: workspaceId,
      name: 'Northstar Workspace',
      updated_at: updatedAt,
    })
    expect(invoke).toHaveBeenCalledWith('manage-workspace-staff', {
      body: {
        action: 'update_workspace_name',
        workspace_id: workspaceId,
        expected_updated_at: invitedAt,
        workspace_name: 'Northstar Workspace',
      },
    })
  })

  it('rejects invalid logo files and cross-workspace logo paths before invoking the backend', async () => {
    const oversized = {
      type: 'image/png',
      size: 2 * 1024 * 1024 + 1,
      arrayBuffer: vi.fn(),
    } as unknown as File

    await expect(updateWorkspaceLogo(workspaceId, oversized, null)).rejects.toThrow('2 MB or smaller')
    await expect(removeWorkspaceLogo(
      workspaceId,
      `${otherWorkspaceId}/66666666-6666-4666-8666-666666666666.png`,
    )).rejects.toThrow('workspace branding response was invalid')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('fails closed on a mismatched workspace, invalid owner set, or contradictory capabilities', async () => {
    invoke
      .mockResolvedValueOnce({
        data: ownerView({
          workspace: {
            ...ownerView().workspace,
            id: otherWorkspaceId,
            name: 'Other',
          },
        }),
        error: null,
      })
      .mockResolvedValueOnce({ data: ownerView({ members: [admin] }), error: null })
      .mockResolvedValueOnce({
        data: ownerView({
          capabilities: {
            read_only: true,
            invite_roles: [],
            can_generate_password: false,
          can_manage_branding: false,
          can_manage_client_branding: false,
          can_manage_workspace_name: false,
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

  it('creates, retries, and resets a one-time workspace staff password through explicit actions', async () => {
    const passwordMember: WorkspaceStaffMember = {
      ...admin,
      email: 'staff@example.com',
      full_name: 'Agency Member',
      role: 'member',
      status: 'invited',
      setup_method: 'admin_temporary_password',
      accepted_at: null,
      invite_expires_at: '2026-07-29T00:00:00.000Z',
      allowed_actions: [],
    }
    const credential = {
      success: true,
      member: passwordMember,
      email: 'staff@example.com',
      temporary_password: temporaryPassword,
    }
    invoke
      .mockResolvedValueOnce({ data: credential, error: null })
      .mockResolvedValueOnce({ data: credential, error: null })
      .mockResolvedValueOnce({ data: credential, error: null })

    await expect(createWorkspaceStaffTemporaryPassword(workspaceId.toUpperCase(), {
      email: ' Staff@Example.COM ',
      full_name: ' Agency Member ',
      role: 'member',
    })).resolves.toEqual({
      member: passwordMember,
      email: 'staff@example.com',
      temporary_password: temporaryPassword,
    })
    expect(invoke).toHaveBeenNthCalledWith(1, 'manage-workspace-staff', {
      body: {
        action: 'create_password',
        workspace_id: workspaceId,
        email: 'staff@example.com',
        full_name: 'Agency Member',
        role: 'member',
      },
    })

    await expect(retryWorkspaceStaffTemporaryPassword(
      workspaceId,
      staffId.toUpperCase(),
    )).resolves.toEqual({
      member: passwordMember,
      email: 'staff@example.com',
      temporary_password: temporaryPassword,
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'manage-workspace-staff', {
      body: {
        action: 'retry_password',
        workspace_id: workspaceId,
        membership_id: staffId,
      },
    })

    await expect(resetWorkspaceStaffTemporaryPassword(
      workspaceId,
      staffId.toUpperCase(),
    )).resolves.toEqual({
      member: passwordMember,
      email: 'staff@example.com',
      temporary_password: temporaryPassword,
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'manage-workspace-staff', {
      body: {
        action: 'reset_password',
        workspace_id: workspaceId,
        membership_id: staffId,
      },
    })
  })

  it('rejects a malformed or mismatched temporary credential response', async () => {
    const passwordMember: WorkspaceStaffMember = {
      ...admin,
      status: 'invited',
      setup_method: 'admin_temporary_password',
      accepted_at: null,
      invite_expires_at: '2026-07-29T00:00:00.000Z',
      allowed_actions: [],
    }
    invoke
      .mockResolvedValueOnce({
        data: {
          success: true,
          member: passwordMember,
          email: 'different@example.com',
          temporary_password: temporaryPassword,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          member: passwordMember,
          email: passwordMember.email,
          temporary_password: 'weak-password',
        },
        error: null,
      })

    await expect(retryWorkspaceStaffTemporaryPassword(workspaceId, staffId)).rejects.toThrow(
      'workspace staff response was invalid',
    )
    await expect(retryWorkspaceStaffTemporaryPassword(workspaceId, staffId)).rejects.toThrow(
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
    await expect(retryWorkspaceStaffTemporaryPassword(workspaceId, 'not-a-membership')).rejects.toThrow(
      'Staff membership ID is invalid.',
    )
    await expect(resetWorkspaceStaffTemporaryPassword(workspaceId, 'not-a-membership')).rejects.toThrow(
      'Staff membership ID is invalid.',
    )
    await expect(mutateWorkspaceStaff(workspaceId, staffId, 'not-an-action' as never)).rejects.toThrow(
      'Staff action is invalid.',
    )
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('updateBillingPlanPrice', () => {
  beforeEach(() => invoke.mockReset())

  it('sends the backfill opt-in only when asked, with the reason and key, and returns the plans', async () => {
    const plans = [{ plan_key: 'standard', display_name: 'Standard', base_price_cents: 9900, monthly_credit_allowance: 300, stripe_price_id: 'price_x', is_purchasable: true }]
    invoke.mockResolvedValue({ data: { success: true, plans, backfilled_workspaces: 4 }, error: null })
    const actionKey = '77777777-7777-4777-8777-777777777777'

    await expect(updateBillingPlanPrice('standard', 9900, 300, {
      applyToExistingSubscribers: true, reason: 'contract_adjustment', note: 'Q4 pricing', actionKey,
    })).resolves.toEqual(plans)
    expect(invoke).toHaveBeenLastCalledWith('workspace-billing-portal', {
      body: {
        action: 'plans-update',
        plan_key: 'standard',
        base_price_cents: 9900,
        monthly_credit_allowance: 300,
        apply_to_existing_subscribers: true,
        reason: 'contract_adjustment',
        note: 'Q4 pricing',
        action_key: actionKey,
      },
    })

    await updateBillingPlanPrice('standard', 9900, 300, { reason: 'other', note: '', actionKey })
    expect(invoke).toHaveBeenLastCalledWith('workspace-billing-portal', {
      body: {
        action: 'plans-update', plan_key: 'standard', base_price_cents: 9900, monthly_credit_allowance: 300,
        reason: 'other', note: '', action_key: actionKey,
      },
    })
  })
})

describe('testWorkspaceAiKey', () => {
  beforeEach(() => invoke.mockReset())

  it('asks the server to test the saved key and returns its answer', async () => {
    invoke.mockResolvedValue({ data: { success: true, result: 'unreachable' }, error: null })
    await expect(testWorkspaceAiKey(workspaceId.toUpperCase(), 'anthropic')).resolves.toBe('unreachable')
    expect(invoke).toHaveBeenCalledWith('manage-workspace-staff', {
      body: { action: 'ai-keys-test', workspace_id: workspaceId, provider: 'anthropic' },
    })
  })

  it('refuses an answer it does not recognize', async () => {
    invoke.mockResolvedValue({ data: { success: true, result: 'maybe' }, error: null })
    await expect(testWorkspaceAiKey(workspaceId, 'openai')).rejects.toThrow('The API key could not be tested.')
  })
})

describe('platform credit changes', () => {
  beforeEach(() => invoke.mockReset())

  const key = '55555555-5555-4555-8555-555555555555'

  // The caller's key, so every attempt at one change is the same change.
  it('grants with the key the caller holds for the review', async () => {
    invoke.mockResolvedValue({ data: { success: true, granted: 25, balance: 225 }, error: null })
    await expect(grantWorkspaceCredits(workspaceId, { amount: 25, reason: 'customer_support', note: '', grantKey: key }))
      .resolves.toEqual({ granted: 25, balance: 225 })
    expect(invoke).toHaveBeenCalledWith('manage-workspace-staff', {
      body: {
        action: 'credits-grant',
        workspace_id: workspaceId,
        amount: 25,
        reason: 'customer_support',
        note: '',
        grant_key: key,
      },
    })
  })

  it('removes with a reason, a note and the review key', async () => {
    invoke.mockResolvedValue({ data: { success: true, removed: 10, balance: 190 }, error: null })
    await expect(adjustWorkspaceCredits(workspaceId, { amount: 10, reason: 'other', note: 'Duplicate', adjustmentKey: key }))
      .resolves.toEqual({ removed: 10, balance: 190 })
    expect(invoke).toHaveBeenCalledWith('manage-workspace-staff', {
      body: {
        action: 'credits-adjust',
        workspace_id: workspaceId,
        amount: 10,
        reason: 'other',
        note: 'Duplicate',
        adjustment_key: key,
      },
    })
  })

  it('sets an allowance with a reason and note', async () => {
    invoke.mockResolvedValue({ data: { success: true, monthly_credit_allowance: 150 }, error: null })
    await expect(setWorkspaceMonthlyAllowance(workspaceId, 150, { reason: 'contract_adjustment', note: '' })).resolves.toBe(150)
    expect(invoke).toHaveBeenCalledWith('manage-workspace-staff', {
      body: {
        action: 'billing-allowance-set',
        workspace_id: workspaceId,
        monthly_credit_allowance: 150,
        reason: 'contract_adjustment',
        note: '',
      },
    })
  })

  it('reads a page of the ledger by type', async () => {
    invoke.mockResolvedValue({
      data: { success: true, entries: [{ id: 'e1', amount: 5 }], total: 30, page: 1, page_size: 25 },
      error: null,
    })
    await expect(getWorkspaceCreditLedger(workspaceId, { type: 'grant', page: 1 })).resolves.toEqual({
      entries: [{ id: 'e1', amount: 5 }],
      total: 30,
      page: 1,
      pageSize: 25,
    })
    expect(invoke).toHaveBeenCalledWith('manage-workspace-staff', {
      body: { action: 'credits-ledger', workspace_id: workspaceId, type: 'grant', page: 1 },
    })
  })

  it('refuses a ledger response without entries', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null })
    await expect(getWorkspaceCreditLedger(workspaceId, { type: 'all', page: 0 }))
      .rejects.toThrow('The credit ledger could not be loaded.')
  })
})

describe('runSubscriptionAction', () => {
  beforeEach(() => invoke.mockReset())
  const key = '66666666-6666-4666-8666-666666666666'

  it('sends only the fields the operation uses', async () => {
    invoke.mockResolvedValue({ data: { success: true, operation: 'cancel', result: { cancel_at_period_end: true } }, error: null })
    await expect(runSubscriptionAction(workspaceId, { operation: 'cancel', reason: 'other', note: '', actionKey: key }))
      .resolves.toEqual({ operation: 'cancel', idempotent: false, result: { cancel_at_period_end: true } })
    expect(invoke).toHaveBeenCalledWith('manage-workspace-staff', {
      body: { action: 'subscription-admin', workspace_id: workspaceId, operation: 'cancel', reason: 'other', note: '', action_key: key },
    })
  })

  it('sends the plan and email choice for a checkout link', async () => {
    invoke.mockResolvedValue({ data: { success: true, idempotent: true, operation: 'checkout_link', result: { url: 'https://x' } }, error: null })
    const response = await runSubscriptionAction(workspaceId, {
      operation: 'checkout_link', reason: 'other', note: 'n', actionKey: key, planKey: 'standard', emailOwner: true,
    })
    expect(response.idempotent).toBe(true)
    expect(invoke).toHaveBeenCalledWith('manage-workspace-staff', {
      body: {
        action: 'subscription-admin', workspace_id: workspaceId, operation: 'checkout_link', reason: 'other', note: 'n',
        action_key: key, plan_key: 'standard', email_owner: true,
      },
    })
  })

  it('refuses a response without a result', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null })
    await expect(runSubscriptionAction(workspaceId, { operation: 'cancel', reason: 'other', note: '', actionKey: key }))
      .rejects.toThrow('The subscription could not be changed.')
  })
})
