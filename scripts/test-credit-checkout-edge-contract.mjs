import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const checkout = readFileSync('supabase/functions/workspace-credit-checkout/index.ts', 'utf8')
// Old URLs cannot create new charges, even for authenticated legacy clients.
assert.match(checkout, /410/u)
assert.match(checkout, /CREDIT_BILLING_RETIRED/u)
assert.doesNotMatch(checkout, /fetch\(|grant_workspace_credits/u)
const refill = readFileSync('supabase/functions/workspace-credit-refill-tick/index.ts', 'utf8')
assert.match(refill, /410/u)
assert.doesNotMatch(refill, /fetch\(|payment_intents/u)

const webhook = readFileSync('supabase/functions/stripe-credit-webhook/index.ts', 'utf8')
// Signature-verified with replay tolerance; idempotent grant keyed on event id.
assert.match(webhook, /STRIPE_CREDIT_WEBHOOK_SECRET/u)
assert.match(webhook, /SIGNATURE_TOLERANCE_SECONDS = 5 \* 60/u)
assert.match(webhook, /timingSafeEqual\(expected, signature\)/u)
assert.match(webhook, /if \(!verified\) return json\(400/u)
assert.match(webhook, /checkout\.session\.completed/u)
// Two events buy credits — a person completing a checkout session, and an
// automatic top-up charged off-session with nobody present. Each reports its
// success under a different field, so the paid value is read per event rather
// than assumed.
assert.match(webhook, /paymentStatus !== paidValue/u)
assert.match(webhook, /const AUTOMATIC = 'payment_intent\.succeeded'/u)
assert.match(webhook, /event\.type === AUTOMATIC[\s\S]{0,160}session\.status/u)
assert.match(webhook, /const paidValue = event\.type === AUTOMATIC \? 'succeeded' : 'paid'/u)
// Both grant through the same idempotent call: a second grant path could
// drift from this one, and credits would exist for money that never arrived.
assert.match(webhook, /p_reference_kind: event\.type === AUTOMATIC \? 'stripe_auto_refill' : 'stripe_checkout'/u)
assert.match(webhook, /p_source: 'purchase'/u)
// Auto-refills grant under the tick's own auto-refill:… key so the tick's
// daily pre-check and monthly cap can see past refills in the ledger; keyed on
// the Stripe event id they were invisible, the daily check was dead code, and
// the cap summed zero. Checkout purchases keep the event-id key, and event
// retries still deduplicate either way — redeliveries carry the same metadata.
assert.match(webhook, /event\.type === AUTOMATIC && typeof metadata\.refill_key === 'string' && metadata\.refill_key\.startsWith\('auto-refill:'\)\s*\n\s*\? metadata\.refill_key\s*\n\s*: `stripe:\$\{event\.id\}`/u)

// A 100%-off promotion code completes with nothing to collect. It is still a
// purchase, so it grants — but only at a true zero total.
assert.match(webhook, /paymentStatus === 'no_payment_required'\s*\n\s*&& session\.amount_total === 0/u)
assert.match(webhook, /paymentStatus !== paidValue && !freeCheckout/u)
// The lot remembers which payment bought it, so a refund can find it; a retry
// after that write failed is a 500, and the idempotent grant fills it in.
assert.match(webhook, /\.update\(\{ stripe_payment_ref: paymentRef \}\)/u)
assert.match(webhook, /typeof session\.payment_intent === 'string' \? session\.payment_intent : null/u)
assert.match(webhook, /return json\(500, \{ error: 'PAYMENT_REF_FAILED' \}\)/u)
// Refunds and disputes take back the unspent part of that lot, through one
// RPC, idempotent on the Stripe event id. A refund carries a cumulative
// amount_refunded; a dispute takes the whole lot.
assert.match(webhook, /event\.type === 'charge\.refunded' \|\| event\.type === 'charge\.dispute\.created'/u)
assert.match(webhook, /reverse_workspace_credit_lot_v1/u)
assert.match(webhook, /p_refunded_cents: refunded/u)
assert.match(webhook, /p_reference_kind: dispute \? 'stripe_dispute' : 'stripe_refund'/u)
assert.match(webhook, /p_idempotency_key: `stripe:\$\{event\.id\}`,\n\s+\}\)\n\s+if \(error\) \{\n\s+console\.error\('\[Stripe Credit Webhook\] Credit reversal failed'\)/u)
assert.match(webhook, /console\.warn\(/u)
// A refund or dispute that finds no lot for a recent credit-pack payment is
// handed back to Stripe for retry (bounded by the retry window); a won
// dispute grants back what the dispute removed, once per dispute.
assert.match(webhook, /const MISSING_LOT_RETRY_SECONDS = 3 \* 24 \* 60 \* 60/u)
assert.match(webhook, /const pack = await creditPackPayment\(object, paymentRef\)/u)
assert.match(webhook, /if \(ageSeconds < MISSING_LOT_RETRY_SECONDS\) \{[\s\S]{0,200}return json\(500, \{ error: 'LOT_NOT_FOUND_YET' \}\)/u)
assert.match(webhook, /\$\{STRIPE_API\}\/payment_intents\/\$\{encodeURIComponent\(paymentRef\)\}/u)
assert.match(webhook, /charge\.dispute\.closed/u)
assert.match(webhook, /if \(object\.status !== 'won'\)/u)
assert.match(webhook, /\.eq\('reference_kind', 'stripe_dispute'\)\s*\n\s*\.eq\('reference_id', disputeId\)/u)
assert.match(webhook, /p_idempotency_key: `stripe-dispute-won:\$\{disputeId\}`/u)

const reversal = readFileSync('supabase/migrations/20261011000200_billing_refunds_and_refill_failures.sql', 'utf8')
assert.match(reversal, /CREATE OR REPLACE FUNCTION public\.reverse_workspace_credit_lot_v1/u)
assert.match(reversal, /SECURITY DEFINER\nSET search_path = ''/u)
assert.match(reversal, /REVOKE ALL ON FUNCTION public\.reverse_workspace_credit_lot_v1\(TEXT, BIGINT, BIGINT, TEXT, TEXT, TEXT\)\n\s+FROM PUBLIC, anon, authenticated;/u)
// Only the lot's own remainder: never below zero, never from another purchase.
assert.match(reversal, /taken := LEAST\(wanted, lot\.remaining\)/u)
assert.match(reversal, /CREATE UNIQUE INDEX IF NOT EXISTS workspace_credit_lots_stripe_payment_ref_uidx/u)

// Historical payment processing remains enabled after sales are retired.
const config = readFileSync('supabase/config.toml', 'utf8')
assert.match(config, /\[functions\.stripe-credit-webhook\]\nverify_jwt = false/u)
const page = readFileSync('src/pages/app/WorkspaceBilling.tsx', 'utf8')
assert.doesNotMatch(page, /createWorkspaceCreditCheckout|setWorkspaceAutoRefill|CreditPackPicker/u)
assert.match(page, /getWorkspaceSubscriptionOverview/u)
assert.match(page, /confirmationPending/u)
console.log('Retired credit checkout and historical webhook contracts passed')
