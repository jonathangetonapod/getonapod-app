# Get On A Pod — invite-only workspace MVP

This application is an administrator-provisioned, multi-tenant MVP without
billing or public registration. A platform administrator creates an agency
workspace by inviting its owner or by generating a one-time temporary password.
That owner can add agency admins and members; the agency team signs in to one
private workspace, manages its own clients, and gives each client a separate
client portal.

## Current rollout status

The invite-only account lifecycle, manual account provisioning, tenant Clients
module, and administrator workspace view are deployed. The
workspace-customizable Guest Resources backend was added on 2026-07-22:
migration `20260721000200_workspace_guest_resources.sql` is the eighth
production migration, and the exact `workspace-guest-resources` v1 and
`get-guest-resources` v14 Edge revisions are active. The reviewed frontend at
commit `bc418e72e0b95e2b64d6632e58d880e65065b2b6` is on `main`, and Railway
deployment `ede90c81-111d-4e65-ac0f-9c46830b494a` succeeded. The workspace
experience uses the same responsive left-sidebar structure and product-module
order as the platform dashboard. Clients and Guest Resources are the enabled
tenant links; modules that do not yet satisfy the workspace-isolation contract
are visibly unavailable rather than linked to legacy global admin pages.

The Sub-agency Workspace Foundation is the current release candidate. It adds
exactly one transferable owner per private workspace, admins and members,
`/app/workspace-users`, native platform-owner management of a selected
workspace, independent employee lifecycle controls, and workspace-wide token
revocation. Its ninth foundation migration, tenth forward platform-owner
management migration, new Edge Function, stronger hosted Auth password policy,
and frontend are not production-active until the cutover checks in this
document pass. Client
Podcast System is the next tenant module after that foundation is stable.

The privileged-browser-key containment gate is complete. Railway now supplies
the project publishable key. After the frontend deployment, a second
Cloudflare purge was completed and the hardened recursive live browser verifier
passed. All six retired asset paths now fail closed with 404, `no-store`,
`text/plain`, and `noindex`. The exposed legacy service-role key remains
compromised: inventorying its non-browser consumers, reviewing the exposure
window, and safely rotating it are separate incident work. Do not disable it
before retained Edge and external consumers are migrated.

Credentials previously exposed through chat also still require provider-side
rotation.

The sanitized cutover evidence and remaining gates are recorded in
[`docs/production-cutover-2026-07-21.md`](docs/production-cutover-2026-07-21.md).

## MVP roles

| Role | Supported access |
| --- | --- |
| Platform administrator | Existing internal `/admin/*` application, agency-owner provisioning/workspace lifecycle, and owner-level management of a selected private workspace's users, Clients, and Guest Resources modules |
| Workspace owner | One agency workspace; invites admins or members, manages non-owner staff, transfers ownership, and manages tenant-enabled modules |
| Workspace admin | One agency workspace; invites and manages members and manages tenant-enabled modules, but cannot manage the owner or another admin |
| Workspace member | One agency workspace; no staff administration and read-only access to the currently enabled Clients and Guest Resources modules |
| Client portal user | Separate `/portal/*` login and client-specific bookings/resources view; this is not a SaaS workspace account |
| Anonymous visitor | Marketing pages plus enabled high-entropy client/prospect capability links only |

Each private workspace has one live, transferable owner plus optional admins
and members. A live email/Auth identity belongs to at most one private
workspace during the MVP, so tenant users do not receive a workspace selector.
Public signup, self-service billing, and cross-workspace access remain out of
scope. Tenant feature parity is being released one module at a time behind the
shared isolation contract.

## Routes

| Route | Access |
| --- | --- |
| `/login` | Workspace/platform account login |
| `/accept-invite` | Supabase email-invite completion |
| `/change-password` | Mandatory first-sign-in password replacement for manually created accounts |
| `/app/workspace-users` | Workspace owner/admin roster, invitations, roles, employee lifecycle, and ownership transfer |
| `/app/clients` | Authenticated workspace client CRUD |
| `/app/guest-resources` | Authenticated workspace resource customization, lifecycle, ordering, and client audience management |
| `/admin/users` | Platform administrator invitation/lifecycle console |
| `/admin/workspaces/:workspaceId/workspace-users` | Platform-owner management of the selected workspace's staff roster |
| `/admin/workspaces/:workspaceId/clients` | Platform-owner management of the selected workspace's Clients experience |
| `/admin/workspaces/:workspaceId/guest-resources` | Platform-owner management of that workspace's resource catalog and audience assignments |
| `/admin/*` | Platform administrator only, except `/admin/login` and the Auth callback `/admin/callback` |
| `/portal/login` | Separate client portal login |
| `/portal/dashboard`, `/portal/resources` | Authenticated client portal |
| `/prospect/:slug`, `/client/:slug` | Enabled capability dashboards; `noindex, nofollow` |

The following surfaces are retired for this MVP and redirect to a supported
landing page: billing/checkout, premium placements, customers/orders/analytics,
AI Sales Director, admin videos, admin blog, admin settings, and the old API
docs route. Their charge/order/video mutation endpoints return HTTP 410.

## Security boundaries

