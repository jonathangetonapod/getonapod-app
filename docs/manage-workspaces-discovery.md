# Manage Workspaces: discovery report (Task 0)

Snapshot of `/app/manage-workspaces` before the Phase 1 rebuild. Every later
task reads this first.

## 1. Route and component tree

| Piece | File |
| --- | --- |
| Route `/app/manage-workspaces` (inside `ProtectedRoute`) | `src/App.tsx:157` |
| Route component, platform-admin gate | `src/pages/app/ManageWorkspaces.tsx` |
| Page body (also rendered at `/app/settings` for a platform admin with no workspace of their own) | `src/pages/admin/WorkspaceUsers.tsx` |
| Requests section | `src/components/workspace/JoinRequestsCard.tsx` |
| Workspaces section | inline in `WorkspaceUsers.tsx` |
| Custom domains section | `src/components/workspace/WorkspaceDomainsCard.tsx` |
| Closed workspaces section | `src/components/workspace/WorkspaceRecoveryCard.tsx` |
| App shell | `src/components/workspace/WorkspaceLayout.tsx` |

`src/pages/app/MyWorkspaceSettings.tsx` also renders `WorkspaceUsers`, so the
rebuild shows up there too for that one case. That page itself is not changed.

## 2. Data types and status enums

**Request** (`JoinRequest`, `src/services/accessRequests.ts`, table `workspace_access_requests`)

- `status: 'new' | 'contacted' | 'invited' | 'declined'` (check constraint). The UI shows `new` as "Waiting".
- `audience: 'agency' | 'pr' | 'freelancer' | 'starting_out' | 'other'`
- Fields: `id, email, full_name, company, website, audience, clients_now, notes, status, handled_at, handled_note, created_at`.
- No `is_test` or similar column. No link from a request to the workspace it produced.

**Workspace owner** (`ManagedWorkspaceUser`, `src/services/workspaceUsers.ts`, one owner membership per row)

- `status: 'provisioning' | 'invited' | 'active' | 'suspended' | 'revoked'`
- `provisioning_method: 'platform_bootstrap' | 'email_invite' | 'admin_temporary_password'`
- "Invite expired" is derived on the client: `status === 'invited'` and `invite_expires_at <= now`.
- Revoked rows come back from the API and are filtered out on the client.
- Reconciliation flags (`auth_/invite_/credential_reconciliation_pending`, `*_review_after`, `credential_reconciliation_claim_kind`) gate which actions are enabled.
- The list excludes the default workspace on the server.

**Workspace** (`AdminWorkspace`, `src/services/adminWorkspaces.ts`): `status: 'active' | 'suspended' | 'archived' | 'deleted'`.

**Custom domain** (`WorkspaceDomain`, `src/services/workspaceDomains.ts`)

- `status: 'awaiting_dns' | 'provisioning' | 'active' | 'failed' | 'disabled'` (shown as Waiting for DNS, Issuing certificate, Serving, Failed, Disabled).
- `is_primary` is "Links use this". Carries `workspace_id` and `workspace { id, name, slug }`.

**Closed workspace** (`DeletedAdminWorkspace`, `src/services/adminWorkspaces.ts`): workspaces with `status = 'deleted'`; fields `id, name, slug, deleted_at, purge_after, deletion_reason`. No owner email on this type; the owner's membership row (revoked) in the workspace-users list carries it.

## 3. API calls and their triggers

| Trigger | Call | Payload |
| --- | --- | --- |
| Page load | `manage-workspace-users` | `{ action: 'list' }` |
| Page load | table `workspaces` select (`listAdminWorkspaces`) | status active, for the domain picker |
| Page load | table `workspace_access_requests` select | all rows, newest first |
| Page load | `workspace-domains` | `{ action: 'list' }` |
| Page load | table `workspaces` select (`listDeletedWorkspaces`) | status deleted |
| Invite an owner by email > Send invitation | `manage-workspace-users` | `{ action: 'invite', email, full_name?, workspace_name? }` |
| Create with a temporary password > Create | `provision-workspace-account` | `{ action: 'create', request_id, email, full_name?, workspace_name? }` |
| Reset password (active owner) | `manage-workspace-staff` | `{ action: 'reset_password', workspace_id, membership_id }` |
| Issue new temporary password (invited manual account) | `provision-workspace-account` | `{ action: 'rotate', membership_id, request_id }` |
| Retry manual setup (provisioning manual account) | `provision-workspace-account` | `{ action: 'retry', membership_id, request_id }` |
| Delete (manual account) | `provision-workspace-account` | `{ action: 'revoke', membership_id, request_id }` |
| Suspend / Reactivate / Retry / Delete (email invite) | `manage-workspace-users` | `{ action: 'suspend' \| 'reactivate' \| 'retry_invite' \| 'revoke_pending', membership_id }` |
| Request: Send invitation | `manage-workspace-users` invite, then table update | invite as above, then `{ status: 'invited', handled_by, handled_at, handled_note }` |
| Request: Mark contacted / Decline / Move back to waiting | table `workspace_access_requests` update | `{ status, handled_by, handled_at, handled_note }` |
| Domain: Add domain | `workspace-domains` | `{ action: 'add', workspace_id, hostname }` |
| Domain: Check (and a 60 s background timer while waiting) | `workspace-domains` | `{ action: 'refresh', domain_id }` |
| Domain: Use for links | `workspace-domains` | `{ action: 'set_primary', domain_id }` |
| Domain: trash icon > Remove domain | `workspace-domains` | `{ action: 'remove', domain_id }` |
| Closed: Bring back | `workspace-deletion` | `{ action: 'restore', workspace_id }` |

