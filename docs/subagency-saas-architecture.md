# Sub-agency SaaS architecture

Status: implementation in progress on `main` (2026-07-22).

## Product hierarchy

```text
Get On A Pod platform
└── Agency workspace
    ├── Owner (exactly one, transferable)
    ├── Admins and members
    ├── Agency integrations and operational data
    └── Agency clients
        ├── Client-scoped podcast work
        ├── Client-scoped resources
        └── Separate client portal users
```

The platform uses one Supabase project and one Postgres database. A database per
agency would make migrations, shared podcast data, support, analytics, and
operational fixes unnecessarily fragmented. Isolation is enforced in the data
model and authorization boundary instead.

## Identity and tenancy rules

- Platform administrators provision and suspend agency workspaces. The
  platform owner can select a workspace and manage its supported modules with
  owner-equivalent authority. Selection never changes the Auth session or
  creates an impersonated tenant membership; every mutation retains the real
  platform actor ID in the audit log.
- Each agency has one private `workspaces` row.
- Each agency employee has one live `workspace_memberships` row; revoked
  historical rows may be retained for audit and provider reconciliation. A live
  email or Auth user may belong to only one agency during the MVP, so tenant
  users never see a workspace selector.
- A private workspace has exactly one live owner. Ownership moves only through
  an atomic transfer that promotes the selected active employee and demotes the
  previous owner to admin.
- An agency client is a `clients` row with a required `workspace_id`.
- A client portal identity is authorized for one exact client. It is not a
  workspace employee and cannot use agency routes.
- The podcast catalog may remain global and read-only. Saved searches, matches,
  outreach, dashboards, bookings, resources, integrations, and every other
  tenant-owned record require `workspace_id`; client-owned records also require
  or derive an exact `client_id` in the same workspace.

## Authorization model

| Actor | Scope | Staff management | Agency operations | Client portal |
| --- | --- | --- | --- | --- |
| Platform admin | Platform | Provision/suspend agency owner; owner-level selected-workspace management | Legacy platform tools plus selected workspace modules | No impersonation |
| Workspace owner | One agency | Admins, members, ownership transfer | Full agency access | Manages portal access |
| Workspace admin | One agency | Members only | Operational management | Manages permitted clients |
| Workspace member | One agency | None | Restricted/read-only by module | None by default |
| Client portal user | One client | None | None | Exact client only |

Authorization is rechecked in versioned `SECURITY DEFINER` RPCs under row lock.
Edge Functions validate the bearer token and request shape, but never supply an
authoritative role to SQL. Browser-provided workspace, membership, client, and
resource IDs are always treated as untrusted selectors and rebound to the
authenticated actor inside the database transaction.

## Lifecycle boundaries

Agency lifecycle and employee lifecycle are deliberately separate:

- The platform agency-account workflow changes workspace lifecycle through its
  owner record. Suspending an agency suspends the workspace, denies every
  employee, and revokes its client portal sessions.
- Suspending an admin or member changes only that membership and the exact Auth
  identity. It never changes `workspaces.status`, client data, portal tokens, or
  other employees.
- Removing an employee immediately revokes their database access before Auth
  cleanup. Provider uncertainty is represented by a durable, non-stealable
  reconciliation claim; it never reopens access.
- The owner cannot be suspended, revoked, or demoted through a staff action.
  The owner changes only through ownership transfer.
- An archived agency retains no live staff. Non-owner staff must be removed
  before the owner/workspace archive operation.

The MVP caps a private workspace at 100 live staff. Workspace owners may invite
admins or members and manage any non-owner; admins may invite/manage members
only; members cannot administer staff. The platform owner has owner-equivalent
staff controls in an explicitly selected active workspace but is not inserted
into that workspace's roster.

## Cross-system operations

Supabase Auth changes and Postgres changes cannot share a transaction. Staff
invitation, suspension, reactivation, and revocation therefore use durable claim
rows with exact random tokens:

1. SQL authenticates and authorizes the actor, locks the target, records the
   intended state, and fail-closes access where necessary.
2. The Edge Function changes the exact Auth identity and verifies its email and
   workspace/membership metadata markers.
3. SQL completes the same token-bound claim and writes an audit event.
4. An uncertain provider result keeps the claim for explicit reconciliation;
   another request cannot steal it based on time alone.

Raw Auth IDs, app metadata, token epochs, actor IDs, and claim tokens are never
returned to the browser.

## Module rollout

Modules are enabled only after their complete read/write path is tenant-scoped
and passes two-workspace isolation tests. The release order is:

1. Workspace Users foundation (implemented locally; production cutover pending)
2. Client Podcast System
3. Read-only Podcast Database
4. Onboarding
5. Podcast Finder
6. Prospect Dashboards
7. Outreach Platform
8. Unibox

Clients and customizable Guest Resources already use tenant-safe workspace
boundaries. Disabled sidebar entries are not promises of authorization; their
routes remain unavailable until the corresponding vertical slice is complete.

## Required release evidence

Every tenant module must prove:

- two independent workspaces cannot read or mutate one another by guessing IDs;
- owner/admin/member permissions and self-targeting rules are enforced in SQL;
- suspended memberships and stale tokens fail closed;
- only the platform owner receives the workspace selector, and selected-workspace
  mutations remain scoped to the explicit workspace and audited to that actor;
- portal users cannot reach workspace routes, and workspace users cannot cross
  client portal boundaries;
- direct REST/RLS, Edge Function, and browser paths agree;
- migrations, grants, search paths, audit redaction, CORS, JWT enforcement,
  static build, and production browser verification pass before exposure.

White-label domains and branding can be layered on later with a workspace-domain
mapping and branded asset/settings tables. They do not require separate
databases and must not weaken the authorization model above.
