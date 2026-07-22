import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  MEMBERSHIP_COLUMNS,
  normalizeEmail,
  optionsResponse,
  optionalString,
  parseJsonObject,
  requireEmail,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireUuid,
} from '../_shared/workspaceAuth.ts'
import {
  credentialVersion,
  generateTemporaryPassword,
} from '../_shared/workspaceCredentials.ts'

const METHODS = ['POST'] as const

type MembershipRow = Record<string, unknown> & {
  id: string
  workspace_id: string
  user_id: string | null
  email_normalized: string
  full_name: string | null
  role: string
  status: string
  provisioning_method: string
}

type WorkspaceRow = Record<string, unknown> & {
  id: string
  name: string
  slug: string
  status: string
  is_default?: boolean
}

type Provisioning = { membership: MembershipRow; workspace: WorkspaceRow }
type CredentialChangeClaim = {
  membership: MembershipRow
  attemptId: string
  executionId: string
  recovering: boolean
}

function provisioningFromRpc(data: unknown): Provisioning | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const value = data as { membership?: unknown; workspace?: unknown }
  if (!value.membership || typeof value.membership !== 'object') return null
  if (!value.workspace || typeof value.workspace !== 'object') return null
  const membership = value.membership as MembershipRow
  if (membership.role !== 'owner') return null
  return {
    membership,
    workspace: value.workspace as WorkspaceRow,
  }
}

function membershipFromRpc(data: unknown): MembershipRow | null {
  const value = Array.isArray(data) ? data[0] : data
  return value && typeof value === 'object' ? value as MembershipRow : null
}

function membershipDto(membership: MembershipRow) {
  return {
    id: membership.id,
    workspace_id: membership.workspace_id,
    status: membership.status,
    provisioning_method: membership.provisioning_method,
    password_change_required: membership.password_change_required === true,
    invite_expires_at: typeof membership.invite_expires_at === 'string'
      ? membership.invite_expires_at
      : null,
  }
}

function workspaceDto(workspace: WorkspaceRow) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    status: workspace.status,
  }
}

function metadataUuid(value: unknown): string | null {
  return typeof value === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null
}

function manualAuthIdentityMatches(
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

function workspaceName(email: string, fullName: string | null, requested: string | null): string {
  if (requested) return requested
  if (fullName) return `${fullName}'s Workspace`
  return `${email.split('@')[0]}'s Workspace`
}

function workspaceSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'workspace'
  const suffix = [crypto.randomUUID(), crypto.randomUUID()]
    .map((value) => value.replaceAll('-', '').slice(0, 12))
    .join('')
  return `${base}-${suffix}`
}

async function beginProvisioning(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  input: {
    email: string
    fullName: string | null
    workspaceName: string
    actorUserId: string
  },
): Promise<Provisioning> {
  const { data, error } = await admin.rpc('begin_workspace_password_account', {
    p_email: input.email,
    p_full_name: input.fullName,
    p_workspace_name: input.workspaceName,
    p_workspace_slug: workspaceSlug(input.workspaceName),
    p_actor_user_id: input.actorUserId,
  })

  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('platform administrator')) {
      throw new HttpError(409, 'PLATFORM_ADMIN_EXISTS', 'This email is already a platform administrator')
    }
    if (message.includes('already exists') || error.code === '23505') {
      throw new HttpError(409, 'ACCOUNT_ALREADY_EXISTS', 'This email already has workspace access')
    }
    if (message.includes('invalid')) {
      throw new HttpError(400, 'INVALID_ACCOUNT', 'The workspace account fields are invalid')
    }
    throw new HttpError(500, 'ACCOUNT_PROVISION_FAILED', 'The workspace account could not be provisioned')
  }

  const provisioning = provisioningFromRpc(data)
  if (!provisioning) {
    throw new HttpError(500, 'ACCOUNT_PROVISION_FAILED', 'The workspace account could not be provisioned')
  }
  return provisioning
}

