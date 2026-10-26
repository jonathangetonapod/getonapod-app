// Static checks for what an agency's own clients and prospects see, and for
// the public-surface hardening that ships with it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

// Portal sign-in: neutral without a known agency, never the platform's name,
// homepage, inbox or copyright; the agency is remembered apart from the session.
const login = read('src/pages/portal/Login.tsx')
assert.doesNotMatch(login, /Get On A Pod|getonapod\.com|to="\/"/u)
assert.match(login, /Contact the team that invited you/u)
assert.match(login, /whiteLabel\s+brandName=\{agencyName \|\| 'Client portal'\}/u)
const brandMemory = read('src/components/portal/portalBrandMemory.ts')
assert.match(brandMemory, /const STORAGE_KEY = 'client_portal_brand'/u)
assert.doesNotMatch(brandMemory, /session_token/u)
assert.match(read('src/components/ClientProtectedRoute.tsx'), /<Navigate to=\{portalLoginPath\(\)\}/u)
assert.match(read('src/components/portal/PortalLayout.tsx'), /navigate\(portalLoginPath\(\)\)/u)

// A dead client-facing link offers no marketing doors.
const notFound = read('src/pages/NotFound.tsx')
assert.match(notFound, /\/\^\\\/\(\?:portal\|client\|prospect\|onboarding\)/u)
assert.match(notFound, /This link is not valid\./u)

// The production shell drops the marketing head off every non-marketing route.
const server = read('scripts/serve-production.mjs')
// Indexable marketing pages keep the Organization block; every other route
// gets the neutral shell.
assert.match(server, /pathname !== '\/'\) \{\s*\/\/[^\n]*\n\s*const source = await readFile[\s\S]*?INDEXABLE_ROUTE_PATTERN\.test\(pathname\)\s*\? marketingPageShell\(source\)\s*: neutralApplicationShell\(source, pathname\)/u)

// Client-facing emails speak in the workspace's name: every one passes the
// workspace as the sender, and the workflow signs it as the agency.
for (const file of ['_shared/portalResetEmail.ts', '_shared/clientNotify.ts', '_shared/workspaceOnboarding.ts']) {
  assert.match(read(`supabase/functions/${file}`), /senderName: (?:input\.workspaceName|recipient\.workspaceName|input\.workspaceName,)/u, `${file} must send under the workspace's name`)
}
// The legacy client-creation path no longer emails at all.
const createClient = read('supabase/functions/create-client-account/index.ts')
assert.doesNotMatch(createClient, /api\.resend\.com|sendAppEmail|Jonathan Garces|reply_to: 'jonathan@/u)

// A prospect dashboard view is counted once per caller per hour, and the
// response no longer invents an extra view.
const prospect = read('supabase/functions/get-prospect-dashboard/index.ts')
assert.match(prospect, /shouldRecordPublicView\(admin, req, 'prospect', dashboardRow\.id\)\) return \{ error: null \}[\s\S]*?record_public_prospect_dashboard_view/u)
assert.doesNotMatch(prospect, /view_count \?\? 0\) \+ 1/u)

// Invite acceptance requires a confirmed address, and provisioned temporary
// password accounts are created confirmed.
const invites = read('supabase/migrations/20261011000500_security_definer_grants_and_confirmed_invites.sql')
assert.match(invites, /auth_user\.email_confirmed_at IS NOT NULL\s+INTO auth_email, auth_has_password, auth_email_confirmed/u)
assert.match(invites, /IF NOT COALESCE\(auth_email_confirmed, false\) THEN\s+RAISE EXCEPTION 'workspace invite requires a confirmed sign-in address'\s+USING ERRCODE = '55000'/u)
assert.match(invites, /REVOKE ALL ON FUNCTION public\.accept_workspace_invite\(UUID, UUID, TEXT\)\s+FROM PUBLIC, anon, authenticated;/u)
assert.match(read('supabase/functions/provision-workspace-account/index.ts'), /createUser\(\{[\s\S]{0,200}?email_confirm: true/u)

console.log('White-label boundary contract checks passed')
