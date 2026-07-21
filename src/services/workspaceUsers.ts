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
  provisioning_method: 'platform_bootstrap' | 'email_invite' | 'admin_temporary_password'
  password_change_required: boolean
  workspace_access_not_before_epoch: number
  suspended_at?: string | null
  auth_reconciliation_pending: boolean
  auth_reconciliation_review_after: string | null
  has_newer_membership: boolean
  invite_cleanup_blocked: boolean
  invite_reconciliation_pending: boolean
  invite_reconciliation_claim_kind: 'deliver' | 'revoke_cleanup' | null
  invite_reconciliation_review_after: string | null
  credential_reconciliation_pending: boolean
  credential_reconciliation_claim_kind:
    | 'temporary_password_rotation'
    | 'initial_password_change'
    | null
  credential_reconciliation_review_after: string | null
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

export interface ManualWorkspaceCredential {
  membership: {
    id: string
    workspace_id: string
    status: WorkspaceUserStatus
    provisioning_method: ManagedWorkspaceUser['provisioning_method']
    password_change_required: boolean
    invite_expires_at: string | null
  }
  workspace?: { id: string; name: string } | null
  email: string
  temporary_password: string
}

async function invokeManualAccount(body: Record<string, unknown>): Promise<ManualWorkspaceCredential> {
  const { data, error } = await supabase.functions.invoke<ManualWorkspaceCredential>(
    'provision-workspace-account',
    { body },
  )
  if (error) throw await toFunctionError(error, 'The manual workspace account request failed.')
  if (!data?.temporary_password || !data.email || !data.membership) {
    throw new Error('The temporary credential response was incomplete.')
  }
  return data
}

export const createManualWorkspaceAccount = (input: {
  request_id: string
  email: string
  full_name?: string
  workspace_name?: string
}) => invokeManualAccount({ action: 'create', ...input })

export const retryManualWorkspaceAccount = (membershipId: string, requestId: string) => (
  invokeManualAccount({ action: 'retry', membership_id: membershipId, request_id: requestId })
)

export const rotateManualWorkspacePassword = (membershipId: string, requestId: string) => (
  invokeManualAccount({ action: 'rotate', membership_id: membershipId, request_id: requestId })
)

export async function revokeManualWorkspaceAccount(
  membershipId: string,
  requestId: string,
): Promise<void> {
  const { error } = await supabase.functions.invoke('provision-workspace-account', {
    body: { action: 'revoke', membership_id: membershipId, request_id: requestId },
  })
  if (error) throw await toFunctionError(error, 'The manual workspace account could not be revoked.')
}

export async function changeInitialPassword(input: {
  membership_id: string
  attempt_id: string
  new_password: string
}): Promise<void> {
  const { error } = await supabase.functions.invoke('change-initial-password', { body: input })
  if (error) throw await toFunctionError(error, 'The initial password could not be changed.')
}