async function loadProvisioning(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  membershipId: string,
): Promise<Provisioning> {
  const { data, error } = await admin
    .from('workspace_memberships')
    .select(`${MEMBERSHIP_COLUMNS}, workspace:workspaces(id,name,slug,status,is_default)`)
    .eq('id', membershipId)
    .maybeSingle()

  if (error) throw new HttpError(500, 'ACCOUNT_LOOKUP_FAILED', 'The workspace account could not be loaded')
  if (!data) throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Workspace account not found')

  const row = data as unknown as MembershipRow & { workspace?: WorkspaceRow | null }
  if (
    row.status !== 'provisioning'
    || row.role !== 'owner'
    || row.provisioning_method !== 'admin_temporary_password'
    || !row.workspace
    || row.workspace.is_default
    || row.workspace.status !== 'active'
  ) {
    throw new HttpError(409, 'ACCOUNT_NOT_RETRYABLE', 'This manual account cannot be retried')
  }
  return { membership: row, workspace: row.workspace }
}

async function claimDelivery(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  membershipId: string,
  actorUserId: string,
  attemptId: string,
): Promise<MembershipRow> {
  const { data, error } = await admin.rpc('claim_workspace_invite_delivery', {
    p_membership_id: membershipId,
    p_actor_user_id: actorUserId,
    p_lock_token: attemptId,
  })
  const membership = membershipFromRpc(data)
  if (!error && membership) return membership

  const message = error?.message.toLowerCase() ?? ''
  if (message.includes('busy')) {
    throw new HttpError(409, 'ACCOUNT_PROVISION_BUSY', 'Account provisioning requires operator review')
  }
  if (message.includes('not provisioning')) {
    throw new HttpError(409, 'ACCOUNT_NOT_RETRYABLE', 'This manual account cannot be retried')
  }
  throw new HttpError(500, 'ACCOUNT_PROVISION_FAILED', 'The workspace account could not be provisioned')
}

async function releaseDelivery(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  membershipId: string,
  attemptId: string,
): Promise<void> {
  const { data, error } = await admin.rpc('release_workspace_invite_delivery_claim', {
    p_membership_id: membershipId,
    p_lock_token: attemptId,
  })
  if (error || data !== true) {
    throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'Account cleanup requires operator review')
  }
}

async function cancelProvisioning(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  membershipId: string,
  actorUserId: string,
  attemptId: string,
): Promise<void> {
  const { data, error } = await admin.rpc('cancel_workspace_password_account_provisioning', {
    p_membership_id: membershipId,
    p_actor_user_id: actorUserId,
    p_lock_token: attemptId,
  })
  if (error || !membershipFromRpc(data)) {
    throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'Account cancellation requires operator review')
  }
}

async function findMarkedAuthUser(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  membershipId: string,
  actorUserId: string,
  attemptId: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc('find_workspace_invite_auth_user', {
    p_membership_id: membershipId,
    p_actor_user_id: actorUserId,
    p_lock_token: attemptId,
  })
  if (error) {
    throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'The Auth identity requires operator review')
  }
  return typeof data === 'string' && data.length > 0 ? data : null
}

function exactManualMetadata(
  appMetadata: Record<string, unknown> | undefined,
  provisioning: Provisioning,
  attemptId: string,
  executionId: string,
): boolean {
  return appMetadata?.workspace_id === provisioning.workspace.id
    && appMetadata?.workspace_membership_id === provisioning.membership.id
    && appMetadata?.workspace_provisioning_method === 'admin_temporary_password'
    && appMetadata?.workspace_password_change_required === true
    && appMetadata?.workspace_credential_version === 1
    && appMetadata?.workspace_credential_attempt_id === attemptId
    && appMetadata?.workspace_credential_execution_id === executionId
}

async function deleteExactAuthUser(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  userId: string,
  provisioning: Provisioning,
  attemptId: string,
  executionId: string,
): Promise<void> {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error) {
    const missing = error.status === 404 || error.message.toLowerCase().includes('not found')
    if (missing) return
    throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'Auth cleanup requires operator review')
  }
  if (!data.user) return
  if (
    normalizeEmail(data.user.email ?? '') !== provisioning.membership.email_normalized
    || !exactManualMetadata(data.user.app_metadata, provisioning, attemptId, executionId)
  ) {
    throw new HttpError(409, 'ACCOUNT_IDENTITY_UNSAFE', 'The Auth identity requires operator review')
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
  if (deleteError && deleteError.status !== 404) {
    throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'Auth cleanup requires operator review')
  }
}