- The checked-in Supabase configuration disables public email signup and
  anonymous Auth, and the product exposes no signup UI. The foundation password
  contract is 12 or more characters, no more than 72 UTF-8 bytes, with
  uppercase, lowercase, digit, and symbol classes; permanent passwords cannot
  reuse the `Tmp-` prefix. Hosted Auth must be verified separately because
  checking in `config.toml` does not change production GoTrue settings.
- The server derives platform-admin status from the immutable Auth user ID, its
  current email, the `admin_users` allowlist, and an active default-workspace
  membership. Browser metadata or an email change alone is not an authority.
- Tenant authorization requires both the accepted Auth user ID and its bound
  membership email. A direct Auth email change fails closed. Suspension still
  uses the immutable user ID; reactivation requires administrator identity
  review.
- Invitations use a database-first two-phase flow. The service creates an
  active private workspace with a `provisioning` owner membership, attempts
  Supabase Auth delivery under a durable database claim, writes a service-owned
  Auth metadata marker, and only then advances the membership to `invited`. A
  known matching identity is invalidated before delivery becomes retryable;
  unresolved provider or identity ambiguity retains the claim and requires
  operator review. Invite acceptance also requires a password.
- Manual accounts use a separate database-first flow. The server—not the
  browser—generates a 28-character temporary password, creates an exact marked
  Supabase Auth identity without sending email, and returns the credential only
  in the successful `no-store` response. Plaintext credentials never enter the
  application database, audit log, Auth metadata, browser storage, or query
  cache. A lost credential is replaced, never retrieved.
- A manually created membership remains non-active until the user replaces the
  temporary password. Password rotation and first-password replacement use
  durable claims and exact attempt/execution markers. The provider password
  update revokes existing sessions before activation, and a membership token
  epoch plus current Auth metadata rejects stale access JWTs.
- Manual owner-account revocation is database-first: it immediately revokes the
  owner membership, archives the private workspace, clears portal capabilities,
  and then deletes only the exact marked Auth identity. Revoked rows are hidden
  from normal account and staff UX even when provider cleanup requires operator
  reconciliation; the durable claim and audit history remain available to the
  controlled recovery path.
- Credential reconciliation renews one exclusive execution lease only after a
  15-minute review window. That window deliberately exceeds Supabase's hosted
  Edge hard lifetime; revisit the invariant before self-hosting or increasing
  worker limits.
- The platform-owner workspace selector is an explicit URL-scoped management
  context that reuses the tenant Workspace Users, Clients, and Guest Resources
  layout/pages. It includes active owners and newly created manual-password
  accounts that are pending first sign-in, but excludes ordinary unaccepted
  email invitations, revoked memberships, and inactive workspaces. Only the
  platform owner receives the selector. Selecting a workspace does not create
  a tenant membership or mutate the platform owner's Auth context; supported
  writes are authorized server-side and audited under the platform owner's
  real Auth user ID.
- Platform workspace suspend/reactivate uses a separate durable service-only
  lifecycle claim. The database transition commits first and remains
  authoritative while Auth is
  reconciled. A different request token can never steal a claim automatically;
  `review_after` is only a 15-minute operator-review marker. Status-preserving
  service-only `reconcile_active` and `reconcile_suspended` actions verify Auth
  without reversing a newer database state, and successful reconciliation is
  audited before the exact claim is removed. Those recovery actions are not
  exposed as routine “Verify Auth” buttons in the administrator UX.
- Staff lifecycle is independent from workspace lifecycle. Suspending or
  removing a non-owner immediately blocks only that employee and never suspends
  the agency, archives client data, or revokes client portal sessions. The
  current owner can change only through atomic ownership transfer. A private
  workspace cannot be archived while live non-owner staff remain.
- Workspace users never query the full `clients` row. `workspace-clients`
  calls a service-only transactional RPC that returns a narrow projection and
  rechecks active membership and workspace state.
- Direct base-table access to `clients` and `bookings` is platform-admin-only.
  RLS and server checks both enforce the workspace boundary.
- Private workspace resources live in `workspace_guest_resources` with a
  required `workspace_id`; selected-client assignments use same-workspace
  composite foreign keys. Workspace mutations run through one service-only,
  audited transaction. The global `guest_resources` catalog is only the GOAP
  public/default catalog and seed source; existing workspace snapshots are not
  overwritten by later template edits.
- The portal never accepts a workspace ID. It revalidates the exact hashed
  client session, derives the client's active workspace, and returns a narrow
  DTO containing only published all-client or explicitly assigned resources.
  Published articles require visible text; video/link/download resources
  require a safe action target.
- Resource bodies use canonical editor HTML capped at 100,000 characters and
  are rendered through a restrictive sanitizer. Scripts, styles, forms,
  images, embeds, event handlers, and unsafe URLs are removed at the client
  display boundary.
- Client portal password verifiers are PBKDF2-HMAC-SHA256 values with a
  600,000-iteration work factor in the
  service-role-only `client_portal_credentials` table. The retired
  `clients.portal_password` column is constrained to `NULL`.
- Portal bearer tokens are opaque UUIDs. Only SHA-256 verifiers are stored;
  stored verifiers are never accepted as bearer tokens. Login attempt
  reservation is atomic and password/session changes revoke prior access.
