# Workspace subscriptions and provider accounts

The application uses one flat workspace subscription for new customers. The
Standard plan is seeded at **$99 USD/month**, with unlimited clients and team
members. Stripe's configured Price is authoritative. Existing subscribers retain
their Stripe subscriptions and prices, including founding-member prices.
Complimentary access remains available to platform administrators.

## User billing portal

`/app/settings/billing` shows subscription status, actual subscriber price,
renewal/cancellation timing, payment settings, invoices, and provider connections.
Owners and workspace administrators can manage billing; only owners and platform
administrators can change provider credentials. Stripe hosts card collection,
invoices and cancellation. Card details never pass through the application.

The page provides jump links for the plan, payments and provider setup. Past-due
subscriptions prioritize payment recovery. Checkout cancellation is acknowledged
without claiming a payment result, and a late webhook confirmation clears the
pending state even after automatic polling has stopped.

Provider setup shows research/search first, with additional providers in a
collapsible section. A failed status request shows recovery controls instead of
empty key forms. Key entry supports keyboard submission and keeps saved secrets
masked.

The portal reads `subscription-overview`, which does not query the credit ledger.
A successful redirect starts bounded polling; it does not prove payment. If Stripe
cannot confirm a legacy price, the page displays an unavailable price rather than
substituting the current catalog price. Former subscribers with a Stripe customer
can still open payment settings and historical invoices.

## Provider costs

Tenant operations require customer-owned credentials. Missing keys stop the relevant feature with `PROVIDER_KEY_REQUIRED`. Storage or
decryption failures return `AI_KEY_STORAGE_UNAVAILABLE` or
`PROVIDER_CONNECTION_UNAVAILABLE`; they do not instruct users to replace valid
credentials. Tenant operations never fall back to platform credentials.

- Anthropic: research, client briefs, pitches and replies.
- OpenAI: semantic database searches and embeddings.
- Podscan: live discovery and requested episode refreshes.
- Blitz: direct host contact enrichment.
- Winnr: domain/mailbox provisioning, billed to the customer's provider account.
- Instantly: remains a separate customer-owned sending integration.

Keys are encrypted with the existing credential-storage mechanism. Anthropic and
OpenAI keys are probed on save. Other providers' keys are stored and checked when
used; the UI does not claim they were verified. Cached catalog data remains
shared. Optional episode captures may reuse that data without a Podscan key but
cannot fall back to the platform key to fetch new data.

Platform-scoped maintenance can still use platform credentials. Shared catalog
maintenance, email verification, hosting and storage therefore remain platform
costs. Unlimited clients is not a promise of unlimited platform-funded provider
usage. Existing catalog/search rate limits remain in place.

## Access and trials

The service-role-only `workspace_subscription_access_v1` RPC authorizes active
workspaces with an active or complimentary billing profile, or an unexpired trial.
The default trial is 14 days from workspace creation unless overridden. The
platform's default workspace is exempt from subscription payment.

Authenticated operational writes and provider resolution check this entitlement.
Billing and account/key recovery remain reachable after expiry or failed payment.
Client and guest-resource lists, plus staff onboarding lists, details and existing
links, remain readable for recovery and access to existing data. Creating,
editing, deleting or publishing those resources requires access. Public client
onboarding submissions retain their separate capability-based authorization.
Keyword-only catalog search does not require an OpenAI key, and mailbox setup can
report a disconnected provider before a Winnr key is supplied.
Scheduled autopilot/provider work and inbox enrollment/nudges also check access.
Existing campaigns already running in the customer's external sending account
are not cancelled automatically by this change.

## Credit retirement and historical money

No new app credit debits are issued, even if the old enforcement environment flag
is still enabled. Credit checkout and refill endpoints return HTTP 410. Credit
allowance/grant/removal/refill management actions are retired. The migration clears
refill settings, sets allowances to zero, prices operations at zero, and removes
allowance, refill and expiry schedules.

Existing lots, ledger entries, payment references and audit records are preserved.
The platform workspace billing page keeps the historical ledger for reconciliation.
The signed credit webhook remains active for delayed purchases, refunds and
disputes. Do not remove that endpoint when retiring sales.

**Outstanding purchased credits require an explicit customer settlement policy.**
This change does not refund money or convert balances automatically. Reconcile
remaining purchased balances with the customer. The billing page shows the
historical purchased balance and allows an owner or administrator to request a
review. Platform administrators have a review queue and must record the verified
outcome before marking a review complete. These actions do not move money or
change credit lots. A completed review cannot be overwritten by a retry.

