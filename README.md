# Get On A Pod — invite-only workspace MVP

This application is an administrator-provisioned, multi-account MVP without
billing or public registration. A platform administrator can invite a user by
email or create the account manually and hand over a one-time temporary
password. Each user signs in and manages clients inside one private workspace.

## Current rollout status

Pull request #1 was merged into `main` on 2026-07-21 at commit
`3f608997522a76207ace8ebf355daf0cf3642865`. Railway automatically deployed
that frontend to the production GOAP service. The coordinated production
Supabase cutover was completed on 2026-07-21 from the follow-up release branch,
whose backend deployment/configuration head was
`b2655c36f46042d4ace56236fbd373272205e207`.

Production now has all six release migrations, a passing catalog verifier, and
an exact inventory of 87 active Edge Functions with no JWT-policy drift.
`account-context` has a valid production CORS preflight, and the six approved
legacy shutdown targets are absent. The separate video service is a
credential-free 410 tombstone, and obsolete Stripe Edge secrets were removed.

Pull request #2 is now merged, so `main` matches the deployed cutover source.
The manual-account and read-only workspace-view feature described below is the
next release and is not yet deployed. Its migration, two new Edge Functions,
changed guarded functions, frontend, and acceptance evidence must move as one
reviewed release. Credentials exposed through chat still require rotation.

The sanitized cutover evidence and remaining gates are recorded in
[`docs/production-cutover-2026-07-21.md`](docs/production-cutover-2026-07-21.md).

## MVP roles

| Role | Supported access |
| --- | --- |
| Platform administrator | Existing internal `/admin/*` application, email invitations, manual account creation, account suspension/reactivation, and a read-only view of each private workspace's clients |
| Workspace user | `/app/clients`; create, list, edit, and delete only clients owned by the user's private workspace |
| Client portal user | Separate `/portal/*` login and minimal bookings/resources view for a client record; this is not a SaaS workspace account |
| Anonymous visitor | Marketing pages plus enabled high-entropy client/prospect capability links only |

Each invited account owns one private workspace. User-managed teams, multiple
members per private workspace, public signup, self-service billing, and full
tenant access to every legacy operational module are deliberately out of scope.

## Routes

| Route | Access |
| --- | --- |
| `/login` | Workspace/platform account login |
| `/accept-invite` | Supabase email-invite completion |
| `/change-password` | Mandatory first-sign-in password replacement for manually created accounts |
| `/app/clients` | Authenticated workspace client CRUD |
| `/admin/users` | Platform administrator invitation/lifecycle console |
| `/admin/workspaces/:workspaceId/clients` | Platform administrator read-only view of one explicitly selected private workspace |
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
  anonymous Auth, and the product exposes no signup UI. Production hosted Auth
  was verified to match on 2026-07-21; only a platform administrator may create
  a workspace invitation.
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
- Manual-account revocation is database-first: it immediately revokes the
  membership, archives the private workspace, clears portal capabilities, and
  then deletes only the exact marked Auth identity. Interrupted cleanup remains
  visible under a durable claim and becomes safely retryable after review.
- Credential reconciliation renews one exclusive execution lease only after a
  15-minute review window. That window deliberately exceeds Supabase's hosted
  Edge hard lifetime; revisit the invariant before self-hosting or increasing
  worker limits.
- The administrator workspace selector is an explicit URL-scoped, read-only
  view. It does not impersonate the tenant, mutate the administrator's Auth
  context, or silently fall back to another workspace.
- Suspend/reactivate uses a separate durable service-only lifecycle claim. The
  database transition commits first and remains authoritative while Auth is
  reconciled. A different request token can never steal a claim automatically;
  `review_after` is only a 15-minute operator-review marker. Status-preserving
  `reconcile_active` and `reconcile_suspended` actions verify Auth without
  reversing a newer database state, and successful reconciliation is audited
  before the exact claim is removed.
- Workspace users never query the full `clients` row. `workspace-clients`
  calls a service-only transactional RPC that returns a narrow projection and
  rechecks active membership and workspace state.
- Direct base-table access to `clients` and `bookings` is platform-admin-only.
  RLS and server checks both enforce the workspace boundary.
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
VITE_SUPABASE_ANON_KEY=your-staging-anon-key
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

## Database rollout

