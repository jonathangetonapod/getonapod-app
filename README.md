# Get On A Pod — invite-only workspace MVP

This branch turns the existing internal application into an invite-only,
multi-account MVP without billing or public registration. A platform
administrator invites a user; the user accepts the email invitation, creates a
password, signs in, and manages clients inside one private workspace.

The implementation is isolated on `feat/invite-only-workspaces`. Do not merge
or deploy it to production until the staging migration, SQL verifier, and
two-account isolation matrix pass.

## MVP roles

| Role | Supported access |
| --- | --- |
| Platform administrator | Existing internal `/admin/*` application, user invitations, account suspension/reactivation, and all legacy/default-workspace data |
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
| `/app/clients` | Authenticated workspace client CRUD |
| `/admin/users` | Platform administrator invitation/lifecycle console |
| `/admin/*` | Platform administrator only |
| `/portal/login` | Separate client portal login |
| `/portal/dashboard`, `/portal/resources` | Authenticated client portal |
| `/prospect/:slug`, `/client/:slug` | Enabled capability dashboards; `noindex, nofollow` |

The following surfaces are retired for this MVP and redirect to a supported
landing page: billing/checkout, premium placements, customers/orders/analytics,
AI Sales Director, admin videos, admin blog, admin settings, and the old API
docs route. Their charge/order/video mutation endpoints return HTTP 410.

## Security boundaries

- Supabase public email signup and anonymous Auth are disabled. Only a platform
  administrator can create a workspace invitation.
- The server derives platform-admin status from the `admin_users` allowlist and
  the current Auth email. Browser metadata is not an authority.
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

Requirements: Node.js 20+ and npm.

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
- `APP_URL`/`WEB_URL`, `ALLOWED_ORIGIN`/`ALLOWED_ORIGINS`
- `PODSCAN_API_KEY` or `PODSCAN_TOKEN`
- `RESEND_WEBHOOK_SECRET`
- provider keys such as OpenAI, Resend, and Google credentials

The excluded legacy Clay/Bison handlers require `CLAY_WEBHOOK_SECRET` and
`CAMPAIGN_WEBHOOK_SECRET` only in their separate operator environment; do not
configure them in the tenant MVP environment.

`npm run build` generates a static-only sitemap when database variables are
absent, so a clean checkout remains reproducible. Release builds that must
include published blog URLs should set `SITEMAP_REQUIRE_DATABASE=true` and
provide a staging-safe Supabase URL/key; strict mode fails closed if the query
is unavailable.

## Database rollout

Use a dedicated staging project. Do not point local acceptance testing at
production and do not replay the repository's entire historical migration
directory blindly.

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
   5. `supabase/tests/20260720_invite_only_workspace_verification.sql`

5. Recheck the post-migration zero-token/hash-only invariants, inspect
   workspace/client ownership, deploy the remaining reviewed function manifest
   and frontend, then run the complete acceptance matrix before reopening
   traffic.

Migration 1 creates workspaces/memberships, assigns existing clients to the
default Get On A Pod workspace, and preserves the legacy administrator model.
Migration 2 installs tenant RLS, public-data containment, and the narrow client
operation RPC. Migration 3 hardens portal credentials/sessions and capability
links. Migration 4 makes signed Resend delivery events transactional,
deduplicated by `svix-id`, and monotonic under out-of-order delivery.

Important cutover effects:

- Every pre-cutover client and prospect dashboard capability slug is rotated,
  regardless of its former format. Previously shared links stop working;
  inventory and distribute replacement URLs after staging acceptance.
- Raw legacy portal sessions are invalidated. Legacy plaintext portal
  credentials are deleted and affected portals are disabled; an operator must
  set a new password and securely reissue access before those clients sign in.
- Legacy client-portal magic-link tokens are deleted and cannot be redeemed.
- Existing data remains in the default workspace; verify row counts and
  ownership before promotion.

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

Production may still contain historical copies of all 17 retired function
entrypoints; omitting those names from a deploy does not remove a remote
function. Keep the 410 tombstones in place through migration and acceptance.
`get-client-portfolio` is replaced by the narrower
`public-client-dashboard` capability endpoint. After every caller, schedule,
and provider workflow is removed, delete the remote functions and list the
inventory again. Migration 3 deletes all outstanding magic-link tokens, so
none may be carried into production.

Configure the Resend endpoint for only `email.sent`, `email.delivered`,
`email.delivery_delayed`, `email.failed`, `email.bounced`,
`email.complained`, `email.suppressed`, `email.opened`, and `email.clicked`.
Use a dedicated Resend account/team for this tracked application mail; an API
key or sending domain alone does not isolate webhook delivery. Do not attach
this handler to an account that also emits untracked Supabase Auth or other
mail. A temporarily missing log returns a retryable 500 so a send/log commit
race can recover; alert and reconcile any identifier that remains unmatched
before Resend exhausts retries.

Hosted Auth settings must also disable email/anonymous signup, set the invite
expiry to 24 hours, and allow only the intended staging `/accept-invite`
callback. A Supabase invite email is a bearer credential: anyone with the full
link can establish the invited Auth session, so it must not be forwarded or
logged.

## Verification

Static checks:

