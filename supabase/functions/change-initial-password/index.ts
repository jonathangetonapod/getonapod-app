import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  MEMBERSHIP_COLUMNS,
  normalizeEmail,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireUuid,
  workspaceCredentialIsFresh,
} from '../_shared/workspaceAuth.ts'
import {
  credentialVersion,
  requirePermanentPassword,
} from '../_shared/workspaceCredentials.ts'

const METHODS = ['POST'] as const

type MembershipRow = Record<string, unknown> & {
  id: string
  workspace_id: string
  user_id: string | null
  email_normalized: string
  status: string
  provisioning_method: string
  password_change_required: boolean
  invite_expires_at: string | null
  workspace_access_not_before_epoch: number | string
  workspace?: { id: string; status: string; is_default: boolean } | null
}

type CredentialClaim = {
  membership: MembershipRow
  attemptId: string
  executionId: string
}

function membershipFromRpc(data: unknown): MembershipRow | null {
  const value = Array.isArray(data) ? data[0] : data
  return value && typeof value === 'object' ? value as MembershipRow : null
}

function credentialClaimFromRpc(data: unknown): CredentialClaim | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const value = data as {
    membership?: unknown
    attempt_id?: unknown
    execution_id?: unknown
  }
  if (!value.membership || typeof value.membership !== 'object' || Array.isArray(value.membership)) {
    return null
  }
  const attemptId = metadataUuid(value.attempt_id)
  const executionId = metadataUuid(value.execution_id)
  if (!attemptId || !executionId) return null
  return {
    membership: value.membership as MembershipRow,
    attemptId,
    executionId,
  }
}

function metadataUuid(value: unknown): string | null {
  return typeof value === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null
}

function manualIdentityMatches(
  authUser: { email?: string; app_metadata?: Record<string, unknown> },
  membership: MembershipRow,
): boolean {
  const metadata = authUser.app_metadata ?? {}
  return normalizeEmail(authUser.email ?? '') === membership.email_normalized
    && metadata.workspace_id === membership.workspace_id
    && metadata.workspace_membership_id === membership.id
    && metadata.workspace_provisioning_method === 'admin_temporary_password'
}

function exactCredentialMarker(
  metadata: Record<string, unknown>,
  attemptId: string,
  executionId: string,
): boolean {
  return metadataUuid(metadata.workspace_credential_attempt_id) === attemptId
    && metadataUuid(metadata.workspace_credential_execution_id) === executionId
}

function tokenMatchesCurrentCredential(
  authContext: Awaited<ReturnType<typeof requireAuthenticatedUser>>,
  currentMetadata: Record<string, unknown>,
  membership: MembershipRow,
): boolean {
  const token = authContext.tokenAppMetadata
  return token.workspace_id === membership.workspace_id
    && token.workspace_membership_id === membership.id
    && token.workspace_provisioning_method === 'admin_temporary_password'
    && token.workspace_password_change_required === currentMetadata.workspace_password_change_required
    && token.workspace_credential_version === currentMetadata.workspace_credential_version
    && metadataUuid(token.workspace_credential_attempt_id)
      === metadataUuid(currentMetadata.workspace_credential_attempt_id)
    && metadataUuid(token.workspace_credential_execution_id)
      === metadataUuid(currentMetadata.workspace_credential_execution_id)
    && metadataUuid(token.workspace_credential_attempt_id) !== null
    && metadataUuid(token.workspace_credential_execution_id) !== null
}

async function releaseCredentialClaim(
  admin: Awaited<ReturnType<typeof requireAuthenticatedUser>>['admin'],
  membershipId: string,
  actorUserId: string,
  attemptId: string,
  executionId: string,
): Promise<void> {
  const { data, error } = await admin.rpc('release_workspace_account_credential_claim', {
    p_membership_id: membershipId,
    p_actor_user_id: actorUserId,
    p_attempt_id: attemptId,
    p_execution_id: executionId,
  })
  if (error || data !== true) {
    throw new HttpError(503, 'PASSWORD_CHANGE_RECONCILIATION_REQUIRED', 'The password change requires administrator review')
  }
}

async function failBeforeProviderChange(
  admin: Awaited<ReturnType<typeof requireAuthenticatedUser>>['admin'],
  claim: CredentialClaim,
  actorUserId: string,
  error: HttpError,
): Promise<never> {
  await releaseCredentialClaim(
    admin,
    claim.membership.id,
    actorUserId,
    claim.attemptId,
    claim.executionId,
  )
  throw error
}

