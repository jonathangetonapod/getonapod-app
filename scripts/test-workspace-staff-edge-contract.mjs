import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/functions/manage-workspace-staff/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260722000100_subagency_workspace_foundation.sql',
  'utf8',
)

const cutoverGuardIndex = migration.indexOf('DO $cutover_claim_guard$')
assert.ok(cutoverGuardIndex > 0, 'provider-claim cutover guard must remain installed')
for (const claimTable of [
  'workspace_account_credential_claims',
  'workspace_auth_lifecycle_claims',
  'workspace_invite_delivery_claims',
]) {
  const lockIndex = migration.indexOf(
    `LOCK TABLE public.${claimTable}\n  IN SHARE ROW EXCLUSIVE MODE;`,
  )
  assert.ok(lockIndex >= 0 && lockIndex < cutoverGuardIndex, `${claimTable} must be write-locked before the cutover guard`)
}

function sqlPattern(value) {
  return new RegExp(
    value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replaceAll(/\s+/gu, '\\s+'),
    'u',
  )
}

assert.match(source, /if \(req\.method === "OPTIONS"\) return optionsResponse\(req, METHODS\)/u)
assert.match(source, /return errorResponse\(req, METHODS, error\)/u)
assert.match(source, /const authContext = await requireAuthenticatedUser\(req\)/u)
assert.match(source, /if \(!workspaceCredentialIsFresh\(authContext\)\)/u)
assert.match(source, /const workspaceId = requireUuid\(body\.workspace_id, "workspace_id"\)/u)
assert.match(source, /if \(platformAdmin\) \{[\s\S]*?"PREVIEW_READ_ONLY"/u)
assert.match(source, /result\.capabilities\.read_only !== platformAdmin/u)

for (const rpc of [
  'workspace_staff_list_v1',
  'begin_workspace_staff_invite_v1',
  'claim_workspace_staff_invite_delivery_v1',
  'find_workspace_staff_invite_auth_user_v1',
  'finalize_workspace_staff_invite_v1',
  'revoke_workspace_staff_account_v1',
  'claim_workspace_staff_auth_lifecycle_v1',
  'complete_workspace_staff_auth_lifecycle_v1',
  'update_workspace_staff_role_v1',
  'transfer_workspace_owner_v1',
]) {
  assert.match(source, new RegExp(`"${rpc}"`, 'u'), `${rpc} must remain version-pinned`)
}

for (const edgeCall of [
  /"workspace_staff_list_v1", \{\s*p_workspace_id: workspaceId,\s*p_actor_user_id: actorUserId,\s*p_token_issued_at: tokenIssuedAt/u,
  /"begin_workspace_staff_invite_v1", \{\s*p_workspace_id: input\.workspaceId,\s*p_email: input\.email,\s*p_full_name: input\.fullName,\s*p_role: input\.role,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt/u,
  /"claim_workspace_staff_invite_delivery_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken/u,
  /"find_workspace_staff_invite_auth_user_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken/u,
  /"finalize_workspace_staff_invite_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken,\s*p_auth_user_id: input\.authUserId/u,
  /"revoke_workspace_staff_account_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: lockToken/u,
  /"claim_workspace_staff_auth_lifecycle_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_action: input\.action,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken/u,
  /"complete_workspace_staff_auth_lifecycle_v1",\s*\{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_action: input\.action,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt,\s*p_lock_token: input\.lockToken/u,
  /"update_workspace_staff_role_v1", \{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_role: input\.role,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt/u,
  /"transfer_workspace_owner_v1", \{\s*p_workspace_id: input\.workspaceId,\s*p_membership_id: input\.membershipId,\s*p_actor_user_id: input\.actorUserId,\s*p_token_issued_at: input\.tokenIssuedAt/u,
]) {
  assert.match(source, edgeCall, 'Edge RPC argument map must match the SQL contract')
}

const sqlContracts = [
  ['workspace_staff_list_v1', 'p_workspace_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT', 'UUID, UUID, BIGINT'],
  ['begin_workspace_staff_invite_v1', 'p_workspace_id UUID, p_email TEXT, p_full_name TEXT, p_role TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT', 'UUID, TEXT, TEXT, TEXT, UUID, BIGINT'],
  ['claim_workspace_staff_invite_delivery_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, UUID, BIGINT, UUID'],
  ['find_workspace_staff_invite_auth_user_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, UUID, BIGINT, UUID'],
  ['finalize_workspace_staff_invite_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID, p_auth_user_id UUID', 'UUID, UUID, UUID, BIGINT, UUID, UUID'],
  ['revoke_workspace_staff_account_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, UUID, BIGINT, UUID'],
  ['claim_workspace_staff_auth_lifecycle_v1', 'p_workspace_id UUID, p_membership_id UUID, p_action TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, TEXT, UUID, BIGINT, UUID'],
  ['complete_workspace_staff_auth_lifecycle_v1', 'p_workspace_id UUID, p_membership_id UUID, p_action TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT, p_lock_token UUID', 'UUID, UUID, TEXT, UUID, BIGINT, UUID'],
  ['update_workspace_staff_role_v1', 'p_workspace_id UUID, p_membership_id UUID, p_role TEXT, p_actor_user_id UUID, p_token_issued_at BIGINT', 'UUID, UUID, TEXT, UUID, BIGINT'],
  ['transfer_workspace_owner_v1', 'p_workspace_id UUID, p_membership_id UUID, p_actor_user_id UUID, p_token_issued_at BIGINT', 'UUID, UUID, UUID, BIGINT'],
]

for (const [name, namedSignature, typeSignature] of sqlContracts) {
  assert.match(
    migration,
    sqlPattern(`CREATE OR REPLACE FUNCTION public.${name}( ${namedSignature} )`),
    `${name} SQL named signature must match Edge`,
  )
  assert.match(
    migration,
    sqlPattern(`REVOKE ALL ON FUNCTION public.${name}( ${typeSignature} ) FROM PUBLIC, anon, authenticated;`),
    `${name} must not be browser-callable`,
  )
  assert.match(
    migration,
    sqlPattern(`GRANT EXECUTE ON FUNCTION public.${name}( ${typeSignature} ) TO service_role;`),
    `${name} must be service-role-only`,
  )
}

for (const parameter of [
  'p_workspace_id: input.workspaceId',
  'p_actor_user_id: input.actorUserId',
  'p_token_issued_at: input.tokenIssuedAt',
]) {
  assert.match(source, new RegExp(parameter.replaceAll('.', '\\.'), 'u'))
}

assert.match(source, /const lockToken = crypto\.randomUUID\(\)/u)
assert.match(source, /"release_workspace_invite_delivery_claim"/u)
assert.match(source, /admin\.auth\.admin[\s\S]*?\.inviteUserByEmail/u)
assert.match(source, /data: \{[\s\S]*?workspace_id: membership\.workspace_id,[\s\S]*?workspace_membership_id: membership\.id/u)
assert.match(source, /app_metadata: \{[\s\S]*?workspace_id: membership\.workspace_id,[\s\S]*?workspace_membership_id: membership\.id/u)
assert.match(source, /markerMatches\(data\.user\.app_metadata, membership\)/u)
assert.match(source, /const safeUntrustedInviteMarker = allowInviteMarker &&[\s\S]*?Boolean\(data\.user\.invited_at\)[\s\S]*?!data\.user\.confirmed_at[\s\S]*?!data\.user\.last_sign_in_at/u)
assert.match(source, /admin\.auth\.admin\.deleteUser\(authUserId\)/u)
assert.match(source, /ban_duration: desiredStatus === "suspended" \? "876000h" : "none"/u)
assert.doesNotMatch(source, /reconcile_active|reconcile_suspended/u)
assert.match(source, /"transfer_workspace_owner_v1", \{[\s\S]*?p_membership_id: input\.membershipId/u)
assert.match(source, /message\.includes\("active workspace preview"\)/u)
assert.match(source, /message\.includes\("auth identity is not ready"\)/u)
assert.match(source, /\["22023", "23505", "42501", "55000", "55P03", "P0002"\]\.includes/u)
assert.match(source, /let sawTransportUncertainty = false/u)
assert.match(source, /if \(sawTransportUncertainty\) break;[\s\S]*?sawTransportUncertainty = true/u)
assert.match(source, /if \(!sawTransportUncertainty && notReadyResponses === 2\) return null/u)
assert.match(source, /"INVITE_FINALIZE_UNCERTAIN"[\s\S]*?requires operator review/u)
assert.match(source, /error\.code === "INVITE_FINALIZE_UNCERTAIN"[\s\S]*?throw error/u)
assert.match(migration, /RAISE EXCEPTION 'workspace staff invitation Auth identity is not ready'/u)
assert.ok(
  migration.indexOf("workspace staff invitation Auth identity is not ready") <
    migration.indexOf("workspace staff invitation Auth identity is unsafe"),
  'transient missing Auth markers must be distinguished before unsafe identity mismatches',
)

const publicMemberProjection = source.match(
  /function memberDto[\s\S]*?return \{([\s\S]*?)\n  \};\n\}/u,
)?.[1]
assert.ok(publicMemberProjection, 'memberDto must use an explicit public projection')
for (const key of [
  'id',
  'email',
  'full_name',
  'role',
  'status',
  'invited_at',
  'invite_expires_at',
  'accepted_at',
  'suspended_at',
  'pending_review',
  'allowed_actions',
]) {
  assert.match(publicMemberProjection, new RegExp(`\\b${key}\\b`, 'u'))
}
for (const forbidden of [
  'user_id',
  'workspace_id',
  'lock_token',
  'actor_user_id',
  'workspace_access_not_before_epoch',
]) {
  assert.doesNotMatch(
    publicMemberProjection,
    new RegExp(`\\b${forbidden}\\b`, 'u'),
    `public staff DTO must exclude ${forbidden}`,
  )
}

assert.match(config, /\[functions\.manage-workspace-staff\]\s+verify_jwt = true/u)

process.stdout.write('Workspace Staff Edge contract checks passed\n')