## Checkout and provider recovery

Tenant checkout and administrator checkout links share a durable workspace attempt.
Concurrent requests reuse the same frozen Stripe parameters and idempotency key.
An uncertain Stripe response blocks a fresh payment until the existing attempt can
be reconciled; the app does not infer failure from a network timeout. A reused
checkout retains its original price and expiration. Payment access still depends
on verified subscription state, not the return URL.

Provider responses distinguish `PROVIDER_KEY_REJECTED`, `PROVIDER_BILLING_REQUIRED`,
`PROVIDER_RATE_LIMITED` and `PROVIDER_UNAVAILABLE`. HTTP 402 alone must not be
interpreted as a depleted app credit balance. Key tests validate authentication;
they do not guarantee funds, quota or access to every model. Keys belong to the
workspace and should use an account the organization controls. Replacing/removing
a key affects all members but does not cancel external jobs or charges.

## External automation and n8n

Remove app credit debit/refill logic while retaining historical records. Every
job must retain its workspace identity and enforce subscription access; privileged
credentials are not a bypass. Use the workspace provider connection without a
cross-workspace or platform-key fallback. Route subscription errors to app billing,
provider billing errors to that provider, and rejected keys to the workspace owner.
Use bounded retries for transient provider errors, but reconcile any action that
may already have sent a message or purchased a resource before replaying it.
`WINNR_UNCONFIRMED` requires reconciliation rather than another order.

App cancellation and key removal do not automatically stop n8n schedules, external
campaigns, mailboxes or domains. Their owners must implement explicit pause and
cleanup handling. Keep the historical credit webhook for delayed refunds/disputes;
do not automatically refund or convert old balances. This repository change does
not modify external n8n workflows. Legacy `send-outreach-webhook` payloads have no
workspace routing and remain platform-scoped. Review them before enabling BYO
automation; adding a workspace ID alone does not satisfy tenant user authorization.
Also update n8n-owned checkout email templates that still mention old credit plans.

## Deployment

Migration `20261031000200_flat_workspace_subscriptions.sql` has been applied to
Get On A Pod (`ysjwveqnwjysldpfqzov`). Live verification confirmed zero credit
operation prices, disabled refill settings and retired credit schedules, correct
provider constraints and entitlement grants, and unchanged subscription prices
and identities. All 18 historical credit lots and 190 ledger entries were retained.
Only this billing migration was pushed; unrelated pending migrations were excluded.

The frontend and 70 existing Edge Functions that depend on the updated billing
and authorization helpers were deployed to production on 2026-10-28. Railway
release `35df2c88-1d6d-488d-98dd-cf303324d458` passed its health check. Backend
verification confirmed active function versions, preserved JWT settings, HTTP 410
for retired credit endpoints, and HTTP 401 for unauthenticated billing requests.
The live bundle check passed across 251 assets and confirmed both updated billing
and provider-setup components. The billing route redirects signed-out visitors to
sign-in. No live Stripe
subscriptions or prices were changed by the migration.

Desktop/mobile previews and keyboard key submission passed, alongside 1,867
frontend tests and 194 backend tests. Signed-in Stripe checkout and customer
portal completion still need an authenticated acceptance run; no live charge was
created as part of verification. The deployment procedure for future releases is:

1. Apply `20261031000200_flat_workspace_subscriptions.sql` during the coordinated
   cutover. It adds the entitlement RPC and provider types before edge functions
   can use them, and disables refill schedules and database credit spending.
2. Deploy changed edge functions, including the retired checkout/refill endpoints,
   subscription overview, auth/key helpers, provider callers and automated jobs.
   Avoid leaving old allowance-granting edge code running during the cutover.
3. Deploy the frontend. Ensure Standard has the intended monthly Stripe Price.
   Preserve existing subscriptions and founding Price IDs; do not bulk-reprice them.
4. Verify Stripe's customer portal opens with payment-method updates, invoice
   history and cancellation at period end. The endpoint sets these features
   explicitly and disables plan switching so legacy prices cannot change accidentally.
5. Keep subscription and historical credit webhook secrets/event subscriptions.
   Configure customer provider accounts before enabling their provider-backed work.
6. Verify a new subscription, existing legacy price, failed payment recovery,
   trial expiry, cancellation and historical refund using Stripe test mode before
   promoting the release.

Automated checks cover portal rendering, authorization routing, absent-key
isolation, credit retirement, legacy webhook contracts, SQL grammar and grants.
Live Stripe behavior and migration execution require deployment verification.

