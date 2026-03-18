---
phase: quick-1
plan: "01"
subsystem: podcast-database-ui
tags: [podcast-database, podscan-api, demographics, prs, find-similar]
dependency_graph:
  requires: [podscan.ts, podcastDatabase.ts, PodcastDatabase.tsx]
  provides: [getRelatedPodcasts, podcast_reach_score, Find Similar dialog, Demographics sheet, PRS column]
  affects: [PodcastDatabase.tsx, podscan.ts, podcastDatabase.ts]
tech_stack:
  added: []
  patterns: [shadcn Dialog, shadcn Sheet, shadcn Progress, shadcn ScrollArea, shadcn Skeleton]
key_files:
  created: []
  modified:
    - src/services/podscan.ts
    - src/services/podcastDatabase.ts
    - src/pages/admin/PodcastDatabase.tsx
decisions:
  - Used spread merge `{ prs: true, ...parsed }` for columnVisibility localStorage to ensure prs defaults true even for existing stored values
  - PRS badge color thresholds: >=70 default (blue), >=40 secondary (gray), <40 outline
  - Related podcasts response parsing tries data.related_podcasts || data.podcasts || data to handle varied API response shapes
metrics:
  duration: "~12 minutes"
  completed: "2026-03-18"
  tasks_completed: 2
  files_modified: 3
---

# Phase Quick-1 Plan 01: Add Find Similar, Demographics Panel, PRS Column Summary

**One-liner:** PRS sortable column with badge coloring, Find Similar dialog via Podscan related_podcasts API, and audience Demographics sheet with progress bars added to PodcastDatabase admin page.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add getRelatedPodcasts service + PRS to data layer | 823defd | src/services/podscan.ts, src/services/podcastDatabase.ts |
| 2 | Add PRS column, Find Similar dialog, and Demographics sheet to PodcastDatabase UI | ca4dd01 | src/pages/admin/PodcastDatabase.tsx |

## What Was Built

### Task 1: Service Layer

**src/services/podscan.ts:**
- Added `getRelatedPodcasts(podcastId: string): Promise<PodcastData[]>` function calling `GET /podcasts/{id}/related_podcasts` with Bearer auth, matching error handling pattern of `getPodcastById()`

**src/services/podcastDatabase.ts:**
- Added `podcast_reach_score: number | null` to `PodcastDatabaseItem` interface
- Added `sortBy === 'prs' ? 'podcast_reach_score'` mapping in `getPodcasts()` sort logic
- Added 'PRS' to CSV export headers and `p.podcast_reach_score || ''` to row data

### Task 2: UI Layer

**src/pages/admin/PodcastDatabase.tsx:**
- Added `Sparkles`, `UserSearch` icons from lucide-react
- Added imports for `getRelatedPodcasts`, `getPodcastDemographics`, `PodcastData`, `PodcastDemographics` from podscan service
- Added imports for `Dialog`, `Sheet`, `Progress`, `ScrollArea`, `Skeleton` from shadcn
- Updated `SortOption` type to include `'prs'`
- Updated `ColumnVisibility` interface to include `prs: boolean`
- Updated columnVisibility localStorage initialization to default `prs: true` (with spread merge for backward compatibility)
- Added 6 new state variables for Find Similar and Demographics panels
- Added `handleFindSimilar()` and `handleViewDemographics()` async handlers
- Added PRS sortable `TableHead` after Episodes column
- Added PRS `TableCell` with color-coded Badge (default/secondary/outline) and tooltip
- Updated actions dropdown: Find Similar, Demographics, separator, View Details, Copy Email (now with working onClick)
- Added Find Similar Dialog with loading skeleton, empty state, and podcast cards (image, name, host, audience, PRS badge, category)
- Added Demographics Sheet with loading skeleton, no-data state, and full breakdown: summary cards (age, gender, purchasing power, education), episodes analyzed counter, age distribution bars, industry breakdown, geographic distribution, family status badges, technology adoption card, brand relationship grid, living environment bars
- Added 'PRS Score' toggle to column visibility dropdown

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria Met

- [x] PRS score column displays in table with color-coded badges and sortable header
- [x] Find Similar dialog shows loading state, related podcasts with images/details, or empty state
- [x] Demographics sheet shows comprehensive audience breakdown with progress bars and summary cards
- [x] All three features accessible from the per-row actions dropdown
- [x] No TypeScript errors, build passes cleanly

## Self-Check: PASSED

- src/services/podscan.ts - FOUND: getRelatedPodcasts exported
- src/services/podcastDatabase.ts - FOUND: podcast_reach_score in interface, prs sort mapping, PRS in CSV
- src/pages/admin/PodcastDatabase.tsx - FOUND: all UI features added
- Commit 823defd - FOUND: service layer changes
- Commit ca4dd01 - FOUND: UI layer changes
- TypeScript: passes with no errors
- Build: succeeds (vite build completes in 4.72s)