async function finalizeProvisioning(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  provisioning: Provisioning,
  actorUserId: string,
  attemptId: string,
  authUserId: string,
): Promise<MembershipRow | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc('finalize_workspace_password_account', {
      p_membership_id: provisioning.membership.id,
      p_actor_user_id: actorUserId,
      p_lock_token: attemptId,
      p_auth_user_id: authUserId,
    })
    const membership = membershipFromRpc(data)
    if (!error && membership) return membership
    if (!error?.message.toLowerCase().includes('not ready')) {
      const message = error?.message.toLowerCase() ?? ''
      if (message.includes('unsafe') || message.includes('claim')) {
        throw new HttpError(409, 'ACCOUNT_IDENTITY_UNSAFE', 'The account identity requires operator review')
      }
      return null
    }
  }
  return null
}

async function reconcileProvisioningState(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  provisioning: Provisioning,
  authUserId: string,
): Promise<MembershipRow | null> {
  const { data, error } = await admin
    .from('workspace_memberships')
    .select(MEMBERSHIP_COLUMNS)
    .eq('id', provisioning.membership.id)
    .maybeSingle()

  if (error || !data) {
    throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'The account state requires operator review')
  }
  const membership = data as unknown as MembershipRow
  if (
    membership.status === 'invited'
    && membership.provisioning_method === 'admin_temporary_password'
    && membership.user_id === authUserId
    && membership.workspace_id === provisioning.workspace.id
    && membership.password_change_required === true
  ) {
    return membership
  }
  if (
    membership.status === 'provisioning'
    && membership.provisioning_method === 'admin_temporary_password'
    && membership.user_id === null
    && membership.workspace_id === provisioning.workspace.id
  ) {
    return null
  }
  throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'The account state requires operator review')
}

async function issueInitialTemporaryPassword(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  provisioning: Provisioning,
  actorUserId: string,
  attemptId: string,
): Promise<{ membership: MembershipRow; temporaryPassword: string }> {
  const claimedMembership = await claimDelivery(
    admin,
    provisioning.membership.id,
    actorUserId,
    attemptId,
  )
  if (
    claimedMembership.workspace_id !== provisioning.workspace.id
    || claimedMembership.role !== 'owner'
  ) {
    throw new HttpError(409, 'ACCOUNT_WORKSPACE_MISMATCH', 'The account workspace requires operator review')
  }

  const temporaryPassword = generateTemporaryPassword()
  const { data, error } = await admin.auth.admin.createUser({
    email: claimedMembership.email_normalized,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      full_name: claimedMembership.full_name,
    },
    app_metadata: {
      workspace_id: claimedMembership.workspace_id,
      workspace_membership_id: claimedMembership.id,
      workspace_provisioning_method: 'admin_temporary_password',
      workspace_password_change_required: true,
      workspace_credential_version: 1,
      workspace_credential_attempt_id: attemptId,
      workspace_credential_execution_id: attemptId,
    },
  })

  if (error || !data.user) {
    const authAccountExists = (error as { code?: string } | null)?.code === 'email_exists'
      || error?.message.toLowerCase().includes('registered') === true
    const markedUserId = await findMarkedAuthUser(admin, claimedMembership.id, actorUserId, attemptId)
    if (markedUserId) {
      await deleteExactAuthUser(admin, markedUserId, provisioning, attemptId, attemptId)
    }
    if (authAccountExists) {
      await cancelProvisioning(admin, claimedMembership.id, actorUserId, attemptId)
      throw new HttpError(409, 'AUTH_ACCOUNT_EXISTS', 'This email already belongs to another Auth account')
    }
    await releaseDelivery(admin, claimedMembership.id, attemptId)
    throw new HttpError(503, 'ACCOUNT_CREATE_RETRY_REQUIRED', 'Account creation was safely rolled back. Retry it')
  }

  if (
    normalizeEmail(data.user.email ?? '') !== claimedMembership.email_normalized
    || !exactManualMetadata(data.user.app_metadata, provisioning, attemptId, attemptId)
  ) {
    throw new HttpError(409, 'ACCOUNT_IDENTITY_UNSAFE', 'The account identity requires operator review')
  }

  let finalized = await finalizeProvisioning(
    admin,
    provisioning,
    actorUserId,
    attemptId,
    data.user.id,
  )
  if (!finalized) {
    finalized = await reconcileProvisioningState(admin, provisioning, data.user.id)
  }
  if (!finalized) {
    await deleteExactAuthUser(admin, data.user.id, provisioning, attemptId, attemptId)
    await releaseDelivery(admin, claimedMembership.id, attemptId)
    throw new HttpError(503, 'ACCOUNT_CREATE_RETRY_REQUIRED', 'Account creation was safely rolled back. Retry it')
  }

  return { membership: finalized, temporaryPassword }
}

