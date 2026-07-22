import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const portal = readFileSync('supabase/functions/get-guest-resources/index.ts', 'utf8')
const management = readFileSync('supabase/functions/workspace-guest-resources/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260722000100_subagency_workspace_foundation.sql',
  'utf8',
)

for (const [name, source] of [
  ['get-guest-resources', portal],
  ['workspace-guest-resources', management],
]) {
  assert.match(source, /if \(req\.method === "OPTIONS"\) return optionsResponse\(req, METHODS\)/u, `${name} must use shared CORS preflight handling`)
  assert.match(source, /return errorResponse\(req, METHODS, error\)/u, `${name} must use shared no-store/CORS error handling`)
  assert.match(source, /requireOnlyKeys\(/u, `${name} must reject unknown request fields`)
}

assert.match(portal, /let sessionTokenHash: string \| null = null/u)
assert.match(portal, /sessionTokenHash = await hashPortalSessionToken\(sessionToken\)/u)
assert.match(portal, /\.eq\("session_token", sessionTokenHash\)[\s\S]*?\.eq\("client_id", clientId\)/u)
assert.match(portal, /\.gt\("expires_at", new Date\(\)\.toISOString\(\)\)/u, 'portal sessions must be unexpired')
assert.match(portal, /!client\?\.portal_access_enabled/u, 'portal access must remain explicitly enabled')
assert.match(portal, /client\.workspace\?\.status !== "active"/u, 'portal resources require an active workspace')
assert.match(portal, /else \{[\s\S]*?const authContext = await requirePlatformAdmin\(req\)/u)
assert.match(portal, /const authContext = await requirePlatformAdmin\(req\);[\s\S]*?if \(!workspaceCredentialIsFresh\(authContext\)\)/u, 'operator impersonation must reject stale provisioned-account credentials')
assert.match(portal, /p_client_id: clientId,[\s\S]*?p_session_token_hash: sessionTokenHash/u)
assert.match(portal, /"portal_guest_resources_for_client_v1"/u)
assert.doesNotMatch(portal, /session_token:\s*sessionToken/u, 'portal responses must never echo the bearer')

const portalProjection = portal.match(/function portalResourceDto[\s\S]*?return \{([\s\S]*?)\n  \};\n\}/u)?.[1]
assert.ok(portalProjection, 'portal DTO projection must remain explicit')
for (const key of [
  'id',
  'title',
  'description',
  'content',
  'category',
  'type',
  'url',
  'file_url',
  'featured',
  'display_order',
  'published_at',
  'updated_at',
]) {
  assert.match(portalProjection, new RegExp(`\\b${key}\\b`, 'u'), `portal DTO must include ${key}`)
}
for (const forbidden of [
  'workspace_id',
  'status',
  'visibility',
  'client_ids',
  'source_template_id',
  'created_by',
  'updated_by',
]) {
  assert.doesNotMatch(portalProjection, new RegExp(`\\b${forbidden}\\b`, 'u'), `portal DTO must exclude ${forbidden}`)
}

assert.match(management, /const authContext = await requireAuthenticatedUser\(req\)/u)
assert.match(management, /if \(!workspaceCredentialIsFresh\(authContext\)\)/u)
assert.match(management, /"workspace_guest_resource_operation_v1"/u)
assert.match(management, /p_workspace_id: workspaceId,[\s\S]*?p_actor_user_id: user\.id,[\s\S]*?p_token_issued_at: tokenIssuedAt/u)
assert.match(management, /data === null \? null : resourceDto\(data\)/u, 'delete must accept the RPC JSON null result without parsing another row')
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.platform_workspace_guest_resource_mutation_v1\([\s\S]*?actor_role := public\.workspace_staff_actor_role_v1\([\s\S]*?IF actor_role <> 'platform_admin'/u)
assert.match(migration, /IF public\.is_platform_admin_identity\(p_actor_user_id, actor_email\) THEN[\s\S]*?IF normalized_action = 'list' THEN[\s\S]*?workspace_guest_resource_operation_manager_v1[\s\S]*?platform_workspace_guest_resource_mutation_v1/u)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.platform_workspace_guest_resource_mutation_v1\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role/u)
assert.match(management, /optionalCanonicalGuestResourceContent\(input\.content\)/u, 'workspace writes must reject non-canonical resource content at the Edge boundary')
assert.match(management, /title: requireResourceText\(input\.title, "title", 200\)/u, 'workspace title input must use the Unicode code-point contract')
assert.match(management, /description: requireResourceText\(input\.description, "description", 2_000\)/u, 'workspace description input must use the Unicode code-point contract')
assert.match(management, /isCanonicalGuestResourceContent\(row\.content\)/u, 'workspace responses must reject non-canonical resource content')
assert.match(portal, /isCanonicalGuestResourceContent\(row\.content\)/u, 'portal responses must reject non-canonical resource content')
assert.match(management, /type === "article"[\s\S]*?!hasMeaningfulGuestResourceContent\(content\)/u, 'published workspace articles must contain visible text')
assert.match(portal, /type === "article" && !hasMeaningfulGuestResourceContent\(content\)/u, 'portal articles must contain visible text')
assert.match(portal, /result\.total > 1_000/u, 'portal responses must honor the catalog quota')
assert.match(portal, /offset \+ result\.resources\.length > result\.total/u, 'portal page bounds must be fail-closed')
assert.match(portal, /result\.resources\.length > 0 &&[\s\S]*?offset \+ result\.resources\.length > result\.total/u, 'an empty page beyond the end of the catalog must remain a valid pagination response')

assert.match(config, /\[functions\.get-guest-resources\]\s+verify_jwt = false/u)
assert.match(config, /\[functions\.workspace-guest-resources\]\s+verify_jwt = true/u)

process.stdout.write('Guest Resource Edge contract checks passed\n')
