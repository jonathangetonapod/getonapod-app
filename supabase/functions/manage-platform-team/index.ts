import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  inviteRedirectUrl,
  jsonResponse,
  optionsResponse,
  optionalString,
  parseJsonObject,
  requireEmail,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireUuid,
  writeAudit,
} from '../_shared/workspaceAuth.ts'

// The platform team: the people with an active membership in the default
// workspace, and which of them are platform administrators. Any platform
// administrator may read it; only the default workspace's owner may change it,
// and the database enforces that on every mutation
// (supabase/migrations/20261103000100_platform_team.sql).
//
// Invitations reuse the owner-invite delivery protocol from
// manage-workspace-users: a durable delivery claim, a provider invite, an
// identity check, and finalization, with Auth cleanup whenever the outcome is
// uncertain. Platform access itself is granted when the invite is accepted.

const METHODS = ['POST'] as const

type Admin = Parameters<typeof writeAudit>[0]

type MembershipRow = {
  id: string
  workspace_id: string
  user_id: string | null
  email_normalized: string
  full_name: string | null
  role: string
  status: string
  created_at: string
}

type WorkspaceRow = {
  id: string
  name: string
}

interface TeamMember {
  id: string
  email: string
  full_name: string | null
  role: 'owner' | 'admin' | 'member'
  status: 'provisioning' | 'invited' | 'active' | 'suspended' | 'revoked'
  invited_at: string | null
  invite_expires_at: string | null
  accepted_at: string | null
  platform_admin: boolean
  platform_invite: boolean
  delivery_pending: boolean
  is_self: boolean
}

function membershipFromRpc(data: unknown): MembershipRow | null {
  const value = Array.isArray(data) ? data[0] : data
  return value && typeof value === 'object' ? value as MembershipRow : null
}

function provisioningFromRpc(data: unknown): { membership: MembershipRow; workspace: WorkspaceRow } | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const value = data as { membership?: unknown; workspace?: unknown }
  if (!value.membership || typeof value.membership !== 'object') return null
  if (!value.workspace || typeof value.workspace !== 'object') return null
  return {
    membership: value.membership as MembershipRow,
    workspace: value.workspace as WorkspaceRow,
  }
}

// Database refusals come back as messages. Map the ones the owner can act on;
// anything else is an opaque failure with the given fallback.
function teamRpcError(message: string, fallback: HttpError): HttpError {
  const text = message.toLowerCase()
  if (text.includes('only the platform owner')) {
    return new HttpError(403, 'PLATFORM_OWNER_REQUIRED', 'Only the platform owner can change the platform team')
  }
  if (text.includes('token is stale') || text.includes('platform administrator access is required')) {
    return new HttpError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required. Sign in again and retry')
  }
  if (text.includes('already a platform administrator')) {
    return new HttpError(409, 'ALREADY_PLATFORM_ADMIN', 'This person is already a platform admin')
  }
  if (text.includes('account already exists')) {
    return new HttpError(
      409,
      'ACCOUNT_ALREADY_EXISTS',
      'This email already belongs to a workspace. One email can only be in one workspace at a time',
    )
  }
  if (text.includes('invalid platform admin invitation')) {
    return new HttpError(400, 'INVALID_INVITE', 'Enter a valid email address and a name under 120 characters')
  }
  if (text.includes('cannot remove yourself')) {
    return new HttpError(409, 'CANNOT_REMOVE_SELF', 'You cannot remove yourself from the platform team')
  }
  if (text.includes('owner cannot be removed')) {
    return new HttpError(409, 'CANNOT_REMOVE_OWNER', 'The platform owner cannot be removed')
  }
  if (text.includes('cancel a pending invitation instead')) {
    return new HttpError(409, 'MEMBER_NOT_ACTIVE', 'This person has not joined yet. Cancel their invite instead')
  }
  if (text.includes('only an active team member')) {
    return new HttpError(409, 'MEMBER_NOT_ACTIVE', 'Only someone who has joined can be made a platform admin')
  }
  if (text.includes('identity mismatch')) {
    return new HttpError(409, 'ACCOUNT_IDENTITY_MISMATCH', 'This account needs manual review before it can be changed')
  }
  if (text.includes('not found')) {
    return new HttpError(404, 'MEMBER_NOT_FOUND', 'That person is no longer on the platform team')
  }
  if (text.includes('not pending')) {
    return new HttpError(409, 'INVITE_NOT_PENDING', 'This invite is no longer pending')
  }
  if (text.includes('delivery is busy')) {
    return new HttpError(409, 'INVITE_DELIVERY_BUSY', 'This invite is being sent right now. Wait a moment and retry')
  }
  if (text.includes('superseded')) {
    return new HttpError(409, 'INVITE_SUPERSEDED', 'A newer invite exists for this email')
  }
  if (text.includes('cannot be changed here')) {
    return new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'This person is already a platform admin. Remove them instead')
  }
  return fallback
}