- Changing a client's portal email is an identity reassignment: it disables
  portal access, deletes the old verifier and sessions, and requires a platform
  administrator to set a fresh password before the new identity can sign in.
- Client and prospect approval URLs are bearer capabilities with 96 bits of
  random suffix entropy. They are server-validated, excluded from the sitemap,
  marked `noindex, nofollow`, and use a no-referrer policy.
- Podscan and other paid/service credentials stay in server-side secret storage.
  No third-party secret may use a `VITE_` name.

## Local development

Requirements: Node.js 22.22.2, npm 10.9.7, and Deno 2.5.2. Node and npm match
`package.json`; all three exact versions match pull-request CI.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

The development server runs at `http://localhost:8080`.

Only browser-safe values belong in `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-staging-project.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-key-or-legacy-JWT-with-role-anon>
VITE_APP_URL=http://localhost:8080
```

Never place a service-role key, database password, OpenAI key, Podscan key,
Google service-account JSON, webhook secret, or other private credential in a
browser variable or tracked file. `credentials.json`, `.env*`, and service
account files are ignored.

Relevant server-side secrets are configured in Supabase, as required by the
functions being deployed:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `APP_URL`/`WEB_URL`, `ALLOWED_ORIGIN`/`ALLOWED_ORIGINS` for any optional
  HTTPS origins (including legacy domains, when still required)
- `PODSCAN_API_KEY` or `PODSCAN_TOKEN`
- `RESEND_WEBHOOK_SECRET`
- provider keys such as OpenAI, Resend, and Google credentials

The excluded legacy Clay/Bison handlers require `CLAY_WEBHOOK_SECRET` and
`CAMPAIGN_WEBHOOK_SECRET` only in their separate operator environment; do not
configure them in the tenant MVP environment.

Shared Edge CORS always permits `https://getonapod.com` and its `www` origin.
Localhost and `127.0.0.1` are permitted only when the Edge environment sets
`ENVIRONMENT=development` explicitly; an unset or non-development value fails
closed for local origins. Legacy production domains have no built-in access and
must be added through the origin settings above.

`npm run build` always uses the deterministic static sitemap and an isolated
Vite environment that does not load the repository's ignored dotenv files. It
does not contact Supabase. Generate a sitemap containing published blog URLs
only as a separate, explicit operation with `npm run sitemap:database` and
review the resulting file before committing or deploying it.

Railway is configured to build the root `Dockerfile`, not the obsolete
Nixpacks plan. Both build and runtime stages pin Node 22.22.2 and npm 10.9.7,
install from the reviewed lockfile with lifecycle scripts disabled, and run the
application as the unprivileged `node` user. The Docker build refuses to run
without `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_APP_URL` build
arguments. Supply only reviewed browser-safe values; Docker build arguments are
not a place for service-role or provider credentials.

The Docker build validates that the Supabase browser key is either an
`sb_publishable_...` key or a legacy JWT whose role is exactly `anon`, then
scans the completed `dist` bundle. `npm start` repeats the bundle scan before
opening a listening socket. To inspect the already deployed site without
printing any discovered value, run:

```bash
npm run verify:production-browser
```

That read-only network check recursively scans referenced JavaScript assets and
validates the public Supabase configuration. It passed after the 2026-07-22
publishable-key rebuild and Cloudflare purge and remains a required regression
gate for every frontend deployment.

## Database rollout

The original six-version production cutover and the seventh manual-account
forward migration were completed on 2026-07-21. The workspace Guest Resources
migration was applied as the eighth production migration on 2026-07-22. The
historical procedure below is retained for recovery and fresh environments.
The operator explicitly accepted proceeding without a dedicated staging
backend or restore rehearsal for the earlier release; do not generalize that
exception to future releases.

For future acceptance, use a dedicated staging project. Do not point synthetic
acceptance tests at production and do not replay the repository's entire
historical migration directory blindly. It contains many historical or
noncanonical files; the six coordinated 20260720 versions and
`20260721000100_manual_workspace_accounts.sql` are the historical 2026-07-21
production unit. The 2026-07-22 increment adds
`20260721000200_workspace_guest_resources.sql`. The legacy
`scripts/deploy-edge-functions.sh` and `scripts/run-migration.cjs` helpers are
intentionally retired and fail closed; they do not implement this release's
target, commit, backup, manifest, or evidence controls.

Use a coordinated maintenance window; do not run the SQL while historical
portal functions can still mint credentials or sessions:

1. Back up the target, record the remote Edge Function/webhook/schedule
   inventory, and quiesce client-portal traffic and automated callers.
2. Deploy all 17 HTTP 410 handlers in phase 1 of the checked-in Edge manifest.
   The five names in `unauthenticated_tombstone_probes` (the four legacy public
   functions plus `stripe-webhook`) must return 410 without a user JWT or side
   effect. Probe the other tombstones with an administrator JWT and require no
   provider/database side effect.
3. While traffic remains closed, deploy this branch's
   `login-with-password`, `validate-portal-session`,
   `logout-portal-session`, `get-client-bookings`, and `resend-webhook`.
   Before their new RPCs exist these handlers fail closed (Resend receives a
   retryable failure), preventing an old handler from crossing the cutover.
