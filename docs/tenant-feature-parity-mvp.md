# Tenant feature parity MVP

## Current status

The Guest Resources backend production increment completed on 2026-07-22.
Migration `20260721000200_workspace_guest_resources.sql` is recorded as
migration 8, and `workspace-guest-resources` v1 plus `get-guest-resources` v14
are active with their reviewed JWT settings. Production catalog, CORS,
fail-closed, and default-client portal-projection checks passed.

The browser-key containment gate also passed: Railway uses the project
publishable key, and the original Cloudflare purge removed the cached
credential-bearing assets. The Guest Resources frontend at commit
`bc418e72e0b95e2b64d6632e58d880e65065b2b6` is now on `main`; Railway
deployment `ede90c81-111d-4e65-ac0f-9c46830b494a` succeeded. A second,
post-deployment Cloudflare purge was completed, and the hardened recursive live
verifier passed with all six retired asset paths returning 404, `no-store`,
`text/plain`, and `noindex`. Safe rotation of the exposed legacy service-role
key remains a separate incident task. That earlier increment did not capture a
controlled signed-in tenant, administrator workspace, or private-client portal
acceptance run; current production state must be inventoried and tested again
rather than relying on the historical “no private workspace” observation.

The Sub-agency Workspace Foundation and native platform-owner
selected-workspace management are production-active through migration 10. The
current release candidate adds Settings-based workspace-user management and
staff temporary-password migration 11 plus audited workspace-logo migration 12.
Migrations 11–12, the changed Edge Functions, frontend, and live acceptance
remain incomplete for this increment.

## Product goal

An administrator provisions one private workspace and its agency owner. The
owner can add admins and members; that agency team signs in under `/app/*`, adds
its own clients, and uses supported podcast-placement modules without seeing
another workspace's records. Billing, public registration, multi-workspace
tenant identities, and full visual white-labeling beyond a workspace logo
remain out of scope.

The downstream client portal is a separate identity layer. A workspace account
manages work for many clients; each client portal login sees only that client's
published bookings, approvals, and resources.

## Data model decision

Use one Supabase project and one PostgreSQL database. Shared reference data,
such as the podcast catalog, stays global. Tenant-owned records carry a required
`workspace_id`, and child records use composite foreign keys so a client from
workspace A cannot be attached to a record in workspace B. Direct browser
writes to tenant operational tables remain closed; narrow Edge Functions call
service-only transactional RPCs that recheck membership and audit mutations.

A database per workspace is not needed for this MVP. It would multiply
migrations, backups, credentials, observability, and support work without
improving the product experience. Strong row ownership plus verified server
operations provides the intended isolation at this stage.

## Shared tenant contract

Every tenant module must satisfy the same contract before its navigation item
is enabled:

1. Resolve the Auth user and reject stale manually provisioned credentials.
2. Lock and verify the active target workspace plus either an active target
   membership or the platform owner's fresh default-workspace authority.
3. Derive or validate every object against the selected `workspace_id`.
4. Return a narrow DTO rather than a base-table `select('*')` result.
5. Allow writes only to an active owner/administrator or the authenticated
   platform owner acting in an explicitly selected active workspace.
6. Perform mutations in a service-only transaction and append an audit event.
7. Include user ID and workspace ID in query and browser-storage keys.
8. Reuse the real tenant component for the platform owner's selected-workspace
   context, while keeping the platform Auth identity and audit actor intact.
9. Test two-workspace isolation, suspension, stale tokens, malformed IDs,
   cross-workspace IDs, CORS, and direct table denial.

Existing `/admin/*` pages are platform tools. Hiding or linking one of those
pages does not make it tenant-safe.

## Shared workspace shell

Workspace accounts use the same responsive left-sidebar structure and module
order as the platform dashboard, under `/app/*`. A workspace account never
receives the platform workspace selector or provisioning controls. The
platform owner's selected-workspace route renders this same workspace shell
with native controls and a platform-only selector while preserving the
platform session.

The shell may name a planned module before its backend is ready, but that entry
must remain a disabled control rather than a route. Settings (including
Workspace users), Clients, and Guest Resources satisfy the shared tenant contract in the current release
candidate. Each remaining entry
becomes a link only in the same release unit as its migration, narrow service
boundary, platform-owner management path, and isolation tests.

## Module rollout

| Order | Module | MVP boundary |
| --- | --- | --- |
| 1 | Settings / Workspace users foundation | Workspace-logo branding; exactly one transferable owner; admins/members; email or generated-password staff setup; role hierarchy; employee lifecycle; stale-token revocation; and owner-level platform management of a selected workspace |
| 2 | Client Podcast System | Workspace-scoped booking/calendar management and portal-credential controls for workspace-owned clients |
| 3 | Podcast Database | Read-only browse/search/filter over a narrow projection of the shared podcast catalog; no global writes, contact export, cost analytics, or live paid lookups |
| 4 | Onboarding | Workspace-owned submissions behind expiring capability links; no legacy client deletion behavior |
| 5 | Podcast Finder | Search for a verified workspace client, server-loaded bio, per-workspace usage limits, and an idempotent export workflow |
| 6 | Prospect Dashboard | Workspace-owned dashboards, child rows, images, public capabilities, AI work, and Google Sheet operations |
| 7 | Outreach Platform | Workspace/integration/campaign ownership, provider event ledger, outbox state machine, and idempotent individual approval |
| 8 | Unibox | Campaign-bound ingestion, quarantined unknown events, read-only inbox first, then AI drafts and idempotent sends |

