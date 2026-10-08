// Static contract checks for the self-serve client portal password reset.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/portal-password-reset/index.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260726000200_client_portal_password_reset.sql', 'utf8')
const configToml = readFileSync('supabase/config.toml', 'utf8')
const service = readFileSync('src/services/clientPortal.ts', 'utf8')
const appRoutes = readFileSync('src/App.tsx', 'utf8')

// Rate limiting happens before any account lookup.
assert.match(edge, /reserve_client_portal_reset_request_v1[\s\S]*?RESET_RATE_LIMITED[\s\S]*?\.from\('clients'\)/u)
// Anti-enumeration: the request action returns success whether or not a client matched.
assert.match(edge, /Identical response whether or not the email matched a portal account/u)
assert.match(edge, /return jsonResponse\(req, METHODS, 200, \{ success: true \}\)/u)
// Tokens are hashed before storage and redeemed by hash only.
assert.match(edge, /const tokenHash = await hashPortalSessionToken\(token\)/u)
assert.match(edge, /crypto\.randomUUID\(\)/u)
assert.doesNotMatch(edge, /token_hash:\s*token\b/u)
// The completion RPC never receives the raw password, only the PBKDF2 verifier.
assert.match(edge, /const passwordHash = await hashPortalPassword\(password\)/u)
assert.match(edge, /complete_client_portal_password_reset_v1[\s\S]*?p_password_hash: passwordHash/u)
// Generic failure copy for invalid/expired tokens.
assert.match(edge, /RESET_INVALID/u)

// Migration: sessions and tokens are revoked on reset, token burns after use.
assert.match(migration, /DELETE FROM public\.client_portal_sessions WHERE client_id = reset_client_id/u)
assert.match(migration, /DELETE FROM public\.client_portal_reset_tokens WHERE client_id = reset_client_id/u)
assert.match(migration, /credential_version = public\.client_portal_credentials\.credential_version \+ 1/u)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.complete_client_portal_password_reset_v1\(TEXT, TEXT, TEXT\) FROM PUBLIC, anon, authenticated/u)
assert.match(migration, /'client\.portal_password\.reset'/u)

