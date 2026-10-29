import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const read = (path) => readFileSync(path, 'utf8')
const ai = read('supabase/functions/_shared/textAi.ts')
const keys = read('supabase/functions/_shared/workspaceAiKeys.ts')
const preference = keys.slice(keys.indexOf('export async function workspaceTextAiPreference('))
const resolver = keys.slice(keys.indexOf('export async function resolveTextAiKey('), keys.indexOf('export async function setWorkspaceTextAiProvider('))

// Provider choice and encrypted key reads are bounded to the same agency.
assert.match(preference, /from\('workspaces'\)\.select\('default_ai_provider'\)\.eq\('id', workspaceId\)/u)
assert.match(resolver, /await requireWorkspaceSubscription\(admin, workspaceId\)/u)
assert.match(resolver, /await workspaceTextAiPreference\(admin, workspaceId\)/u)
assert.match(resolver, /preferred \? \[preferred\] : \['anthropic', 'openai'\]/u)
assert.match(resolver, /readStoredAiKey\(admin, workspaceId, provider\)/u)
assert.match(resolver, /source: 'workspace', provider/u)
assert.doesNotMatch(resolver, /Deno\.env|platformTextAiKey|PLATFORM_ENV/u)
assert.match(keys, /\.eq\('workspace_id', workspaceId\)\s*\.eq\('provider', provider\)\s*\.maybeSingle\(\)/u)

// All prior Claude generators share one transport. Any reintroduced direct
// Messages call would bypass the agency's alternative provider.
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') && !path.includes('.test.') ? [path] : []
  })
}
for (const path of sourceFiles('supabase/functions')) {
  if (path === 'supabase/functions/_shared/textAi.ts') continue
  assert.doesNotMatch(read(path), /https:\/\/api\.anthropic\.com\/v1\/messages|new Anthropic\s*\(/u, `${path} bypasses the text AI transport`)
}
for (const path of [
  'workspace-client-shortlist/index.ts', 'workspace-clients/index.ts',
  'workspace-onboarding/index.ts', 'workspace-prospect-dashboards/index.ts',
  'client-autopilot-tick/index.ts', 'score-podcast-compatibility/index.ts',
  'generate-podcast-queries/index.ts', '_shared/inboxSdr.ts',
]) {
  assert.match(read(`supabase/functions/${path}`), /await resolveTextAiKey\(/u, `${path} must choose the agency's provider`)
}
assert.match(ai, /https:\/\/api\.openai\.com\/v1\/responses/u)
assert.match(ai, /store: false/u)
assert.match(ai, /'x-api-key': apiKey/u)
assert.match(ai, /Authorization: `Bearer \$\{apiKey\}`/u)
assert.match(ai, /web_search_call\.action\.sources/u)

// Search embeddings remain platform infrastructure, independent of the
// customer's text model choice. An OpenAI text key cannot accidentally
// become the platform's embedding or Podscan credential.
for (const path of ['workspace-podcast-catalog/index.ts', 'workspace-client-shortlist/index.ts', 'workspace-prospect-dashboards/index.ts']) {
  assert.match(read(`supabase/functions/${path}`), /resolveAiKey\([^\n]+, 'openai'\)/u)
}
const infrastructureResolver = keys.slice(keys.indexOf('export async function resolveAiKey('), keys.indexOf('export type AiKeyProbeResult'))
assert.match(infrastructureResolver, /const platformKey = Deno\.env\.get\(PLATFORM_ENV\[provider\]\)/u)
assert.match(infrastructureResolver, /source: 'platform'/u)
for (const path of ['podscan-proxy/index.ts', 'client-autopilot-tick/index.ts', 'workspace-client-shortlist/index.ts']) {
  const source = read(`supabase/functions/${path}`)
  assert.match(source, /resolveAiKey\([^\n]+, 'podscan'\)/u)
  assert.doesNotMatch(source, /readStoredAiKey\([^\n]+, 'podscan'\)/u)
}

// Agency owners still connect their own Instantly workspace; the AI selector
// must not silently turn sending into a shared platform connection.
const campaigns = read('supabase/functions/workspace-client-campaigns/index.ts')
assert.match(campaigns, /const INTEGRATION_MANAGER_ROLES = new Set\(\["owner", "platform_admin"\]\)/u)
assert.match(campaigns, /if \(action === "connect-instantly"\) \{\s*requireOnlyKeys\(body, \["action", "workspace_id", "api_key"\]\);\s*requireIntegrationOwner\(access\);/u)
assert.match(campaigns, /can_manage: INTEGRATION_MANAGER_ROLES\.has\(access\.role\)/u)

// The new non-secret preference inherits existing tenant SELECT isolation and
// service-role-only mutation. Migration changes no credentials or policies.
const migration = read('supabase/migrations/20261031001400_workspace_text_ai_provider.sql')
assert.match(migration, /ADD COLUMN IF NOT EXISTS default_ai_provider TEXT\s*CHECK \(default_ai_provider IN \('anthropic', 'openai'\)\)/u)
assert.match(migration, /openai_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK \(openai_input_tokens >= 0\)/u)
assert.match(migration, /openai_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK \(openai_output_tokens >= 0\)/u)
assert.doesNotMatch(migration, /GRANT|DROP POLICY|DISABLE ROW LEVEL SECURITY|DELETE FROM|UPDATE public\.workspace_ai_credentials/iu)
const grants = read('supabase/migrations/20260720000200_invite_only_workspace_rls.sql')
assert.match(grants, /REVOKE ALL PRIVILEGES ON TABLE public\.workspaces FROM anon, authenticated/u)
assert.match(grants, /GRANT SELECT ON TABLE public\.workspaces TO authenticated/u)
assert.match(grants, /GRANT ALL PRIVILEGES ON TABLE public\.workspaces TO service_role/u)

console.log('Text AI provider integration and credential boundary contracts passed')
