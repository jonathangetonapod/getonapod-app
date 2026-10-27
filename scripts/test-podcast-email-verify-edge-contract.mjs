import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tick = readFileSync('supabase/functions/podcast-email-verify-tick/index.ts', 'utf8')
const tableMigration = readFileSync('supabase/migrations/20261029001100_podcast_email_verifications.sql', 'utf8')
const migration = readFileSync('supabase/migrations/20261030000300_podcast_email_verify_tick.sql', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')
const fastDue = readFileSync('supabase/migrations/20261030000400_podcast_email_verify_due_fast.sql', 'utf8')
const sendsDue = readFileSync('supabase/migrations/20261030000500_podcast_email_verify_tick_sends_due.sql', 'utf8')
const unschedule = readFileSync('supabase/migrations/20261030000600_podcast_email_verify_tick_unschedule.sql', 'utf8')

// Driven by pg_cron with a shared secret, never a user session.
assert.match(config, /\[functions\.podcast-email-verify-tick\]\s+verify_jwt = false/u)
assert.match(tick, /Deno\.env\.get\('EMAIL_VERIFY_SECRET'\)/u)
assert.match(tick, /req\.headers\.get\('x-email-verify-secret'\)/u)
assert.match(tick, /secretsMatch\(presentedSecret, secret\)/u)
assert.doesNotMatch(tick, /!== secret/u)
assert.doesNotMatch(tick, /Access-Control-Allow-Origin/u, 'a cron tick has no browser caller')

// The key is a server secret, never logged and never in the response.
assert.match(tick, /Deno\.env\.get\('MILLIONVERIFIER_API_KEY'\)/u)
assert.doesNotMatch(tick, /console\.[a-z]+\([^)]*apiKey\)/u)
// The key travels in MillionVerifier's query string, so a logged fetch error has it redacted.
assert.match(tick, /\.replaceAll\(apiKey, '\[key\]'\)/u)
assert.doesNotMatch(tick, /console\.error\('\[Email Verify\] Check failed', caught/u)

// The database decides what is due; the tick only spends the batch.
assert.match(tick, /admin\.rpc\('podcast_email_verification_due', \{ p_limit: batchSize\(\) \}\)/u)
assert.match(tick, /const MAX_BATCH = 1000/u)
assert.match(tick, /const RUN_BUDGET_MS = 110_000/u)
// A refused key, spent credits or an outage stops the sweep with nothing written for it.
assert.match(tick, /stopReason \?\?= 'millionverifier_auth'/u)
assert.match(tick, /millionverifier_no_credits/u)
assert.match(tick, /stopReason \?\?= 'millionverifier_unavailable'/u)
// One upsert per tick, keyed by address: contacts re-pick once per statement.
assert.match(tick, /\.from\('podcast_email_verifications'\)\s+\.upsert\(rows, \{ onConflict: 'normalized_email' \}\)/u)
assert.doesNotMatch(tick, /\.from\('podcasts'\)/u, 'the tick never writes catalogue rows')

// Results are private: service role only.
assert.match(tableMigration, /FORCE ROW LEVEL SECURITY/u)
assert.match(tableMigration, /REVOKE ALL PRIVILEGES ON TABLE public\.podcast_email_verifications FROM PUBLIC, anon, authenticated;/u)

// Never-checked first, then stale results; service-only due list.
assert.match(migration, /ORDER BY candidates\.checked_at ASC NULLS FIRST/u)
assert.match(migration, /verification\.checked_at < NOW\(\) - INTERVAL '90 days'/u)
assert.match(migration, /REVOKE ALL ON FUNCTION public\.podcast_email_verification_due\(INTEGER\)\s+FROM PUBLIC, anon, authenticated, service_role;/u)
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.podcast_email_verification_due\(INTEGER\) TO service_role;/u)
// Every 10 minutes, and only once both vault secrets exist.
assert.match(migration, /'podcast-email-verify-tick',\s+'\*\/10 \* \* \* \*'/u)
assert.match(migration, /HAVING count\(\*\) = 2/u)

// The due list fits PostgREST's statement timeout: single-address fields are not
// split, and each address is looked up by primary key before de-duplication.
assert.match(fastDue, /podcast\.podscan_email !~ '\[,;\[:space:\]\]'/u)
assert.match(fastDue, /NOT EXISTS \(\s+SELECT 1 FROM public\.podcast_email_verifications verification/u)
assert.match(fastDue, /GRANT EXECUTE ON FUNCTION public\.podcast_email_verification_due\(INTEGER\) TO service_role;/u)

// The cron job computes the due list in the database (no API statement
// timeout) and sends it; the tick validates every address and caps the list.
assert.match(sendsDue, /'podcast-email-verify-tick',\s+'7-59\/10 \* \* \* \*'/u)
assert.match(sendsDue, /jsonb_agg\(due\.normalized_email\) FROM public\.podcast_email_verification_due\(300\)/u)
assert.match(tick, /let dueEmails = await dueFromBody\(req\)/u)
assert.match(tick, /if \(email\.length <= 320 && EMAIL\.test\(email\)\) unique\.add\(email\)/u)
assert.match(tick, /if \(unique\.size >= MAX_BATCH\) break/u)

// Verification is a backfill run on request: the standing schedule is removed.
assert.match(unschedule, /PERFORM cron\.unschedule\('podcast-email-verify-tick'\)/u)

console.log('podcast email verify Edge contract passed')
