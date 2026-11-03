import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export type PlatformTeamStatus = 'provisioning' | 'invited' | 'active' | 'suspended' | 'revoked'

/** Someone with a membership in the default (Get On A Pod) workspace. */
export interface PlatformTeamMember {
  id: string
  email: string
  full_name: string | null
  role: 'owner' | 'admin' | 'member'
  status: PlatformTeamStatus
  invited_at: string | null
  invite_expires_at: string | null
  accepted_at: string | null
  /** Has full platform access: every workspace, Manage workspaces, /admin. */
  platform_admin: boolean
  /** Invited from the platform team, so accepting grants platform access. */
  platform_invite: boolean
  /** An invite send or cancel is still in flight for this row. */
  delivery_pending: boolean
  /** That send or cancel did not finish; an operator has to look at it. */
  needs_review?: boolean
  is_self: boolean
}

export interface PlatformTeam {
  /** Only the platform owner may invite, promote or remove. */
  can_manage: boolean
  members: PlatformTeamMember[]
}

const invoke = async <T>(body: Record<string, unknown>, fallback: string): Promise<T> => {
  const { data, error } = await supabase.functions.invoke<T>('manage-platform-team', { body })
  if (error) throw await toFunctionError(error, fallback)
  return data as T
}

export const listPlatformTeam = async (): Promise<PlatformTeam> => {
  const data = await invoke<PlatformTeam>({ action: 'list' }, 'The platform team could not be loaded.')
  return {
    can_manage: data?.can_manage === true,
    members: Array.isArray(data?.members) ? data.members : [],
  }
}

export const invitePlatformAdmin = (input: { email: string; full_name?: string }) => (
  invoke<{ success: true; membership_id: string }>(
    { action: 'invite', email: input.email, ...(input.full_name ? { full_name: input.full_name } : {}) },
    'The invite could not be sent.',
  )
)

export type PlatformTeamAction = 'resend_invite' | 'cancel_invite' | 'grant_admin' | 'remove'

export interface PlatformTeamChange {
  success: true
  /** Remove only: false when access was removed but the old sign-in could not be deleted. */
  sign_in_deleted?: boolean
}

export const updatePlatformTeamMember = (action: PlatformTeamAction, membershipId: string) => (
  invoke<PlatformTeamChange>({ action, membership_id: membershipId }, 'The platform team could not be changed.')
)

/** Expired invites need a fresh link; the database sets a 24-hour expiry when one is sent. */
export const inviteExpired = (member: PlatformTeamMember, now = Date.now()): boolean => {
  if (member.status !== 'invited' || !member.invite_expires_at) return false
  const expiresAt = Date.parse(member.invite_expires_at)
  return Number.isFinite(expiresAt) && expiresAt <= now
}
