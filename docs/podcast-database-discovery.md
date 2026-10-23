# Podcast Database: Phase 0 discovery

Date: 2026-10-23. Scope: `/app/podcast-database` (and the platform-admin mirror
`/app/workspaces/:workspaceId/podcast-database`). Everything here comes from reading
the source. Nothing has been changed yet.

## 1. Components

| Piece | Where |
|---|---|
| Route | `src/App.tsx:239` (`/app/podcast-database`) and `src/App.tsx:361` (admin mirror) |
| Page | `src/pages/app/WorkspacePodcastDatabase.tsx` (838 lines, one file) |
| Admin wrapper | `src/pages/admin/AdminWorkspacePodcastDatabase.tsx` (passes `platformWorkspaceId`) |
| Details modal | `src/components/workspace/PodcastCatalogDetailsDialog.tsx` |
| Service | `src/services/workspacePodcastCatalog.ts` (`getWorkspacePodcastCatalog`) |
| Edge function | `supabase/functions/workspace-podcast-catalog/index.ts` |
| SQL | `public.workspace_podcast_catalog_page_v2` in `supabase/migrations/20260725000700_workspace_podcast_catalog_filters.sql` |
| Add to client | `addClientShortlistPodcasts` in `src/services/clientShortlist.ts`, which calls the `workspace-client-shortlist` edge function with `action: 'add'` |
| Add to prospect | `addWorkspaceProspectPodcasts` in `src/services/prospectDashboards.ts` |
| Relationship badges | `listHostRelationships` + `relationshipBadge` (marks hosts the workspace already pitched, declined, do-not-contact) |
| Tests | `WorkspacePodcastDatabase.test.tsx` (13 tests), `workspacePodcastCatalog.test.ts` (2), `scripts/test-workspace-podcast-catalog-edge-contract.mjs` (static asserts on the edge function and migration). All are in `test:workspace-mvp` / `lint:mvp` / `check:static`. |

Everything is inline in the page: the search panel, the filter grid, the result card, the
selection bar, pagination, the "How the database grows" footer, and the add dialog. None of
them are separate components today. The "Select" button, the checkbox, "See details", and a
bare external-link icon all sit on each card.

Primitives already available in `src/components/ui`: `tooltip`, `dropdown-menu`, `sheet`,
`drawer`, `toggle-group`, `pagination`, `table`, `popover`, `skeleton`. Nothing new is needed.

## 2. Request and response contract

The page uses `useQuery` with `placeholderData: previous`, so it already keeps the old page on
screen during fetches. It has a 5 minute `staleTime` and prefetches the next page.

**Request** (POST body, unknown keys rejected by `requireOnlyKeys`, 4 KB cap):

| Key | Values | Default |
|---|---|---|
| `action` | `'list'` | required |
| `workspace_id` | uuid | required |
| `search` | string, max 120 | none |
| `category` | string, max 200, exact case-insensitive match | none |
| `contact` | `all` `any` `free` `direct` `none` | `all` |
| `activity` | `active` `last_30_days` `last_90_days` `last_180_days` `last_year` `all` | `active` |
| `audience` | `all` `under_10k` `10k_50k` `50k_250k` `250k_plus` | `all` |
| `sort` | `audience` `name` `recent` `community` | `audience` |
| `page` | 1 to 10,000 | 1 |
| `page_size` | **12 to 48** (enforced in the edge function and the SQL) | 24 (page sends 24) |

**Response:** `{ workspace: {id, name}, search_mode: 'browse'|'keyword'|'hybrid', items[], categories: string[], pagination: {page, page_size, total, total_pages}, summary: {...} }`

**Per item:** `podcast_id` (Podscan id), `podcast_name`, `podcast_description`,
`podcast_image_url`, `podcast_url`, `publisher_name`, `host_name`, `podcast_categories`,
`episode_count`, `itunes_rating`, `spotify_rating`, `audience_size`, `podcast_reach_score`,
`language`, `region`, `website`, `rss_feed`, **`last_posted_at`**, `is_active`,
`catalog_updated_at`, `free_podscan_email`, `direct_email`, `direct_verified_at`,
`shortlist_uses`, `workspace_uses`.

When a search is present, ordering is search rank first and the chosen sort second. So the
sort control only partly applies during a search.

