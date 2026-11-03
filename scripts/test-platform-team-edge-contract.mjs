// Contract checks for manage-platform-team and its migration. They pin the
// security shape of adding and removing platform administrators:
//
//   * the function is JWT-verified, listed for deploy, and platform-admin gated
//     before any action runs;
//   * every database mutation is owner-only and takes the caller's token issue
//     time, so a stale session cannot change the team;
//   * the admin_users row is written on acceptance (by trigger) or by an
//     explicit owner grant, never at invite time;
//   * cancelling a platform invite never runs the private-workspace teardown;
//   * removal revokes the membership, which advances the access epoch;
//   * nobody can remove themselves or the owner.
//
// If one of these fails after a deliberate change, move the pin WITH the
// change and say why in a comment.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/manage-platform-team/index.ts', 'utf8')
const baseMigration = readFileSync('supabase/migrations/20261103000100_platform_team.sql', 'utf8')
const hardening = readFileSync('supabase/migrations/20261103000200_platform_team_hardening.sql', 'utf8')
// Later files redefine functions; the newest definition is the live one.
const migration = `${baseMigration}\n${hardening}`
const config = readFileSync('supabase/config.toml', 'utf8')
const manifest = JSON.parse(readFileSync('docs/invite-only-edge-manifest.json', 'utf8'))
const service = readFileSync('src/services/platformTeam.ts', 'utf8')

const sqlFunction = (name) => {
  const start = migration.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  assert.ok(start >= 0, `${name} must be defined`)
  const end = migration.indexOf('\n$$;', start)
  assert.ok(end > start, `${name} must have a body`)
  return migration.slice(start, end)
}

// Registered like every current-generation function.
assert.match(config, /\[functions\.manage-platform-team\]\nverify_jwt = true/u)
assert.ok(
  manifest.phases['3_after_migrations_and_verifier'].includes('manage-platform-team'),
  'manage-platform-team must be listed in the release manifest deploy phase',
)

// One platform-admin gate, before any action is dispatched.
const gate = edge.indexOf('await requirePlatformAdmin(req)')
assert.ok(gate > 0, 'the platform-admin gate must exist')
for (const action of ["action === 'list'", "action === 'invite'", "action === 'resend_invite'", "action === 'cancel_invite'", "action === 'grant_admin'"]) {
  const index = edge.indexOf(action)
  assert.ok(index > gate, `${action} must come after the platform-admin gate`)
}
// The edge never writes admin_users or memberships itself.
assert.ok(!/from\('admin_users'\)/u.test(edge), 'the edge must not touch admin_users directly')
assert.ok(!/from\('workspace_memberships'\)/u.test(edge), 'the edge must not touch memberships directly')
// The token issue time reaches every owner-gated RPC.
for (const rpc of ['begin_platform_admin_invite_v1', 'revoke_platform_admin_invite_v1', 'platform_admin_invite_for_resend_v1', 'platform_team_list_v1']) {
  const call = edge.indexOf(`'${rpc}'`)
  assert.ok(call > 0, `${rpc} must be called`)
  assert.ok(edge.slice(call, call + 400).includes('p_token_issued_at: tokenIssuedAt'), `${rpc} must receive the token issue time`)
}
// grant_admin and remove share one call, which also carries the issue time.
const shared = edge.indexOf("action === 'grant_admin' ? 'grant_platform_admin_v1' : 'remove_platform_team_member_v1'")
assert.ok(shared > gate, 'grant and remove must go through the shared owner-gated call')
assert.ok(edge.slice(shared, shared + 400).includes('p_token_issued_at: tokenIssuedAt'), 'grant and remove must receive the token issue time')

// Owner-only mutations, platform-admin read.
for (const name of [
  'begin_platform_admin_invite_v1',
  'platform_admin_invite_for_resend_v1',
  'revoke_platform_admin_invite_v1',
  'grant_platform_admin_v1',
  'remove_platform_team_member_v1',
]) {
  assert.match(sqlFunction(name), /public\.platform_team_owner_v1\(p_actor_user_id, p_token_issued_at\)/u, `${name} must be owner-only`)
  assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\)\\n  TO service_role;`, 'u'))
}
assert.match(sqlFunction('platform_team_list_v1'), /public\.platform_team_actor_v1\(p_actor_user_id, p_token_issued_at\)/u)
assert.match(sqlFunction('platform_team_owner_v1'), /actor_membership\.role <> 'owner'/u)
assert.match(sqlFunction('platform_team_actor_v1'), /p_token_issued_at >= membership\.workspace_access_not_before_epoch/u)
assert.match(sqlFunction('platform_team_actor_v1'), /p_token_issued_at >= workspace\.access_not_before_epoch/u)
assert.match(sqlFunction('platform_team_actor_v1'), /public\.is_platform_admin_identity\(p_actor_user_id, actor_email\)/u)
// Helpers are not callable even by the service role.
assert.match(migration, /REVOKE ALL ON FUNCTION public\.platform_team_actor_v1\(UUID, BIGINT\)\n  FROM PUBLIC, anon, authenticated, service_role;/u)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.platform_team_owner_v1\(UUID, BIGINT\)\n  FROM PUBLIC, anon, authenticated, service_role;/u)
assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.platform_admin_invitations\n  FROM PUBLIC, anon, authenticated, service_role;/u)

// admin_users is never written at invite time.
assert.ok(!/admin_users/u.test(sqlFunction('begin_platform_admin_invite_v1').replace(/is_platform_admin_email/gu, '')), 'invites must not write admin_users')
assert.match(sqlFunction('grant_platform_admin_on_invite_acceptance'), /INSERT INTO public\.admin_users/u)
assert.match(migration, /AFTER UPDATE OF status ON public\.workspace_memberships\n  FOR EACH ROW\n  WHEN \(NEW\.status = 'active' AND OLD\.status IS DISTINCT FROM 'active'\)/u)

// Cancelling never tears down a workspace or its portal sessions.
const revoke = sqlFunction('revoke_platform_admin_invite_v1')
assert.ok(!/archived|client_portal_sessions|client_portal_tokens/u.test(revoke), 'cancelling a platform invite must not run private-workspace teardown')
assert.match(revoke, /platform_admin_invitations/u)

// Cancel never touches a membership that was ever accepted: its Auth cleanup
// would delete a removed member's real account.
assert.match(revoke, /IF membership\.accepted_at IS NOT NULL THEN/u)
// The acceptance grant fires on invited -> active only.
assert.match(hardening, /WHEN \(NEW\.status = 'active' AND OLD\.status = 'invited'\)/u)
// Removing returns the Auth user the edge deletes, and only after the SQL
// removal succeeded; a failed deletion is reported, not hidden.
assert.match(sqlFunction('remove_platform_team_member_v1'), /'user_id', membership\.user_id/u)
assert.match(edge, /sign_in_deleted: signInDeleted/u)

// Removal: never yourself, never the owner; revoking advances the epoch.
const remove = sqlFunction('remove_platform_team_member_v1')
assert.match(remove, /membership\.id = actor_membership\.id/u)
assert.match(remove, /membership\.role = 'owner'/u)
assert.match(remove, /DELETE FROM public\.admin_users/u)
assert.match(remove, /status = 'revoked'/u)

// The browser only talks to the function.
assert.match(service, /supabase\.functions\.invoke<T>\('manage-platform-team'/u)
assert.ok(!/from\(/u.test(service), 'the service must not query tables directly')

console.log('manage-platform-team edge contract passed')
