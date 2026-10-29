import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  'supabase/migrations/20260725000300_global_podcast_catalog.sql',
  'utf8',
)
const validationFix = readFileSync(
  'supabase/migrations/20260725000400_fix_global_podcast_id_validation.sql',
  'utf8',
)
const directContactReuseFix = readFileSync(
  'supabase/migrations/20260725000500_fix_global_direct_contact_reuse.sql',
  'utf8',
)
const clientShortlist = readFileSync(
  'supabase/functions/workspace-client-shortlist/index.ts',
  'utf8',
)
const prospectStudio = readFileSync(
  'supabase/functions/workspace-prospect-dashboards/index.ts',
  'utf8',
)
const clientCampaigns = readFileSync(
  'supabase/functions/workspace-client-campaigns/index.ts',
  'utf8',
)
const freeEmailLookup = readFileSync(
  'supabase/functions/fetch-podscan-email/index.ts',
  'utf8',
)
const reverificationMigration = readFileSync(
  'supabase/migrations/20260728001300_direct_contact_reverification.sql',
  'utf8',
)
const prepDialog = readFileSync(
  'src/components/workspace/ClientCampaignPrepDialog.tsx',
  'utf8',
)

assert.match(migration, /CREATE TABLE public\.podcast_catalog_contributions/u)
assert.match(migration, /CREATE TABLE public\.podcast_direct_contacts/u)
assert.match(migration, /ALTER TABLE public\.podcast_direct_contacts FORCE ROW LEVEL SECURITY/u)
assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.podcast_direct_contacts FROM PUBLIC, anon, authenticated/u)
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.merge_global_podcast_catalog_batch_v1/u)
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.record_global_podcast_direct_contact_v1/u)
assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\('global-podcast-direct-contact:'/u)
assert.match(migration, /'credit_charge_allowed', first_global_unlock/u)
assert.match(migration, /client_dashboard_podcasts_global_podcast_fk/u)
assert.match(migration, /prospect_dashboard_podcasts_global_podcast_fk/u)
assert.match(migration, /podcast_emails_global_podcast_fk/u)
assert.match(migration, /CREATE TRIGGER podcasts_reflect_to_workflows_v1/u)
assert.match(migration, /DROP POLICY IF EXISTS "Public read access to podcasts"/u)
assert.match(migration, /DROP POLICY IF EXISTS "Authenticated users can update podcasts"/u)
assert.match(migration, /DROP POLICY IF EXISTS "Admin full access to podcasts"/u)
assert.match(migration, /CREATE POLICY podcasts_platform_admin_all[\s\S]*?public\.is_platform_admin\(\)/u)
assert.match(migration, /COALESCE\(NEW\.source, 'podscan'\)/u)
const directContactGrant = migration.match(
  /GRANT EXECUTE ON FUNCTION public\.record_global_podcast_direct_contact_v1\([^;]+;/u,
)?.[0]
assert.ok(directContactGrant, 'direct-contact function grant must exist')
assert.match(directContactGrant, /TO service_role;/u)
assert.doesNotMatch(directContactGrant, /\b(?:anon|authenticated)\b/u)
assert.match(validationFix, /length\(normalized_podscan_id\) > 300/u)
assert.match(validationFix, /normalized_podscan_id !~ '\^\[A-Za-z0-9_-\]\+\$'/u)
assert.doesNotMatch(validationFix, /\{1,300\}/u)
assert.match(directContactReuseFix, /normalized_direct_email/u)
assert.doesNotMatch(directContactReuseFix, /DECLARE[\s\S]*?normalized_email TEXT/u)

assert.match(clientShortlist, /rpc\('merge_global_podcast_catalog_batch_v1'/u)
assert.match(clientShortlist, /\.from\('podcast_direct_contacts'\)/u)
assert.match(clientShortlist, /scope: 'global'/u)
assert.doesNotMatch(clientShortlist, /ignoreDuplicates: true[\s\S]{0,200}from\('podcasts'\)/u)
assert.match(prospectStudio, /rpc\('merge_global_podcast_catalog_batch_v1'/u)
assert.match(clientCampaigns, /\.from\("podcast_direct_contacts"\)/u)
assert.match(clientCampaigns, /cleanContactEmail\(directContact\?\.email\)/u)
assert.match(clientCampaigns, /verifiedDirectByShortlistId/u)
assert.match(freeEmailLookup, /\.from\('podcasts'\)[\s\S]*?podscan_email/u)
assert.match(freeEmailLookup, /contact_type: 'podscan_free'/u)
assert.match(freeEmailLookup, /\.from\('podcast_emails'\)[\s\S]*?\.upsert/u)


// A verified contact goes out of date. Ninety days is one re-check per quarter
// per show, and an unchecked address costs a bounce against the sender's
// reputation — more expensive than the verification call that prevents it.
assert.match(clientShortlist, /const DIRECT_CONTACT_FRESH_DAYS = 90/u)
// Fresh contacts return before either customer-owned provider is called.
const emailSearchStart = clientShortlist.indexOf("if (action === 'email-search-run')")
const emailSearchEnd = clientShortlist.indexOf("if (action === ", emailSearchStart + 1)
const emailSearch = clientShortlist.slice(emailSearchStart, emailSearchEnd === -1 ? undefined : emailSearchEnd)
assert.match(emailSearch, /existingContact\?\.email && Number\.isFinite\(verifiedAt\)[\s\S]*?Date\.now\(\) - verifiedAt <= DIRECT_CONTACT_FRESH_DAYS \* DAY_MS/u)
assert.match(emailSearch, /email_unlock: unlocked\(existingContact\.email/u)
assert.ok(emailSearch.indexOf('email_unlock: unlocked(existingContact.email') < emailSearch.indexOf('const blitzKey'))
// Stale entries use the customer's selected AI provider and platform-managed Blitz.
assert.match(emailSearch, /discoverHostLinkedin\(/u)
assert.match(emailSearch, /findBlitzEmail\(blitzKey, profile\)/u)
assert.match(reverificationMigration, /UPDATE public\.podcast_direct_contacts contact\s+SET verification_status = 'invalid'/u)
assert.doesNotMatch(
  reverificationMigration,
  /DELETE FROM public\.podcast_direct_contacts/u,
  'the row carries who paid for the unlock; retiring it must not discard that',
)
assert.match(
  reverificationMigration,
  /REVOKE ALL ON FUNCTION public\.expire_global_podcast_direct_contact_v1\(TEXT\)\s+FROM PUBLIC, anon, authenticated, service_role;/u,
)
assert.match(
  reverificationMigration,
  /GRANT EXECUTE ON FUNCTION public\.expire_global_podcast_direct_contact_v1\(TEXT\)\s+TO service_role;/u,
)
// Existing stale contacts remain labeled and refreshes disclose provider billing.
assert.match(clientShortlist, /stale: !Number\.isFinite\(Date\.parse\(directContact\.last_verified_at\)\)/u)
assert.match(prepDialog, /const contactIsStale = emailAlreadyUnlocked && storedEmailUnlock\?\.stale === true/u)
assert.match(prepDialog, /contactIsStale \? 'This contact needs a fresh lookup before outreach\.'/u)
assert.match(prepDialog, /Uses your selected AI key and platform-managed contact enrichment\. AI provider charges apply\./u)

process.stdout.write('Global podcast catalog contract checks passed.\n')