async function claimInviteDelivery(
  admin: Admin,
  membershipId: string,
  actorUserId: string,
  lockToken: string,
): Promise<MembershipRow> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('claim_workspace_invite_delivery', {
      p_membership_id: membershipId,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
    })
    const membership = membershipFromRpc(data)
    if (!error && membership) return membership

    const message = error?.message.toLowerCase() ?? ''
    if (message.includes('delivery is busy')) {
      throw new HttpError(409, 'INVITE_DELIVERY_BUSY', 'This invite is being sent right now. Wait a moment and retry')
    }
    if (message.includes('not provisioning')) {
      throw new HttpError(409, 'INVITE_NOT_PROVISIONING', 'This invite cannot be sent again')
    }
    if (message.includes('not found')) {
      throw new HttpError(404, 'MEMBER_NOT_FOUND', 'That invite no longer exists')
    }
    if (message.includes('platform administrator')) {
      throw new HttpError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator access is required')
    }
    if (message.includes('invalid') || message.includes('reused inconsistently')) {
      throw new HttpError(400, 'INVALID_INVITE_DELIVERY', 'The invite delivery request is invalid')
    }
    // Retry once with the same token: a committed claim whose response was
    // lost comes back unchanged.
  }
  throw new HttpError(503, 'INVITE_DELIVERY_CLAIM_UNCERTAIN', 'The invite could not be sent. Try again in a minute')
}

async function releaseInviteDeliveryClaim(admin: Admin, membershipId: string, lockToken: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('release_workspace_invite_delivery_claim', {
      p_membership_id: membershipId,
      p_lock_token: lockToken,
    })
    if (!error && data === true) return
    if (!error && data === false) {
      throw new HttpError(409, 'INVITE_DELIVERY_CLAIM_LOST', 'The invite needs operator review before it can be retried')
    }
    if (error?.message.toLowerCase().includes('superseded')) {
      throw new HttpError(409, 'INVITE_SUPERSEDED', 'A newer invite exists for this email')
    }
  }
  throw new HttpError(503, 'INVITE_DELIVERY_RELEASE_FAILED', 'The invite cleanup did not finish. Try again in a minute')
}

async function findInviteAuthUserId(
  admin: Admin,
  membershipId: string,
  actorUserId: string,
  lockToken: string,
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('find_workspace_invite_auth_user', {
      p_membership_id: membershipId,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
    })
    if (!error) return typeof data === 'string' && data.length > 0 ? data : null

    const message = error.message.toLowerCase()
    if (message.includes('ambiguous') || message.includes('unsafe') || message.includes('platform administrator')) {
      throw new HttpError(409, 'INVITE_IDENTITY_UNSAFE', 'The invite needs operator review before it can be changed')
    }
    if (message.includes('delivery is busy') || message.includes('claim is required')) {
      throw new HttpError(409, 'INVITE_DELIVERY_CLAIM_LOST', 'The invite needs operator review before it can be changed')
    }
    if (message.includes('not found')) {
      throw new HttpError(404, 'MEMBER_NOT_FOUND', 'That invite no longer exists')
    }
    if (message.includes('superseded')) {
      throw new HttpError(409, 'INVITE_SUPERSEDED', 'A newer invite exists for this email')
    }
  }
  throw new HttpError(503, 'INVITE_RECONCILIATION_FAILED', 'The invite could not be checked. Try again in a minute')
}

async function finalizeInvite(
  admin: Admin,
  membershipId: string,
  actorUserId: string,
  lockToken: string,
  authUserId: string,
): Promise<MembershipRow | null> {
  let notReadyResponses = 0
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('finalize_workspace_invite', {
      p_membership_id: membershipId,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
      p_auth_user_id: authUserId,
    })
    const membership = membershipFromRpc(data)
    if (!error && membership) return membership

    const message = error?.message.toLowerCase() ?? ''
    if (message.includes('auth identity is not ready')) {
      notReadyResponses += 1
      continue
    }
    if (message.includes('not found')) {
      throw new HttpError(404, 'MEMBER_NOT_FOUND', 'That invite no longer exists')
    }
    if (message.includes('not provisioning')) {
      throw new HttpError(409, 'INVITE_NOT_PROVISIONING', 'This invite cannot be sent again')
    }
    if (message.includes('unsafe') || message.includes('platform administrator')) {
      throw new HttpError(409, 'INVITE_IDENTITY_UNSAFE', 'The invite needs operator review before it can be changed')
    }
    if (message.includes('claim is required') || message.includes('delivery is busy') || message.includes('claim was lost')) {
      throw new HttpError(409, 'INVITE_DELIVERY_CLAIM_LOST', 'The invite needs operator review before it can be retried')
    }
  }
  if (notReadyResponses === 2) return null
  throw new HttpError(503, 'INVITE_FINALIZE_UNCERTAIN', 'The invite result is uncertain. Refresh before retrying')
}

