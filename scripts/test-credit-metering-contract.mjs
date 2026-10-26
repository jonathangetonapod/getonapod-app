// Static contract checks for credit metering and BYO AI keys.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const billing = readFileSync('supabase/functions/_shared/billing.ts', 'utf8')
const aiKeys = readFileSync('supabase/functions/_shared/workspaceAiKeys.ts', 'utf8')
const prospectBuild = readFileSync('supabase/functions/workspace-prospect-dashboards/index.ts', 'utf8')
const scoring = readFileSync('supabase/functions/score-podcast-compatibility/index.ts', 'utf8')
const autopilot = readFileSync('supabase/functions/client-autopilot-tick/index.ts', 'utf8')
const creditFixes = readFileSync('supabase/migrations/20260802030000_credit_refunds_and_expiry.sql', 'utf8')
const renewal = readFileSync('supabase/migrations/20260802050000_allowance_renewal_reports_truthfully.sql', 'utf8')
const renewalSchedule = readFileSync('supabase/migrations/20260802040000_monthly_allowance_renewal.sql', 'utf8')
const queries = readFileSync('supabase/functions/generate-podcast-queries/index.ts', 'utf8')
const podscanProxy = readFileSync('supabase/functions/podscan-proxy/index.ts', 'utf8')
const staffEdge = readFileSync('supabase/functions/manage-workspace-staff/index.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260726000300_metering_and_byo_keys.sql', 'utf8')