async function completeInitialPasswordChange(
  admin: Awaited<ReturnType<typeof requireAuthenticatedUser>>['admin'],
  input: {
    membershipId: string
    userId: string
    email: string
    attemptId: string
    executionId: string
    credentialVersion: number
    tokenIssuedAt: number
  },
): Promise<void> {
  const { data, error } = await admin.rpc('complete_workspace_initial_password_change', {
    p_membership_id: input.membershipId,
    p_user_id: input.userId,
    p_email: input.email,
    p_attempt_id: input.attemptId,
    p_execution_id: input.executionId,
    p_credential_version: input.credentialVersion,
    p_token_issued_at: input.tokenIssuedAt,
  })
  if (error || !membershipFromRpc(data)) {
    throw new HttpError(503, 'PASSWORD_CHANGE_RECONCILIATION_REQUIRED', 'The password changed, but workspace activation requires review')
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    requireOnlyKeys(body, ['membership_id', 'attempt_id', 'new_password'])
    const membershipId = requireUuid(body.membership_id, 'membership_id')
    requireUuid(body.attempt_id, 'attempt_id')
    const newPassword = requirePermanentPassword(body.new_password)
    const authContext = await requireAuthenticatedUser(req)
    const { admin, user, email } = authContext

    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest temporary password')
    }

    const { data, error } = await admin
      .from('workspace_memberships')
      .select(`${MEMBERSHIP_COLUMNS}, workspace:workspaces(id,status,is_default)`)
      .eq('id', membershipId)
      .maybeSingle()

    if (error) throw new HttpError(500, 'ACCOUNT_LOOKUP_FAILED', 'The workspace account could not be loaded')
    if (!data) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace account not found')
    const membership = data as unknown as MembershipRow
    const expiresAt = membership.invite_expires_at
      ? Date.parse(membership.invite_expires_at)
      : Number.NaN

    if (
      membership.user_id !== user.id
      || membership.email_normalized !== email
      || membership.provisioning_method !== 'admin_temporary_password'
      || membership.status !== 'invited'
      || !membership.password_change_required
      || !membership.workspace
      || membership.workspace.is_default
      || membership.workspace.status !== 'active'
    ) {
      throw new HttpError(403, 'PASSWORD_CHANGE_NOT_ALLOWED', 'This account cannot complete temporary password setup')
    }
    const accessNotBefore = Number(membership.workspace_access_not_before_epoch)
    if (
      !Number.isSafeInteger(accessNotBefore)
      || accessNotBefore < 0
      || authContext.tokenIssuedAt < accessNotBefore
    ) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest temporary password')
    }
    if (!Number.isFinite(expiresAt)) {
      throw new HttpError(410, 'TEMPORARY_PASSWORD_EXPIRED', 'The temporary password has expired')
    }

    const currentMetadata = user.app_metadata ?? {}
    if (
      currentMetadata.workspace_id !== membership.workspace_id
      || currentMetadata.workspace_membership_id !== membership.id
      || currentMetadata.workspace_provisioning_method !== 'admin_temporary_password'
    ) {
      throw new HttpError(409, 'ACCOUNT_IDENTITY_UNSAFE', 'The account identity requires administrator review')
    }

    const expectedVersion = credentialVersion(authContext.tokenAppMetadata.workspace_credential_version)
    const expectedAttemptId = metadataUuid(authContext.tokenAppMetadata.workspace_credential_attempt_id)
    const expectedExecutionId = metadataUuid(authContext.tokenAppMetadata.workspace_credential_execution_id)
    if (!expectedAttemptId || !expectedExecutionId) {
      throw new HttpError(409, 'CREDENTIAL_STATE_INVALID', 'The account credential state requires review')
    }

    const providerAttemptId = crypto.randomUUID()
    let executionId = crypto.randomUUID()
    let { data: claimData, error: claimError } = await admin.rpc(
      'claim_workspace_account_credential',
      {
        p_membership_id: membership.id,
        p_claim_kind: 'initial_password_change',
        p_actor_user_id: user.id,
        p_attempt_id: providerAttemptId,
        p_execution_id: executionId,
        p_token_issued_at: authContext.tokenIssuedAt,
        p_expected_credential_version: expectedVersion,
        p_expected_credential_attempt_id: expectedAttemptId,
        p_expected_credential_execution_id: expectedExecutionId,
        p_expected_password_change_required: true,
      },
    )
    let recovering = false
    if (claimError?.message.toLowerCase().includes('busy')) {
      executionId = crypto.randomUUID()
      const reconciliation = await admin.rpc('reconcile_workspace_account_credential_claim', {
        p_membership_id: membership.id,
        p_claim_kind: 'initial_password_change',
        p_actor_user_id: user.id,
        p_execution_id: executionId,
      })
      claimData = reconciliation.data
      claimError = reconciliation.error
      recovering = !claimError
    }
    const claim = credentialClaimFromRpc(claimData)
    if (
      claimError
      || !claim
      || claim.executionId !== executionId
    ) {
      const message = claimError?.message.toLowerCase() ?? ''
      if (message.includes('stale') || message.includes('token')) {
        if (expiresAt <= Date.now()) {
          throw new HttpError(410, 'TEMPORARY_PASSWORD_EXPIRED', 'The temporary password has expired')
        }
        throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest temporary password')
      }
      if (message.includes('expired')) {
        throw new HttpError(410, 'TEMPORARY_PASSWORD_EXPIRED', 'The temporary password has expired')
      }
      if (message.includes('busy') || message.includes('not ready') || message.includes('reconciliation')) {
        throw new HttpError(409, 'PASSWORD_CHANGE_BUSY', 'A password change is still being reconciled. Try again after the review window')
      }
      throw new HttpError(409, 'PASSWORD_CHANGE_NOT_ALLOWED', 'The password change could not be started')
    }
    const claimedMembership = claim.membership
    const claimedExpiresAt = claimedMembership.invite_expires_at
      ? Date.parse(claimedMembership.invite_expires_at)
      : Number.NaN
    const claimedAccessNotBefore = Number(claimedMembership.workspace_access_not_before_epoch)
    const claimedMembershipIsSafe = claimedMembership.id === membership.id
      && claimedMembership.workspace_id === membership.workspace_id
      && claimedMembership.user_id === user.id
      && claimedMembership.email_normalized === email
      && claimedMembership.provisioning_method === 'admin_temporary_password'
      && claimedMembership.status === 'invited'
      && claimedMembership.password_change_required === true
      && Number.isFinite(claimedExpiresAt)
      && (recovering || claimedExpiresAt > Date.now())
      && Number.isSafeInteger(claimedAccessNotBefore)
      && claimedAccessNotBefore >= 0
      && authContext.tokenIssuedAt >= claimedAccessNotBefore

    const { data: workspaceData, error: workspaceError } = await admin
      .from('workspaces')
      .select('id,status,is_default')
      .eq('id', claimedMembership.workspace_id)
      .maybeSingle()
    if (workspaceError) {
      if (!recovering) {
        await failBeforeProviderChange(
          admin,
          claim,
          user.id,
          new HttpError(503, 'PASSWORD_CHANGE_RETRY_REQUIRED', 'The password change could not be verified. Try again'),
        )
      }
      throw new HttpError(503, 'PASSWORD_CHANGE_RECONCILIATION_REQUIRED', 'The password change requires administrator review')
    }
    const workspaceIsSafe = workspaceData?.id === claimedMembership.workspace_id
      && workspaceData.status === 'active'
      && workspaceData.is_default === false

    const { data: currentUserData, error: currentUserError } = await admin.auth.admin.getUserById(user.id)
    const currentUser = currentUserData.user
    if (currentUserError || !currentUser) {
      if (!recovering) {
        await failBeforeProviderChange(
          admin,
          claim,
          user.id,
          new HttpError(503, 'PASSWORD_CHANGE_RETRY_REQUIRED', 'The password change could not be verified. Try again'),
        )
      }
      throw new HttpError(503, 'PASSWORD_CHANGE_RECONCILIATION_REQUIRED', 'The password change requires administrator review')
    }
    if (!manualIdentityMatches(currentUser, claimedMembership)) {
      if (!recovering) {
        await failBeforeProviderChange(
          admin,
          claim,
          user.id,
          new HttpError(409, 'ACCOUNT_IDENTITY_UNSAFE', 'The account identity requires administrator review'),
        )
      }
      throw new HttpError(503, 'PASSWORD_CHANGE_RECONCILIATION_REQUIRED', 'The password change requires administrator review')
    }
    if (!claimedMembershipIsSafe || !workspaceIsSafe) {
      if (!recovering) {
        await failBeforeProviderChange(
          admin,
          claim,
          user.id,
          new HttpError(403, 'PASSWORD_CHANGE_NOT_ALLOWED', 'This account cannot complete temporary password setup'),
        )
      }
      throw new HttpError(503, 'PASSWORD_CHANGE_RECONCILIATION_REQUIRED', 'The password change requires administrator review')
    }

    let providerUser: typeof currentUser | null = currentUser
    const providerMetadata = currentUser.app_metadata ?? {}
    if (!tokenMatchesCurrentCredential(authContext, providerMetadata, claimedMembership)) {
      if (!recovering) {
        await failBeforeProviderChange(
          admin,
          claim,
          user.id,
          new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest temporary password'),
        )
      }
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Sign in again with the newest account password')
    }

    if (
      recovering
      && providerMetadata.workspace_password_change_required === false
      && metadataUuid(providerMetadata.workspace_credential_attempt_id) === claim.attemptId
    ) {
      const currentVersion = credentialVersion(providerMetadata.workspace_credential_version)
      const reboundMetadata = {
        ...providerMetadata,
        workspace_credential_execution_id: claim.executionId,
      }
      const rebound = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: reboundMetadata,
      })
      providerUser = rebound.data.user
      if (rebound.error || !providerUser) {
        const { data: reconciled } = await admin.auth.admin.getUserById(user.id)
        providerUser = reconciled.user
      }
      if (
        !providerUser
        || !manualIdentityMatches(providerUser, claimedMembership)
        || !exactCredentialMarker(providerUser.app_metadata ?? {}, claim.attemptId, claim.executionId)
        || providerUser.app_metadata?.workspace_password_change_required !== false
        || providerUser.app_metadata?.workspace_credential_version !== currentVersion
      ) {
        throw new HttpError(503, 'PASSWORD_CHANGE_RECONCILIATION_REQUIRED', 'The password change requires administrator review')
      }

      const { error: signOutError } = await admin.auth.admin.signOut(authContext.accessToken, 'global')
      if (signOutError) {
        throw new HttpError(503, 'PASSWORD_CHANGE_RECONCILIATION_REQUIRED', 'The password change requires administrator review')
      }
      await completeInitialPasswordChange(admin, {
        membershipId: claimedMembership.id,
        userId: user.id,
        email,
        attemptId: claim.attemptId,
        executionId: claim.executionId,
        credentialVersion: currentVersion,
        tokenIssuedAt: authContext.tokenIssuedAt,
      })
      return jsonResponse(req, METHODS, 200, { success: true, requires_sign_in: true })
    }

    if (
      providerMetadata.workspace_password_change_required !== true
      || (
        recovering
        && metadataUuid(providerMetadata.workspace_credential_attempt_id) === claim.attemptId
      )
    ) {
      throw new HttpError(503, 'PASSWORD_CHANGE_RECONCILIATION_REQUIRED', 'The password change requires administrator review')
    }

    const currentVersion = credentialVersion(providerMetadata.workspace_credential_version)
    const nextVersion = currentVersion + 1
    if (!Number.isSafeInteger(nextVersion)) {
      throw new HttpError(409, 'CREDENTIAL_STATE_INVALID', 'The account credential state requires review')
    }
    const nextMetadata = {
      ...providerMetadata,
      workspace_password_change_required: false,
      workspace_credential_version: nextVersion,
      workspace_credential_attempt_id: claim.attemptId,
      workspace_credential_execution_id: claim.executionId,
    }

    // Hosted Supabase Auth changes the password and revokes the user's refresh
    // sessions in the same provider transaction. Surviving access JWTs are
    // fenced by current credential metadata and the database issuance epoch.
    const { data: updatedData, error: updateError } = await admin.auth.admin.updateUserById(
      user.id,
      { password: newPassword, app_metadata: nextMetadata },
    )
    providerUser = updatedData.user
    if (updateError || !providerUser) {
      const { data: reconciled } = await admin.auth.admin.getUserById(user.id)
      providerUser = reconciled.user
    }
    if (
      !providerUser
      || !manualIdentityMatches(providerUser, claimedMembership)
      || !exactCredentialMarker(providerUser.app_metadata ?? {}, claim.attemptId, claim.executionId)
      || providerUser.app_metadata?.workspace_credential_version !== nextVersion
      || providerUser.app_metadata?.workspace_password_change_required !== false
    ) {
      throw new HttpError(503, 'PASSWORD_CHANGE_RECONCILIATION_REQUIRED', 'The password change requires administrator review')
    }

    await completeInitialPasswordChange(admin, {
      membershipId: claimedMembership.id,
      userId: user.id,
      email,
      attemptId: claim.attemptId,
      executionId: claim.executionId,
      credentialVersion: nextVersion,
      tokenIssuedAt: authContext.tokenIssuedAt,
    })

    return jsonResponse(req, METHODS, 200, {
      success: true,
      requires_sign_in: true,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
