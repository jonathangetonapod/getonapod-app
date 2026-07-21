# Production cutover record — 2026-07-21

This is the sanitized handoff record for the invite-only workspace backend
cutover. It contains no credentials, user data, capability URLs, or private
backup locations.

## Decision

The production backend cutover is complete and safe to retain. The backend
source/configuration head used for the final deploy and inventory check was
`b2655c36f46042d4ace56236fbd373272205e207`. Subsequent audit/documentation
fixes belong in the same follow-up pull request; merge its final head only after
the fresh pull-request check passes.

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

1. Rotate the OpenAI, Podscan, Jotform, and Clay credentials exposed through
   chat, then review provider and application logs. Do not copy replacement
   values into tracked files, chat, or evidence.
2. Configure and verify custom SMTP and the production invitation email. Do
   not use the Invite user action before this is complete.
3. Run a signed-in administrator smoke test for dashboard, users, global
   clients, legacy records, and logout.
4. Complete one real invitation from delivery through password creation,
   acceptance, login, isolated client CRUD, logout, suspension, and
   reactivation. Complete the two-account cross-tenant denial matrix.
5. Confirm provider-side removal of the external Stripe webhook and every
   obsolete caller/schedule. Retain the 410 tombstones until that evidence is
   complete.
6. Decide whether to delete the credential-free Railway video tombstone
   project after its audit/caller-observation value is no longer needed.
7. Push the follow-up branch, refresh pull request #2, require a new CI result
   for the final head, and merge only the reviewed commit.
8. Add branch protection/required checks to `main`, or explicitly accept that
   repository-control risk before merge.

## Operating constraints

- There are 86 historical/noncanonical files in `supabase/migrations`. Only
  the six coordinated 20260720 versions are authoritative for this cutover.
  Never run an unreviewed full-directory `supabase db push`.
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