Not on the page today but available to a platform admin: `workspace-deletion`
`{ action: 'delete', workspace_id, reason? }` (the function allows platform
admins and refuses the default workspace). Task 4's "Close workspace" uses it.

**No resend endpoint exists.** `retry_invite` only finishes an invitation stuck
in `provisioning`. An expired email link cannot be resent; the server path is
cancel, then invite again. "Resend invitation" is left out of the menu.

**Reset password needs an active owner.** `claim_workspace_staff_password_reset_v1`
accepts `active` (or `invited`) memberships only, so Reset password is not
offered on Suspended rows.

**Issue temporary password needs a temporary-password account.** `rotate`
refuses anything whose `provisioning_method` is not `admin_temporary_password`,
so it is not offered on emailed invitations.

## 4. "Rate limit check N" and "Deployment check" requests

They are not created by anything in this repo: no test suite, CI workflow or
script posts to `request-workspace-access`. Production has exactly these rows,
all created 2026-08-03 between 00:42:02 and 00:42:09 UTC, which is a manual
smoke check run by hand when `request-workspace-access` was deployed (one
"Deployment check (please decline)" plus a burst of rate-limit probes; the
probes that were refused never got a row):

| full_name | email | status |
| --- | --- | --- |
| Deployment check (please decline) | deploy-check@getonapod.com | declined |
| Rate limit check 2, 4, 5, 8 | burst-N@getonapod.com | declined |

Tagging without a schema change: they are recognised on the client by that
reserved pattern (name starts "Rate limit check" or "Deployment check", or the
email is `burst-N@getonapod.com` / `deploy-check@getonapod.com`), in
`src/lib/joinRequestTriage.ts`.

Proposed, not applied (needs a migration and an edge function change, so it
stops here per the brief):

```sql
alter table public.workspace_access_requests
  add column is_test boolean not null default false;
update public.workspace_access_requests
  set is_test = true
  where email ~* '^(burst-[0-9]+|deploy-check)@getonapod\.com$';
```

`request-workspace-access` would then set `is_test` for the reserved addresses,
and future smoke checks should keep using them.

## 5. Date formats rendered on the page

| Where | Output | Code |
| --- | --- | --- |
| Workspaces table, Added | locale date and time with seconds | `formatAccountDate`: `toLocaleString()` |
| Workspaces status detail, sign-in instructions, expiry | `Intl.DateTimeFormat(dateStyle: 'medium')` | `formatAccountDay` |
| Reconciliation "pending until ..." | `toLocaleString()` | `formatAccountDate` |
| Temporary access expires ... (credential dialog) | `toLocaleString()` | `formatAccountDate` |
| Requests, Waiting | "today", "1 day", "N days" | `waitedFor` |
| Requests, "Last moved" | `toLocaleDateString(day numeric, month short, year)` | inline in `RequestRow` |
| Domains, "Serving since" | `toLocaleDateString(day numeric, month short, year)` | inline |
| Closed, Closed and Deleted for good | `toLocaleDateString(day numeric, month short, year)` | `formattedDate` |
| Closed, days left | "Last day", "N days left" | `daysLeft` |

Five distinct formats. Task 9 replaces all of them with `formatDate` and
`formatRelativeDays` from `src/lib/dates.ts`.

## 6. UI primitives

All exist in `src/components/ui/`: `tabs` (Radix), `dropdown-menu` (Radix),
`collapsible` and `accordion`, `dialog` and `alert-dialog`, `badge`, `table`,
`radio-group`, `checkbox`, `switch`, `tooltip`. There was no shared row
overflow menu (only the catalog-specific `PodcastRowMenu`), so Task 7 adds
`src/components/workspace/RowMenu.tsx` on top of `dropdown-menu`.

## 7. Invite expiry

Not 7 days for everyone. It depends on how access was given:

- **Email invitation link: 24 hours.** `finalize_workspace_invite` sets
  `invite_expires_at = auth_invited_at + interval '24 hours'`
  (`supabase/migrations/20260722000200_platform_owner_workspace_management.sql:742`).
  Production rows confirm a 1 day gap.
- **Temporary password: 7 days.** Every create, rotate and reset path sets
  `now() + interval '7 days'` (e.g. `20260807000700_password_reset_defer_flip.sql:331`).

The rows behind "added Aug 3, expired Aug 10" were temporary-password accounts.
The New workspace dialog states 24 hours for the email path and 7 days for the
password path.
