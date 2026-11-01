# Outreach providers: Instantly, Email Bison and ReachInbox

Status: in progress (started 2026-11-01).

## Goal

A workspace can run its outreach through Instantly, Email Bison or ReachInbox
with the same features: connect a key, see mailboxes, build a client campaign, stage
and launch pitches, sync status and analytics, pause/resume, keep the
do-not-contact list in step, and pause everything on workspace deletion.

## Decisions

1. **One provider per workspace.** The integration row gains a `provider`
   column (`instantly` | `emailbison` | `reachinbox`). Switching provider is a disconnect and a
   fresh connect, and is refused while campaigns are mapped (the same rule that
   already guards switching Instantly workspaces).
2. **Table and column names stay.** `workspace_instantly_integrations`,
   `instantly_campaign_id`, `instantly_lead_id` and
   `client_instantly_campaign_links` keep their names and now mean "the
   provider's id". Renaming them would touch every function, RPC, contract
   script and test for no behavioural gain; it can happen later as its own
   change. The id columns change type from `UUID` to `TEXT`, because Email
   Bison ids are integers.
3. **The app's status vocabulary is Instantly's numeric codes.** Campaign status
   `-99..4` and lead status `1/2/3/-1/-2/-3` are what the database CHECKs, the
   UI (`nextSend.ts`, `campaignTargetState.ts`) and the RPCs already understand.
   The Email Bison adapter translates its string statuses *into* those codes, so
   nothing downstream changes. The mapping lives in one place
   (`_shared/emailBison.ts`) and is unit-tested.
4. **A provider interface, not a request shim.** `_shared/outreachProvider.ts`
   defines typed operations (`getCampaign`, `createCampaign`, `stageLead`, ...)
   returning the function's existing neutral shapes (`ProviderCampaign`,
   `ProviderLead`, account summaries). Instantly's adapter holds the request code
   that used to sit inline in `workspace-client-campaigns`; Email Bison's adapter
   implements the same operations against its API.
5. **Pitch variables are campaign-scoped on Email Bison.** Instantly keeps custom
   variables per lead-in-campaign; Email Bison keeps them per contact, across the
   whole workspace. One host pitched for two clients would have the second pitch
   overwrite the first. The Bison adapter therefore names each provisioned
   campaign's variables with a campaign token
   (`GOAP_<token>_PITCH_BODY`), and that campaign's sequence reads only its own.
6. **Self-hosted base URL, treated as hostile input.** Email Bison runs on a
   per-customer host (`https://send.agency.com`). The URL must be `https`, port
   443, a DNS name (no IP literals, no `localhost`, no internal suffixes), no
   credentials, no path. Redirects are never followed. Optional
   `EMAILBISON_ALLOWED_HOST_SUFFIXES` narrows it further. The token is encrypted
   exactly like the Instantly key.
7. **Gaps are explicit.** Where Email Bison has no equivalent the action returns
   `409 PROVIDER_FEATURE_UNSUPPORTED` and the UI hides the control:
   - per-mailbox pause/resume (Bison has no endpoint for it),
   - per-mailbox daily send history (Bison reports totals, not days),
   - the inbox actions (`inbox-*`), which no screen calls today.

## Email Bison API used

From the OpenAPI spec at `https://dedi.emailbison.com/api/reference.openapi`
(fetched 2026-11-01). Auth is `Authorization: Bearer <api-user token>`.

| Need | Endpoint |
|---|---|
| Verify key, workspace identity | `GET /api/users` → `data.team.{id,name}` |
| Mailboxes | `GET /api/sender-emails` (paged), `GET /api/warmup/sender-emails` |
| List / search campaigns | `GET /api/campaigns?search=` (stats inline) |
| Campaign detail | `GET /api/campaigns/{id}`, `GET /api/campaigns/{id}/schedule`, `GET /api/campaigns/v1.1/{id}/sequence-steps`, `GET /api/campaigns/{id}/sender-emails` |
| Create campaign | `POST /api/campaigns`, `PATCH /api/campaigns/{id}/update`, `POST /api/campaigns/{id}/schedule`, `POST /api/campaigns/v1.1/{id}/sequence-steps`, `POST /api/campaigns/{id}/attach-sender-emails` |
| Update settings | `PATCH .../update`, `PUT .../schedule`, `PUT /api/campaigns/v1.1/sequence-steps/{sequence_id}`, attach/remove sender emails |
| Pause / resume | `PATCH /api/campaigns/{id}/pause`, `PATCH /api/campaigns/{id}/resume` |
| Variables | `GET/POST /api/custom-variables` |
| Leads | `GET /api/campaigns/{id}/leads?search=`, `POST /api/leads`, `PATCH /api/leads/{id}`, `POST /api/campaigns/{id}/leads/attach-leads`, `DELETE /api/campaigns/{id}/leads`, `GET /api/leads/{id}` |
| Analytics | campaign list/detail counters; `POST /api/campaigns/{id}/stats` |
| Do-not-contact | `POST /api/blacklisted-emails`, `GET /api/blacklisted-emails?search=`, `DELETE /api/blacklisted-emails/{id}` |

