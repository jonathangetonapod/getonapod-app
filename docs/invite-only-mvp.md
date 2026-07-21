# Invite-only workspace MVP rollout

## Release objective

A platform administrator can invite an account, and the invitee can accept the
email invitation, set a password, sign in, and manage clients inside one private
workspace. Existing Get On A Pod administrator data remains available in the
default workspace.

This release intentionally has:

- no public account registration;
- no billing, checkout, paid add-ons, or order management;
- no user-managed teams or multiple private-workspace members;
- no tenant access to legacy modules that are not workspace-aware; and
- no production mutation before staging acceptance.

The platform administrator uses the existing `/admin/*` application. Invited
workspace accounts use `/app/clients`. Client portal users are separate client
records and use `/portal/*`; they are not workspace accounts.

## Account lifecycle

| State | Meaning | Server behavior |
| --- | --- | --- |
| `invited` | A 24-hour Supabase invitation and pending membership exist | Invite completion only |
| `active` | The invitation was accepted and the private workspace is active | Workspace client CRUD allowed |
| `suspended` | A platform administrator disabled the account | Auth user is banned; membership/workspace access denied; client portal sessions/tokens for the workspace are revoked |
| `revoked` | A pending invitation was withdrawn or expired and cleaned up | Invite cannot be accepted; private workspace is archived |

Platform-administrator status is derived server-side by joining the current
Supabase Auth email to `admin_users`. Lifecycle actions also verify that the
membership's bound Auth user still has the expected email, so a renamed or
reused Auth identity is never banned/deleted automatically.

A full Supabase email invitation URL is a bearer authenticator. The membership
UUID is bound to the invited Auth identity after the link establishes that
session, but the server cannot distinguish the intended recipient from someone
to whom the full email link was forwarded. Keep invite links out of logs and do
not forward them.

## Tenant boundary

`workspace_id` is required on every client. Existing clients are backfilled to
the default Get On A Pod workspace. Each new invitation creates a distinct
private workspace and one owner membership.

Workspace client CRUD goes through `workspace-clients`, which invokes the
service-only `workspace_client_operation` RPC. That transaction:

1. locks and verifies the active membership and workspace;
2. permits only `list`, `create`, `update`, or `delete`;
3. accepts/returns a narrow client field projection;
4. binds every row to the verified workspace; and
5. writes an append-only workspace audit event for mutations.

Direct browser policies on the full `clients` and `bookings` base rows are
platform-admin-only. Workspace users cannot use `.select('*')` to recover
portal, dashboard, outreach, Google, or other internal fields. A client trigger
also prevents browser writes to internal fields if a future policy is widened
accidentally.

Legacy podcast, outreach, reporting, and automation functions remain
platform-admin/service-only containment paths. They are not tenant-enabled just
because their navigation is hidden.

## Portal and capability security

Client portal passwords are not stored on `clients`. The retired
`clients.portal_password` column is constrained to `NULL`; versioned
PBKDF2-HMAC-SHA256 verifiers (600,000 iterations) live in the service-role-only
`client_portal_credentials` table.

Password login:

- accepts a bounded JSON POST only;
- atomically reserves login attempts by normalized email and proxy-derived IP;
- performs equivalent expensive work on unknown and malformed credential
  paths;
- locks the active workspace, client, and credential before issuing a session;
- stores only `sha256$...` session verifiers; and
- returns a minimal client DTO with `Cache-Control: no-store`.

Migration cutover deletes raw legacy sessions and legacy/plaintext password
credentials, disables every affected portal, and requires an operator to set a
new password before reissuing access. Hash-only constraints and exact hash
lookup ensure that a leaked stored session verifier cannot be submitted as a
bearer. Password changes, portal disable/email changes, logout, and workspace
suspension revoke the relevant access artifacts.

Changing a client's normalized portal email is an identity reassignment, not a
profile-only edit. The database trigger deletes the prior password verifier and
sessions, clears password metadata, disables portal access, and requires a
platform administrator to set a new password before access is reissued.

Magic-link portal authentication is retired. Migration cutover deletes every
outstanding `client_portal_tokens` row, and the historical send/verify function
names are replaced temporarily by handlers that only return HTTP 410.

Client/prospect approval dashboards are unauthenticated bearer capabilities.
The security migration rotates every pre-cutover capability slug, regardless
of its former format, and enforces a random 24-hex suffix (96 bits). The
endpoints verify enabled/active state and return narrow projections. Both pages
emit `noindex, nofollow` and `no-referrer` and are absent from the sitemap.

