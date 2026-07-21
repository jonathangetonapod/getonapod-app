# Invite-only workspace MVP rollout

## Current deployment state

Pull request #1 was merged into `main` on 2026-07-21 at commit
`3f608997522a76207ace8ebf355daf0cf3642865`. The production Railway integration
automatically deployed the new frontend, but no Supabase migration or Edge
Function deployment was part of that integration. Production currently returns
`404 NOT_FOUND` for `account-context`, `accept-workspace-invite`,
`manage-workspace-users`, and `workspace-clients`.

Protected application routes intentionally fail closed in this split-release
state. Do not bypass the account gate or deploy `account-context` by itself: it
depends on the workspace schema and server-side authorization RPCs. Immediate
service restoration requires an explicitly approved frontend rollback to
`b46a737631ee840f2f49270bdfbbe392833e814a`; otherwise keep protected routes
closed while the complete release is exercised in staging.

The GOAP Railway project now has an empty `staging` environment with no service,
domain, deployment, or copied production configuration. A separate sanitized
Supabase staging project and secure deployer/database access remain prerequisites.

## Release objective

A platform administrator can invite an account, and the invitee can accept the
email invitation, set a password, sign in, and manage clients inside one private
workspace. Existing client rows are assigned to the default Get On A Pod
workspace; other legacy data remains administrator-only.

The target MVP intentionally has:

- no public account registration;
- no billing, checkout, paid add-ons, or order management;
- no user-managed teams or multiple private-workspace members;
- no tenant access to legacy modules that are not workspace-aware; and
- no additional production mutation before staging acceptance and explicit
  cutover approval.

The platform administrator uses the existing `/admin/*` application. Invited
workspace accounts use `/app/clients`. Client portal users are separate client
records and use `/portal/*`; they are not workspace accounts.

## Account lifecycle

| State | Meaning | Server behavior |
| --- | --- | --- |
| `provisioning` | An active private workspace exists, but its owner membership has not completed invite delivery/finalization | No tenant access; administrator may retry or revoke after any required reconciliation |
| `invited` | A 24-hour Supabase invitation and pending membership exist | Invite completion only |
| `active` | The invitation was accepted and the owner membership is active | Workspace client CRUD allowed |
| `suspended` | A platform administrator disabled database access | Membership/workspace access is denied and portal artifacts are revoked immediately; Auth ban reconciliation may remain pending under a durable claim |
| `revoked` | A pending database invitation was withdrawn or expired | Invite cannot be accepted and the private workspace is archived; exact marked-identity cleanup may remain pending under a durable claim |

Platform-administrator status is derived server-side from the immutable Auth
user ID, its current email, the `admin_users` allowlist, and an active
default-workspace membership. Accepted tenant authorization requires the Auth
user ID and bound membership email to agree, so a direct Auth email change
fails closed. An administrator can still suspend that immutable user ID, but
reactivation is refused until the identity mismatch is reviewed and explicitly
reconciled.

Invitation creation is database-first and two-phase. One transaction creates
the private workspace and `provisioning` membership. A durable, service-only
delivery claim serializes the external provider call; Supabase Auth receives
the membership marker, the service writes a service-owned, non-user-editable
`app_metadata` marker, and a second transaction binds that Auth user and
advances the membership to `invited`. A provider error is never evidence of
delivery: a known matching
identity is deleted before the claim is released, while unresolved provider or
identity ambiguity retains the claim for operator review rather than risking a
second delivery or deleting the wrong Auth account.
Acceptance requires the bound Auth identity, unexpired database invitation, and
a backend-observed password verifier.

Suspend/reactivate uses a separate durable service-only lifecycle claim. The
database transition commits before Auth ban/unban reconciliation and remains
authoritative after an interrupted request. Same-token retries are idempotent.
A different token never takes over either kind of claim automatically;
`review_after` is only a 15-minute signal for an operator to investigate.
`reconcile_active` and `reconcile_suspended` are distinct status-preserving
actions: they cannot replay an earlier transition over a newer database state.
Successful Auth reconciliation and its desired state are written to the audit
log before the token-bound claim is removed. The administrator UI disables all
conflicting lifecycle/invite actions while the service-only safe projection
reports a pending claim.

Historical same-email invitation cleanup is also fail-closed. Any newer
membership permanently supersedes an older revoked invitation, and another
unresolved delivery/cleanup claim blocks historical cleanup. Provider deletion
requires the exact trusted membership/metadata identity binding; an email match
alone is never enough to delete an Auth user.

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
standalone video's `/api/*` routes are HTTP 410 tombstones. Its side-effect-free
`/health` remains 200 with `status: retired` only so Railway can activate the
safe tombstone revision before the service is removed.