## ReachInbox API used

From https://docs.reachinbox.ai (read 2026-11-01). Base URL
`https://api.reachinbox.ai/api/v1`, Bearer auth, 5 requests/second (the adapter
spaces requests 220 ms apart).

| Need | Endpoint |
|---|---|
| Mailboxes | `GET /account/all` (offset paged) |
| Campaigns | `GET /campaigns/all`, `POST /campaigns/create`, `POST /campaigns/update-details`, `PUT /campaigns/set-name`, `PUT /campaigns/set-schedule`, `PUT /campaigns/set-accounts`, `POST /campaigns/add-sequence`, `POST /campaigns/start`, `POST /campaigns/pause`, `GET /campaigns/accounts` |
| Leads | `GET /leads?campaignId&lastLead`, `GET /leads/details`, `POST /leads/add`, `POST /leads` (update), `POST /leads/delete` |
| Analytics | `POST /analytics`, campaign list counters |
| Do-not-contact | `POST /blocklist/add`, `GET /blocklist/:table`, `DELETE /blocklist/:table` |

ReachInbox gaps, and what the app does instead:

- **No identity endpoint.** The provider workspace id is `key-<sha256 prefix>`
  of the API key, so the same ReachInbox workspace reached through two keys
  counts as two.
- **No campaign read or sequence read.** Campaigns are found in the listing;
  "sends our pitch" is decided by provenance (the `GOAP-` marker in the name
  of every campaign this app builds), and settings saves re-push the sequence.
- **`POST /leads/delete` with an empty `leadIds` deletes every lead.** The
  adapter refuses to send one.
- The blocklist table name for addresses (`emails`) is inferred from the docs'
  `:table` placeholder and needs confirming against a live account.

Status translation (Bison → app):

| Bison campaign status | App code |
|---|---|
| draft | 0 |
| launching, active, queued | 1 |
| paused | 2 |
| completed | 3 |
| stopped, failed | -1 |
| archived, pending deletion, deleted | -99 |

| Bison lead-in-campaign status | App lead code |
|---|---|
| never contacted / in sequence / active | 1 |
| paused | 2 |
| sequence finished / completed | 3 |
| bounced | -1 |
| unsubscribed | -2 |
| stopped / replied / other stop | 3 |

## Phases

1. **Schema** — `provider`, `provider_base_url`, id columns to `TEXT`,
   per-workspace uniqueness of campaign ids.
2. **Shared layer** — `outreachProvider.ts` (interface + shared error base),
   `instantlyProvider.ts` (moved request code), `emailBison.ts` (client,
   base-URL guard, status maps, adapter), with Deno tests.
3. **Campaign function** — replace the 33 inline Instantly requests with
   provider calls; `connect-instantly` accepts `provider` and `base_url`;
   provider-aware id validation and messages.
4. **Other functions** — suppression sync (`workspace-host-relationships`),
   pause-on-delete (`workspace-deletion`).
5. **Frontend** — provider choice and base URL on connect, provider name in
   copy, hide unsupported controls, guidance entries for `EMAILBISON_*` codes.
6. **Verification** — `check:edge`, contract scripts, `test:workspace-mvp`,
   `typecheck:app`, `build`. Live Email Bison and ReachInbox keys are needed to
   prove the adapters against real accounts; until then they are verified
   against the published examples only.

## Deploy and rollback

1. Apply the migration (`20261101000100_outreach_providers.sql`) first: the
   new function code selects `provider` and `provider_base_url`.
2. Deploy `workspace-client-campaigns`, `workspace-host-relationships`,
   `workspace-deletion`, `inbox-enroll-tick` and `inbox-nudge-tick` together.
3. **Rollback:** code from before this change cannot read `provider`. Before
   rolling the functions back, disconnect any Email Bison or ReachInbox
   connection, or the old code would send those keys to Instantly (and reject
   their integer campaign ids). The migration itself is safe to leave applied.

Response fields kept their Instantly names for compatibility:
`workspace-host-relationships` still returns `instantly_blocked`,
`instantly_unblocked` and `instantly_error`, now for whichever provider is
connected.

## Not in scope here

- Email Bison webhooks for push-based reply/status updates (the API supports
  them; this would replace polling for Bison workspaces).
- Renaming `instantly_*` tables and columns.
- The retired AI SDR ticks (`inbox-enroll-tick`, `inbox-nudge-tick`) stay
  Instantly-only; both are disabled.
