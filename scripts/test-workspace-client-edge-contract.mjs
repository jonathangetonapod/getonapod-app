import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-clients/index.ts', 'utf8')
const exportEdge = readFileSync('supabase/functions/export-to-google-sheets/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260722000100_subagency_workspace_foundation.sql',
  'utf8',
)
const forwardMigration = readFileSync(
  'supabase/migrations/20260722000200_platform_owner_workspace_management.sql',
  'utf8',
)

assert.match(edge, /if \(req\.method === 'OPTIONS'\) return optionsResponse\(req, METHODS\)/u)
assert.match(edge, /return errorResponse\(req, METHODS, error\)/u)
assert.match(edge, /const authContext = await requireAuthenticatedUser\(req\)/u)
assert.match(edge, /if \(!workspaceCredentialIsFresh\(authContext\)\)/u)
assert.match(edge, /const workspaceId = requireUuid\(body\.workspace_id, 'workspace_id'\)/u)
assert.match(edge, /if \(action === 'research-get' \|\| action === 'detail-get'\)[\s\S]*?clientId = requireUuid\(body\.client_id, 'client_id'\)/u)
assert.match(edge, /if \(action === 'detail-get'\)[\s\S]*?await requireWorkspaceFeatureAccess\(authContext, workspaceId\)/u)
assert.match(edge, /\.from\('clients'\)[\s\S]*?\.eq\('id', clientId!\)[\s\S]*?\.eq\('workspace_id', workspaceId\)/u)
assert.match(edge, /\.from\('bookings'\)[\s\S]*?\.eq\('client_id', clientId!\)[\s\S]*?\.limit\(500\)/u)
assert.match(edge, /\.from\('workspace_onboarding_instances'\)[\s\S]*?\.eq\('workspace_id', workspaceId\)[\s\S]*?\.eq\('client_id', clientId!\)/u)
assert.match(edge, /\.from\('client_dashboard_podcasts'\)[\s\S]*?\.eq\('client_id', clientId!\)[\s\S]*?\.limit\(500\)/u)
assert.match(edge, /\.from\('client_podcast_feedback'\)[\s\S]*?\.eq\('client_id', clientId!\)[\s\S]*?\.limit\(500\)/u)
assert.match(edge, /viewer_role: access\.role,[\s\S]*?can_manage: \['owner', 'admin', 'platform_admin'\]\.includes\(access\.role\),[\s\S]*?dashboard: \{[\s\S]*?podcast_count: dashboardPodcasts\.length,[\s\S]*?reviewed_count: reviewedCount,[\s\S]*?bookings: bookingsResult\.data \|\| \[\],[\s\S]*?onboarding: access\.role === 'member' \? null : onboardingResult\.data \|\| null/u)
assert.doesNotMatch(edge, /portal_password/u)
assert.match(edge, /const historyTables = \[[\s\S]*?'client_dashboard_podcasts',[\s\S]*?'client_podcast_feedback',[\s\S]*?'podcast_outreach_actions',[\s\S]*?'bookings'/u)
assert.match(edge, /\.range\(offset, offset \+ pageSize - 1\)/u)
assert.match(edge, /existing_podcast_ids: existingPodcastIds/u)
assert.match(edge, /admin\.rpc\('workspace_client_operation_v2', \{[\s\S]*?p_action: action,[\s\S]*?p_workspace_id: workspaceId,[\s\S]*?p_client_id: clientId,[\s\S]*?p_payload: payload,[\s\S]*?p_actor_user_id: user\.id,[\s\S]*?p_token_issued_at: tokenIssuedAt/u)
assert.match(edge, /message\.includes\('active workspace staff'\)/u)
assert.match(edge, /message\.includes\('active selected workspace'\)/u)
assert.doesNotMatch(edge, /PREVIEW_READ_ONLY|preview is read-only/u)
assert.match(config, /\[functions\.workspace-clients\]\s+verify_jwt = true/u)

assert.match(exportEdge, /await requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(exportEdge, /fields=sheets\.properties/u)
assert.match(exportEdge, /const quotedFirstSheetName = `'/u)
assert.match(exportEdge, /const existingIdsRange = encodeURIComponent\(`\$\{quotedFirstSheetName\}!E2:E`\)/u)
assert.match(exportEdge, /partitionPodcastExports\(podcasts, existingPodcastIds\)/u)
assert.match(exportEdge, /const rows = newPodcasts\.map/u)
assert.match(exportEdge, /from\('client_dashboard_podcasts'\)[\s\S]*?onConflict: 'client_id,podcast_id'/u)
assert.match(exportEdge, /duplicatesSkipped: podcasts\.length - newPodcasts\.length/u)

assert.match(migration, /CREATE OR REPLACE FUNCTION public\.workspace_client_operation_v2\([\s\S]*?p_token_issued_at BIGINT[\s\S]*?\)\s+RETURNS JSONB/u)
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.workspace_client_operation\([\s\S]*?actor_is_authorized := public\.is_platform_admin_identity\([\s\S]*?p_actor_user_id,[\s\S]*?actor_email[\s\S]*?\);[\s\S]*?workspace\.id = p_workspace_id[\s\S]*?NOT workspace\.is_default/u)
assert.match(migration, /IF public\.is_platform_admin_identity\(p_actor_user_id, actor_email\) THEN[\s\S]*?actor_role := public\.workspace_staff_actor_role_v1\([\s\S]*?p_token_issued_at,[\s\S]*?true[\s\S]*?\);[\s\S]*?ELSE/u)
assert.doesNotMatch(migration, /platform administrator preview is read-only/u)
assert.match(migration, /ELSE[\s\S]*?membership\.workspace_id = p_workspace_id[\s\S]*?membership\.user_id = p_actor_user_id[\s\S]*?p_token_issued_at >= membership\.workspace_access_not_before_epoch[\s\S]*?p_token_issued_at >= workspace\.access_not_before_epoch/u)
assert.match(migration, /IF normalized_action <> 'list' AND actor_role = 'member' THEN[\s\S]*?active workspace manager access is required/u)
assert.match(migration, /'workspace\.client\.(?:created|updated|deleted)'[\s\S]*?'client'[\s\S]*?p_actor_user_id/u)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.workspace_client_operation_v2\([\s\S]*?TEXT, UUID, UUID, JSONB, UUID, BIGINT[\s\S]*?\) FROM PUBLIC, anon, authenticated;/u)
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.workspace_client_operation_v2\([\s\S]*?TEXT, UUID, UUID, JSONB, UUID, BIGINT[\s\S]*?\) TO service_role;/u)
assert.match(forwardMigration, /CREATE OR REPLACE FUNCTION public\.workspace_client_operation\([\s\S]*?actor_is_authorized := public\.is_platform_admin_identity/u)
assert.match(forwardMigration, /CREATE OR REPLACE FUNCTION public\.workspace_client_operation_v2\([\s\S]*?IF public\.is_platform_admin_identity\(p_actor_user_id, actor_email\) THEN[\s\S]*?p_token_issued_at,[\s\S]*?true/u)
assert.doesNotMatch(forwardMigration, /platform administrator preview is read-only/u)

process.stdout.write('Workspace Client Edge contract checks passed\n')