## 3. "Working on" selector

- It lives in `WorkspaceLayout.tsx` (around lines 512 to 590). It is stored in
  **sessionStorage** (not localStorage) under `workspace-working-client-v1:<workspaceId>`
  by `src/lib/workingClient.ts`. It only offers active clients.
- **The page does not read it.** The page reads only `?client=` from the URL
  (`targetClientId`). The sidebar link adds `?client=` when a working client is set
  (`clientScopedHref`), so landing on the page usually agrees with the header.
- `podcast-database` is in `CLIENT_SCOPED_SEGMENTS` but **not** in
  `HEADER_DRIVES_ADDRESS_SEGMENTS` (that list only has `client-podcast-system`). So changing
  the header while you are on this page writes sessionStorage but leaves the URL alone. The
  page then keeps its old client (the "Browsing for X" banner and the add dialog default).
  This is a live bug, and Phase 3.1 depends on fixing it.
- "Add to client" today: the bulk bar opens a dialog. The dialog preselects `targetClientId`,
  lists active clients, and can switch to **"A prospect"** (adds to a prospect dashboard
  instead). The prospect path has to stay reachable after the rebuild.
- Only owner/admin members and platform admins can add (`canAddToClient`). Plain members
  get no checkboxes and no Select button. The rebuild needs a no-add version of the row.

## 4. Email status

Three states. There is no contact-form state anywhere in the schema.

| Data | Meaning | Proposed chip |
|---|---|---|
| `direct_email` not null | Row in `podcast_direct_contacts` with `verification_status = 'verified'`. A paid unlock, shared across workspaces. `stale`/`invalid` rows are excluded and fall through to the rows below. | `Verified email` |
| `free_podscan_email` not null | `podcasts.podscan_email`, published by the show, kept only if it passes an email regex. Not verified. | `Public email` |
| both null | nothing usable | `No email` |

- `direct_verified_at` is `last_verified_at`, which is `NOT NULL`. So the card's "Paid for,
  not yet confirmed" branch can never render.
- The card uses a violet badge for verified, the modal uses emerald, and "Free email" is
  emerald in both. That is three styles for two meanings.
- The filter control's accessible name is "Email availability" but it shows "All podcasts".
- No extra states exist, so the 3.4 table maps cleanly and there is no reason to stop.

## 5. Descriptions and titles

- **The catalog path does not sanitize anything.** `podcast_name` and
  `podcast_description` come straight from `podcasts` (Podscan feed text) and render as-is.
- A decoder already exists: `decodeFeedText` in `src/lib/feedText.ts` (tested in
  `feedText.test.ts`, with a Deno twin in `_shared/promptVariables.ts`).
  `clientShortlist.ts` already uses it at its service boundary. Phase 1.1 should apply it in
  `getWorkspacePodcastCatalog` to name, description, host and publisher. That is one place,
  and it also means added shortlist rows carry clean text.
- Gaps in `decodeFeedText`: it decodes a fixed list of named entities and a few numeric ones.
  It does not decode generic `&#NNN;` / `&#xHH;` (for example `&#233;`) or other named
  entities like `&eacute;`. It also keeps paragraph breaks as `\n`, but the spec wants
  whitespace collapsed. My plan: extend it with generic numeric entities (shared behaviour,
  mirrored to the Deno twin), then collapse whitespace in the catalog mapper. No new
  dependency is needed. `dompurify` is already installed, but React renders text, so there
  is no XSS issue here, only display.

## 6. Rating

- Card: `itunes_rating` only, shown as `4.4 / 5`. Spotify is never used on the card.
- Modal: Apple and Spotify separately.
- `podcasts` has `itunes_rating_count` and `spotify_rating_count` (and `_bracket` columns),
  but **the list response does not return them**. The "higher-volume one" rule in 1.2 needs
  them added as optional response fields (SQL function change plus migration). The fallback
  that needs no contract change: show Apple when present, otherwise Spotify, always labeled.

## 7. Reach score

`podcast_reach_score` is an integer copied from Podscan (`reach` block). We do not compute
it, and nothing in the repo defines it. **It is not on the card today**, only in the modal.
I cannot write a true one-sentence explanation from our code. Per 1.5: leave it out of the
card (no change) and either keep it in the modal with a tooltip that only says what we know
("A popularity score from our podcast data source"), or remove it from the modal too.