The six-version production rollout was completed on 2026-07-21. The procedure
below is retained for recovery and future environments. The operator explicitly
accepted proceeding without a dedicated staging backend or restore rehearsal;
do not generalize that exception to later releases.

For future acceptance, use a dedicated staging project. Do not point synthetic
acceptance tests at production and do not replay the repository's entire
historical migration directory blindly. It contains 86 historical or
noncanonical files; only the six coordinated 20260720 versions are authoritative
for this cutover and recorded in the production migration ledger. The legacy
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
   7. `supabase/tests/20260720_invite_only_workspace_verification.sql`

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
browser-role execution grants from trigger-only functions.

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
`account-context`, `manage-workspace-users`, `accept-workspace-invite`,
`workspace-clients`, `manage-client-portal-password`, `podscan-proxy`,
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

Production records the exact six-version release unit in its migration ledger.
Apply those complete current files to a fresh dedicated staging baseline, or
replay staging from its pre-MVP backup; do not assume that an older draft of a
release migration has been upgraded in place.

## Verification

Static checks:

```bash
npm run check:static
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
git diff --check
git diff --check origin/main...HEAD
```

`check:static` runs the release-shape verifier, parses the six historical
cutover migrations, the pending manual-account migration, and the SQL verifier
with a PostgreSQL grammar parser, runs both TypeScript checks, the zero-warning
MVP lint scope, and focused workspace UI tests, exercises the URL, telemetry,
session-storage, retired-helper, and evidence-path tests, checks all 91 Edge
entrypoints and shared Edge unit tests against the frozen Deno lock,
validates the database-runner shell, performs a clean install/build and both
audits for the nested MCP server,
tests the dependency-free retired video-service tombstone with malformed and
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

The runner creates tagged synthetic clients, attacks the tenant boundary over
Edge Functions and REST, checks exact tombstone/exclusion behavior, probes the
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

For the pending manual-account release, run the database verifier only after
the historical six migrations and
`20260721000100_manual_workspace_accounts.sql` have been applied to the same
staging release. Use `PG*` environment variables and prefer a project-
specific direct database hostname rather than a hostname shared by production
and staging. Hostnames with a trailing dot are refused. Never put the connection
URL or password on the command line or type a password into shell history:

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

The app and staging TypeScript checks are green. The repository still contains
legacy full-repository ESLint debt outside the zero-warning MVP scope; compare
that non-gating baseline with `main` if it is changed. The production build,
production-dependency audit, release secret scan, and all-entrypoint Deno check
must pass. A local PostgreSQL parser catches SQL grammar errors, but only the
catalog verifier against the actual staging schema can validate definitions,
ACLs, RLS, and data invariants.

Latest release evidence (2026-07-21; production backend at clean deployment
source head `b2655c36f46042d4ace56236fbd373272205e207`):

| Check | Result |
| --- | --- |
| No-secret PR workflow definition | Pass; pinned Node/Deno, locked dependencies, no deploy/database step |
| Clean locked install | Pass; Node 22.22.2 and npm 10.9.7 with lifecycle scripts disabled |
| Production build/static sitemap | Pass; Vite 7.3.6, 3,139 modules, and five public sitemap URLs |
| Full and production dependency audits | Pass; zero vulnerabilities at `audit-level=low` |
| Nested MCP clean install/build/audits | Pass; MCP SDK 1.29.0 and zero full/production vulnerabilities |
| Docker/Railway deployment contract | Pass; exact two-stage Node/npm toolchain, required browser build arguments, non-root runtime, and secret-excluding context |
| Release/Edge manifest shape | Pass; 89 changed functions = 87 deployed, including 17 tombstones, plus 2 tenant-environment exclusions; 94 Edge TypeScript files |
| Production migration unit | Pass; all six versions applied and reconciled into the migration ledger with names and statement arrays |
| Production database catalog verifier | Pass; exact committed verifier ran serializable/read-only and ended with `ROLLBACK` |
| Production Edge inventory | Pass; 87 expected/active, zero missing/unexpected, 73 JWT-verified and the exact 14 reviewed non-JWT handlers |
| Hosted Auth and CORS | Pass; signup/anonymous disabled, 24-hour invite expiry, allowlist reduced to the exact two production callbacks, and `account-context` preflight 204 |
| Fail-closed HTTP containment | Pass; protected unauthenticated requests denied, public handlers reject empty input, and five public tombstones return 410 |
| Billing/video containment | Pass; Stripe endpoint tombstoned and Edge secrets removed; Railway video API tombstoned and service credentials removed |
| Edge semantic type check | Pass; all 89 entrypoints on Deno 2.5.2 with frozen `deno.lock` |
| Edge TypeScript inventory/syntax check | Pass; 94 function/shared TypeScript files |
| App TypeScript | Pass; zero diagnostics |
| Staging HTTP runner type check | Pass |
| Focused MVP ESLint | Pass; zero warnings |
| Sensitive URL/telemetry tests | Pass |
| Release secret scan | Pass; 589 full-current-tree files including ignored dotenv/build files, built output, 23 positive and 3 negative scanner self-tests; values suppressed |
| Staging runners with missing environment | Pass; refuse before network/artifact creation |
| Database verifier shell syntax | Pass |
| Local SQL grammar parse | Pass; six migrations plus verifier |
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
  provider/database state and removes only the reviewed exact claim, after which
  a fresh status-preserving Verify action may run;
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