4. Apply this release unit in order:

   1. `supabase/migrations/20260720000100_invite_only_workspace_core.sql`
   2. `supabase/migrations/20260720000200_invite_only_workspace_rls.sql`
   3. `supabase/migrations/20260720000300_client_portal_security.sql`
   4. `supabase/migrations/20260720000400_resend_webhook_idempotency.sql`
   5. `supabase/migrations/20260720000500_client_prospect_link_normalization.sql`
   6. `supabase/migrations/20260720000600_trigger_function_privileges.sql`
   7. `supabase/migrations/20260721000100_manual_workspace_accounts.sql`
   8. `supabase/tests/20260720_invite_only_workspace_verification.sql`

5. Recheck the post-migration zero-token/hash-only invariants, inspect
   workspace/client ownership, deploy the remaining reviewed function manifest
   and frontend, then run the complete acceptance matrix before reopening
   traffic.

Migration 1 creates workspaces/memberships, assigns existing clients to the
default Get On A Pod workspace, and preserves the legacy administrator model.
Migration 2 installs tenant RLS, public-data containment, and the narrow client
operation RPC. Migration 3 hardens portal credentials/sessions and capability
links. Migration 4 makes signed Resend delivery events transactional,
deduplicated by `svix-id`, and monotonic under out-of-order delivery. Migration
5 canonicalizes an unlinked client-to-prospect reference to `NULL` and enforces
strong, non-orphaned capability references. Migration 6 removes residual
browser-role execution grants from trigger-only functions. Migration 7 adds
manual workspace-account credential state, durable claims, first-password
replacement, revocation cleanup, and the supporting service-only routines.
Migration 8 adds independent private-workspace resource catalogs, same-workspace
client assignments, service-only audited operations, portal visibility rules,
catalog quotas, canonical content/URL constraints, and snapshot seeding.

The incremental Guest Resources backend order was completed separately from
the historical cutover above:

1. The browser `service_role` exposure was contained with the project
   publishable key; Cloudflare was purged and the recursive live-asset verifier
   passed.
2. A checksummed private backup and target inventory were captured outside the
   repository before mutation.
3. Only `20260721000200_workspace_guest_resources.sql` was applied as migration
   8.
4. The committed catalog verifier passed against production over
   `verify-full` TLS using the Supabase Root 2021 CA, inside a serializable,
   read-only transaction. Its SHA-256 is
   `53f59f3593eb3753729d37422fc3e6965ef3a1e38abdce73cba51bc509704137`.
5. `get-guest-resources` v14 is active with gateway JWT verification disabled
   for its opaque portal-session contract; `workspace-guest-resources` v1 is
   active with gateway JWT verification enabled. The exact production
   inventory is 90 active functions: 75 JWT-verified and 15 reviewed
   public/custom-auth functions. CORS, fail-closed, and default-client narrow
   portal projection probes passed.
6. Frontend commit `bc418e72e0b95e2b64d6632e58d880e65065b2b6` was pushed
   directly to `main`, and Railway deployment
   `ede90c81-111d-4e65-ac0f-9c46830b494a` succeeded. After a second,
   post-deployment Cloudflare purge, the hardened recursive live verifier
   passed and all six retired asset paths returned 404 with `no-store`,
   `text/plain`, and `noindex`. That historical increment did not record a
   controlled signed-in tenant, platform-owner workspace management, or
   private-client audience acceptance run; current production state must be
   inventoried and tested again.

`scripts/run-workspace-guest-resources-behavior.sh` is for an explicitly
confirmed non-production local/staging database only. Its SQL opens one
transaction and ends with `ROLLBACK`; `check:static` grammar-parses it but does
not execute it. The synthetic PostgreSQL 18 behavior smoke passed against a
partial local Supabase-shaped schema. It is supporting evidence only and does
not substitute for production catalog or signed-in acceptance evidence.

Important cutover effects:

- Every pre-cutover client and prospect dashboard capability slug is rotated,
  regardless of its former format. Previously shared links stop working;
  inventory and distribute replacement URLs after controlled end-to-end
  acceptance.
- Raw legacy portal sessions are invalidated. Legacy plaintext portal
  credentials are deleted and affected portals are disabled; an operator must
  set a new password and securely reissue access before those clients sign in.
- Legacy client-portal magic-link tokens are deleted and cannot be redeemed.
- Existing client rows are assigned to the default workspace; other legacy data
  remains administrator-only. The production catalog verifier confirmed the
  ownership invariants.

Deploy the new account/client functions and every changed guarded function from
this branch as one reviewed, explicit allowlist. Do not bulk-deploy the entire
`supabase/functions` directory: the repository retains legacy operator code,
and `create-outreach-message` plus `campaign-reply-webhook` are intentionally
excluded from the tenant environment. The checked-in phased allowlist is
[`docs/invite-only-edge-manifest.json`](docs/invite-only-edge-manifest.json);
regenerate and review it if `main` moves. Delete any old remote copies of the
two excluded handlers from the tenant Supabase project before opening traffic;
omitting them from a deploy is not deletion. At minimum the MVP uses
`account-context`, `manage-workspace-users`, `manage-workspace-staff`,
`provision-workspace-account`, `accept-workspace-invite`, `workspace-clients`,
`workspace-guest-resources`, `manage-client-portal-password`, `podscan-proxy`,
`login-with-password`, `validate-portal-session`, `logout-portal-session`,
`get-client-bookings`, and `public-client-dashboard`.