The orphan `get-client-portfolio` service-role reader is also an HTTP 410
tombstone. The supported replacement is the narrower
`public-client-dashboard` capability endpoint.

Before production promotion, remove the Stripe webhook from Stripe and remove
the separate retired video-generator Railway service, HeyGen integration, and
their stored secrets. Deploying a frontend redirect
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
8. Review Sentry, hosting, proxy, and support logs for captured invite, recovery,
   or capability URLs. Revoke affected sessions/links and purge retained
   telemetry under the incident process.
9. Apply the current migration files to a fresh staging baseline or restore the
   pre-MVP backup first. The branch has edited its still-unreleased numbered
   migration; an older draft is not an in-place upgrade path.
10. Protect `main`: require the no-secret static validation check, a reviewer,
    an up-to-date branch/merge queue, and block direct and force pushes.

## Deployment order

Treat this as a coordinated, fail-closed cutover:

The legacy `scripts/deploy-edge-functions.sh` and
`scripts/run-migration.cjs` helpers are intentionally retired and must not be
used for this rollout. They do not bind the target, reviewed commit, backup,
phased manifest, or evidence path.

The root Dockerfile provides an executable frontend container path, but there
is no automated Supabase Edge/database rollout executor in this branch. The
operator procedure or future backend executor must bind every action and
evidence record to the exact reviewed commit, dedicated staging project,
backup, phased manifest, and private output directory.

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
   of the 17 retired function names, but retain the HTTP 410 tombstones through
   the complete acceptance matrix so their gateway behavior and lack of side
   effects can be proved.
9. Unregister the Stripe webhook and HeyGen integration and remove their
   provider secrets. Keep the separate retired video-generator Railway service
   running its safe tombstone through acceptance.
10. Run the complete acceptance matrix while all 17 Edge tombstones and the
    video-generator tombstone remain deployed; require its `/api` routes to
    return 410 and `/health` to report only `status: retired`.
11. Only after acceptance proves containment and every caller is gone, delete
    the 17 retired remote functions, remove the separate video-generator
    Railway service, and save the final absent-function inventory. Make no
    additional production mutation until reviewers approve all evidence.

If any migration or assertion fails, keep traffic closed and the new account
endpoints unavailable, investigate against the staging backup, and continue
only after the schema is reconciled. Never put an old portal handler back in
service to work around a failed cutover.

## Evidence runners

Use the checked-in runners only from the preserved, reviewed
`feat/invite-only-workspaces` worktree at commit
`ec94301da5dc64de5d7f7c2c79a96a626dc573af`. The runners require that exact
branch and a clean worktree including untracked files, then fingerprint the
commit and release inputs into sanitized NDJSON. Its tree is identical to the
merged `main` tree at `3f608997522a76207ace8ebf355daf0cf3642865`. Each output
path must be absolute, outside the repository, have an existing parent, and not
already exist.

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
and performs owner cleanup in `finally`. Exit `2` means the automated HTTP
subset passed while the checked-in external release-gate allowlist remains
incomplete; it is not release approval. That allowlist explicitly records the
database verifier, commit-bound deployment inventory, hosted Auth,
invite delivery fault injection and backend password enforcement,
durable-claim recovery, UI/legacy-admin checks, audit and portal races, identity
changes, the live Storage API boundary, capability links, provider side
effects/decommissioning, credential rotation, historical telemetry review, and
signed Resend behavior.
Administrator credentials are required, and any unexpected incomplete record
converts the run to a failure. Exact variable names and a safe command template
are in the root README.

Run `scripts/staging-database-verifier.sh` after the four migrations. Provide
the connection only through `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`,
`PGPASSWORD`, and `PGSSLMODE=verify-full`, plus
`STAGING_DB_EXPECTED_PGHOST`, mandatory
`STAGING_DB_PRODUCTION_PGHOSTS`, the exact dynamic `STAGING_DB_CONFIRM`, and
`STAGING_DB_EVIDENCE_PATH`. The confirmation is bound to the canonical host,
port, database, user, and release commit. Use a project-specific hostname; a
trailing-dot alias is refused. The private evidence directory must be owned by
the current user, not group/world-writable, and outside every linked worktree
and Git metadata directory. The wrapper refuses service/host-address overrides,
runs only the recorded commit's verifier blob in one serializable read-only
transaction with `ON_ERROR_STOP`, bounds runtime, deletes raw SQL stdout/stderr,
and publishes mode-600 NDJSON plus its SHA-256 as one required integrity pair.
The pair is invalid if either file is missing. The evidence includes
a domain-separated SHA-256 fingerprint of the canonical
host/port/database/user target without retaining the connection coordinates.
Never pass a connection URL or password as a command-line argument or enter a
password in shell history.

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

