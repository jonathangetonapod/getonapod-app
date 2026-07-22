# Manual workspace accounts and administrator workspace preview

## Release status

This release contract began from production-aligned `main` commit
`399741354e54ed172012270f6d388f5c4167c5a0`. Its production backend rollout was
completed on 2026-07-21: the seventh migration is in the production ledger, the
catalog verifier passes, and all six changed/new JWT-verified functions are
deployed. Production has exactly 89 active Edge Functions—75 with JWT
verification enabled and the exact 14 reviewed handlers with it disabled.

The historical six-migration cutover remains documented in
`production-cutover-2026-07-21.md`. The administrator preview now reuses the
real tenant Clients experience in read-only mode. Signed-in end-to-end
acceptance still needs human/browser confirmation; this document does not
promote that gate to an automated pass.

## Product outcome

A platform administrator can:

- create one private workspace and account without sending an email;
- receive a server-generated temporary password exactly once;
- issue a replacement temporary password when the prior value is lost;
- select an active-owner workspace or a newly created manual-password
  workspace that is pending first sign-in from the administrator navigation;
  and
- open the same Clients experience that workspace's owner uses, in a visibly
  read-only administrator preview without impersonating the owner.

The manually created user signs in at `/login`, is restricted to
`/change-password`, replaces the temporary password, signs in again, and then
uses `/app/clients` normally.

## Data architecture

All MVP tenants use one Supabase/PostgreSQL database. Tenant-owned rows carry a
`workspace_id`; memberships, Row Level Security, guarded Edge Functions, and
service-only transactional RPCs enforce isolation.

Do not create a separate database per customer for this MVP. Per-customer
databases would multiply migrations, backups, monitoring, connection pools,
incident response, and cross-tenant administration. A dedicated database may
become an enterprise option later for contractual residency or isolation, but
it should not be the default tenancy model.

The administrator workspace route is
`/admin/workspaces/:workspaceId/clients`. The route parameter is the selected
view; it never overwrites `AuthContext.workspace`, Auth/JWT metadata, or a
membership. Unknown, malformed, default, archived, suspended, or unauthorized
workspace IDs fail closed. Ordinary unaccepted email invitations are not
previewable. A manual-password workspace becomes previewable after its
one-time credential is successfully issued, even though the owner remains
unable to access tenant data until replacing that password. The view is
deliberately read-only.
It reuses the tenant workspace layout and Clients page, including the same
client rows and loading, empty, and error states. A persistent preview banner
and workspace selector preserve administrator context; write controls are
disabled, mutation dialogs are unavailable, and Exit preview returns to the
administrator console.

## Manual-account security contract

- The browser cannot choose the temporary password.
- The Edge Function generates a reserved `Tmp-` credential with Web Crypto,
  returns it only in a `Cache-Control: no-store` response, and never logs it.
- No plaintext or reversible credential is stored in Postgres, audit metadata,
  Auth metadata, local/session storage, URLs, toasts, or React Query.
- The Auth identity is created with exact workspace, membership, provisioning,
  credential-version, attempt, and execution markers in service-owned app
  metadata.
- The private membership remains `invited` with
  `password_change_required = true`; it cannot read workspace data.
- Temporary-password issuance and replacement use durable database claims so
  concurrent, interrupted, and ambiguous Auth operations fail closed.
- A claim can renew exclusive execution ownership only after a 15-minute
  review window, which exceeds the hosted Supabase Edge hard lifetime. This
  assumption must be revisited before self-hosting or increasing worker limits.
- First-password replacement validates the exact Auth identity and membership,
  updates the password and marker together, revokes all refresh sessions, and
  activates the membership transactionally.
- The membership's `workspace_access_not_before_epoch` and current Auth
  credential metadata reject pre-change access JWTs. The browser clears its
  local session and requires a fresh sign-in.
- A lost one-time credential is never recovered or redisplayed. The
  administrator explicitly rotates it and securely transfers the replacement.
- Revocation denies database access and archives the private workspace before
  deleting the exact marked Auth identity. Interrupted deletion remains under
  a visible, retryable cleanup claim and never re-enables workspace access.
- Completed revoked records remain in the audit history but are hidden from the
  administrator's workspace-account list. A genuinely interrupted deletion is
  shown as `Deletion pending`, with passive operator review unless the dedicated
  manual-account deletion workflow can safely resume it.