Production currently contains the 17 reviewed 410 tombstones; omitting those
names from a future deploy does not remove a remote function. Keep the
tombstones in place through acceptance and external caller cleanup.
`get-client-portfolio` is replaced by the narrower
`public-client-dashboard` capability endpoint. After every caller, schedule,
and provider workflow is removed, delete the remote functions and list the
inventory again. The six separate shutdown targets are already absent.
Migration 3 deleted all outstanding magic-link tokens, so none may be restored.

Configure the Resend endpoint for only `email.sent`, `email.delivered`,
`email.delivery_delayed`, `email.failed`, `email.bounced`,
`email.complained`, `email.suppressed`, `email.opened`, and `email.clicked`.
Use a dedicated Resend account/team for this tracked application mail; an API
key or sending domain alone does not isolate webhook delivery. Do not attach
this handler to an account that also emits untracked Supabase Auth or other
mail. A temporarily missing log returns a retryable 500 so a send/log commit
race can recover; alert and reconcile any identifier that remains unmatched
before Resend exhausts retries.

Production hosted Auth disables email/anonymous signup, uses a 24-hour invite
expiry, and allows only the exact production `/accept-invite` and
`/admin/callback` redirects. Custom SMTP is still unconfigured, so invitation sending remains on
hold. A Supabase invite email is a bearer credential: anyone with the full link
can establish the invited Auth session, so it must not be forwarded or logged.

The foundation cutover must also reconcile the hosted password policy to the
checked-in 12-character/strongest-class contract. Run the read-only verifier
from an interactive terminal, then use the narrowly confirmed updater only if
it reports drift:

```bash
npm run verify:hosted-auth -- --project-ref ysjwveqnwjysldpfqzov
npm run verify:hosted-auth -- --project-ref ysjwveqnwjysldpfqzov --apply
```

The updater GETs the current Auth configuration, PATCHes exactly
`password_min_length` and `password_required_characters`, GETs again, and
fails if any unrelated setting changed. Do not use broad `supabase config push`
for this cutover; it can overwrite unrelated hosted Auth settings.

Before the foundation cutover, the production migration ledger records eight
coordinated versions. Migration
`20260722000100_subagency_workspace_foundation.sql` becomes the ninth and
`20260722000200_platform_owner_workspace_management.sql` becomes the tenth only
after their reviewed, ordered production apply and catalog verification
succeed. The tenth migration is also the forward upgrade for any controlled
environment that applied the foundation while selected-workspace platform
access was still read-only. Apply the complete current files to a fresh
dedicated staging baseline, or apply the tenth migration after the recorded
ninth version; never assume edits to an already-applied migration were replayed.

## Verification

Static checks:

```bash
npm run check:static
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
git diff --check
git diff --check origin/main...HEAD
```

`check:static` runs the release-shape verifier, parses all ten release
migrations, the catalog verifier, and both rollback behavior suites with a
PostgreSQL grammar parser, runs both
TypeScript checks, the zero-warning
MVP lint scope, and focused workspace UI tests, exercises the URL, telemetry,
session-storage, retired-helper, and evidence-path tests, checks all 93 Edge
entrypoints and 106 Edge TypeScript files plus shared Edge unit tests against the frozen Deno lock,
validates the database-runner shell, performs a clean install/build and both
audits for the nested MCP server,
tests the Guest Resources Edge contract, the dependency-free retired video-service tombstone with malformed and
oversized bodies, checks the exact Docker/Railway runtime contract and secret-
excluding build context, performs an isolated static build, launches the real
`npm start` server to test routes/assets/security headers, and scans the full
current worktree and built output for secrets. The secret scanner also runs
positive and negative self-tests and suppresses values in its output.

The pull-request workflow pins Node 22.22.2, npm 10.9.7, Deno 2.5.2, and the
GitHub Actions by immutable commit. It runs for pull requests and merge queues
without application secrets. If Deno is not on the local `PATH`, set `DENO_BIN`
to the 2.5.2 executable.

### Executable staging evidence

Run staging evidence only from a reviewed, clean commit. Both runners refuse a
dirty/untracked worktree, an unsafe branch name, an uncommitted release input,
a reused evidence path, or
an explicitly identified production target. Evidence paths must be absolute,
must have an existing current-user-owned parent that is not group/world
writable, and must be outside every linked worktree, the Git directory, and the
shared Git metadata directory.

The HTTP runner reads only dedicated `ACCEPTANCE_*` process variables. It does
not load `.env.local`, accept a service-role key, or write raw responses. Supply
one platform administrator and two already active, disposable private-workspace
staging accounts. Alice's and Bob's workspaces must each contain zero clients;
the harness refuses to mutate a workspace with existing client data:

```bash
export ACCEPTANCE_EXPECTED_PROJECT_REF='<staging-project-ref>'
export ACCEPTANCE_PRODUCTION_PROJECT_REFS='<production-project-ref[,another-ref]>'
export ACCEPTANCE_CONFIRM='RUN_SYNTHETIC_TESTS_ON_<staging-project-ref>'
export ACCEPTANCE_SUPABASE_URL='https://<staging-project-ref>.supabase.co'
export ACCEPTANCE_SUPABASE_ANON_KEY='<browser-safe-anon-or-publishable-key>'
export ACCEPTANCE_RUN_ID='goap-acceptance-001'
export ACCEPTANCE_ADMIN_EMAIL='<staging-platform-admin-email>'
export ACCEPTANCE_ALICE_EMAIL='<active-staging-tenant-a-email>'
export ACCEPTANCE_BOB_EMAIL='<active-staging-tenant-b-email>'
export ACCEPTANCE_EVIDENCE_PATH='/absolute/private/path/http-acceptance.ndjson'
read -r -s -p 'Staging admin password: ' ACCEPTANCE_ADMIN_PASSWORD; printf '\n'
read -r -s -p 'Staging Alice password: ' ACCEPTANCE_ALICE_PASSWORD; printf '\n'
read -r -s -p 'Staging Bob password: ' ACCEPTANCE_BOB_PASSWORD; printf '\n'
export ACCEPTANCE_ADMIN_PASSWORD ACCEPTANCE_ALICE_PASSWORD ACCEPTANCE_BOB_PASSWORD
npm run typecheck:staging
npm run test:staging
```

The runner creates tagged synthetic clients plus a selected-client resource,
attacks the Clients and Guest Resources boundaries over Edge Functions/REST,
checks platform-owner client/resource management and exact portal-session visibility,
checks exact tombstone/exclusion behavior, probes the
Resend signature/body limits, exercises suspend/reactivate plus portal-session
revocation, and removes its fixtures in `finally`. Its NDJSON contains only
fixed test labels, statuses, HTTP status codes, and source fingerprints—never
emails, UUIDs, tokens, URLs, request bodies, or response bodies. Exit `1` means
refused/failed; exit `2` means the runner's automated HTTP checks passed while
the separately reviewed external release gates recorded in the NDJSON remain
incomplete. Those records cover the database verifier, commit-bound deployment
inventory, hosted Auth, invite delivery fault injection and the backend
password gate, durable-claim recovery, manual-account creation, pre-change
denial, rotation, first-password replacement, stale-token denial, fault
reconciliation and revocation, administrator workspace-view isolation and
navigation, UI/legacy-admin checks, audit and portal races, the live Storage API
boundary, capability links, provider side
effects/decommissioning, credential rotation, historical telemetry review, and
signed Resend behavior. The runner
never turns those external gates into an automatic pass. Administrator
credentials are mandatory; omitting them is a configuration refusal, and any
incomplete record outside the exact checked-in allowlist converts the run to a
failure.

For a fresh environment, run the database verifier only after the historical
six migrations, `20260721000100_manual_workspace_accounts.sql`, and
`20260721000200_workspace_guest_resources.sql` have been applied to the same
release. Use `PG*` environment variables and prefer a
project-specific direct database hostname rather than a hostname shared by
production and staging. Hostnames with a trailing dot are refused. Never put
the connection URL or password on the command line or type a password into
shell history:

```bash
export PGHOST='<staging-database-host>'
export PGPORT='5432'
export PGDATABASE='postgres'
export PGUSER='<staging-database-user>'
export PGSSLMODE='verify-full'
export STAGING_DB_EXPECTED_PGHOST='<staging-database-host>'
export STAGING_DB_PRODUCTION_PGHOSTS='<production-database-host[,another-host]>'
export STAGING_DB_EVIDENCE_PATH='/absolute/private/path/database-verifier.ndjson'
read -r -s -p 'Staging database password: ' PGPASSWORD; printf '\n'
export PGPASSWORD
staging_release_commit="$(git rev-parse --verify HEAD)"
export STAGING_DB_CONFIRM="RUN_SQL_VERIFIER_ON_${STAGING_DB_EXPECTED_PGHOST,,}:${PGPORT}/${PGDATABASE}?user=${PGUSER}@${staging_release_commit}"
unset staging_release_commit
./scripts/staging-database-verifier.sh
```

This wrapper executes only the committed SQL verifier, in one serializable,
read-only transaction with `ON_ERROR_STOP`, a bounded runtime, no psql startup
files, and an exact committed snapshot of the SQL. Raw stdout/stderr live only
in a mode-700 temporary directory and are deleted on exit. The private evidence
directory must be owned by the current user and not group/world-writable. The
retained mode-600 NDJSON and `.sha256` files contain only the release
commit/input digest, a domain-separated SHA-256 fingerprint of the canonical
host/port/database/user target, and pass/fail/exit metadata.

These are local/static checks. They do not execute either database runner and
do not run `npm run verify:production-browser`; the latter is a separate
read-only live-network incident gate. The app and staging TypeScript checks are green. The repository still contains
legacy full-repository ESLint debt outside the zero-warning MVP scope; compare
that non-gating baseline with `main` if it is changed. The production build,
production-dependency audit, release secret scan, and all-entrypoint Deno check
must pass. A local PostgreSQL parser catches SQL grammar errors, but only the
catalog verifier against the actual staging schema can validate definitions,
ACLs, RLS, and data invariants.

Historical prior-release evidence (2026-07-21; production backend at clean deployment
source head `bc763431a298be26a93b2aa16de846991f8aebb1`):