## 8. Community: N uses

`shortlist_uses` is the count of rows in **every workspace's** `client_dashboard_podcasts`
**plus** `prospect_dashboard_podcasts` for this show. `workspace_uses` is the number of
distinct workspaces. It is a cross-tenant aggregate. Only counts are exposed, no names.

- The modal says "Used on N client shortlists". That overstates it, because prospect pages
  are counted too.
- Spec 3.5 asks for "On {N} client shortlists" **with client names** for the current
  workspace. The response has nothing scoped to the caller's workspace. That needs a new
  optional field, built inside the RPC from the caller's workspace only.

## 9. Freshness

- `catalog_updated_at` is **per show**: `COALESCE(podscan_last_fetched_at, updated_at)`.
  It comes in the list response. The modal's "Catalog data refreshed <date>" is that row's
  value. There is no catalog-wide date.
- So "Catalog updated <date>" in the results header has no single source today. See
  decision D3.
- `last_posted_at` **is already in the list response**, so 2.2 needs no contract change for
  "Last episode".
- `is_active` is a stored flag (Podscan's), not computed from `last_posted_at`. If a row is
  stale, its active flag is stale too.

## 10. Episode counts

`episode_count` comes from Podscan, and it is also overwritten from whatever the client sends
on a shortlist add (`merge_global_podcast_catalog_batch_v1`). Nothing records a feed cap or
whether the count is complete, so a "500+" display is not possible (spec 1.3). Big shows with
feed-limited counts cannot be told apart from small shows in the data. See decision D4.

## 11. Credits

**Nothing on this page spends credits.**
- Semantic search logs a `semantic_search` operation cost for platform accounting, but its
  credit price is 0 (`20260726000300_metering_and_byo_keys.sql:69`). It is rate limited
  (300 per hour per workspace, 60 per 10 minutes per user). Past the limit it quietly runs
  keyword-only. Workspaces with their own OpenAI key are not limited.
- `add` to a client shortlist charges nothing. Paid actions (email unlock, research, episode
  refresh) happen on the client shortlist, not here.
- So 5.3 means no change: leave the header as is.

Side effects of `add` that matter for **Undo** (3.1):
- It merges the shows into the global catalog. It captures episodes for up to 5 new shows
  (Podscan calls). It writes an audit row. It sends the client a "shortlist ready"
  notification (`notifyShortlistReady`, at most once a day). None of these can be undone.
- **There is no remove action** in `workspace-client-shortlist`. `update` can set
  `visibility: 'archived'`, but an archived row still exists. A later add would then be
  skipped as "already there" and the show would read "On shortlist". See decision D1.

## 12. Format and guests

- No format field (interview, solo, narrative, news).
- `podcasts.podcast_has_guests BOOLEAN` exists (from Podscan) and is already used by
  `search_similar_podcasts` (`IS NOT FALSE`). It is not in the catalog response, and I have
  not checked how many rows have it filled in (that needs a DB query). It is the obvious seed
  for Phase 6.1's "Takes guests".

## 13. Other things the spec relies on

- **Search debounce** is already 300 ms. No spinner in the field yet.
- **Active shows** (the default) means `is_active IS TRUE` with no date window. "Active in
  last 90 days" would be a false label for that default. See decision D5.
- **Sort.** Existing: Largest audience, Most used (`community`), Most recently active,
  Name A–Z. The spec's list has no Name A–Z, but rule 7 says to keep it, so I will keep it.
  "Highest rating" does not exist and needs an SQL change. "Most shortlisted" is the existing
  `community` sort.
- **Page size.** The spec wants 25/50/100 and "Showing 1 to 25". The contract allows 12 to
  48 and the page uses 24. See decision D2.
- **"Select all {total} results".** Not supported. `add` takes explicit show payloads (sent
  in chunks of 50 by the client). There is no server-side add by query. Per 3.3 I will leave
  it out.
- **"On shortlist" state for the selected client.** Not in the catalog response. It can come
  from the existing `getClientShortlist(workspaceId, clientId)` read (one request per
  working client, cached) with no contract change. That is my plan unless you prefer an
  optional field.
- **The modal already closes** on Escape and backdrop click (Radix Dialog default). It also
  has an "Email the show" mailto button that the spec does not mention. I will keep it.
- **Relationship badges** (already pitched, do not contact) are on cards and in the modal.
  They are not in the spec. I will keep them in both views.

## Decisions I need before Phase 1

The spec says to stop and ask when an answer changes the data model or an edge function.
These do.

- **D1. Undo on add (3.1).** No remove action exists, and an add triggers a client
  notification and Podscan calls.
  - (a) **Deferred commit (my recommendation).** The button flips to `Added` and the toast
    shows Undo. The real `add` call goes out when the 8 seconds end, or right away if the tab
    is hidden or closed. No backend change, and Undo is exact. The cost: an add is not saved
    during those 8 seconds.
  - (b) A new `remove` action on `workspace-client-shortlist` that deletes a row added in
    the last minute, if no research or outreach is attached. Real undo, but the notification
    may already have gone.
  - (c) Undo = archive. No backend change, but re-adding the show later is blocked.
- **D2. Page size.** (a) Use 24/48 and keep the contract (my recommendation, no backend
  change), or (b) raise the edge function and SQL limit to 100 and allow 25/50/100. Option
  (b) needs a migration that replaces `workspace_podcast_catalog_page_v2` and an update to
  the contract test.
- **D3. "Catalog updated" date.** No catalog-wide value exists. Options: (a) add an optional
  `summary.catalog_updated_at` (newest refresh across the catalog), or (b) show the oldest
  `catalog_updated_at` on the current page. Option (a) would read "fresh" even when most rows
  are 8 months old. Option (b) is honest and needs no contract change, but the date moves
  from page to page. My recommendation is (b), plus the warning color per row in the modal.
- **D4. Episode counts.** No cap or completeness signal exists. Options: (a) keep showing
  them (the bad ones stay), (b) hide episode counts in the list and card and keep them in the
  modal, or (c) use a heuristic (for example, hide when `audience_size` is over 1M and the
  count is under 50). My recommendation is (b).
- **D5. Default activity label.** Either keep the current default (`is_active`) labeled
  truthfully as `Still publishing`, or change the default to `last_90_days` so the spec's
  label `Active in last 90 days` is true. That shrinks the default result set.
- **D6. Optional new response fields.** Do you approve adding these as optional, additive
  fields to the RPC and edge response (one migration)?
  - `itunes_rating_count`, `spotify_rating_count` (1.2 higher-volume rating)
  - a `rating` sort (4.4 Highest rating)
  - `workspace_shortlist_clients: [{client_id, client_name}]`, scoped to the caller's
    workspace (3.5 Notes line)
  - `podcast_has_guests` (cheap now, and Phase 6 needs it)

  If you decline, I will drop the Highest rating sort and the client names, and use the
  Apple-else-Spotify rating rule.
- **D7. Working-client sync.** I plan to add `podcast-database` to
  `HEADER_DRIVES_ADDRESS_SEGMENTS`. Then the header rewrites `?client=` on this page, and the
  primary button always matches the header. This touches `WorkspaceLayout.tsx`, which is not
  on the protected list, and its tests. Confirm.
- **D8. Plain members (no add rights).** Should a plain member's row have no primary button,
  or show `See details` in that slot? My recommendation is `See details`.

## Decisions taken (2026-10-23)

Approved: go with the recommendations.

- D1: deferred commit. The add is held for the 8 second Undo window, then sent (sent at once if the tab is hidden or the page is left).
- D2: page sizes 24 and 48. No contract change.
- D3: "Catalog updated" shows the oldest refresh date among the shows on the current page, with the warning color past 90 days.
- D4: episode counts are hidden on rows and cards and kept in the modal.
- D5: the default stays `is_active` and is labeled `Still publishing`.
- D6: no new response fields this round. Rating shows Apple when present, otherwise Spotify, always labeled. No Highest rating sort. The Notes line shows the count only, without client names.
- D7: `podcast-database` joins `HEADER_DRIVES_ADDRESS_SEGMENTS`.
- D8: members without add rights get `See details` in the primary slot.
- Not built: "Select all {total} results" (no server-side bulk add) and Phase 6 (needs separate sign-off).
