import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const edge = readFileSync('supabase/functions/workspace-client-campaigns/index.ts', 'utf8')
const provider = readFileSync('supabase/functions/_shared/instantly.ts', 'utf8')
const migration = readFileSync(
  'supabase/migrations/20260724000100_workspace_client_campaigns.sql',
  'utf8',
)
const config = readFileSync('supabase/config.toml', 'utf8')

assert.match(edge, /if \(req\.method === "OPTIONS"\) return optionsResponse\(req, METHODS\)/u)
assert.match(edge, /const context = await requireAuthenticatedUser\(req\)/u)
assert.match(edge, /const access = await requireWorkspaceFeatureAccess\(context, workspaceId\)/u)
assert.match(edge, /const CAMPAIGN_MANAGER_ROLES = new Set\(\["owner", "admin", "platform_admin"\]\)/u)
assert.match(edge, /function requireIntegrationOwner[\s\S]*?access\.role !== "owner"/u)
assert.match(edge, /action === "connect-instantly"[\s\S]*?requireIntegrationOwner\(access\)/u)
assert.match(edge, /action === "disconnect-instantly"[\s\S]*?requireIntegrationOwner\(access\)/u)
assert.match(edge, /action === "launch-pitch"[\s\S]*?requireCampaignManager\(access\)/u)
assert.match(edge, /action === "update-contact"[\s\S]*?requireCampaignManager\(access\)/u)
assert.match(edge, /\.from\("clients"\)[\s\S]*?\.eq\("id", clientId\)[\s\S]*?\.eq\("workspace_id", workspaceId\)/u)
assert.match(edge, /encryptInstantlyApiKey\(apiKey\)/u)
assert.match(edge, /api_key_ciphertext: encrypted\.ciphertext[\s\S]*?api_key_iv: encrypted\.iv[\s\S]*?api_key_last_four: apiKey\.slice\(-4\)/u)
assert.match(edge, /providerCampaignName[\s\S]*?GOAP-\$\{campaign\.id\}/u)
assert.match(edge, /verifyProviderReadAccess[\s\S]*?"\/campaigns"[\s\S]*?"\/leads\/list"/u)
assert.match(edge, /skip_if_in_workspace: false,[\s\S]*?skip_if_in_campaign: false,[\s\S]*?skip_if_in_list: false/u)
assert.match(edge, /CAMPAIGN_CONTACT_ALREADY_IN_OUTREACH/u)
assert.match(edge, /\.eq\("campaign_id", campaign\.id\)[\s\S]*?\.eq\("contact_email", target\.contact_email\)/u)
assert.match(edge, /provider_sync_state: "creating"[\s\S]*?\.in\("provider_sync_state", \["idle", "error"\]\)/u)
assert.match(edge, /provider_sync_state", "creating"[\s\S]*?\.lt\("provider_sync_started_at", staleBefore\)/u)
assert.doesNotMatch(edge, /subsequence|workspace[_ -]group/iu)

const connectionProjection = edge.match(/function connectionDto[\s\S]*?return \{([\s\S]*?)\n  \};\n\}/u)?.[1]
assert.ok(connectionProjection, 'the integration response must use an explicit DTO')
assert.match(connectionProjection, /api_key_last_four/u)
assert.doesNotMatch(connectionProjection, /api_key_ciphertext|api_key_iv/u)

assert.match(provider, /const INSTANTLY_API_ORIGIN = "https:\/\/api\.instantly\.ai"/u)
assert.match(provider, /const INSTANTLY_API_PREFIX = "\/api\/v2"/u)
assert.match(provider, /Deno\.env\.get\("INSTANTLY_CREDENTIAL_ENCRYPTION_KEY"\)/u)
assert.match(provider, /AES-GCM/u)
assert.match(provider, /Authorization: `Bearer \$\{apiKey\}`/u)
assert.match(provider, /path\.includes\(":\/\/"\)/u)
assert.match(provider, /"\/workspaces\/current"/u)
assert.match(provider, /"\/accounts"/u)

for (const table of [
  'workspace_instantly_integrations',
  'workspace_client_campaigns',
  'workspace_client_campaign_targets',
]) {
  assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'u'))
  assert.match(
    migration,
    new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`, 'u'),
  )
  assert.match(
    migration,
    new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE[\\s\\S]*?ON TABLE public\\.${table} TO service_role`, 'u'),
  )
}
assert.match(migration, /provider_workspace_id UUID NOT NULL UNIQUE/u)
assert.match(migration, /UNIQUE \(workspace_id, client_id\)/u)
assert.match(migration, /UNIQUE \(campaign_id, shortlist_podcast_id\)/u)
assert.match(migration, /FOREIGN KEY \(workspace_id, client_id, campaign_id\)[\s\S]*?REFERENCES public\.workspace_client_campaigns\(workspace_id, client_id, id\)/u)
assert.match(config, /\[functions\.workspace-client-campaigns\]\s+verify_jwt = true/u)

process.stdout.write('Workspace Client Campaign Edge contract checks passed\n')