- Only client CRUD is tenant-enabled. Podcast operations, outreach, reporting,
  and other legacy modules remain platform-admin-only until they receive an
  explicit `workspace_id` model and isolation tests.
- The platform administrator's private-workspace view is intentionally
  read-only and currently shows only that workspace's clients. It is not an
  impersonation mode and does not make legacy modules tenant-aware.
- Workspace users cannot invite teammates or own multiple workspaces.
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

The current-tree secret scan is green, but that does not make previously
exposed credentials safe. Review found non-placeholder Podscan and BridgeKit
credentials in repository history. OpenAI, Podscan, Jotform, and Clay webhook
credentials were also shared through chat. Treat every affected value as
compromised: revoke/rotate it first, review provider and Supabase logs, and
replace it only in server-side secret storage. Keep exact incident locations in
the private response record rather than advertising them in public docs.

No history rewrite has been performed. If the repository owner chooses to
remove the historical blobs, coordinate `git filter-repo`, force-push timing,
open pull requests, forks/clones, GitHub caches, CI artifacts, and third-party
logs as one incident operation. Rewriting Git history does not replace
credential rotation.

As checked on 2026-07-21, `main` has no GitHub branch protection. The repository
defines the **No-secret static validation** workflow, which runs on pull
requests but becomes a required check only when repository protection is
configured. Protect `main` before any additional release merge: require that
check and an independent approval, require the branch to be current, and block
direct and force pushes. The workflow supports GitHub merge queues through
`merge_group`.

The root Dockerfile provides an executable frontend container path, but there
is intentionally no automated Supabase Edge/database rollout executor in this
repository: the legacy deploy/migration helpers refuse to run. A staging backend
rollout still needs a reviewed executor or operator procedure bound to the exact
commit, project, backup, phased manifest, and private evidence directory.

## Next-release gates

The historical production cutover and its follow-up source merge are complete.
The manual-account/read-only-workspace-view increment is not deployed. Follow
the release contract in
[`docs/manual-workspace-accounts.md`](docs/manual-workspace-accounts.md) before
merging or deploying it.

Before enabling the new manual-account action in production:

1. rotate the exposed OpenAI, Podscan, Jotform, and Clay credentials and review
   provider/application logs;
2. apply and catalog-verify the new forward migration on a disposable staging
   project, then deploy the exact reviewed Edge manifest and frontend;
3. exercise create → one-time handoff → temporary sign-in → forced password
   replacement → fresh sign-in → isolated client CRUD → logout;
4. test duplicate/concurrent creation, password rotation, expired credentials,
   provider timeouts, session revocation, and two-account cross-tenant denial;
5. complete the signed-in administrator browser smoke test for workspace
   switching, malformed/stale workspace URLs, back/reload behavior, and logout;
6. obtain independent database-security, Edge-saga, frontend, and release-ops
   approval on the exact commit and require a fresh green CI result; and
7. decide when to delete the credential-free Railway video tombstone project
   and the 17 Edge tombstones after caller quietness is proved.

Credentials previously committed in repository history or shared through chat
remain compromised after source cleanup. Rotate them; deleting the visible
string is not sufficient.