async function claimCredentialChange(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  membershipId: string,
  actorUserId: string,
): Promise<CredentialChangeClaim> {
  const requestedAttemptId = crypto.randomUUID()
  let executionId = crypto.randomUUID()
  let { data, error } = await admin.rpc('claim_workspace_account_credential', {
    p_membership_id: membershipId,
    p_claim_kind: 'temporary_password_rotation',
    p_actor_user_id: actorUserId,
    p_attempt_id: requestedAttemptId,
    p_execution_id: executionId,
    p_token_issued_at: null,
    p_expected_credential_version: null,
    p_expected_credential_attempt_id: null,
    p_expected_credential_execution_id: null,
    p_expected_password_change_required: null,
  })
  let recovering = false
  if (error?.message.toLowerCase().includes('busy')) {
    executionId = crypto.randomUUID()
    const reconciliation = await admin.rpc('reconcile_workspace_account_credential_claim', {
      p_membership_id: membershipId,
      p_claim_kind: 'temporary_password_rotation',
      p_actor_user_id: actorUserId,
      p_execution_id: executionId,
    })
    data = reconciliation.data
    error = reconciliation.error
    recovering = !error
  }
  const value = data && typeof data === 'object' && !Array.isArray(data)
    ? data as { membership?: unknown; attempt_id?: unknown; execution_id?: unknown }
    : null
  if (
    error
    || !value
    || !value.membership
    || typeof value.membership !== 'object'
    || Array.isArray(value.membership)
  ) {
    const message = error?.message.toLowerCase() ?? ''
    if (message.includes('busy') || message.includes('not ready')) {
      throw new HttpError(409, 'CREDENTIAL_CHANGE_BUSY', 'A credential change requires operator review')
    }
    throw new HttpError(409, 'CREDENTIAL_CHANGE_UNAVAILABLE', 'A temporary password cannot be issued for this account')
  }
  const attemptId = metadataUuid(value.attempt_id)
  const claimedExecutionId = metadataUuid(value.execution_id)
  if (
    !attemptId
    || claimedExecutionId !== executionId
    || (!recovering && attemptId !== requestedAttemptId)
  ) {
    throw new HttpError(503, 'CREDENTIAL_RECONCILIATION_REQUIRED', 'The credential change requires operator review')
  }
  return {
    membership: value.membership as MembershipRow,
    attemptId,
    executionId,
    recovering,
  }
}

async function releaseCredentialChange(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
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
    throw new HttpError(503, 'CREDENTIAL_RECONCILIATION_REQUIRED', 'The credential change requires operator review')
  }
}

async function failCredentialChangeBeforeProvider(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  claim: CredentialChangeClaim,
  actorUserId: string,
  error: HttpError,
): Promise<never> {
  if (!claim.recovering) {
    await releaseCredentialChange(
      admin,
      claim.membership.id,
      actorUserId,
      claim.attemptId,
      claim.executionId,
    )
  }
  throw error
}