// 20261008000100: a self-serve request adds a token and never overwrites a
// pending one (an anonymous caller could otherwise invalidate the victim's
// link); completion requires an active workspace; resets need 12 characters.
const hardening = readFileSync('supabase/migrations/20261008000100_tighten_grants_and_portal_auth.sql', 'utf8')
const requestBranch = edge.slice(edge.indexOf("if (action === 'request')"), edge.indexOf("if (action === 'complete')"))
assert.doesNotMatch(requestBranch, /\.upsert\(/u)
assert.doesNotMatch(requestBranch, /onConflict/u)
assert.match(requestBranch, /from\('client_portal_reset_tokens'\)\s*\.insert\(\{/u)
// Only expired tokens are cleaned up on request.
assert.match(requestBranch, /\.delete\(\)\s*\.eq\('client_id', client\.id\)\s*\.lte\('expires_at'/u)
assert.match(edge, /const MIN_RESET_PASSWORD_LENGTH = 12/u)
assert.match(edge, /value\.length < MIN_RESET_PASSWORD_LENGTH/u)
assert.match(hardening, /ADD CONSTRAINT client_portal_reset_tokens_pkey PRIMARY KEY \(id\)/u)
assert.match(hardening, /CREATE UNIQUE INDEX IF NOT EXISTS client_portal_reset_tokens_token_hash_uidx/u)
const hardenedComplete = hardening.slice(hardening.indexOf('CREATE OR REPLACE FUNCTION public.complete_client_portal_password_reset_v1'))
assert.match(
  hardenedComplete,
  /FROM public\.workspaces AS workspace\s+WHERE workspace\.id = target_workspace_id\s+AND workspace\.status = 'active'\s+FOR SHARE;[\s\S]*?FROM public\.clients AS client[\s\S]*?FOR UPDATE;/u,
)
assert.match(hardenedComplete, /DELETE FROM public\.client_portal_reset_tokens WHERE client_id = reset_client_id/u)
assert.match(hardenedComplete, /REVOKE ALL ON FUNCTION public\.complete_client_portal_password_reset_v1\(TEXT, TEXT, TEXT\) FROM PUBLIC, anon, authenticated/u)
const portalResetPage = readFileSync('src/pages/portal/ResetPassword.tsx', 'utf8')
assert.match(portalResetPage, /password\.length < 12/u)
assert.match(portalResetPage, /At least 12 characters/u)
assert.doesNotMatch(portalResetPage, /8 characters/u)

// Portal login lockout counts only unsuccessful attempts, per (email, IP)
// with a higher per-email ceiling, and a success clears the email's slate.
const reserveLogin = hardening.slice(
  hardening.indexOf('CREATE OR REPLACE FUNCTION public.reserve_client_portal_login_attempt'),
  hardening.indexOf('-- 5. Reset tokens'),
)
assert.match(reserveLogin, /portal-login-email:[\s\S]*?portal-login-ip:/u)
assert.match(reserveLogin, /action = 'password_login_success'/u)
assert.match(reserveLogin, /failure_window_start := GREATEST\(window_start, COALESCE\(last_success_at, window_start\)\)/u)
assert.match(reserveLogin, /recent_pair_failures >= 8\s+OR recent_email_failures >= 40\s+OR recent_ip_attempts >= 30/u)
assert.match(reserveLogin, /REVOKE ALL ON FUNCTION public\.reserve_client_portal_login_attempt\(TEXT, TEXT, TEXT\)\s+FROM PUBLIC, anon, authenticated/u)
const loginEdge = readFileSync('supabase/functions/login-with-password/index.ts', 'utf8')
assert.match(loginEdge, /reserve_client_portal_login_attempt[\s\S]*?\.from\('clients'\)[\s\S]*?issue_client_portal_password_session/u)

// Owner-issued invites and setup links replace every pending token rather
// than relying on the old one-row-per-client upsert.
const manageEdgeForTokens = readFileSync('supabase/functions/manage-client-portal-password/index.ts', 'utf8')
assert.doesNotMatch(manageEdgeForTokens, /client_portal_reset_tokens'\)\s*\.upsert/u)
assert.equal(
  (manageEdgeForTokens.match(/from\('client_portal_reset_tokens'\)\s*\.delete\(\)\s*\.eq\('client_id', clientId\)/gu) ?? []).length,
  2,
)

// Public function is explicitly configured and routed.
assert.match(configToml, /\[functions\.portal-password-reset\]\nverify_jwt = false/u)
assert.match(service, /'portal-password-reset'/u)
assert.match(appRoutes, /path="\/portal\/forgot"/u)
assert.match(appRoutes, /path="\/portal\/reset"/u)
assert.match(appRoutes, /path="\/reset-password"/u)

// Portal invitation action (manage-client-portal-password): tenant-only,
// owner-gated, hashed 7-day token, delivery status returned, never the token.
const manageEdge = readFileSync('supabase/functions/manage-client-portal-password/index.ts', 'utf8')
assert.match(manageEdge, /const INVITE_TOKEN_TTL_DAYS = 7/u)
assert.match(manageEdge, /if \(action === 'invite'\)[\s\S]*?requireOnlyKeys\(body, \['action', 'workspace_id', 'client_id'\]\)/u)
assert.match(manageEdge, /PASSWORD_MANAGER_ROLES\.has\(access\.role\)/u)
assert.match(manageEdge, /const tokenHash = await hashPortalSessionToken\(token\)/u)
assert.match(manageEdge, /client_portal_reset_tokens[\s\S]*?token_hash: tokenHash/u)
assert.match(manageEdge, /delivery: \{ status: delivery\.status \}/u)
// Scoped to the invite action: 'setup-link' and 'preview-session' return a
// capability URL and an audited preview session on purpose, so a file-wide
// ban would forbid the features rather than the leak it is guarding against.
const inviteBranchStart = manageEdge.indexOf("if (action === 'invite')")
const inviteBranchEnd = manageEdge.indexOf("if (action === 'setup-link')")
assert.ok(inviteBranchStart > 0 && inviteBranchEnd > inviteBranchStart, 'invite branch markers missing')
assert.doesNotMatch(
  manageEdge.slice(inviteBranchStart, inviteBranchEnd),
  /jsonResponse\([^)]*token[^_]/u,
)
// The invite action is unreachable from the legacy platform-admin branch.
const legacyBranchStart = manageEdge.indexOf('Compatibility path for the legacy platform-only client screen')
assert.ok(legacyBranchStart > 0, 'legacy branch marker missing')
assert.doesNotMatch(manageEdge.slice(legacyBranchStart), /action === 'invite'/u)

console.log('Portal password reset edge contract passed')
