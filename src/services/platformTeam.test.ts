import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  inviteExpired,
  invitePlatformAdmin,
  listPlatformTeam,
  updatePlatformTeamMember,
  type PlatformTeamMember,
} from '@/services/platformTeam'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }))

const memberId = '44444444-4444-4444-8444-444444444444'

const member: PlatformTeamMember = {
  id: memberId,
  email: 'new@example.com',
  full_name: 'New Person',
  role: 'admin',
  status: 'invited',
  invited_at: '2026-11-03T10:00:00.000Z',
  invite_expires_at: '2026-11-04T10:00:00.000Z',
  accepted_at: null,
  platform_admin: false,
  platform_invite: true,
  delivery_pending: false,
  is_self: false,
}

describe('platformTeam service', () => {
  beforeEach(() => invoke.mockReset())

  it('lists the team and keeps the owner flag', async () => {
    invoke.mockResolvedValue({ data: { can_manage: true, members: [member] }, error: null })
    await expect(listPlatformTeam()).resolves.toEqual({ can_manage: true, members: [member] })
    expect(invoke).toHaveBeenCalledWith('manage-platform-team', { body: { action: 'list' } })
  })

  it('reads a malformed list as read-only and empty', async () => {
    invoke.mockResolvedValue({ data: { can_manage: 'yes' }, error: null })
    await expect(listPlatformTeam()).resolves.toEqual({ can_manage: false, members: [] })
  })

  it('sends an invite with the name only when one was given', async () => {
    invoke.mockResolvedValue({ data: { success: true, membership_id: memberId }, error: null })
    await invitePlatformAdmin({ email: 'new@example.com' })
    expect(invoke).toHaveBeenLastCalledWith('manage-platform-team', {
      body: { action: 'invite', email: 'new@example.com' },
    })
    await invitePlatformAdmin({ email: 'new@example.com', full_name: 'New Person' })
    expect(invoke).toHaveBeenLastCalledWith('manage-platform-team', {
      body: { action: 'invite', email: 'new@example.com', full_name: 'New Person' },
    })
  })

  it.each(['resend_invite', 'cancel_invite', 'grant_admin', 'remove'] as const)('sends %s for one membership', async (action) => {
    invoke.mockResolvedValue({ data: { success: true }, error: null })
    await updatePlatformTeamMember(action, memberId)
    expect(invoke).toHaveBeenCalledWith('manage-platform-team', { body: { action, membership_id: memberId } })
  })

  it('surfaces the function error message', async () => {
    const context = new Response(JSON.stringify({ error: 'Only the platform owner can change the platform team', code: 'PLATFORM_OWNER_REQUIRED' }), { status: 403 })
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context }) })
    await expect(updatePlatformTeamMember('remove', memberId)).rejects.toThrow('Only the platform owner can change the platform team')
  })

  it('knows when an invite link has expired', () => {
    expect(inviteExpired(member, Date.parse('2026-11-03T12:00:00.000Z'))).toBe(false)
    expect(inviteExpired(member, Date.parse('2026-11-04T10:00:00.000Z'))).toBe(true)
    expect(inviteExpired({ ...member, status: 'active' }, Date.parse('2026-12-01T00:00:00.000Z'))).toBe(false)
  })
})
