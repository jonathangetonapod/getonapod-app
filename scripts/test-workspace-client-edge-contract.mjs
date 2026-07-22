import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-clients/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260722000100_subagency_workspace_foundation.sql',
  'utf8',
)

assert.match(edge, /if \(req\.method === 'OPTIONS'\) return optionsResponse\(req, METHODS\)/u)
assert.match(edge, /return errorResponse\(req, METHODS, error\)/u)
assert.match(edge, /const authContext = await requireAuthenticatedUser\(req\)/u)
assert.match(edge, /if \(!workspaceCredentialIsFresh\(authContext\)\)/u)
assert.match(edge, /const workspaceId = requireUuid\(body\.workspace_id, 'workspace_id'\)/u)
assert.match(edge, /admin\.rpc\('workspace_client_operation_v2', \{[\s\S]*?p_action: action,[\s\S]*?p_workspace_id: workspaceId,[\s\S]*?p_client_id: clientId,[\s\S]*?p_payload: payload,[\s\S]*?p_actor_user_id: user\.id,[\s\S]*?p_token_issued_at: tokenIssuedAt/u)
assert.match(edge, /message\.includes\('active workspace staff'\)/u)
assert.match(edge, /message\.includes\('active selected workspace'\)/u)
assert.doesNotMatch(edge, /PREVIEW_READ_ONLY|preview is read-only/u)
assert.match(config, /\[functions\.workspace-clients\]\s+verify_jwt = true/u)

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.workspace_client_operation_v2\([\s\S]*?p_token_issued_at BIGINT[\s\S]*?\)\s+RETURNS JSONB/u)
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.workspace_client_operation\([\s\S]*?actor_is_authorized := public\.is_platform_admin_identity\([\s\S]*?p_actor_user_id,[\s\S]*?actor_email[\s\S]*?\);[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?NOT workspace\.is_default/u)
assert.match(migration, /IF public\.is_platform_admin_identity\(p_actor_user_id, actor_email\) THEN[\s\S]*?actor_role := public\.workspace_staff_actor_role_v1\([\s\S]*?p_token_issued_at,[\s\S]*?true[\s\S]*?\);[\s\S]*?ELSE/u)
assert.doesNotMatch(migration, /platform administrator preview is read-only/u)
assert.match(migration, /ELSE[\s\S]*?membership\.workspace_id = p_workspace_id[\s\S]*?membership\.user_id = p_actor_user_id[\s\S]*?p_token_issued_at >= membership\.workspace_access_not_before_epoch[\s\S]*?p_token_issued_at >= workspace\.access_not_before_epoch/u)
assert.match(migration, /IF normalized_action <> 'list' AND actor_role = 'member' THEN[\s\S]*?active workspace manager access is required/u)
assert.match(migration, /'workspace\.client\.(?:created|updated|deleted)'[\s\S]*?'client'[\s\S]*?p_actor_user_id/u)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.workspace_client_operation_v2\([\s\S]*?TEXT, UUID, UUID, JSONB, UUID, BIGINT[\s\S]*?\) FROM PUBLIC, anon, authenticated;/u)
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.workspace_client_operation_v2\([\s\S]*?TEXT, UUID, UUID, JSONB, UUID, BIGINT[\s\S]*?\) TO service_role;/u)

process.stdout.write('Workspace Client Edge contract checks passed\n')