async function rotateTemporaryPassword(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  membershipId: string,
  actorUserId: string,
): Promise<{ membership: MembershipRow; temporaryPassword: string }> {
  const claim = await claimCredentialChange(admin, membershipId, actorUserId)
  const claimedMembership = claim.membership
  if (
    claimedMembership.id !== membershipId
    || claimedMembership.role !== 'owner'
    || claimedMembership.provisioning_method !== 'admin_temporary_password'
    || claimedMembership.status !== 'invited'
    || claimedMembership.password_change_required !== true
    || !claimedMembership.user_id
  ) {
    return await failCredentialChangeBeforeProvider(
      admin,
      claim,
      actorUserId,
      new HttpError(409, 'ACCOUNT_IDENTITY_UNAVAILABLE', 'The account Auth identity requires review'),
    )
  }

  const { data: protectedAdmin, error: protectedAdminError } = await admin.rpc(
    'is_platform_admin_email',
    { p_email: claimedMembership.email_normalized },
  )
  if (protectedAdminError) {
    if (claim.recovering) {
      throw new HttpError(503, 'CREDENTIAL_RECONCILIATION_REQUIRED', 'The credential change requires operator review')
    }
    return await failCredentialChangeBeforeProvider(
      admin,
      claim,
      actorUserId,
      new HttpError(503, 'CREDENTIAL_CHANGE_RETRY_REQUIRED', 'The credential change could not be verified. Try again'),
    )
  }
  if (protectedAdmin === true) {
    return await failCredentialChangeBeforeProvider(
      admin,
      claim,
      actorUserId,
      new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here'),
    )
  }

  const { data: workspaceData, error: workspaceError } = await admin
    .from('workspaces')
    .select('id,status,is_default')
    .eq('id', claimedMembership.workspace_id)
    .maybeSingle()
  if (workspaceError) {
    if (claim.recovering) {
      throw new HttpError(503, 'CREDENTIAL_RECONCILIATION_REQUIRED', 'The credential change requires operator review')
    }
    return await failCredentialChangeBeforeProvider(
      admin,
      claim,
      actorUserId,
      new HttpError(503, 'CREDENTIAL_CHANGE_RETRY_REQUIRED', 'The credential change could not be verified. Try again'),
    )
  }
  if (
    workspaceData?.id !== claimedMembership.workspace_id
    || workspaceData.status !== 'active'
    || workspaceData.is_default !== false
  ) {
    return await failCredentialChangeBeforeProvider(
      admin,
      claim,
      actorUserId,
      new HttpError(409, 'ACCOUNT_WORKSPACE_UNAVAILABLE', 'The account workspace requires review'),
    )
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(claimedMembership.user_id)
  const authUser = userData.user
  if (userError) {
    if (claim.recovering) {
      throw new HttpError(503, 'CREDENTIAL_RECONCILIATION_REQUIRED', 'The credential change requires operator review')
    }
    return await failCredentialChangeBeforeProvider(
      admin,
      claim,
      actorUserId,
      new HttpError(503, 'CREDENTIAL_CHANGE_RETRY_REQUIRED', 'The credential change could not be verified. Try again'),
    )
  }
  if (
    !authUser
    || !manualAuthIdentityMatches(authUser, claimedMembership)
    || authUser.app_metadata?.workspace_password_change_required !== true
    || !metadataUuid(authUser.app_metadata?.workspace_credential_attempt_id)
    || !metadataUuid(authUser.app_metadata?.workspace_credential_execution_id)
  ) {
    return await failCredentialChangeBeforeProvider(
      admin,
      claim,
      actorUserId,
      new HttpError(409, 'ACCOUNT_IDENTITY_UNSAFE', 'The account Auth identity requires operator review'),
    )
  }

  let nextVersion: number
  try {
    nextVersion = credentialVersion(authUser.app_metadata.workspace_credential_version) + 1
    if (!Number.isSafeInteger(nextVersion)) {
      throw new HttpError(409, 'CREDENTIAL_STATE_INVALID', 'The account credential state requires review')
    }
  } catch (error) {
    await failCredentialChangeBeforeProvider(
      admin,
      claim,
      actorUserId,
      error instanceof HttpError
        ? error
        : new HttpError(409, 'CREDENTIAL_STATE_INVALID', 'The account credential state requires review'),
    )
    throw new HttpError(503, 'CREDENTIAL_RECONCILIATION_REQUIRED', 'The credential change requires operator review')
  }
  const temporaryPassword = generateTemporaryPassword()
  const nextMetadata = {
    ...authUser.app_metadata,
    workspace_password_change_required: true,
    workspace_credential_version: nextVersion,
    workspace_credential_attempt_id: claim.attemptId,
    workspace_credential_execution_id: claim.executionId,
  }
  const { data: updatedData, error: updateError } = await admin.auth.admin.updateUserById(
    authUser.id,
    { password: temporaryPassword, app_metadata: nextMetadata },
  )

  let updatedUser = updatedData.user
  if (updateError || !updatedUser) {
    const { data: reconciled } = await admin.auth.admin.getUserById(authUser.id)
    updatedUser = reconciled.user
  }
  if (
    !updatedUser
    || !manualAuthIdentityMatches(updatedUser, claimedMembership)
    || !exactCredentialMarker(updatedUser.app_metadata ?? {}, claim.attemptId, claim.executionId)
    || updatedUser.app_metadata?.workspace_credential_version !== nextVersion
    || updatedUser.app_metadata?.workspace_password_change_required !== true
  ) {
    throw new HttpError(503, 'CREDENTIAL_RECONCILIATION_REQUIRED', 'The credential change requires operator review')
  }

  const { data: completedData, error: completedError } = await admin.rpc(
    'complete_workspace_temporary_password_rotation',
    {
      p_membership_id: claimedMembership.id,
      p_actor_user_id: actorUserId,
      p_attempt_id: claim.attemptId,
      p_execution_id: claim.executionId,
      p_credential_version: nextVersion,
    },
  )
  const completed = membershipFromRpc(completedData)
  if (completedError || !completed) {
    throw new HttpError(503, 'CREDENTIAL_RECONCILIATION_REQUIRED', 'The credential change requires operator review')
  }
  return { membership: completed, temporaryPassword }
}

function revocationError(error: { message?: string } | null): never {
  const message = error?.message?.toLowerCase() ?? ''
  if (message.includes('not found')) {
    throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Manual workspace account not found')
  }
  if (message.includes('busy')) {
    throw new HttpError(409, 'ACCOUNT_REVOKE_BUSY', 'Account revocation is already being reconciled')
  }
  if (message.includes('protected') || message.includes('platform administrator')) {
    throw new HttpError(409, 'PLATFORM_ADMIN_PROTECTED', 'Platform administrators cannot be changed here')
  }
  if (message.includes('not revocable') || message.includes('superseded')) {
    throw new HttpError(409, 'ACCOUNT_NOT_REVOKABLE', 'This manual workspace account cannot be revoked')
  }
  if (message.includes('unsafe') || message.includes('ambiguous')) {
    throw new HttpError(409, 'ACCOUNT_IDENTITY_UNSAFE', 'The account Auth identity requires operator review')
  }
  throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'Account revocation requires operator review')
}

