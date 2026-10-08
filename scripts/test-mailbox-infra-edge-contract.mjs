import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-mailbox-infra/index.ts', 'utf8')

// Auth: manager-gated workspace access with fresh credentials.
assert.match(edge, /const authContext = await requireAuthenticatedUser\(req\)/u)
assert.match(edge, /if \(!workspaceCredentialIsFresh\(authContext\)\)/u)
assert.match(edge, /const access = await requireWorkspaceFeatureAccess\(authContext, workspaceId\)[\s\S]*?requireManager\(access\)/u)

// Winnr access: workspace BYO key first, platform env fallback — resolved
// server-side, never from the request. BYO orders skip platform credits.
assert.match(edge, /resolveAiKey\(authContext\.admin, workspaceId, 'winnr'\)/u)
assert.match(edge, /const usingWorkspaceKey = winnrKey\.source === 'workspace'/u)
assert.match(edge, /byoKeyUsed: usingWorkspaceKey/u)
assert.doesNotMatch(edge, /body\.(?:token|api_key|winnr)/u)

// Ordering safety: credits are charged with idempotency keys BEFORE the
// provider purchase, and every purchased domain carries the workspace tag.
assert.match(edge, /idempotencyKey: `mailbox-domain:\$\{workspaceId\}:\$\{order\.domain\}`[\s\S]*?idempotencyKey: `mailbox-monthly:\$\{workspaceId\}:[\s\S]*?winnrRequest[\s\S]*?'\/domains\/purchase'/u)
assert.match(edge, /tags: \[workspaceTag\(workspaceId\)\]/u)
assert.match(edge, /async: true/u)

// Order limits and validation.
assert.match(edge, /MAX_ORDER_DOMAINS = 3/u)
assert.match(edge, /MAX_MAILBOXES_PER_DOMAIN = 3/u)
assert.match(edge, /USERNAME_PATTERN/u)

// Overview and export only ever see workspace-tagged domains.
assert.match(edge, /function workspaceTag\(workspaceId: string\): string \{\s*return `workspace:\$\{workspaceId\}`/u)
assert.match(edge, /listWorkspaceDomains\(winnrKey\.apiKey, workspaceId, !usingWorkspaceKey\)/u)
assert.match(edge, /format: 'instantly'/u)

// Release ritual: config, manifest, migration all present.
const config = readFileSync('supabase/config.toml', 'utf8')
assert.match(config, /\[functions\.workspace-mailbox-infra\]\nverify_jwt = true/u)
const manifest = JSON.parse(readFileSync('docs/invite-only-edge-manifest.json', 'utf8'))
assert.ok(manifest.phases['3_after_migrations_and_verifier'].includes('workspace-mailbox-infra'))
const migration = readFileSync('supabase/migrations/20260726000800_mailbox_infra.sql', 'utf8')
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.workspace_mailbox_orders/u)
assert.match(migration, /'mailbox_domain_purchase', 'mailbox_monthly', 'other'/u)
assert.match(migration, /ENABLE ROW LEVEL SECURITY/u)

// 20261008000100: orders are written only by the edge function on the
// service role, so browser roles hold no table privileges at all.
const grantHardening = readFileSync('supabase/migrations/20261008000100_tighten_grants_and_portal_auth.sql', 'utf8')
assert.match(grantHardening, /REVOKE ALL PRIVILEGES ON TABLE public\.workspace_mailbox_orders FROM PUBLIC, anon, authenticated;/u)
assert.match(grantHardening, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.workspace_mailbox_orders TO service_role;/u)
const mailboxEdgeSource = readFileSync('supabase/functions/workspace-mailbox-infra/index.ts', 'utf8')
for (const call of mailboxEdgeSource.matchAll(/(\w+(?:\.\w+)?)\s*\.from\('workspace_mailbox_orders'\)/gu)) {
  assert.equal(call[1], 'authContext.admin', 'workspace_mailbox_orders must be accessed with the service-role client')
}

process.stdout.write('Mailbox infra edge contract checks passed\n')