async function deleteAuthUserIfPresent(
  admin: Admin,
  userId: string,
  expectedEmail: string,
  code: string,
  message: string,
): Promise<void> {
  const { data, error: lookupError } = await admin.auth.admin.getUserById(userId)
  if (lookupError) {
    const missing = lookupError.status === 404 || lookupError.message.toLowerCase().includes('not found')
    if (missing) return
    throw new HttpError(503, code, message)
  }
  if (!data.user) return
  if (data.user.email?.trim().toLowerCase() !== expectedEmail) {
    throw new HttpError(409, code, message)
  }

  // Never delete an Auth user who is already a platform administrator.
  const { data: protectedAdmin, error: protectedAdminError } = await admin.rpc(
    'is_platform_admin_email',
    { p_email: data.user.email },
  )
  if (protectedAdminError) throw new HttpError(503, code, message)
  if (protectedAdmin === true) {
    throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'This person is already a platform admin. Remove them instead')
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError) {
    const missing = deleteError.status === 404 || deleteError.message.toLowerCase().includes('not found')
    if (missing) return
    throw new HttpError(503, code, message)
  }
}

function requireSafeInvitedIdentity(
  user: {
    email?: string
    created_at?: string
    invited_at?: string
    confirmed_at?: string
    last_sign_in_at?: string
    user_metadata?: Record<string, unknown>
  },
  membership: MembershipRow,
): void {
  const email = user.email?.trim().toLowerCase()
  const createdAt = Date.parse(user.created_at ?? '')
  const invitedAt = Date.parse(user.invited_at ?? '')
  const membershipCreatedAt = Date.parse(membership.created_at)
  const metadata = user.user_metadata ?? {}

  if (
    email !== membership.email_normalized
    || !Number.isFinite(createdAt)
    || !Number.isFinite(invitedAt)
    || !Number.isFinite(membershipCreatedAt)
    || createdAt < membershipCreatedAt - 60_000
    || invitedAt < membershipCreatedAt - 60_000
    || Boolean(user.confirmed_at)
    || Boolean(user.last_sign_in_at)
    || metadata.workspace_id !== membership.workspace_id
    || metadata.workspace_membership_id !== membership.id
  ) {
    throw new HttpError(409, 'INVITE_IDENTITY_UNSAFE', 'The invite needs operator review before it can be changed')
  }
}

