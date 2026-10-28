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

Tenant operations require customer-owned credentials. Missing or undecryptable
keys stop the relevant feature with `PROVIDER_KEY_REQUIRED`; they never fall back
to platform credentials.

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
remaining purchased balances with the customer before production cutover; the UI
points affected customers to support.

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
