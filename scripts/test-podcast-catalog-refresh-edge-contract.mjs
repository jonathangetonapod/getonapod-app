import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const tick = readFileSync('supabase/functions/podcast-catalog-refresh-tick/index.ts', 'utf8')
const mapping = readFileSync('supabase/functions/_shared/podcastRefresh.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20261029000200_podcast_catalog_refresh.sql', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')

// Driven by pg_cron with a shared secret, never a user session.
assert.match(config, /\[functions\.podcast-catalog-refresh-tick\]\s+verify_jwt = false/u)
assert.match(tick, /Deno\.env\.get\('CATALOG_REFRESH_SECRET'\)/u)
assert.match(tick, /req\.headers\.get\('x-catalog-refresh-secret'\)/u)
assert.match(tick, /secretsMatch\(presentedSecret, secret\)/u)
assert.doesNotMatch(tick, /!== secret/u)
assert.doesNotMatch(tick, /Access-Control-Allow-Origin/u, 'a cron tick has no browser caller')

// The database decides what is due; the tick only spends the batch.
assert.match(tick, /admin\.rpc\('podcast_catalog_refresh_due', \{ p_limit: batchSize\(\) \}\)/u)
assert.match(tick, /Deno\.env\.get\('CATALOG_REFRESH_BATCH'\)/u)
assert.match(tick, /const MAX_BATCH = 100/u)
// Every Podscan call goes through the shared client, inside a run budget that
// ends before pg_net stops waiting.
assert.match(tick, /from '\.\.\/_shared\/podscan\.ts'/u)
assert.doesNotMatch(tick, /podscan\.fm/u, 'the shared client is the only Podscan caller')
assert.match(tick, /podscanFetch\(`\/podcasts\/\$\{podscanId\}`, \{ retries: 1, deadlineAt \}\)/u)
assert.match(tick, /const RUN_BUDGET_MS = 110_000/u)
assert.match(tick, /Array\.from\(\{ length: PODSCAN_MAX_CONCURRENT \}, worker\)/u)
// Podscan saying stop, or the budget running out, ends the sweep; the rest stay due.
assert.match(tick, /caught instanceof PodscanRateLimitError/u)
assert.match(tick, /isPodscanDeadlineError\(caught\)/u)
// One 404 does not switch a show off: a transient one could hide a live show.
assert.match(tick, /podscanUpstreamStatus\(caught\) === 404/u)
assert.doesNotMatch(tick, /is_active: false/u)
// A refused key or a Podscan outage is not about any show: nothing is marked.
assert.match(tick, /if \(isPodscanAuthError\(caught\)\) \{[\s\S]{0,200}stopReason \?\?= 'podscan_auth'/u)
assert.match(tick, /if \(isRetryablePodscanError\(caught\)\) \{[\s\S]{0,300}MAX_TRANSIENT_FAILURES/u)
// A 200 with no podcast in it does not count as a refresh.
assert.match(tick, /if \(!fields\.podcast_name\) \{/u)
// Empty lists and lower-casing never overwrite what the row holds.
assert.match(mapping, /value\.length > 0 \? value : undefined/u)
assert.doesNotMatch(mapping, /toLowerCase\(\)/u)
// Embeddings are not generated inside the tick (no deadline on that path).
assert.doesNotMatch(tick, /generateMissingEmbeddings/u)
// Every try is recorded, so a failing show cannot hold the front of the queue.
assert.match(tick, /catalog_refresh_attempted_at: new Date\(\)\.toISOString\(\)/u)
// Updates existing rows; it never creates or deletes catalogue rows.
assert.match(tick, /\.update\(/u)
assert.doesNotMatch(tick, /\.upsert\(|\.insert\(|\.delete\(/u)
assert.match(tick, /podscan_last_fetched_at: new Date\(\)\.toISOString\(\)/u)
assert.match(mapping, /filter\(\(\[, value\]\) => value !== undefined\)/u, 'missing fields keep their value')

assert.match(migration, /ADD COLUMN IF NOT EXISTS catalog_refresh_attempted_at TIMESTAMPTZ/u)
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.podcast_catalog_refresh_due\(p_limit INTEGER DEFAULT 55\)/u)
assert.match(migration, /SECURITY DEFINER/u)
assert.match(migration, /WHEN candidates\.on_shortlist THEN INTERVAL '7 days'\s+ELSE INTERVAL '30 days'/u)
assert.match(migration, /ORDER BY candidates\.on_shortlist DESC, candidates\.last_touched ASC/u)
assert.match(
  migration,
  /REVOKE ALL ON FUNCTION public\.podcast_catalog_refresh_due\(INTEGER\)\s+FROM PUBLIC, anon, authenticated, service_role;/u,
)
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.podcast_catalog_refresh_due\(INTEGER\) TO service_role;/u)
assert.match(migration, /'podcast-catalog-refresh-tick',\s+'23 \* \* \* \*'/u)
assert.match(migration, /'x-catalog-refresh-secret'/u)
assert.match(migration, /HAVING count\(\*\) = 2/u)

console.log('podcast catalog refresh Edge contract passed')