// Sends the invitation email for a provisioning membership. Any uncertain
// provider outcome invalidates the possibly-sent link before reporting.
async function deliverInvite(
  admin: Admin,
  membership: MembershipRow,
  workspace: WorkspaceRow,
  actorUserId: string,
): Promise<MembershipRow> {
  const redirectTo = inviteRedirectUrl()
  const lockToken = crypto.randomUUID()

  const claimed = await claimInviteDelivery(admin, membership.id, actorUserId, lockToken)
  if (claimed.workspace_id !== workspace.id) {
    await releaseInviteDeliveryClaim(admin, claimed.id, lockToken)
    throw new HttpError(409, 'INVITE_WORKSPACE_MISMATCH', 'The invite needs operator review before it can be sent')
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    claimed.email_normalized,
    {
      redirectTo,
      data: {
        full_name: claimed.full_name,
        workspace_id: claimed.workspace_id,
        workspace_membership_id: claimed.id,
        workspace_name: workspace.name,
      },
    },
  )

  if (inviteError || !invited.user) {
    const authUserId = await findInviteAuthUserId(admin, claimed.id, actorUserId, lockToken)
    if (authUserId) {
      await deleteAuthUserIfPresent(
        admin,
        authUserId,
        claimed.email_normalized,
        'INVITE_AMBIGUOUS_CLEANUP_FAILED',
        'The invite may not have sent, and its cleanup did not finish. Try again in a minute',
      )
      await releaseInviteDeliveryClaim(admin, claimed.id, lockToken)
      throw new HttpError(503, 'INVITE_DELIVERY_RETRY_REQUIRED', 'The invite did not send. Use Resend invite to try again')
    }
    if (inviteError?.message.toLowerCase().includes('registered')) {
      await releaseInviteDeliveryClaim(admin, claimed.id, lockToken)
      throw new HttpError(
        409,
        'AUTH_ACCOUNT_EXISTS',
        'This email already has a sign-in from an earlier account. Cancel this invite and ask for the old account to be cleaned up first',
      )
    }
    throw new HttpError(503, 'INVITE_DELIVERY_UNCERTAIN', 'The invite result is uncertain. Refresh before retrying')
  }

  requireSafeInvitedIdentity(invited.user, claimed)

  // Only the service role can write app_metadata; finalization trusts this
  // marker rather than the user-editable metadata above.
  const { error: markerError } = await admin.auth.admin.updateUserById(invited.user.id, {
    app_metadata: {
      ...invited.user.app_metadata,
      workspace_id: claimed.workspace_id,
      workspace_membership_id: claimed.id,
    },
  })

  let finalized: MembershipRow | null
  let finalizationError: HttpError | null = null
  try {
    finalized = await finalizeInvite(admin, claimed.id, actorUserId, lockToken, invited.user.id)
  } catch (error) {
    if (!(error instanceof HttpError)) throw error
    if (
      error.code === 'INVITE_FINALIZE_UNCERTAIN'
      || error.code === 'INVITE_DELIVERY_CLAIM_LOST'
      || error.code === 'INVITE_IDENTITY_UNSAFE'
    ) {
      throw error
    }
    finalizationError = error
    finalized = null
  }
  if (finalized) return finalized

  await deleteAuthUserIfPresent(
    admin,
    invited.user.id,
    claimed.email_normalized,
    'INVITE_FINALIZE_CLEANUP_FAILED',
    'The invite was blocked, but its cleanup did not finish. Try again in a minute',
  )
  await releaseInviteDeliveryClaim(admin, claimed.id, lockToken)

  if (finalizationError?.code === 'INVITE_NOT_PROVISIONING') {
    throw new HttpError(409, 'INVITE_REVOKED_DURING_DELIVERY', 'The invite was cancelled while it was being sent')
  }
  if (finalizationError) throw finalizationError
  throw new HttpError(
    503,
    markerError ? 'INVITE_MARKER_FAILED' : 'INVITE_FINALIZE_FAILED',
    'The invite did not send. Use Resend invite to try again',
  )
}

// Cancels a pending invite and deletes the Auth user it created, so a link
// already in someone's inbox stops working.
async function cancelInvite(
  admin: Admin,
  membershipId: string,
  actorUserId: string,
  tokenIssuedAt: number,
): Promise<MembershipRow> {
  const lockToken = crypto.randomUUID()
  let revoked: MembershipRow | null = null
  for (let attempt = 0; attempt < 2 && !revoked; attempt += 1) {
    const { data, error } = await admin.rpc('revoke_platform_admin_invite_v1', {
      p_membership_id: membershipId,
      p_actor_user_id: actorUserId,
      p_token_issued_at: tokenIssuedAt,
      p_lock_token: lockToken,
    })
    revoked = membershipFromRpc(data)
    if (!revoked && error) {
      const mapped = teamRpcError(error.message, new HttpError(503, 'INVITE_REVOCATION_UNCERTAIN', ''))
      if (mapped.code !== 'INVITE_REVOCATION_UNCERTAIN') throw mapped
      // Retry once with the same token: a committed revocation whose response
      // was lost returns the same cleanup claim.
    }
  }
  if (!revoked) {
    throw new HttpError(503, 'INVITE_REVOCATION_UNCERTAIN', 'The invite may not be cancelled. Refresh before retrying')
  }

  const authUserId = await findInviteAuthUserId(admin, revoked.id, actorUserId, lockToken)
  if (authUserId) {
    await deleteAuthUserIfPresent(
      admin,
      authUserId,
      revoked.email_normalized,
      'AUTH_REVOKE_FAILED',
      'The invite is cancelled, but its sign-in cleanup did not finish. Try again in a minute',
    )
  }
  await releaseInviteDeliveryClaim(admin, revoked.id, lockToken)
  return revoked
}

