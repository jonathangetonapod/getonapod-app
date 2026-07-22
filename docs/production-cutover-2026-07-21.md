# Production cutover record — 2026-07-21

This is the sanitized handoff record for the invite-only workspace backend
cutover. The original 2026-07-21 evidence is preserved, followed by the
2026-07-22 Guest Resources increment. It contains no credentials, user data,
capability URLs, or private backup locations.

## Decision

The production backend cutover is complete and safe to retain. The backend
source/configuration head used for the final deploy and inventory check was
`b2655c36f46042d4ace56236fbd373272205e207`. Subsequent audit/documentation
changes superseded that historical source head. For the 2026-07-22 increment,
the repository owner approved a reviewed direct-`main` frontend workflow; the
older follow-up-branch/pull-request instruction is no longer operative.

The product is **not yet approved for real invitations**. Custom SMTP, one
signed-in administrator browser smoke test, one complete invitation lifecycle,
two-account isolation acceptance, and exposed-credential rotation remain open.

## Completed production work

- A checksummed, private pre-cutover database/role/Edge-source backup was
  created before mutation. It is a same-host operator backup; Storage object
  bytes, point-in-time recovery, and a restore rehearsal are not available.
- Public and anonymous Auth signup are disabled. The site URL is
  `https://getonapod.com`; the exact `/accept-invite` and `/admin/callback`
  redirects are the complete allowlist; invitation expiry is 24 hours.
- Migrations `20260720000100` through `20260720000600` were applied in order.
  The exact committed catalog verifier passed inside a serializable read-only
  transaction and ended with `ROLLBACK`. Its SHA-256 was
  `22de3d9c42757a22dc3b49f5a9663f7acf7ce01024d85cf8153bffdbb7e0a106`.
- The six release versions were reconciled into
  `supabase_migrations.schema_migrations`, including non-null names and
  statement arrays. The other historical/noncanonical SQL files are not an
  approved migration stream and must never be bulk-pushed.
- The final Edge inventory exactly matches the manifest: 87 expected, 87
  active, no missing or unexpected names. Seventy-three functions require
  gateway JWT verification and the exact 14 reviewed public/custom-auth
  functions do not.
- `create-prospect-sheet` was explicitly pinned to JWT verification after the
  release audit found that the CLI preserves an older remote flag when config
  is omitted. An unauthenticated request now returns 401.
- `account-context` production-origin preflight returns 204 with the exact
  origin, required headers, and `GET, POST, OPTIONS`; unauthenticated access
  returns 401. This resolves the reported dashboard CORS failure.
- Empty-input probes for the nine public/custom-auth handlers fail closed. The
  five public containment endpoints return 410 even for malformed JSON.
- Six unsafe/orphan remote functions are absent:
  `campaign-reply-webhook`, `create-outreach-message`,
  `auto-populate-dashboard`, `backfill-prospect-podcasts-v2`, `embed`, and
  `swift-function`.
- The Stripe webhook endpoint remains a 410 tombstone. Its two obsolete
  Supabase Edge secret entries were removed after confirming no retained
  function references them.
- The separate Railway video-generator service was replaced with the reviewed
  tombstone. `/health` reports `retired`; `/api` and the historical start,
  stop, generate, and list paths return 410. Its HeyGen and Supabase service
  credentials were removed. The credential-free tombstone project is retained
  pending explicit deletion approval.
- The security, tenant/data, workflow/frontend, and release/operations reviews
  found no concrete tenant-isolation or privilege-escalation blocker in the
  deployed backend.

## Guest Resources production increment — 2026-07-22

- Railway's privileged browser value was replaced by the project's publishable
  key. A clean bundle was deployed, Cloudflare was purged, and the recursive
  live browser-asset credential scan passed. The exposed legacy service-role
  key remains compromised; consumer migration, exposure-window review, and
  safe rotation remain separate incident work.
- Before database mutation, an access-restricted, checksummed private backup
  captured roles, public/Auth schema and data, Storage schema and data,
  migration ledger, Edge source/inventory, and schedule/hook inventory. The
  backup is retained outside the repository; no location or secret is recorded
  here.