| Check | Result |
| --- | --- |
| No-secret PR workflow definition | Pass; pinned Node/Deno, locked dependencies, no deploy/database step |
| Clean locked install | Pass; Node 22.22.2 and npm 10.9.7 with lifecycle scripts disabled |
| Production build/static sitemap | Pass; Vite 7.3.6, 3,139 modules, and five public sitemap URLs |
| Full and production dependency audits | Pass; zero vulnerabilities at `audit-level=low` |
| Nested MCP clean install/build/audits | Pass; MCP SDK 1.29.0 and zero full/production vulnerabilities |
| Docker/Railway deployment contract | Pass; exact two-stage Node/npm toolchain, required browser build arguments, non-root runtime, and secret-excluding context |
| Release/Edge manifest shape | Pass; 91 changed functions = 89 deployed, including 17 tombstones, plus 2 tenant-environment exclusions; 102 Edge TypeScript files |
| Production migration unit | Pass; all seven versions applied and reconciled into the migration ledger with names and statement arrays |
| Production database catalog verifier | Pass; exact committed verifier ran serializable/read-only and ended with `ROLLBACK` |
| Production Edge inventory | Pass; 89 expected/active, zero missing/unexpected, 75 JWT-verified and the exact 14 reviewed non-JWT handlers |
| Hosted Auth and CORS | Pass; signup/anonymous disabled, 24-hour invite expiry, allowlist reduced to the exact two production callbacks, and `account-context` preflight 204 |
| Fail-closed HTTP containment | Pass; protected unauthenticated requests denied, public handlers reject empty input, and five public tombstones return 410 |
| Billing/video containment | Pass; Stripe endpoint tombstoned and Edge secrets removed; Railway video API tombstoned and service credentials removed |
| Edge semantic type check | Pass; all 91 entrypoints on Deno 2.5.2 with frozen `deno.lock` |
| Edge TypeScript inventory/syntax check | Pass; 102 function/shared TypeScript files |
| App TypeScript | Pass; zero diagnostics |
| Staging HTTP runner type check | Pass |
| Focused MVP ESLint | Pass; zero warnings |
| Sensitive URL/telemetry tests | Pass |
| Release secret scan | Pass; 589 full-current-tree files including ignored dotenv/build files, built output, 23 positive and 3 negative scanner self-tests; values suppressed |
| Staging runners with missing environment | Pass; refuse before network/artifact creation |
| Database verifier shell syntax | Pass |
| Local SQL grammar parse | Pass; seven migrations plus verifier |
| Patch whitespace check | Pass |

The static, catalog, inventory, hosted-configuration, and unauthenticated HTTP
gates above are complete. They do not replace signed-in browser acceptance,
SMTP/invitation delivery, two-account isolation, provider-side webhook/caller
removal, credential rotation, or concurrency/fault testing.

Remaining end-to-end acceptance requires one platform administrator and two
disposable invited test accounts:

- each account sees only its own client list;
- guessed/direct client UUID reads and every cross-account write fail;
- hidden/internal client fields cannot be changed through tenant APIs;
- live Storage API tests prove Alice, Bob, and anonymous users cannot insert,
  update, or delete objects; any existing administrator write path remains
  administrator-only; and intended public reads are neither widened nor broken;
- suspend denies workspace APIs immediately and transactionally revokes that
  workspace's client portal sessions/tokens; successful reconciliation also
  bans the Auth identity, while an uncertain provider result retains the claim;
  reactivate restores only workspace access after reconciliation;
- provider success/error/timeout fault injection leaves no usable orphan invite;
  `provisioning` can be retried/revoked, and activation is denied before
  backend-observed password setup;
- the originating same-token Auth reconciliation retry is idempotent; once that
  token is lost, the pending UI remains locked until an operator reconciles the
  provider/database state and removes only the reviewed exact claim through the
  service-only recovery path;
- expired/revoked invitations cannot be accepted;
- a stored portal session verifier cannot be used as a bearer token;
- changing a portal email disables access and the old password cannot
  authenticate the replacement identity;
- enabled replacement capability links work, old links fail, and disabled
  dashboards fail closed;
- all retired billing/order/video endpoints return 410 and no provider can
  create a charge or paid video job;
- duplicate/out-of-order Resend events do not double-count engagement, regress
  delivery status, or skip hard-bounce/complaint/provider suppression; a
  provider-suppressed event must not increment bounce counts or alter bounce
  timestamps;
- historical Sentry/hosting logs are reviewed for leaked invite, recovery, or
  capability URLs; affected sessions/links are revoked and retained telemetry
  is purged under the incident process.

The detailed rollout and acceptance matrix is in
[`docs/invite-only-mvp.md`](docs/invite-only-mvp.md).

## Known MVP limitations

- The workspace sidebar shows the intended full product map, but only Clients
  and Guest Resources are enabled today. Podcast operations, outreach,
  reporting, and every other legacy module remain platform-admin-only until
  they receive an explicit `workspace_id` model and isolation tests.
- The platform owner's selected-workspace context reuses the real tenant
  Workspace Users, Clients, and Guest Resources experiences with native write
  controls. It is not an impersonation mode, preserves the platform session,
  and does not make legacy modules tenant-aware.