async function beginInvite(
  admin: Admin,
  email: string,
  fullName: string | null,
  actorUserId: string,
  tokenIssuedAt: number,
): Promise<{ membership: MembershipRow; workspace: WorkspaceRow }> {
  const { data, error } = await admin.rpc('begin_platform_admin_invite_v1', {
    p_email: email,
    p_full_name: fullName,
    p_actor_user_id: actorUserId,
    p_token_issued_at: tokenIssuedAt,
  })
  if (error) {
    throw teamRpcError(error.message, new HttpError(500, 'INVITE_PROVISION_FAILED', 'The invite could not be created'))
  }
  const provisioning = provisioningFromRpc(data)
  if (!provisioning) throw new HttpError(500, 'INVITE_PROVISION_FAILED', 'The invite could not be created')
  return provisioning
}

async function loadTeam(admin: Admin, actorUserId: string, tokenIssuedAt: number) {
  const { data, error } = await admin.rpc('platform_team_list_v1', {
    p_actor_user_id: actorUserId,
    p_token_issued_at: tokenIssuedAt,
  })
  if (error) {
    throw teamRpcError(error.message, new HttpError(500, 'TEAM_LIST_FAILED', 'The platform team could not be loaded'))
  }
  const value = data as { can_manage?: unknown; members?: unknown } | null
  if (!value || typeof value.can_manage !== 'boolean' || !Array.isArray(value.members)) {
    throw new HttpError(500, 'TEAM_LIST_FAILED', 'The platform team could not be loaded')
  }
  return { can_manage: value.can_manage, members: value.members as TeamMember[] }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const { admin, user, tokenIssuedAt } = await requirePlatformAdmin(req)

    if (action === 'list') {
      requireOnlyKeys(body, ['action'])
      return jsonResponse(req, METHODS, 200, await loadTeam(admin, user.id, tokenIssuedAt))
    }

    if (action === 'invite') {
      requireOnlyKeys(body, ['action', 'email', 'full_name'])
      const email = requireEmail(body.email)
      const fullName = optionalString(body.full_name, 'full_name', 120)
      const provisioning = await beginInvite(admin, email, fullName, user.id, tokenIssuedAt)
      await deliverInvite(admin, provisioning.membership, provisioning.workspace, user.id)
      return jsonResponse(req, METHODS, 201, { success: true, membership_id: provisioning.membership.id })
    }

    if (action === 'resend_invite') {
      requireOnlyKeys(body, ['action', 'membership_id'])
      const membershipId = requireUuid(body.membership_id, 'membership_id')
      const { data, error } = await admin.rpc('platform_admin_invite_for_resend_v1', {
        p_membership_id: membershipId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) {
        throw teamRpcError(error.message, new HttpError(500, 'INVITE_LOOKUP_FAILED', 'The invite could not be loaded'))
      }
      const pending = provisioningFromRpc(data)
      if (!pending) throw new HttpError(500, 'INVITE_LOOKUP_FAILED', 'The invite could not be loaded')

      // Never sent (or the send failed): send it now.
      if (pending.membership.status === 'provisioning') {
        await deliverInvite(admin, pending.membership, pending.workspace, user.id)
        return jsonResponse(req, METHODS, 200, { success: true, membership_id: pending.membership.id })
      }

      // Sent before: the old link is cancelled and a fresh one goes out, so
      // an expired invite is fixed with one click.
      const cancelled = await cancelInvite(admin, pending.membership.id, user.id, tokenIssuedAt)
      const fresh = await beginInvite(admin, cancelled.email_normalized, cancelled.full_name, user.id, tokenIssuedAt)
      await deliverInvite(admin, fresh.membership, fresh.workspace, user.id)
      return jsonResponse(req, METHODS, 200, { success: true, membership_id: fresh.membership.id })
    }

    if (action === 'cancel_invite') {
      requireOnlyKeys(body, ['action', 'membership_id'])
      const membershipId = requireUuid(body.membership_id, 'membership_id')
      await cancelInvite(admin, membershipId, user.id, tokenIssuedAt)
      return jsonResponse(req, METHODS, 200, { success: true })
    }

    if (action === 'grant_admin' || action === 'remove') {
      requireOnlyKeys(body, ['action', 'membership_id'])
      const membershipId = requireUuid(body.membership_id, 'membership_id')
      const rpc = action === 'grant_admin' ? 'grant_platform_admin_v1' : 'remove_platform_team_member_v1'
      const { error } = await admin.rpc(rpc, {
        p_membership_id: membershipId,
        p_actor_user_id: user.id,
        p_token_issued_at: tokenIssuedAt,
      })
      if (error) {
        throw teamRpcError(error.message, new HttpError(500, 'TEAM_CHANGE_FAILED', 'The platform team could not be changed'))
      }
      return jsonResponse(req, METHODS, 200, { success: true })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown platform team action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