Clients and customizable Guest Resources are already tenant-scoped foundation
modules. Client Podcast System is the next implementation slice after the
Workspace users settings section reaches production.

Outreach and Unibox come last because their current provider accounts and event
records are global. `campaign_replies` cannot presently identify a workspace,
and the excluded Clay/Bison webhook handlers must stay disabled until exact
campaign ownership and event deduplication exist.

## Guest Resources vertical slice

The existing `guest_resources` table remains the GOAP public catalog and the
starter-template source. It is not a tenant's live library. Each private
workspace receives independent copies in `workspace_guest_resources`; editing a
template later never overwrites a tenant's customized copy.

Each workspace resource has:

- content fields: title, description, category, type, and either an article
  body or the applicable URL/file URL;
- presentation fields: featured state and display order;
- lifecycle fields: draft, published, or archived, with a publication time;
- audience: every client in the workspace or an explicit set of workspace
  clients; and
- provenance and audit fields, including the optional source template and the
  creating/updating Auth user.

Long-form rich content is article-only in this MVP. It is stored as canonical
resource-editor HTML with a 100,000-character ceiling. A published article must
contain visible text: empty markup, non-breaking spaces, and zero-width-only
content are rejected consistently by browser, Edge, and database boundaries.
Published video/link resources require a safe credential-free HTTP(S) URL, and
published downloads require a safe HTTP(S) file URL. The portal sanitizer
removes scripts, styles, forms, images, embeds, event handlers, and unsafe URLs;
safe links receive protective attributes.

Each global or private catalog is capped atomically at 1,000 resources and
5,000,000 aggregate content characters, and one resource may target at most 500
selected clients. These limits match the complete portal pagination contract
and prevent unbounded resource listings.

`workspace_guest_resource_clients` enforces both the resource workspace and the
client workspace through composite foreign keys. A selected-client resource
cannot be created or saved without an audience. If its final assigned client is
later deleted or moved, the resource remains manageable but becomes invisible
to every portal until a workspace manager assigns a new audience.
Moving a client between workspaces or changing its portal identity also revokes
that client's portal credential, sessions, tokens, and resource assignments.
Deleting a global source template clears provenance without deleting any
workspace's independent snapshot.

Workspace owners manage the catalog at `/app/guest-resources`. The platform
owner opens the same component at
`/admin/workspaces/:workspaceId/guest-resources` and can create, edit, publish,
archive, assign, and delete resources for that selected workspace. SQL binds
the operation to the explicit workspace and records the real platform actor;
the platform session is never replaced with the workspace owner's session.
The public `/resources` page continues to show only GOAP public resources.

This is content and audience customization, not full visual white-labeling. In this
slice a workspace can choose the exact resources, copy, links, files, order,
featured state, lifecycle, and client audience shown in its downstream portal.
A workspace logo is now managed separately under Settings. Custom domains,
colors, navigation labels, and page-level themes remain part of the deferred
white-label phase.

The client portal never accepts a caller-supplied workspace. It validates the
opaque, hash-stored portal session for the exact `clientId`, derives that
client's active workspace, and returns only published resources that are either
visible to all workspace clients or assigned to that client. Administrator
client-portal impersonation remains an explicit platform-admin-only path.
Default-workspace clients retain the global GOAP catalog; private-workspace
clients use their workspace's independent snapshots and audience rules.

## Release rule

Tenant navigation must not reach production before its migration and Edge
Functions. The 2026-07-22 backend increment followed that rule:

1. the browser credential was replaced by the project publishable key;
   Cloudflare was purged and the recursive live-asset scan passed;
2. a checksummed private backup and production inventory were captured outside
   the repository;
3. only `20260721000200_workspace_guest_resources.sql` was applied;
4. the committed verifier passed over `verify-full` TLS using the Supabase Root
   2021 CA, in a serializable read-only transaction, with SHA-256
   `53f59f3593eb3753729d37422fc3e6965ef3a1e38abdce73cba51bc509704137`;
5. only `get-guest-resources` v14 (`verify_jwt=false`) and
   `workspace-guest-resources` v1 (`verify_jwt=true`) were deployed. The exact
   inventory is 90 active functions: 75 JWT-verified and 15 reviewed
   public/custom-auth functions. OPTIONS/CORS, fail-closed, and default-client
   narrow portal projection probes passed; and
6. frontend commit `bc418e72e0b95e2b64d6632e58d880e65065b2b6` was pushed
   directly to `main`, and Railway deployment
   `ede90c81-111d-4e65-ac0f-9c46830b494a` succeeded. A second,
   post-deployment Cloudflare purge was completed; the hardened live verifier
   passed, and all six retired asset paths returned 404 with `no-store`,
   `text/plain`, and `noindex`; and
7. that increment left signed-in tenant, platform-owner workspace management, and
   private-client portal audience acceptance outstanding. Re-inventory current
   production workspaces and run those checks with controlled accounts; do not
   reuse the historical assumption that no private workspace exists.

`scripts/run-workspace-guest-resources-behavior.sh` is non-production-only and
ends all fixture mutations with `ROLLBACK`. `check:static` grammar-parses that
suite but does not execute it. `scripts/staging-database-verifier.sh` is also
staging-only; neither runner authorizes a production migration or substitutes
for production catalog evidence.

If any backend gate fails, do not publish the tenant route.