- Only `20260721000200_workspace_guest_resources.sql` was applied. Production
  now records it as coordinated migration 8.
- The exact committed catalog verifier passed over `verify-full` TLS using the
  Supabase Root 2021 CA, inside a serializable read-only transaction. Its
  SHA-256 is
  `53f59f3593eb3753729d37422fc3e6965ef3a1e38abdce73cba51bc509704137`.
- `get-guest-resources` v14 is active with `verify_jwt=false`, as required for
  the opaque client-portal session contract. `workspace-guest-resources` v1 is
  active with `verify_jwt=true`.
- The exact remote inventory is 90 active functions: 75 with gateway JWT
  verification enabled and 15 reviewed public/custom-auth handlers with it
  disabled. There are no missing, unexpected, or inactive functions.
- Production-origin OPTIONS/CORS checks and unauthenticated fail-closed probes
  passed. The default-workspace client portal RPC returned its expected narrow
  projection.
- The reviewed Guest Resources frontend at commit
  `bc418e72e0b95e2b64d6632e58d880e65065b2b6` was pushed directly to `main`,
  and Railway deployment `ede90c81-111d-4e65-ac0f-9c46830b494a` succeeded.
  A second, post-deployment Cloudflare purge was completed. The hardened
  recursive live verifier passed, and all six retired asset paths returned 404
  with `no-store`, `text/plain`, and `noindex`.
- Production currently has no private workspace, so signed-in private-tenant
  management, platform-owner selected-workspace management, and private-client portal
  audience acceptance cannot run until a controlled workspace is provisioned.

## Production data effects

- Two legacy portal sessions were invalidated.
- Four plaintext portal-password fields were cleared.
- Four client capability slugs and 26 prospect capability slugs were rotated.
- Four historically blank client-to-prospect references were normalized to
  `NULL`; no relationship mapping was lost.
- Existing client data remains assigned to the default administrator workspace.

Replacement capability URLs and any re-enabled portal access must be issued
through a controlled operator process. Old links and credentials must not be
restored.

## Open launch gates

1. Inventory retained consumers of the exposed legacy service-role key, review
   the exposure window, migrate those consumers, and rotate the key safely.
   Separately rotate the OpenAI, Podscan, Jotform, and Clay credentials exposed
   through chat, then review provider and application logs. Do not copy
   replacement values into tracked files, chat, or evidence.
2. Configure and verify custom SMTP and the production invitation email. Do
   not use the Invite user action before this is complete.
3. Run a signed-in administrator smoke test for dashboard, users, global
   clients, legacy records, and logout.
4. Provision one controlled private workspace and complete invitation/password
   creation, acceptance, login, isolated client and resource management,
   platform-owner selected-workspace management, selected-client portal visibility, logout,
   suspension, and reactivation. Add a second disposable workspace for the
   complete cross-tenant denial matrix.
5. Confirm provider-side removal of the external Stripe webhook and every
   obsolete caller/schedule. Retain the 410 tombstones until that evidence is
   complete.
6. Decide whether to delete the credential-free Railway video tombstone
   project after its audit/caller-observation value is no longer needed.
7. Branch protection and required checks remain recommended future repository
   hardening; their absence was explicitly accepted for this direct-`main`
   increment and is not a release-branch prerequisite.

## Operating constraints

- There are 86 historical/noncanonical files in `supabase/migrations`. Only
  the six coordinated 20260720 versions are authoritative for the original
  cutover; the manual-account seventh migration and Guest Resources eighth
  migration are the two approved forward increments. Never run an unreviewed
  full-directory `supabase db push`.
- Deploy Edge Functions only from the explicit phased manifest. Never bulk
  deploy the whole function directory; the two excluded legacy handler source
  directories remain intentionally non-deployed.
- Keep all 17 HTTP 410 tombstones until external caller/provider cleanup has
  been proved. Function omission is not remote deletion.
- A naive full restore would resurrect retired plaintext/session/capability
  state. Prefer a reviewed forward fix or selective restore, reapply the six
  security migrations, rotate capability links, and invalidate legacy portal
  artifacts before reopening traffic.
- The same-host backup is useful but not a substitute for an off-host backup,
  Storage export, point-in-time recovery, or a rehearsed restore.
