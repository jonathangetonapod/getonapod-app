# Workspace onboarding

## Product boundary

Workspace onboarding is a tenant-owned intake and review workflow. An agency
owner or administrator starts it for an existing client or creates a minimal
client while sending the invitation. The invited contact opens an expiring
capability link and does not need a portal account. Onboarding never grants
portal access.

The same management experience is available at:

- `/app/onboarding` for the signed-in workspace owner or staff member; and
- `/admin/workspaces/:workspaceId/onboarding` for the platform owner managing
  the explicitly selected workspace without impersonating its owner.

Members can read only onboarding records explicitly assigned to their active
workspace membership. Owners, admins, and the platform owner can manage the
selected workspace's templates, invitations, reviews, assignments, and
approved pitch profiles.

## Lifecycle

An invitation is pinned to an immutable published template version. Its public
state moves through `invited`, `in_progress`, `submitted`,
`changes_requested`, and `approved`; expired and revoked links are terminal.
The default expiry is 14 days and the hard maximum is 90 days.

Drafts autosave to the server with an optimistic lock version. No onboarding
answers or capability tokens are stored in browser storage. A submitted answer
set becomes an immutable numbered revision. Reviewers leave notes on specific
questions, and the client can submit another immutable revision in response.
Requesting changes sends a branded email when Resend is configured and always
returns the current secure link for manual delivery.

Submitting creates a pending AI pitch-profile draft. AI output is never
published automatically: an owner or admin must review, edit, and approve it.
Approval copies only configured question mappings into the client record and
stores the approved podcast pitch profile separately. If a mapped email change
would invoke the existing portal credential/session revocation lifecycle, the
email mapping is skipped and audited; portal access and artifacts remain
untouched.

## Templates and files

Each new private workspace receives a published default podcast-guest intake.
Workspaces can create multiple reusable templates, publish immutable versions,
choose an optional default, duplicate templates, and configure reminder days.
The builder permits at most 12 sections, 100 questions, and 50 choices per
select question.

Supported fields are short text, long text, email, URL, single select, multi
select, yes/no, date, image upload, and PDF upload. Files use the private
`workspace-onboarding-assets` bucket. PNG, JPEG, and WebP images are limited to
5 MB; PDFs are limited to 10 MB. Browser clients receive only short-lived
signed URLs after capability or staff authorization.

## Capability and retention rules

The public route is `/onboarding/:token`. A token binds the instance UUID and
generation with HMAC-SHA-256. PostgreSQL stores only the SHA-256 token verifier,
never the raw capability. Rotating a link increments its generation and
preserves the server draft; the previous link stops working immediately.

Expired drafts, revisions, comments, and files are retained for agency review.
Archiving an active intake revokes its capability and stops notifications.
Permanent PII purge requires an archived record plus the exact `PURGE`
confirmation. The Edge Function first deletes every private Storage object and
only then deletes database intake data, including metadata for previously
removed files; if Storage enumeration or deletion fails, database records
remain retryable. The underlying client record is always retained.

## Server configuration

Set these as server-only Supabase Edge Function secrets:

- `ONBOARDING_CAPABILITY_SECRET`: at least 32 characters; changing it
  invalidates every outstanding onboarding link.
- `ONBOARDING_REMINDER_SECRET`: at least 32 characters; authenticates the
  reminder worker request.
- `APP_URL` or `WEB_URL`: canonical application origin used to construct
  links.
- `RESEND_API_KEY`: optional; without it, delivery is marked skipped and the
  link is still returned.
- `RESEND_FROM_EMAIL`: optional verified sender override.
- `ANTHROPIC_API_KEY`: optional; required for AI pitch drafts.
- `ONBOARDING_AI_MODEL`: optional model override.

Invoke `process-onboarding-reminders` from a trusted scheduler, typically
every 15 minutes, with a POST request and the
`x-onboarding-reminder-secret` header. The worker atomically claims up to 50
due reminders with `SKIP LOCKED`, so concurrent invocations do not claim the
same row. Claims left in `processing` by an interrupted worker become eligible
again after 15 minutes.

## Deployment order

1. Capture the normal database backup and current production inventory.
2. Apply `20260722000400_workspace_branding.sql` if it is not already present,
   then apply `20260722000500_workspace_onboarding.sql`.
3. Run the database verifier and the rollback-only onboarding behavior suite
   in an authorized local or staging environment.
4. Configure the server secrets above.
5. Deploy `workspace-onboarding` with JWT verification, then
   `client-onboarding` and `process-onboarding-reminders` with the reviewed
   non-JWT settings in `supabase/config.toml`.
6. Configure the reminder scheduler and deploy the frontend routes.
7. Complete signed-in owner, assigned-member, platform-owner, public-link,
   upload, review, approval, and purge acceptance checks before enabling live
   invitations.

This repository implementation does not itself authorize a production
migration, function deployment, scheduler change, or email send.

## Verification

`scripts/run-workspace-onboarding-behavior.sh` verifies the target, clean
committed source, explicit confirmation string, and rollback guard before it
runs `supabase/tests/20260722_workspace_onboarding_behavior.sql` against an
authorized local/staging database. The SQL suite ends with `ROLLBACK`. It covers role and workspace
isolation, immutable versions/revisions, capability mismatch and rotation,
autosave conflicts, WebP metadata, review/resubmission, portal-safe approval,
and archive/purge behavior. `scripts/test-onboarding-edge-contract.mjs` covers
the browser and Edge security contract; the normal typecheck, lint, Deno, and
build checks cover integration.