async function revokeManualWorkspaceAccount(
  admin: Awaited<ReturnType<typeof requirePlatformAdmin>>['admin'],
  membershipId: string,
  actorUserId: string,
): Promise<MembershipRow> {
  const lockToken = crypto.randomUUID()
  let claimed: MembershipRow | null = null
  let claimError: { message?: string } | null = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await admin.rpc('claim_workspace_password_account_revocation', {
      p_membership_id: membershipId,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
    })
    claimed = membershipFromRpc(result.data)
    claimError = result.error
    if (!claimError && claimed) break
  }
  if (claimError || !claimed) revocationError(claimError)
  if (claimed.role !== 'owner') {
    throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'Manual workspace account not found')
  }

  const lookup = await admin.rpc('find_workspace_password_account_auth_user', {
    p_membership_id: claimed.id,
    p_actor_user_id: actorUserId,
    p_lock_token: lockToken,
  })
  if (lookup.error) revocationError(lookup.error)
  const authUserId = typeof lookup.data === 'string' && lookup.data.length > 0
    ? lookup.data
    : null

  if (authUserId) {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(authUserId)
    const missing = userError?.status === 404
      || userError?.message.toLowerCase().includes('not found') === true
    if (userError && !missing) {
      throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'Auth cleanup requires operator review')
    }
    if (userData.user) {
      const metadata = userData.user.app_metadata ?? {}
      const exactIdentity = manualAuthIdentityMatches(userData.user, claimed)
        && metadataUuid(metadata.workspace_credential_attempt_id) !== null
        && metadataUuid(metadata.workspace_credential_execution_id) !== null
        && typeof metadata.workspace_credential_version === 'number'
        && Number.isSafeInteger(metadata.workspace_credential_version)
        && metadata.workspace_credential_version > 0
        && typeof metadata.workspace_password_change_required === 'boolean'
      if (!exactIdentity) {
        throw new HttpError(409, 'ACCOUNT_IDENTITY_UNSAFE', 'The account Auth identity requires operator review')
      }

      const { error: deleteError } = await admin.auth.admin.deleteUser(authUserId)
      if (deleteError && deleteError.status !== 404) {
        const { data: reconciled, error: reconcileError } = await admin.auth.admin.getUserById(authUserId)
        const reconciledMissing = reconcileError?.status === 404
          || reconcileError?.message.toLowerCase().includes('not found') === true
        if (!reconciledMissing && (reconcileError || reconciled.user)) {
          throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'Auth cleanup requires operator review')
        }
      }
    }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completed = await admin.rpc('complete_workspace_password_account_revocation', {
      p_membership_id: claimed.id,
      p_actor_user_id: actorUserId,
      p_lock_token: lockToken,
    })
    const membership = membershipFromRpc(completed.data)
    if (!completed.error && membership) return membership
    if (attempt === 1) revocationError(completed.error)
  }

  throw new HttpError(503, 'ACCOUNT_RECONCILIATION_REQUIRED', 'Account revocation requires operator review')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const { admin, user } = await requirePlatformAdmin(req)
    requireUuid(body.request_id, 'request_id')

    if (action === 'create') {
      requireOnlyKeys(body, ['action', 'request_id', 'email', 'full_name', 'workspace_name'])
      const email = requireEmail(body.email)
      const fullName = optionalString(body.full_name, 'full_name', 120)
      const requestedWorkspaceName = optionalString(body.workspace_name, 'workspace_name', 120)
      const name = workspaceName(email, fullName, requestedWorkspaceName)
      const provisioning = await beginProvisioning(admin, {
        email,
        fullName,
        workspaceName: name,
        actorUserId: user.id,
      })
      const issued = await issueInitialTemporaryPassword(
        admin,
        provisioning,
        user.id,
        crypto.randomUUID(),
      )
      return jsonResponse(req, METHODS, 201, {
        success: true,
        membership: membershipDto(issued.membership),
        workspace: workspaceDto(provisioning.workspace),
        email,
        temporary_password: issued.temporaryPassword,
      })
    }

    if (action === 'retry') {
      requireOnlyKeys(body, ['action', 'request_id', 'membership_id'])
      const membershipId = requireUuid(body.membership_id, 'membership_id')
      const provisioning = await loadProvisioning(admin, membershipId)
      const issued = await issueInitialTemporaryPassword(
        admin,
        provisioning,
        user.id,
        crypto.randomUUID(),
      )
      return jsonResponse(req, METHODS, 201, {
        success: true,
        membership: membershipDto(issued.membership),
        workspace: workspaceDto(provisioning.workspace),
        email: issued.membership.email_normalized,
        temporary_password: issued.temporaryPassword,
      })
    }

    if (action === 'rotate') {
      requireOnlyKeys(body, ['action', 'request_id', 'membership_id'])
      const membershipId = requireUuid(body.membership_id, 'membership_id')
      const issued = await rotateTemporaryPassword(
        admin,
        membershipId,
        user.id,
      )
      return jsonResponse(req, METHODS, 200, {
        success: true,
        membership: membershipDto(issued.membership),
        email: issued.membership.email_normalized,
        temporary_password: issued.temporaryPassword,
      })
    }

    if (action === 'revoke') {
      requireOnlyKeys(body, ['action', 'request_id', 'membership_id'])
      const membershipId = requireUuid(body.membership_id, 'membership_id')
      const revoked = await revokeManualWorkspaceAccount(admin, membershipId, user.id)
      return jsonResponse(req, METHODS, 200, {
        success: true,
        membership: membershipDto(revoked),
      })
    }

    throw new HttpError(400, 'INVALID_ACTION', 'Unknown manual workspace account action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