- Workspace owners can invite admins or members; workspace admins can invite
  members. Tenant identities still cannot own or join multiple private
  workspaces in this MVP.
- Workspace password recovery has no product UI yet; support must perform a
  controlled Supabase Auth recovery/reset.
- Temporary passwords for manually created accounts are displayed once. They
  must be transferred out of band through an approved secure channel; if the
  password is lost, the administrator issues a new temporary password.
- The production invitation UI warns about email readiness but has no automatic
  SMTP-health switch. Until SMTP and a real invite are verified, administrator
  discipline is the release gate and the Invite user action must not be used.
- The client portal is intentionally minimal and separate from workspace Auth.
- Clearing a client portal password deletes the verifier, sessions, and tokens,
  so authentication fails closed, but it does not automatically clear the
  historical `portal_access_enabled` display flag. Disable portal access
  explicitly when retiring a portal until that state is normalized.
- The frontend build still emits a large single-chunk warning; route-level code
  splitting is post-MVP performance work.
- Both the full and production dependency audits are currently clean. Keep the
  exact lockfile and rerun both audits on the reviewed merge commit.
- `create-outreach-message` and `campaign-reply-webhook` are excluded from the
  tenant MVP deploy. Their shared webhook secrets, caller-supplied client IDs,
  and non-atomic duplicate checks are not a tenant boundary. Keep them disabled
  for tenant traffic until they have explicit workspace/client mapping, unique
  provider-event keys, and one transactional ingestion RPC. If the legacy
  administrator still needs them, run them only in an isolated operator
  environment with separate secrets and acceptance evidence.
- `mcp-prospect-dashboard` remains trusted, local, stdio-only operator tooling.
  It holds a service-role credential and is not a tenant API; never expose it
  over HTTP or include it in the tenant deployment.
- The Resend receipt ledger has no automatic retention job yet. Monitor its
  growth and add a service-only purge whose retention window exceeds the
  provider retry/replay horizon before production volume grows.
- The checked-in production server sets no-referrer, nosniff, frame denial, and
  a restricted permissions policy on every response, plus no-store/noindex for
  private application routes. Production hosting must preserve and verify those
  headers and add environment-specific CSP and HSTS at the hosting/CDN boundary.

## Credential incident and repository controls

The browser-key containment step completed on 2026-07-22: Railway now uses the
project publishable key, a clean rebuild was deployed, and the original
Cloudflare purge removed the credential-bearing cache entries. After the final
frontend deployment, a second Cloudflare purge was completed and the hardened
`npm run verify:production-browser` passed across the live referenced asset
graph. The six retired asset paths now return 404 with `no-store`,
`text/plain`, and `noindex`. Do not reproduce or use the formerly exposed
privileged value; it remains compromised even though it is no longer shipped
to browsers.

Long-term incident work remains open. Audit Supabase/API/hosting logs for the
exposure window and inventory every Edge, server, webhook, database, and
external consumer of the legacy service-role key. Disable/rotate that key only
after retained consumers are migrated; revoking it earlier can break
production services.

The current-tree secret scan is green, but that also does not make previously
exposed provider credentials safe. Review found non-placeholder Podscan and
BridgeKit credentials in repository history. OpenAI, Podscan, Jotform, and Clay
webhook credentials were also shared through chat. Treat every affected value
as compromised: revoke/rotate it, review provider, Supabase, CI, hosting, Sentry,
and support logs, and replace it only in server-side secret storage. Keep exact
incident locations in the private response record rather than public docs.

No history rewrite has been performed. If the repository owner chooses to
remove the historical blobs, coordinate `git filter-repo`, force-push timing,
open pull requests, forks/clones, GitHub caches, CI artifacts, and third-party
logs as one incident operation. Rewriting Git history does not replace
credential rotation.

As checked on 2026-07-21, `main` has no GitHub branch protection. The repository
defines the **No-secret static validation** workflow for pull requests and
merge queues, but the repository owner explicitly selected a reviewed
direct-`main` workflow for this production increment. That accepted repository-
control risk does not waive the local static suite, exact-diff review, or live
post-deployment checks. Branch protection remains a future hardening option,
not a prerequisite for this operator-approved cutover.

The root Dockerfile provides an executable frontend container path, but there
is intentionally no automated Supabase Edge/database rollout executor in this
repository: the legacy deploy/migration helpers refuse to run. A staging backend
rollout still needs a reviewed executor or operator procedure bound to the exact
commit, project, backup, phased manifest, and private evidence directory.

## Remaining release gates

The account/Clients and Guest Resources backend/frontend production rollouts
are complete. The current production workspace inventory must be captured
again, then controlled accounts must complete signed-in tenant customization,
platform-owner workspace management, selected-client private-portal visibility,
draft/archive denial, malformed/stale access, and two-workspace isolation.
Historical evidence did not complete those checks, so they cannot yet be
claimed for the foundation release.

Separate incident and operations work remains: inventory and rotate the legacy
service-role key safely, rotate the other exposed provider credentials and
review logs, complete two-workspace isolation with disposable accounts, and
decide when to delete the credential-free Railway video tombstone project and
17 Edge tombstones after caller quietness is proved.

Credentials previously committed in repository history or shared through chat
remain compromised after source cleanup. Rotate them; deleting the visible
string is not sufficient.