### Edge-case follow-up

Migrations `20261031000300_workspace_checkout_attempts.sql` and
`20261031000400_legacy_credit_reviews.sql` were applied on 2026-10-28.
Post-migration checks confirmed service-only access, row security, and unchanged
credit history and subscription identities/prices. Full static checks passed,
including 226 Deno tests. An isolated PostgreSQL test additionally exercises
12 concurrent checkout callers, conditional rotation, failed-write rollback,
review constraints and aggregate balances across 1,500 historical lots. Run it
with `npm run test:checkout-database` when Docker is available.

## Transactional email delivery follow-up (prepared, not deployed)

Transactional and recovery emails keep using the platform Gmail mailbox, including
after a workspace subscription expires. BYO credentials apply to tenant provider
work; they do not gate account recovery or app mail.

The n8n delivery candidate uses a PostgreSQL unique operation claim and canonical
payload fingerprint. Only the inserting request can send. Receipts have no expiry;
uncertain attempts remain held regardless of age. Existing n8n receipt rows are
archived during cutover, including duplicates and unresolved attempts. Legacy keys
without fingerprints are held for review, never silently reused for new content.

`sendAppEmail` preserves `status: 'unknown'` and `DELIVERY_UNCONFIRMED`, including
timeouts and missing receipt acknowledgements. Unknown is not a rejection or an
automatic retry. Checkout, onboarding, portal-invite wrappers, and milestone
notification records preserve that state. The UI asks the operator to check
delivery before sending another message. Migration
`20261031000600_email_delivery_unknown.sql` permits and holds unknown onboarding
records; apply it before deploying these callers. It makes no credit mutations.

Callers should pass the same stable business-operation key on every replay. Keys
are validated, not truncated. The fallback key hashes canonical event content, so
identical unkeyed requests are deduplicated. A deliberately new, identical message
needs an explicit new operation key after verifying the previous outcome; changing
a key is never a recovery mechanism for an unknown delivery.

Local caller/workflow contract tests and isolated PostgreSQL concurrency/crash tests
are in the paired N8N `goap-platform` worktree. Its README contains the coordinated
cutover procedure. Neither these app changes nor the n8n candidates are deployed.

### Durable app email operations and n8n handoff

The app reserves onboarding and checkout email operations before calling n8n.
Retries retain their original operation identity. A new intentional reminder gets
its own operation only after the previous outcome is known; sending and unknown
operations block replacement sends. The client persists the pending onboarding
request across reloads. “Check delivery” reads the operation receipt only.

Add-on request email keys use the persisted activity ID. Clips editor alerts use
the saved lead ID returned by the new backwards-compatible RPC, preserving inbox
confirmation and IP rate limits. Portal invite/reset keys hash the persisted
recovery capability, so a branding change cannot resend the same capability and
bearer tokens never appear in receipt keys. Explicit failure fields override a
sent-looking HTTP 200 response.

Apply migrations 006–009 before deploying these app callers. Run the focused real
PostgreSQL checks with `npm run test:onboarding-email-database`,
`npm run test:checkout-email-database`, and `npm run test:clips-email-database`.
They use disposable containers and never contact customers.

Instructions for the n8n operator:

1. Keep the app's `idempotency_key` unchanged, including after a timeout or a
   template update. Reject changed content under an existing key; do not invent
   a replacement key to escape a hold.
2. Preserve atomic first-owner claims, owner-checked receipts, permanent receipt
   retention, and `DELIVERY_UNCONFIRMED` holds. Only confirmed non-admission may
   return `503 DELIVERY_NOT_ATTEMPTED` with `retryable: true`.
3. Use the platform mailbox for transactional/auth/recovery mail. These workflows
   must not require an active subscription or a tenant BYO provider key.
4. Follow the N8N repository's coordinated cutover: stop admission and drain both
   old app/auth workflows, disable pruning, export every legacy row, import and
   verify the count/digest, activate claims, switch both generated candidates,
   verify receipts, then reopen admission. Preserve workflow IDs and credentials.
5. Keep legacy records intact. Previously pruned receipts cannot be reconstructed;
   do not replay old events under newly generated operation IDs. Reconcile unknown
   and legacy outcomes manually. Rollback must retain both receipt stores and
   must never re-enable the unsafe lookup/upsert send path.

Local n8n candidates and their dedicated mail database are owned by the n8n rollout;
merging app code alone does not deploy those workflows. No real mail is sent by
these verification steps.