Cutover is customer-visible:

- every rotated old approval link stops working;
- operators must export/inventory replacement URLs and redistribute them only
  after staging acceptance; and
- client portal users with a pre-cutover session must sign in again.

## Retired surfaces

Billing, checkout, premium placement administration, customers, orders,
analytics, AI Sales Director, admin video generation, admin blog management,
admin settings, and the legacy docs route are not part of the MVP. Routes
redirect to supported pages. Charge/order/video Edge entrypoints and the
standalone video service are HTTP 410 tombstones.

The orphan `get-client-portfolio` service-role reader is also an HTTP 410
tombstone. The supported replacement is the narrower
`public-client-dashboard` capability endpoint.

Before production promotion, remove the Stripe webhook from Stripe and remove
the Railway/HeyGen service and its stored secrets. Deploying a frontend redirect
alone does not retire an external integration.

## Staging prerequisites

1. Use a dedicated staging Supabase project and staging application origin.
2. Back up and inspect the target schema. Do not blindly replay the full
   historical migration directory; it contains environment-specific legacy
   history.
3. Confirm at least one `admin_users` email maps to a staging Auth user. With no
   mapped operator the system remains default-deny.
4. Put only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`, and
   optional browser-safe telemetry values in the frontend environment.
5. Configure service-role/provider/webhook secrets in Supabase secret storage.
6. Apply hosted Auth settings: public and anonymous signup disabled, invite/OTP
   expiry 86,400 seconds, and an exact allowlist of staging callback URLs.
7. Rotate every credential exposed in chat or repository history before using
   the environment. Source cleanup does not revoke a credential.

## Deployment order

Treat this as a coordinated, fail-closed cutover:

1. Back up and inspect the target schema. Record the remote Edge Function,
   schedule, webhook, row-count, and client ownership inventory as release
   evidence.
2. Enter a maintenance window: quiesce client-portal traffic and every caller
   or worker that can create portal tokens/sessions or mutate the affected
   tables.
3. Deploy all 17 HTTP 410 handlers in phase 1 of
   `docs/invite-only-edge-manifest.json`. Deploy
   `send-portal-magic-link`, `verify-portal-token`,
   `get-outreach-podcasts-v2`, and `get-client-portfolio` under those exact
   names even if absent from the initial inventory. Probe all five names in
   `unauthenticated_tombstone_probes` without a user JWT and require HTTP 410
   with no email/provider/database side effect; probe the other tombstones with
   an administrator JWT.
4. While traffic remains closed, deploy this branch's
   `login-with-password`, `validate-portal-session`,
   `logout-portal-session`, `get-client-bookings`, and `resend-webhook`.
   Before the new RPCs exist they fail closed; Resend receives a retryable 500
   rather than letting a historical webhook mutate state during migration.
5. Apply the four migrations and verifier as one release unit:

   1. `20260720000100_invite_only_workspace_core.sql`
   2. `20260720000200_invite_only_workspace_rls.sql`
   3. `20260720000300_client_portal_security.sql`
   4. `20260720000400_resend_webhook_idempotency.sql`
   5. `supabase/tests/20260720_invite_only_workspace_verification.sql`

6. Re-run the zero-magic-token, hash-only credential/session, ACL/RLS, default
   workspace, private workspace, and client-ownership assertions after all
   deploys. Export replacement client/prospect capability URLs.
7. Deploy the remaining new account/client and guarded Edge Functions from one
   reviewed, explicit allowlist, then deploy the frontend. Do not bulk-deploy
   the whole functions directory: exclude `create-outreach-message` and
   `campaign-reply-webhook` from the tenant environment. Do not reopen traffic
   yet. Use `docs/invite-only-edge-manifest.json`, and regenerate/review it if
   the recorded base commit no longer matches the merge base.
   Delete any pre-existing remote copies of the two excluded handlers from the
   tenant project; deploy omission alone does not remove them.
8. Remove every caller, schedule, webhook, or provider workflow that uses any
   of the 17 retired function names; delete those remote functions only after
   containment is proved, and save the final inventory.
9. Unregister the Stripe webhook and remove the Railway/HeyGen service and
   associated secrets.
10. Run the complete acceptance matrix, then leave `main`/production unchanged
    until reviewers approve the evidence.

If any migration or assertion fails, keep traffic closed and the new account
endpoints unavailable, investigate against the staging backup, and continue
only after the schema is reconciled. Never put an old portal handler back in
service to work around a failed cutover.

## Evidence runners

Use the checked-in runners only after this branch has a reviewed checkpoint
commit. They require the exact `feat/invite-only-workspaces` branch and a clean
worktree including untracked files, then fingerprint the commit and release
inputs into sanitized NDJSON. Each output path must be absolute, outside the
repository, have an existing parent, and not already exist.

`npm run test:staging` is the black-box HTTP runner. It accepts only dedicated
`ACCEPTANCE_*` variables for the exact staging project ref, a mandatory
production-ref denylist, dynamic target confirmation, a browser-safe anon or
publishable key, one platform administrator, Alice, Bob, a unique run ID, and
the evidence path. Alice and Bob must be disposable private-workspace accounts
whose client lists are empty before the run. It never loads a dotenv file or
accepts a service-role key.
It creates tagged synthetic clients, tests real and modified cross-tenant UUIDs
over Edge and REST, probes all manifest tombstones and excluded functions,
checks the Resend signature/body limit, exercises suspension/portal revocation,
and performs owner cleanup in `finally`. Exit `2` means automated checks passed
but the manual invite-link and signed Resend replay/provider gates remain
incomplete; it is not release approval. Exact variable names and a safe command
template are in the root README.

Run `scripts/staging-database-verifier.sh` after the four migrations. Provide
the connection only through `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGPASSWORD`, and an encrypted `PGSSLMODE`, plus
`STAGING_DB_EXPECTED_PGHOST`, mandatory
`STAGING_DB_PRODUCTION_PGHOSTS`, the exact dynamic `STAGING_DB_CONFIRM`, and
`STAGING_DB_EVIDENCE_PATH`. The confirmation is bound to the canonical host,
port, database, user, and release commit. Use a project-specific hostname; a
trailing-dot alias is refused. The private evidence directory must be owned by
the current user, not group/world-writable, and outside every linked worktree
and Git metadata directory. The wrapper refuses service/host-address overrides,
runs only the recorded commit's verifier blob in one serializable read-only
transaction with `ON_ERROR_STOP`, bounds runtime, deletes raw SQL stdout/stderr,
and atomically publishes mode-600 NDJSON plus its SHA-256. Never pass a
connection URL or password as a command-line argument or enter a password in
shell history.

Configure the Resend webhook for only `email.sent`, `email.delivered`,
`email.delivery_delayed`, `email.failed`, `email.bounced`,
`email.complained`, `email.suppressed`, `email.opened`, and `email.clicked`.
Use a dedicated Resend account/team for tracked application mail because event
subscriptions are account-wide by type; a separate API key or domain is not an
isolation boundary. Do not attach this handler to an account that also sends
untracked Supabase Auth or other mail. Missing logs intentionally roll back the
receipt and return 500 to recover a send/log race; alert and reconcile
persistent orphans before the provider retry schedule ends.

The supported membership writers use normal `READ COMMITTED` transactions. Do
not introduce direct `REPEATABLE READ` membership writers without a database-
native private-member slot/index design.

## Acceptance matrix

Use a platform administrator plus two fresh invited accounts, Alice and Bob.
Use synthetic clients and no live provider credentials.

| Test | Expected result |
| --- | --- |
| Anonymous visitor opens `/app/clients` | Redirected to `/login` |
| Uninvited Auth account signs in | No workspace context; access denied |
| Administrator invites Alice | One private workspace/pending owner membership; 24-hour email invite |
| Authenticated Bob submits Alice's membership UUID without Alice's invite-established session | Rejected |
| Alice accepts her own invite and sets a password | Membership/workspace become active; `/app/clients` opens |
| Alice creates a client | Narrow response; row is owned by Alice's workspace; audit event exists |
| Administrator invites/activates Bob | Bob receives a different workspace |
| Alice and Bob list clients | Each receives only their own rows |
| Alice requests Bob's client UUID through workspace endpoint | `403`/`404`; no data returned |
| Alice updates/deletes Bob's client UUID | No row changes; no false success |
| Alice queries full `clients`, `bookings`, credentials, sessions, or audit tables | Denied |
| Alice attempts to write workspace/dashboard/portal/outreach/internal fields | Rejected |
| Administrator views the global client list/detail | Workspace name is visible for every record |
| Administrator suspends Alice | Auth requests denied; workspace suspended; its portal sessions/tokens deleted |
| Administrator reactivates Alice | Alice's workspace CRUD returns; old portal bearer sessions do not revive |
| Administrator revokes a pending invite | Auth invite/membership no longer usable; identity mismatch is manual-review, not deletion |
| Existing administrator uses legacy app | Default-workspace records remain available |
| Anonymous caller invokes privileged operational function | Denied before service-role/provider side effects |
| Client portal uses a pre-cutover plaintext password | Access remains disabled; operator must set a replacement password and reissue access |
| Client portal logs in with a newly set password | Minimal DTO and raw UUID bearer returned; DB stores only PBKDF2 password and SHA-256 session verifiers |
| Stored `sha256$...` session verifier is submitted | Rejected |
| Parallel bad portal logins exceed threshold | Atomic limiter returns 429; requests cannot all pass a count-then-write race |
| Password change/portal disable races login | No old-credential session survives |
| Tenant or administrator changes a portal email | Portal is disabled; prior verifier/sessions are deleted; old password cannot authenticate the new identity |
| Replacement client/prospect capability link opens | Enabled dashboard loads; `noindex`, `nofollow`, `no-referrer` present |
| Old or disabled capability link opens | Generic unavailable response; backing tables remain anonymous-denied |
| Billing/order/video mutation endpoint is called | HTTP 410 and no external side effect |
| Retired magic-link/outreach/portfolio function is called during containment | HTTP 410, request body ignored, and no email/provider/database side effect |
| Retired admin URL is opened | Redirected to administrator dashboard |
| Invalid Resend signature is sent | Rejected before service-role work |
| Tenant traffic reaches Clay/Bison ingestion | No route is deployed or enabled in the tenant MVP environment |
| Isolated legacy Clay/Bison handler receives an invalid secret | Rejected before service-role work |
| Same signed Resend `svix-id` is delivered twice | One receipt and one state/counter/suppression mutation only |
| Older `sent`/`delivered` Resend event arrives after terminal status | Delivery status does not regress |
| `email.suppressed` arrives for a recipient | Address is suppressed; bounce count and first/last bounce timestamps do not change |
| Signed unsupported Resend event arrives without `email_id` | One ignored receipt is ledgered; no email state changes |

Repeat isolation tests over browser navigation, Supabase REST, Edge Functions,
and manually modified UUIDs/URLs. Navigation visibility is not authorization.

## Static and review gates

Run at minimum:

```bash
npm run build
npm audit --omit=dev
npx tsc --noEmit -p tsconfig.app.json
npm run lint
git diff --check
```

Also parse all changed SQL, bundle/type-check every Edge entrypoint, scan tracked
content and built output for secrets/browser service keys, and run the package
security audit. Existing legacy TypeScript/lint findings must be compared with
`main`; this branch may not add regressions.

Static checks do not prove RLS. The release remains blocked until the SQL
verifier and two-account staging matrix pass.

## Accepted limitations and follow-up

- Only client CRUD is tenant-ready; every other legacy module needs an explicit
  ownership model and cross-account tests before tenant exposure.
- Workspace users cannot invite teammates or self-manage workspace/account
  settings.
- There is no workspace forgot-password UI; support uses a controlled Supabase
  Auth recovery/reset.
- Client portal onboarding uses manually coordinated secure password delivery;
  automatic invitation email is off by default.
- `create-outreach-message` and `campaign-reply-webhook` are excluded from the
  tenant MVP deploy. Do not enable them for tenant traffic until they have
  explicit workspace/client mapping, unique provider-event keys, and one
  transactional ingestion RPC. Any temporary legacy use belongs in an isolated
  operator environment with separate secrets and its own acceptance evidence.
- The Resend receipt ledger has no automatic retention job. Monitor growth and
  add a service-only purge whose retention period exceeds the provider's
  maximum retry/replay horizon before production volume grows.
- Schedule `cleanup_expired_portal_data()` and update legacy portal statistics
  before exposing portal operations reporting.
- Route-level code splitting and bundle-size reduction are post-MVP performance
  work.
- The production-dependency audit is clean. Vite 5 retains a development-server
  advisory whose automated fix requires a breaking major upgrade; local Vite is
  loopback-bound by default and is never the production server.
- Add and verify production CSP/HSTS/frame/content-type/referrer response
  headers at the hosting/CDN boundary.

## Merge gate

Merge `feat/invite-only-workspaces` into `main` only when:

- compromised credentials are rotated;
- staging migration backup/review and the SQL verifier pass;
- the complete two-account matrix passes;
- replacement capability links are inventoried and redistribution is approved;
- all 17 retired functions have completed the tombstone, caller cleanup, and
  remote-deletion inventory sequence;
- external Stripe/video integrations are unregistered;
- build/static/dependency checks are accepted; and
- data/RLS, Edge/security, and frontend reviewers approve the final diff.