```bash
npm run build
npm audit --omit=dev
npx tsc --noEmit -p tsconfig.app.json
npm run lint
git diff --check
```

### Executable staging evidence

Run staging evidence only from a reviewed, clean commit on
`feat/invite-only-workspaces`. Both runners refuse a dirty/untracked worktree,
an unexpected branch, an uncommitted release input, a reused evidence path, or
an explicitly identified production target. Evidence paths must be absolute,
must have an existing parent outside this repository, and should point to a
private release-artifact directory.

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
refused/failed; exit `2` means the automated checks passed but the manual invite
and signed Resend replay/provider gates are still incomplete. The runner never
turns those manual gates into an automatic pass.

After the four migrations have been applied to the same staging release, run
the database verifier using `PG*` environment variables. Prefer a project-
specific direct database hostname rather than a hostname shared by production
and staging. Hostnames with a trailing dot are refused. Never put the connection
URL or password on the command line or type a password into shell history:

```bash
export PGHOST='<staging-database-host>'
export PGPORT='5432'
export PGDATABASE='postgres'
export PGUSER='<staging-database-user>'
export PGSSLMODE='require'
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
commit/input digest and pass/fail/exit metadata.

The repository still contains legacy TypeScript/lint debt; compare results with
`main` and require this branch to add no failures. Full lint and TypeScript are
not currently green because of inherited legacy findings, so focused changed-
file checks and the recorded baseline are required. The production build and
production-dependency audit must pass. SQL syntax and Edge entrypoints are
checked separately, but catalog tests and real staging requests remain
mandatory.

Latest local evidence (2026-07-21; not yet a clean-commit staging artifact):

| Check | Result |
| --- | --- |
| Production build/static sitemap | Pass; five public sitemap URLs |
| Production dependency audit | Pass; zero vulnerabilities |
| Release-critical Edge type check | Pass; 18 entrypoints |
| Focused changed-file ESLint | Pass |
| Staging HTTP runner type check | Pass |
| Staging runners with missing environment | Pass; refuse before network/artifact creation |
| Database verifier shell syntax | Pass |
| SQL parse | Pass; four migrations plus verifier |
| App TypeScript baseline | 22 diagnostics vs. 33 on `main` |
| Full ESLint baseline | 250 errors/25 warnings vs. 374/38 on `main` |
| Patch whitespace check | Pass |

These are static results, not deployment approval. A live database was not
available, so the migration verifier, RLS behavior, provider webhooks, and
cross-account concurrency cases are still staging gates.

Staging acceptance requires one platform administrator and two invited test
accounts:

- each account sees only its own client list;
- guessed/direct client UUID reads and every cross-account write fail;
- hidden/internal client fields cannot be changed through tenant APIs;
- suspend denies Auth access immediately and revokes that workspace's client
  portal sessions/tokens; reactivate restores only workspace access;
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
  timestamps.

The detailed rollout and acceptance matrix is in
[`docs/invite-only-mvp.md`](docs/invite-only-mvp.md).

## Known MVP limitations

- Only client CRUD is tenant-enabled. Podcast operations, outreach, reporting,
  and other legacy modules remain platform-admin-only until they receive an
  explicit `workspace_id` model and isolation tests.
- Workspace users cannot invite teammates or own multiple workspaces.
- Workspace password recovery has no product UI yet; support must perform a
  controlled Supabase Auth recovery/reset.
- The client portal is intentionally minimal and separate from workspace Auth.
- The frontend build still emits a large single-chunk warning; route-level code
  splitting is post-MVP performance work.
- `npm audit --omit=dev` is clean. The full development audit retains the Vite
  5/esbuild dev-server advisory because its fix requires a breaking Vite major
  upgrade; the dev server binds to loopback by default and must never serve
  production or an untrusted network. Plan the Vite upgrade after MVP.
- `create-outreach-message` and `campaign-reply-webhook` are excluded from the
  tenant MVP deploy. Their shared webhook secrets, caller-supplied client IDs,
  and non-atomic duplicate checks are not a tenant boundary. Keep them disabled
  for tenant traffic until they have explicit workspace/client mapping, unique
  provider-event keys, and one transactional ingestion RPC. If the legacy
  administrator still needs them, run them only in an isolated operator
  environment with separate secrets and acceptance evidence.
- The Resend receipt ledger has no automatic retention job yet. Monitor its
  growth and add a service-only purge whose retention window exceeds the
  provider retry/replay horizon before production volume grows.
- Production hosting must add and verify CSP/HSTS/frame/content-type/referrer
  response headers; React meta tags are not an HTTP-header substitute.

## Merge policy

`main` and production remain unchanged while this branch is under review. Merge
only after:

1. every exposed credential is rotated;
2. staging backup/schema review succeeds;
3. all four migrations and the verifier pass;
4. the two-account isolation matrix passes over REST, Edge Functions, and
   modified URLs;
5. all 17 retired function tombstones return 410 in their configured gateway
   context, their remote inventory is removed after caller cleanup, and retired
   Stripe and Railway/HeyGen integrations are unregistered or removed;
6. build/static checks show no regression; and
7. the final diff receives security, data/RLS, and frontend review.

Credentials previously committed in repository history or shared through chat
remain compromised after source cleanup. Rotate them; deleting the visible
string is not sufficient.
