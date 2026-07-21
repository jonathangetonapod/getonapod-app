import { supabase } from '@/lib/supabase'
import { toFunctionError } from '@/lib/functionErrors'

export type WorkspaceUserStatus = 'provisioning' | 'invited' | 'active' | 'suspended' | 'revoked'
export type WorkspaceUserRole = 'owner' | 'admin' | 'member'

export interface ManagedWorkspaceUser {
  id: string
  workspace_id: string
  user_id: string | null
  email: string
  full_name: string | null
  role: WorkspaceUserRole
  status: WorkspaceUserStatus
  invited_at: string | null
  invite_expires_at: string | null
  accepted_at: string | null
  suspended_at?: string | null
  auth_reconciliation_pending: boolean
  auth_reconciliation_review_after: string | null
  has_newer_membership: boolean
  invite_cleanup_blocked: boolean
  invite_reconciliation_pending: boolean
  invite_reconciliation_claim_kind: 'deliver' | 'revoke_cleanup' | null
  invite_reconciliation_review_after: string | null
  workspace?: { id: string; name: string } | null
}

interface ManageWorkspaceUsersResponse {
  users?: ManagedWorkspaceUser[]
  memberships?: ManagedWorkspaceUser[]
  user?: ManagedWorkspaceUser
  membership?: ManagedWorkspaceUser
}

const invoke = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke<ManageWorkspaceUsersResponse>('manage-workspace-users', { body })
  if (error) throw await toFunctionError(error, 'The workspace account request failed.')
  return data || {}
}

export const listWorkspaceUsers = async () => {
  const data = await invoke({ action: 'list' })
  return data.users || data.memberships || []
}

export const inviteWorkspaceUser = async (input: {
  email: string
  full_name?: string
  workspace_name?: string
}) => invoke({ action: 'invite', ...input })

export const updateWorkspaceUserStatus = async (
  action:
    | 'suspend'
    | 'reactivate'
    | 'reconcile_active'
    | 'reconcile_suspended'
    | 'revoke_pending'
    | 'retry_invite',
  membershipId: string,
) => invoke({ action, membership_id: membershipId })
