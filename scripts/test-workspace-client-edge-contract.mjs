import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-clients/index.ts', 'utf8')
const exportEdge = readFileSync('supabase/functions/export-to-google-sheets/index.ts', 'utf8')
const shortlistEdge = readFileSync('supabase/functions/workspace-client-shortlist/index.ts', 'utf8')
const publicDashboardEdge = readFileSync('supabase/functions/public-client-dashboard/index.ts', 'utf8')
const clientPodcastsEdge = readFileSync('supabase/functions/get-client-podcasts/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260722000100_subagency_workspace_foundation.sql',
  'utf8',
)
const forwardMigration = readFileSync(
  'supabase/migrations/20260722000200_platform_owner_workspace_management.sql',
  'utf8',
)
const shortlistMigration = readFileSync(
  'supabase/migrations/20260723000400_client_shortlist_editor.sql',
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
assert.match(edge, /\.from\('client_dashboard_podcasts'\)[\s\S]*?\.eq\('client_id', clientId!\)[\s\S]*?\.limit\(1_000\)/u)
assert.match(edge, /\.from\('client_podcast_feedback'\)[\s\S]*?\.eq\('client_id', clientId!\)[\s\S]*?\.limit\(1_000\)/u)
assert.match(edge, /\.from\('outreach_messages'\)[\s\S]*?\.eq\('client_id', clientId!\)[\s\S]*?\.limit\(5_000\)/u)
assert.match(edge, /viewer_role: access\.role,[\s\S]*?can_manage: \['owner', 'admin', 'platform_admin'\]\.includes\(access\.role\),[\s\S]*?dashboard: \{[\s\S]*?podcast_count: dashboardPodcasts\.length,[\s\S]*?reviewed_count: reviewedCount,[\s\S]*?outreach: \{[\s\S]*?initial_emails_sent: sentOutreach\.length,[\s\S]*?podcasts_contacted: contactedPodcastKeys\.size,[\s\S]*?bookings: bookingsResult\.data \|\| \[\],[\s\S]*?onboarding: access\.role === 'member' \? null : onboardingResult\.data \|\| null/u)
assert.doesNotMatch(edge, /portal_password/u)
assert.match(edge, /const historyTables = \[[\s\S]*?'client_dashboard_podcasts',[\s\S]*?'client_podcast_feedback',[\s\S]*?'podcast_outreach_actions',[\s\S]*?'bookings'/u)
assert.match(edge, /\.range\(offset, offset \+ pageSize - 1\)/u)
assert.match(edge, /existing_podcast_ids: existingPodcastIds/u)
assert.match(edge, /admin\.rpc\('workspace_client_operation_v2', \{[\s\S]*?p_action: action,[\s\S]*?p_workspace_id: workspaceId,[\s\S]*?p_client_id: clientId,[\s\S]*?p_payload: payload,[\s\S]*?p_actor_user_id: user\.id,[\s\S]*?p_token_issued_at: tokenIssuedAt/u)
assert.match(edge, /message\.includes\('active workspace staff'\)/u)
assert.match(edge, /message\.includes\('active selected workspace'\)/u)
assert.doesNotMatch(edge, /PREVIEW_READ_ONLY|preview is read-only/u)
assert.match(config, /\[functions\.workspace-clients\]\s+verify_jwt = true/u)
assert.doesNotMatch(edge, /\.select\([^\n]*google_sheet_url/u)

assert.match(shortlistEdge, /const authContext = await requireAuthenticatedUser\(req\)/u)
assert.match(shortlistEdge, /if \(!workspaceCredentialIsFresh\(authContext\)\)/u)
assert.match(shortlistEdge, /const access = await requireWorkspaceFeatureAccess\(authContext, workspaceId\)[\s\S]*?requireManager\(access\)/u)
assert.match(shortlistEdge, /\.from\('clients'\)[\s\S]*?\.eq\('id', clientId\)[\s\S]*?\.eq\('workspace_id', workspaceId\)/u)
assert.match(shortlistEdge, /if \(action === 'list'\)[\s\S]*?if \(action === 'catalog-search'\)[\s\S]*?if \(action === 'add'\)[\s\S]*?if \(action === 'update'\)[\s\S]*?if \(action === 'reorder-featured'\)/u)
assert.match(shortlistEdge, /archived_at = visibility === 'archived'[\s\S]*?archived_by = visibility === 'archived'/u)
assert.doesNotMatch(shortlistEdge, /\.from\('client_dashboard_podcasts'\)\.delete\(/u)
assert.match(shortlistEdge, /podscan_email/u)
assert.match(shortlistEdge, /rpc\('reorder_client_shortlist_featured_v1'/u)
assert.match(config, /\[functions\.workspace-client-shortlist\]\s+verify_jwt = true/u)

assert.match(shortlistMigration, /ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'visible'/u)
assert.match(shortlistMigration, /CHECK \(visibility IN \('visible', 'hidden', 'archived'\)\)/u)
assert.match(shortlistMigration, /CREATE OR REPLACE FUNCTION public\.reorder_client_shortlist_featured_v1/u)
assert.match(shortlistMigration, /SECURITY DEFINER[\s\S]*?SET search_path = public, pg_temp/u)
assert.match(shortlistMigration, /REVOKE ALL ON FUNCTION public\.reorder_client_shortlist_featured_v1\(UUID, TEXT\[\]\)[\s\S]*?FROM PUBLIC, anon, authenticated/u)
assert.match(shortlistMigration, /GRANT EXECUTE ON FUNCTION public\.reorder_client_shortlist_featured_v1\(UUID, TEXT\[\]\)[\s\S]*?TO service_role/u)

assert.match(clientPodcastsEdge, /DATABASE PATH - querying the curated client list/u)
assert.match(clientPodcastsEdge, /\.eq\('visibility', 'visible'\)[\s\S]*?\.order\('is_featured'/u)
assert.doesNotMatch(clientPodcastsEdge, /select\('id,name,bio,google_sheet_url/u)
assert.doesNotMatch(clientPodcastsEdge, /\.from\('client_dashboard_podcasts'\)[\s\S]*?\.delete\(\)/u)
assert.match(publicDashboardEdge, /\.eq\('visibility', 'visible'\)/u)

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