## Durable claim recovery

The invite-delivery and suspend/reactivate claims deliberately have no timeout
takeover. Never clear one merely because `review_after` has passed.

For a reviewed recovery:

1. Quiesce lifecycle/invite actions for the exact membership and confirm the
   originating Edge invocation is no longer running.
2. Record the claim, membership/workspace state, audit events, bound Auth ID and
   email, Auth invitation marker, and Auth ban state in private incident
   evidence. Do not copy invite URLs or tokens.
3. Treat the database state as authoritative. For a suspended membership,
   ensure Auth is banned; for an active membership, verify the identity still
   matches before unbanning. For a `provisioning` invite, delete any matching
   marked Auth identity before making delivery retryable. Never delete an
   unrelated email-only Auth account.
4. In one controlled database-owner transaction, lock the exact membership and
   claim row, verify the recorded token/state have not changed, and delete only
   that claim. Do not grant direct claim-table access to `service_role`.
5. Use **Retry** or **Verify Auth** in the administrator UI, rerun the database
   verifier, and attach the sanitized result to the release evidence.

If identity, provider-delivery, or invocation state is ambiguous, leave the
claim in place and escalate; availability is preferable to issuing or deleting
the wrong Auth identity.

## Acceptance matrix

Use a platform administrator plus two fresh invited accounts, Alice and Bob.
Use synthetic clients and only dedicated staging/test provider configuration;
never use production credentials.

| Test | Expected result |
| --- | --- |
| Anonymous visitor opens `/app/clients` | Redirected to `/login` |
| Uninvited Auth account signs in | No workspace context; access denied |
| Administrator starts Alice's invite | One private workspace and one `provisioning` owner membership; no tenant access yet |
| Invite provider succeeds and service marker finalizes | Membership becomes `invited`; expiry is anchored to the provider invitation time |
| Two administrators retry the same provisioning invite concurrently | One delivery claim wins; no second provider call can delete or replace the winner's Auth identity |
| Provider success/error/timeout is injected at each delivery boundary | No usable orphan link; known-safe cleanup makes Retry available, ambiguous cleanup leaves a review claim |
| Authenticated Bob submits Alice's membership UUID without Alice's invite-established session | Rejected |
| Alice tries acceptance before password setup | Backend rejects activation even if the frontend flow is bypassed |
| Alice accepts her own invite after setting a password | Membership becomes active; the already-active private workspace now permits `/app/clients` |
| Alice creates a client | Narrow response; row is owned by Alice's workspace; audit event exists |
| Administrator invites/activates Bob | Bob receives a different workspace |
| Alice and Bob list clients | Each receives only their own rows |
| Alice requests Bob's client UUID through workspace endpoint | `403`/`404`; no data returned |
| Alice updates/deletes Bob's client UUID | No row changes; no false success |
| Alice queries full `clients`, `bookings`, credentials, sessions, or audit tables | Denied |
| Alice attempts to write workspace/dashboard/portal/outreach/internal fields | Rejected |
| Alice, Bob, anonymous, and administrator sessions exercise the live Storage API with staging-only fixtures | Tenant/anonymous insert, update, and delete are denied; any existing administrator write path remains administrator-only; private reads remain denied and intended public reads are unchanged |
| Administrator views the global client list/detail | Workspace name is visible for every record |
| Administrator suspends Alice | Workspace APIs are denied and portal sessions/tokens are deleted immediately; Auth is banned after successful provider reconciliation, or the claim remains for review |
| Administrator reactivates Alice | Alice's workspace CRUD returns; old portal bearer sessions do not revive |
| Suspend/reactivate response is lost or Auth update fails | Database status remains authoritative; same-token retry is idempotent, but a lost token locks the UI until reviewed provider/database reconciliation and exact manual claim removal; only then may a fresh status-preserving Verify run |
| A different request reaches a stale lifecycle/delivery claim | Request is busy; no automatic timeout takeover occurs |
| Administrator revokes a provisioning/invited record | Database capability is revoked first; matching marked Auth identity is deleted; unrelated identity mismatch is manual review |
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
| Sentry/hosting history contains an Auth or capability URL | Incident evidence is recorded; affected link/session is revoked and retained telemetry is purged |

