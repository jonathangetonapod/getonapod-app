// Static contract checks for the Podscan integration: one HTTP client, and the
// behaviour each caller depends on that a unit test cannot reach from outside
// the edge function.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const read = (path) => readFileSync(path, 'utf8')
const proxy = read('supabase/functions/podscan-proxy/index.ts')
const autopilot = read('supabase/functions/client-autopilot-tick/index.ts')
const freeEmail = read('supabase/functions/fetch-podscan-email/index.ts')
const clientPodcasts = read('supabase/functions/get-client-podcasts/index.ts')
const prospectPodcasts = read('supabase/functions/get-prospect-podcasts/index.ts')
const sharedClient = read('supabase/functions/_shared/podscan.ts')

// One client. Nothing but _shared/podscan.ts talks to the Podscan API, so the
// timeout, size cap, 429 handling and concurrency cap cannot drift apart again.
function edgeFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? edgeFiles(path) : path.endsWith('.ts') ? [path] : []
  })
}
const directCallers = edgeFiles('supabase/functions')
  .filter((path) => !path.endsWith('_shared/podscan.ts') && !path.endsWith('_shared/podscan.test.ts'))
  .filter((path) => /podscan\.fm\/api/u.test(read(path)))
assert.deepEqual(directCallers, [], `only _shared/podscan.ts may call the Podscan API: ${directCallers.join(', ')}`)
assert.match(sharedClient, /return Deno\.env\.get\('PODSCAN_API_KEY'\)\?\.trim\(\) \|\| null/u)

// Proxy: the body is validated before the ledger is touched.
const planAt = proxy.indexOf('const request = podscanRequest(body, action)')
const chargeAt = proxy.indexOf('await chargeCredits(context.admin')
assert.ok(planAt > 0 && chargeAt > planAt, 'podscan-proxy validates the request before charging')
// Duplicate feeds are dropped from both list endpoints, by the key each uses.
assert.match(proxy, /path: '\/podcasts\/search', params: searchParams\(body\.options\), listKey: 'podcasts'/u)
assert.match(proxy, /\/related_podcasts`,\s+listKey: 'related_podcasts'/u)
assert.match(proxy, /dropDuplicateShows\(fetched, request\.listKey\)/u)
assert.match(proxy, /duplicates_removed: removed/u)
// Paging is bounded to what Podscan serves.
assert.match(proxy, /const PAGING_BOUNDS: Record<string, number> = \{ per_page: 50, page: 1_000 \}/u)
// A failed lookup is refunded, except a 404, which is an answer.
assert.match(proxy, /const answered = podscanUpstreamStatus\(error\) === 404/u)
assert.match(proxy, /if \(chargedForRefund && refundAdmin && !answered\) \{[\s\S]*?refundCredits\(refundAdmin/u)
assert.match(proxy, /headers\.set\('X-Credits-Charged', String\(creditsCharged\)\)/u)
assert.match(proxy, /headers\.set\('X-Credits-Refunded', String\(creditsRefunded\)\)/u)
assert.match(proxy, /if \(error instanceof PodscanRateLimitError\) \{[\s\S]*?headers\.set\('Retry-After', error\.retryAfter\)/u)
// The browser retries; the proxy never does, so retries are not doubled.
assert.match(proxy, /return await podscanFetch\(path, \{ params, apiKey \}\)/u)

// Autopilot: the search rules live in _shared/autopilotSearch.ts (tested
// there); the tick must use them, inside its run budget.
assert.match(autopilot, /await searchAcrossQueries\(\s+queries,/u)
assert.match(autopilot, /throw new PodscanSearchError\(podscanSearchFailureKind\(error\)\)/u)
assert.match(autopilot, /\{ params, retries: 2, deadlineAt, apiKey \}/u)
assert.match(autopilot, /const RUN_BUDGET_MS = 140_000/u)
assert.match(autopilot, /if \(Date\.now\(\) >= captureDeadline\) break/u)
assert.match(autopilot, /error\.kind === 'refused'[\s\S]*?retryMs: ACTION_RETRY_MS/u)
assert.match(autopilot, /error\.kind === 'quota'[\s\S]*?retryMs: 24 \* 60 \* 60 \* 1000/u)
assert.doesNotMatch(autopilot, /collected\.size === 0\) throw/u, 'a run that searched is not failed for finding nothing new')

// fetch-podscan-email: the id is checked before it reaches the URL path, and
// errors keep the { success: false } body with their real status.
assert.match(freeEmail, /if \(!isPodscanId\(body\.podcast_id\)\) \{\s+throw new HttpError\(400, 'INVALID_FIELD'/u)
assert.match(freeEmail, /podscanFetch\(`\/podcasts\/\$\{encodeURIComponent\(podcast_id\)\}`/u)
assert.match(freeEmail, /jsonResponse\(req, METHODS, error\.status, \{ success: false, error: error\.message, code: error\.code \}\)/u)
assert.match(freeEmail, /return optionsResponse\(req, METHODS\)/u)

// Legacy dashboard fetchers: sheet ids and podcast ids are checked before
// they go into a URL, Podscan calls stay inside the run budget, and shows
// Podscan could not return are reported instead of dropped.
for (const [name, source] of [['get-client-podcasts', clientPodcasts], ['get-prospect-podcasts', prospectPodcasts]]) {
  assert.match(source, /const SPREADSHEET_ID_PATTERN = \/\^\[A-Za-z0-9_-\]\{10,200\}\$\/u/u, `${name} validates the sheet id`)
  assert.match(source, /isPodscanId\(podcastId\)/u, `${name} validates podcast ids from the sheet`)
  assert.match(source, /const podscanDeadline = startTime \+ MAX_RUNTIME_MS/u, `${name} bounds Podscan calls`)
  assert.match(source, /isPodscanDeadlineError\(/u, `${name} leaves budget-skipped shows for the next run`)
  assert.match(source, /stats\.podscanFailed\+\+\s+podscanFailedIds\.push\(podcastId\)/u, `${name} counts failed shows`)
  assert.match(source, /failed: stats\.podscanFailed,\s+failedPodcastIds: podscanFailedIds,/u, `${name} reports failed shows`)
  assert.match(source, /const remaining = missingPodcastIds\.length - newPodcasts\.length - stats\.podscanFailed/u, `${name} does not count failed shows as remaining`)
}

process.stdout.write('Podscan integration contract checks passed.\n')