// Enforcement is opt-in and BYO-key operations are never charged.
assert.match(billing, /CREDIT_ENFORCEMENT_ENABLED/u)
assert.match(billing, /if \(!enforcementEnabled\(\) \|\| input\.byoKeyUsed\) return \{ charged: 0, entryId: null, replayed: false \}/u)
// A replay names an earlier debit, possibly for delivered work; refund-on-failure
// callers must see the difference or a failed retry claws back a paid success.
assert.match(billing, /replayed: result\?\.idempotent === true/u)
assert.match(billing, /INSUFFICIENT_CREDITS/u)
assert.match(billing, /HttpError\(402/u)

// Charge happens before the provider call in the dashboard build.
const chargeIndex = prospectBuild.indexOf("operationType: 'dashboard_build'")
const anthropicCallIndex = prospectBuild.indexOf('api.anthropic.com')
assert.ok(chargeIndex > 0 && anthropicCallIndex > 0, 'dashboard build metering markers missing')
assert.match(prospectBuild, /await chargeCredits\(context\.admin/u)
assert.match(prospectBuild, /resolveAiKey\(context\.admin, workspaceId, 'anthropic'\)/u)

// Compatibility scoring caps workspace batches at 20.
assert.match(scoring, /body\.podcasts\.slice\(0, 20\)/u)
assert.match(scoring, /operationType: 'compatibility_scoring'/u)
assert.match(scoring, /resolveAiKey\(context\.admin, workspaceId, 'anthropic'\)/u)

// Query generation charges only the workspace branch and honors BYO keys.
assert.match(queries, /operationType: 'query_generation'/u)
assert.match(queries, /resolveAiKey\(context\.admin, workspaceId, 'anthropic'\)/u)

// Podscan proxy meters only the workspace branch.
const podscanWorkspaceBranch = podscanProxy.indexOf('if (workspaceId) {')
const podscanAdminBranch = podscanProxy.indexOf('requirePlatformAdmin(req)')
assert.ok(podscanWorkspaceBranch > 0 && podscanAdminBranch > podscanWorkspaceBranch)
assert.match(podscanProxy, /operationType: 'podscan_lookup'/u)

// AI key management: owner-gated, probed before storage, never echoed back.
assert.match(staffEdge, /action === "ai-keys-status" \|\| action === "ai-keys-set" \|\| action === "ai-keys-clear"/u)
assert.match(staffEdge, /\["owner", "platform_admin"\]\.includes\(access\.role\)/u)
assert.match(staffEdge, /await probeAiKey\(provider, apiKey\.trim\(\)\)/u)
assert.doesNotMatch(staffEdge, /api_key_ciphertext/u)
assert.match(aiKeys, /select\('provider, api_key_last_four, updated_at'\)/u)
const statusFnBody = aiKeys.slice(aiKeys.indexOf('workspaceAiKeyStatus'), aiKeys.indexOf('resolveAiKey'))
assert.ok(statusFnBody.length > 0, 'ai key status function missing')
assert.doesNotMatch(statusFnBody, /ciphertext/u)

// Migration: extended vocabulary, BYO column, service-role-only key table.
assert.match(migration, /'compatibility_scoring',\s*\n\s*'podscan_lookup',\s*\n\s*'semantic_search',\s*\n\s*'pitch_profile',/u)
assert.match(migration, /ADD COLUMN IF NOT EXISTS used_byo_key BOOLEAN NOT NULL DEFAULT false/u)
assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.workspace_ai_credentials FROM PUBLIC, anon, authenticated/u)

// Two movements the ledger has always been able to describe and nothing ever
// wrote, so the journal it calls "the audit explanation for every movement"
// could not explain a failed charge or an expired lot.
assert.match(creditFixes, /CREATE OR REPLACE FUNCTION public\.refund_workspace_credits_v1/u)
assert.match(creditFixes, /CREATE OR REPLACE FUNCTION public\.expire_workspace_credit_lots_v1/u)
// Service-role only, like every other credit primitive.
for (const signature of [
  'public.refund_workspace_credits_v1(UUID, UUID, TEXT)',
  'public.expire_workspace_credit_lots_v1()',
]) {
  assert.ok(
    creditFixes.includes(`REVOKE ALL ON FUNCTION ${signature}\n  FROM PUBLIC, anon, authenticated`),
    `${signature} must be revoked from PUBLIC, anon and authenticated`,
  )
  assert.ok(
    creditFixes.includes(`GRANT EXECUTE ON FUNCTION ${signature}\n  TO service_role`),
    `${signature} must be granted to service_role only`,
  )
}
// A refund returns the exact lots the debit consumed rather than minting new
// credit, or it would quietly extend an expiry date into free lifetime credit.
assert.match(creditFixes, /jsonb_array_elements\(COALESCE\(debit_entry\.lot_breakdown/u)
assert.match(creditFixes, /SET remaining = LEAST\(granted, remaining \+ \(lot_line->>'spent'\)::integer\)/u)
// One refund per debit, and one expiry line per lot, for ever.
assert.match(creditFixes, /refund_key := 'refund:' \|\| p_debit_entry_id::text/u)
assert.match(creditFixes, /'expiry:' \|\| lot\.id::text/u)
// The sweep runs without an edge function in the path, because the work is a
// database function and an HTTP handler would only forward the same call.
assert.match(creditFixes, /cron\.schedule\(\s*'workspace-credit-expiry'/u)

// Charging happens before the provider call, so a caller has to be able to
// name the debit it needs to give back.
assert.match(billing, /Promise<\{ charged: number; entryId: string \| null; replayed: boolean \}>/u)
assert.match(billing, /export async function refundCredits/u)
// A failed refund must not replace the caller's real error with a billing one.
assert.match(billing, /export async function refundCredits[\s\S]*?catch \(_error\)/u)
// The unattended tick is where a swallowed charge would never be noticed.
assert.match(autopilot, /await refundCredits\(admin, \{[\s\S]{0,200}reason: 'autopilot run failed'/u)
// Consecutive failures back off 2h, 6h, 24h, then pause (autopilot switched
// off with the reason) until someone turns it back on; read from the existing
// last_run_error/last_run_error_at columns, no counter.
assert.match(autopilot, /const BACKOFF_STEPS_MS = \[TRANSIENT_RETRY_MS, ACTION_RETRY_MS, 24 \* 60 \* 60 \* 1000\]/u)
assert.match(autopilot, /\.select\('workspace_id, client_id, max_weekly_adds, min_score, next_run_at, last_run_error, last_run_error_at'\)/u)
assert.match(autopilot, /if \(rung >= BACKOFF_STEPS_MS\.length\) return 'pause'/u)
assert.match(autopilot, /\.\.\.\(paused \? \{ enabled: false, last_run_error: pausedMessage \} : \{\}\)/u)
assert.match(autopilot, /action: 'workspace\.client\.autopilot\.paused'/u)
{
  // Behaviour of the ladder, run against the function's own source.
  const start = autopilot.indexOf('function backoffFor(')
  const end = autopilot.indexOf('\n}\n', start) + 2
  const constants = autopilot.slice(autopilot.indexOf('const TRANSIENT_RETRY_MS'), autopilot.indexOf('/**', autopilot.indexOf('const BACKOFF_TOLERANCE_MS')))
  const fnSource = autopilot.slice(start, end)
    .replace(/: \{ retryMs: number \| null \}/u, '')
    .replace(/: \{ lastRunError: unknown; lastRunErrorAt: unknown; dueAt: unknown \}/u, '')
    .replace(/\): number \| 'pause' \| null \{/u, ') {')
  const backoffFor = new Function(`${constants}\n${fnSource}\nreturn backoffFor`)()
  const hour = 60 * 60 * 1000
  const at = (ms) => new Date(Date.UTC(2026, 0, 1) + ms).toISOString()
  const failure = { retryMs: 2 * hour }
  assert.equal(backoffFor(failure, { lastRunError: null, lastRunErrorAt: null, dueAt: at(0) }), 2 * hour)
  assert.equal(backoffFor(failure, { lastRunError: 'x', lastRunErrorAt: at(0), dueAt: at(2 * hour) }), 6 * hour)
  assert.equal(backoffFor(failure, { lastRunError: 'x', lastRunErrorAt: at(0), dueAt: at(6 * hour) }), 24 * hour)
  assert.equal(backoffFor(failure, { lastRunError: 'x', lastRunErrorAt: at(0), dueAt: at(24 * hour) }), 'pause')
  assert.equal(backoffFor(failure, { lastRunError: 'x', lastRunErrorAt: at(0), dueAt: at(7 * 24 * hour) }), 2 * hour)
  assert.equal(backoffFor({ retryMs: null }, { lastRunError: 'x', lastRunErrorAt: at(0), dueAt: at(24 * hour) }), null)
}

// An idempotency key keyed on the thing acted upon would make every later
// repeat free. The window distinguishes a retry from a decision.
assert.match(billing, /export function retryWindowKey/u)
assert.match(billing, /`\$\{parts\.filter\(Boolean\)\.join\(':'\)\}:w\$\{bucket\}`/u)
assert.match(prospectBuild, /idempotencyKey: retryWindowKey\(\['dashboard_build', dashboardId\]\)/u)
// A search is not an artifact: repeating one inside the window is ordinary,
// so these deliberately carry no key.
assert.doesNotMatch(scoring, /idempotencyKey/u)

// The allowance was granted lazily, inside the first charge of the month, so a
// workspace that ran nothing got nothing — and the month a team comes back
// from a quiet period is the month they need the balance already there.
assert.match(renewal, /CREATE OR REPLACE FUNCTION public\.grant_monthly_allowances_v1/u)
assert.match(renewalSchedule, /cron\.schedule\(\s*'workspace-monthly-allowance'/u)
// Daily, because the grant is idempotent per period and a daily run is
// self-healing: a job that fires only on the 1st has one chance to be right.
assert.match(renewalSchedule, /'23 2 \* \* \*'/u)
// The same key the lazy path uses, so the two can never both land.
assert.match(renewal, /'allowance:' \|\| workspace\.id::text \|\| ':' \|\| period/u)
// A cancelled workspace keeps its plan's allowance on the row, so granting
// from it regardless would top it up for ever.
assert.match(renewal, /billing_status NOT IN \('trialing', 'active', 'comped'\)/u)
// The literal must match the column default or a workspace silently lands on
// the wrong plan.
assert.match(renewal, /COALESCE\(workspace\.monthly_credit_allowance, 100\)/u)
// It counts what it granted, not what it considered: a second run in the same
// month granted nothing and used to report a full month's credits anyway.
assert.match(renewal, /COALESCE\(\(grant_result->>'idempotent'\)::boolean, false\)/u)
assert.match(renewal, /'already_held', already_held/u)

console.log('Credit metering edge contract passed')

// Automatic top-ups only work if Stripe was told to keep the card. Checkout
// used to pay as a guest — no customer, nothing saved — so an off-session
// charge later had nothing to charge and the whole feature was unreachable.
const checkoutFn = readFileSync('supabase/functions/workspace-credit-checkout/index.ts', 'utf8')
assert.match(checkoutFn, /params\.set\('payment_intent_data\[setup_future_usage\]', 'off_session'\)/u)
assert.match(checkoutFn, /params\.set\('customer', customerId\)/u)

const refill = readFileSync('supabase/functions/workspace-credit-refill-tick/index.ts', 'utf8')
// A PaymentIntent with only a customer relies on a default payment method that
// a Checkout purchase never sets, so the card is named explicitly.
assert.match(refill, /async function savedCardFor/u)
assert.match(refill, /payment_method: paymentMethodId/u)
assert.match(refill, /no saved card to charge/u)
// It charges and stops: the webhook grants when Stripe confirms the money.
assert.match(refill, /off_session: 'true'/u)
assert.doesNotMatch(refill, /grant_workspace_credits_v1/u)
// Opt-in, one a day, and never a workspace already failing payment.
assert.match(refill, /auto-refill:\$\{workspaceId\}:\$\{today\}/u)
assert.match(refill, /\['past_due', 'suspended'\]\.includes\(billingStatus\)/u)
// The Stripe status names never appear in billing_status, so matching on them
// skipped nobody.
assert.doesNotMatch(refill, /'canceled', 'cancelled'/u)
// Every eligible profile, in a fair order: a bare .limit(200) with no order let
// the same rows win every hour and starved the rest.
assert.doesNotMatch(refill, /\.limit\(200\)/u)
assert.match(refill, /\.order\('last_refill_attempt_at', \{ ascending: true, nullsFirst: true \}\)/u)
assert.match(refill, /\.range\(offset, offset \+ PAGE_SIZE - 1\)/u)
// Failures persist on the profile; three in a row pause the workspace and
// tell its owner, and a failed day is not retried within the same day.
assert.match(refill, /const MAX_CONSECUTIVE_FAILURES = 3/u)
assert.match(refill, /\.lt\('refill_failure_count', MAX_CONSECUTIVE_FAILURES\)/u)
assert.match(refill, /if \(count === MAX_CONSECUTIVE_FAILURES\) \{\n\s+await notifyOwnerRefillPaused/u)
assert.match(refill, /if \(lastFailedDay === today\)/u)
assert.match(refill, /\.eq\('role', 'owner'\)/u)
// The Stripe idempotency key is still the day's refill key.
assert.match(refill, /stripePost\('payment_intents', form, stripeKey, refillKey\)/u)
// A Stripe API error is not an empty card list: it rotates the profile
// without counting toward the pause. Profiles clearly above their threshold
// are skipped from one bulk balance read before any per-workspace query.
assert.match(refill, /if \(!response\.ok\) return \{ ok: false, reason: `Stripe returned \$\{response\.status\}` \}/u)
assert.match(refill, /if \(!card\.ok\) \{[\s\S]{0,200}await recordTransientFailure\(admin, workspaceId, card\.reason\)\s*\n\s*continue/u)
assert.match(refill, /async function recordTransientFailure\([\s\S]*?\.update\(\{ last_refill_attempt_at: new Date\(\)\.toISOString\(\) \}\)/u)
assert.doesNotMatch(refill.slice(refill.indexOf('async function recordTransientFailure('), refill.indexOf('serve(')), /refill_failure_count/u)
assert.match(refill, /if \(!result\.ok && \(result\.status >= 500 \|\| result\.status === 429\)\) \{/u)
assert.match(refill, /const precomputedBalances = await bulkBalances\(admin,/u)
assert.ok(
  refill.indexOf('precomputedBalances.get(workspaceId)') < refill.indexOf("const monthPrefix = `auto-refill:"),
  'the cheap balance skip must run before the monthly-spend ledger read',
)

// The start write after the build charge sits before the failure boundary, so
// it refunds on its own when it fails.
assert.match(
  prospectBuild,
  /if \(startError\) \{[\s\S]{0,400}await refundCredits\(context\.admin, \{[\s\S]{0,200}reason: 'prospect dashboard build could not be started'/u,
)

// Keyword estimates are labelled per score, and a request the model scored
// none of is given back.
assert.match(scoring, /source: 'deterministic'/u)
assert.match(scoring, /source: 'ai'/u)
assert.match(scoring, /deterministicCount === scores\.length && chargedForRefund && refundAdmin[\s\S]*?refundCredits\(/u)
assert.match(scoring, /return errorResponse\(req, METHODS, error\)/u, 'scoring uses the shared CORS allowlist, not one hard-coded origin')
assert.doesNotMatch(scoring, /ALLOWED_ORIGIN/u)

console.log('Credit metering scoring-estimate checks passed')