Repeat isolation tests over browser navigation, Supabase REST, Edge Functions,
and manually modified UUIDs/URLs. Navigation visibility is not authorization.

## Static and review gates

Run at minimum:

```bash
npm run check:static
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
git diff --check
git diff --check origin/main...HEAD
```

`check:static` verifies the exact manifest/release shape; parses all four
migrations and the verifier with a PostgreSQL grammar parser; checks app and
staging TypeScript; enforces zero warnings on the MVP lint scope; tests
sensitive URLs, telemetry, session storage, retired helpers, and staging-path
containment; semantically checks all 89 Edge entrypoints with Deno 2.5.2 and a
frozen `deno.lock`; checks the database-runner shell; performs an isolated
static build; clean-installs, builds, and audits the nested MCP server; exercises
the dependency-free retired video tombstone with malformed/oversized requests;
checks the exact two-stage Docker/Railway Node/npm contract, required browser
build arguments, non-root runtime, and secret-excluding Docker context;
launches the real production server to verify routes, assets, and headers; and
scans the full current worktree plus built output for secrets. The scanner
includes self-tests and suppresses values. The no-secret PR
workflow pins Node 22.22.2, npm 10.9.7, Deno 2.5.2, and its Actions by commit,
then repeats the gates for pull requests and merge queues. Full-repository
ESLint retains unrelated legacy debt and is not the release check.

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
- `mcp-prospect-dashboard` remains trusted stdio-only operator tooling with a
  service-role credential. It is not a tenant API and must not be exposed over
  HTTP or included in the tenant deployment.
- The Resend receipt ledger has no automatic retention job. Monitor growth and
  add a service-only purge whose retention period exceeds the provider's
  maximum retry/replay horizon before production volume grows.
- Schedule `cleanup_expired_portal_data()` and update legacy portal statistics
  before exposing portal operations reporting.
- Route-level code splitting and bundle-size reduction are post-MVP performance
  work.
- Both the full and production dependency audits are clean with Vite 7.3.6.
  Rerun both against the exact reviewed merge commit.
- The checked-in production server emits no-referrer, nosniff, frame denial,
  and restricted permissions headers, plus no-store/noindex on private routes.
  Preserve and verify them in hosting, and add environment-specific CSP/HSTS at
  the hosting/CDN boundary.
- The release secret scanner checks the current tree/build, not Git history,
  chat, or third-party logs. Rotate exposed credentials and complete coordinated
  history/log remediation separately.

## Known credential incident

The current-tree scan passes, but repository-history review found
non-placeholder Podscan and BridgeKit credentials. OpenAI, Podscan, Jotform,
and Clay webhook credentials were also shared through chat. Do not reuse them.
Revoke/rotate first, then review provider, Supabase, CI, hosting, Sentry, and
support logs without copying secret values into evidence. Keep exact historical
locations only in the private incident record, not tracked public docs.

No history rewrite has been performed. Any cleanup must be coordinated across
GitHub, open branches/PRs, forks/clones, caches, artifacts, and third-party
logs; a rewrite never substitutes for credential rotation.

## Merge gate

Merge `feat/invite-only-workspaces` into `main` only when:

- compromised credentials are rotated;
- repository history and telemetry/hosting logs are reviewed and remediated;
- a commit-bound staging deployment inventory proves the exact migrations,
  Edge manifest, and frontend under review;
- staging migration backup/review and the SQL verifier pass;
- hosted Auth configuration and uninvited-account denial are verified;
- the complete two-account browser/REST/Edge/storage matrix passes;
- invite and lifecycle provider fault/concurrency injection, durable-claim
  manual recovery, and signed Resend replay/provider evidence pass;
- replacement capability links are inventoried and redistribution is approved;
- all 17 retired functions have completed the tombstone, caller cleanup, and
  remote-deletion inventory sequence;
- both excluded tenant handlers are remotely absent and their callers removed;
- external Stripe/video integrations are unregistered;
- every external/manual gate enumerated by the staging runner is complete, with
  no unexpected incomplete record;
- build/static/dependency checks are accepted; and
- data/RLS, Edge/security, frontend, and operations reviewers approve the final
  diff;
- `main` has required review/check protection and blocks direct/force pushes;
  and
- the required GitHub check passes on the PR (and any merge-group) synthetic
  merge containing the exact reviewed feature-head SHA.