## Production backend release unit

The deployed forward database input is:

1. `supabase/migrations/20260721000100_manual_workspace_accounts.sql`
2. `supabase/tests/20260720_invite_only_workspace_verification.sql`

The new JWT-verified Edge Functions are:

- `provision-workspace-account`
- `change-initial-password`

The same release also deploys the changed guarded functions:

- `account-context`
- `accept-workspace-invite`
- `manage-workspace-users`
- `workspace-clients`

`account-context` returns only `state`, `platform_admin`, and purpose-built
membership/workspace DTOs. The membership DTO is limited to `id`,
`workspace_id`, `full_name`, `role`, and `status`; the workspace DTO is limited
to `id`, `name`, `slug`, `status`, and `is_default`. Auth identity UUIDs,
internal actor UUIDs, lifecycle timestamps, and credential markers are not part
of this browser response. Successful email-invite acceptance returns only
`{"success":true}`; callers reload `account-context` for the resulting state.

Use `docs/invite-only-edge-manifest.json` as the exact allowlist. Do not bulk
deploy the functions directory, and keep the two documented tenant-environment
exclusions absent.

For recovery or a fresh environment, preserve this deployment order:

1. Preserve a target-bound backup and remote function/config inventory.
2. Quiesce account and tenant-client mutations.
3. Apply the new forward migration and run the exact catalog verifier.
4. Deploy the reviewed changed/new Edge allowlist and confirm both new
   functions have JWT verification enabled.
5. Probe CORS and authorization while the new frontend action remains hidden.
6. Deploy the frontend and run the complete acceptance matrix.
7. Reopen mutations only after every invariant and recovery test passes.

Production completed the database, catalog-verifier, six-function deployment,
CORS, anonymous-denial, and exact-inventory checks on 2026-07-21. The shared
frontend preview and the complete signed-in browser acceptance matrix must
still be verified together on the reviewed frontend commit.

## Required acceptance

- Anonymous and tenant identities cannot list or view other workspaces or call
  either administrator provisioning action.
- The administrator selector changes only the explicit URL. The selected route
  renders the same tenant Clients experience with mutations disabled. Back,
  reload, and workspace A → B changes never show cached A data under B.
- A successfully issued manual-password account appears in the selector before
  first sign-in; an ordinary unaccepted email invitation, provisioning failure,
  revoked membership, or archived workspace never appears.
- Invalid and stale workspace IDs never fall back to the default workspace or
  an unfiltered client query.
- Duplicate-email and concurrent creates produce at most one live workspace
  account; existing Auth users and platform administrators are never rebound or
  deleted by email alone.
- Temporary credentials satisfy the generator policy and do not appear in any
  persistence, log, telemetry, URL, cache, or sanitized evidence artifact.
- Lost-response, Auth error, timeout, password-update, session-revocation, and
  database-finalization faults leave either a safely retryable state or a
  durable operator-review claim—never active workspace access.
- Direct invite acceptance cannot activate a manual account.
- Revoking a provisioning or invited manual account immediately denies tenant
  and portal access; retries delete only its exact marked Auth identity and do
  not affect a newer or unrelated account.
- An old temporary JWT cannot access RLS, tenant RPCs, or complete password
  setup after rotation. An old pre-change JWT remains blocked after activation;
  a fresh login with the permanent password succeeds.
- Two disposable accounts can create/read/update/delete only their own clients,
  and guessed client/workspace UUIDs fail.
- The focused UI tests, app/staging type checks, zero-warning MVP lint, SQL
  grammar, catalog verifier, frozen Deno checks/tests, static build, production
  server tests, dependency audits, whitespace check, and secret scan pass on
  the exact commit.

## Current limitations

- Only client CRUD is tenant-aware. Podcasts, outreach, reporting, and other
  legacy modules remain platform-administrator-only.
- The administrator workspace preview reuses the tenant Clients experience but
  is read-only and covers clients only.
- Users cannot self-register, invite teammates, or own multiple workspaces.
- There is no self-service password-recovery UI.
- One-time credentials require a separately approved secure handoff channel.
- Email invitation SMTP readiness is independent of the manual-account path;
  manual provisioning sends no email.
