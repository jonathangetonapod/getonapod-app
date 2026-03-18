---
phase: quick-1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/podscan.ts
  - src/services/podcastDatabase.ts
  - src/pages/admin/PodcastDatabase.tsx
autonomous: true
requirements: [FIND-SIMILAR, DEMOGRAPHICS-PANEL, PRS-COLUMN]
must_haves:
  truths:
    - "PRS score is visible as a sortable column in the podcast table"
    - "User can click Find Similar on any podcast row to see related podcasts"
    - "User can view audience demographics for any podcast via the actions menu"
    - "Related podcasts results show in a dialog with name, audience, and PRS"
    - "Demographics panel shows age, gender, purchasing power, industry breakdown"
  artifacts:
    - path: "src/services/podscan.ts"
      provides: "getRelatedPodcasts() function"
      exports: ["getRelatedPodcasts"]
    - path: "src/services/podcastDatabase.ts"
      provides: "podcast_reach_score in PodcastDatabaseItem, prs sort support"
      contains: "podcast_reach_score"
    - path: "src/pages/admin/PodcastDatabase.tsx"
      provides: "PRS column, Find Similar dialog, Demographics sheet"
  key_links:
    - from: "PodcastDatabase.tsx actions dropdown"
      to: "getRelatedPodcasts()"
      via: "Find Similar menu item onClick"
      pattern: "getRelatedPodcasts"
    - from: "PodcastDatabase.tsx actions dropdown"
      to: "getPodcastDemographics()"
      via: "Demographics menu item onClick"
      pattern: "getPodcastDemographics"
    - from: "PodcastDatabase.tsx table header"
      to: "getPodcasts sortBy"
      via: "handleSort('prs') -> sortBy state -> query"
      pattern: "podcast_reach_score"
---

<objective>
Add three features to the Podcast Database admin page: (1) PRS score as a sortable table column, (2) Find Similar button per podcast row using Podscan related_podcasts API, (3) Demographics panel showing audience details per podcast.

Purpose: Make it easier to evaluate and discover the right podcasts for prospects and clients by surfacing reach scores, related shows, and audience demographics directly in the database interface.

Output: Enhanced PodcastDatabase.tsx with PRS column, Find Similar dialog, and Demographics sheet panel; updated service layer with getRelatedPodcasts() function.
</objective>

<execution_context>
@/Users/jonathangarces/.claude/get-shit-done/workflows/execute-plan.md
@/Users/jonathangarces/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/services/podscan.ts
@src/services/podcastDatabase.ts
@src/pages/admin/PodcastDatabase.tsx

<interfaces>
<!-- Key types and contracts the executor needs. -->

From src/services/podscan.ts:
```typescript
export interface PodcastData {
  podcast_id: string;
  podcast_name: string;
  podcast_url: string;
  podcast_description?: string;
  podcast_image_url?: string;
  podcast_reach_score?: number;
  podcast_categories?: Array<{ category_id: string; category_name: string }>;
  episode_count?: number;
  publisher_name?: string;
  reach?: { audience_size?: number; itunes?: { itunes_rating_average?: string } };
}

export interface PodcastDemographics {
  episodes_analyzed: number;
  total_episodes: number;
  age: string;
  gender_skew: string;
  purchasing_power: string;
  education_level: string;
  engagement_level: string;
  age_distribution: Array<{ age: string; percentage: number }>;
  geographic_distribution: Array<{ region: string; percentage: number }>;
  professional_industry: Array<{ industry: string; percentage: number }>;
  family_status_distribution: Array<{ status: string; percentage: number }>;
  technology_adoption?: { profile: string; confidence_score: number; reasoning: string };
  content_habits?: { primary_platforms: string[]; content_frequency: string; preferred_formats: string[]; consumption_context: string[] };
  ideological_leaning?: { spectrum: string; confidence_score: number; polarization_level: string; reasoning: string };
  living_environment?: { urban: number; suburban: number; rural: number; confidence_score: number; reasoning: string };
  brand_relationship?: { loyalty_level: string; price_sensitivity: string; brand_switching_frequency: string; advocacy_potential: string; reasoning: string };
}

export async function getPodcastDemographics(podcastId: string): Promise<PodcastDemographics | null>;
export async function getPodcastById(podcastId: string): Promise<PodcastData>;
```

From src/services/podcastDatabase.ts:
```typescript
export interface PodcastDatabaseItem {
  id: string;
  podscan_id: string;
  podcast_name: string;
  podcast_description: string | null;
  podcast_image_url: string | null;
  podcast_url: string | null;
  publisher_name: string | null;
  host_name: string | null;
  podcast_categories: any;
  episode_count: number | null;
  itunes_rating: number | null;
  spotify_rating: number | null;
  audience_size: number | null;
  language: string | null;
  region: string | null;
  podscan_email: string | null;
  // NOTE: podcast_reach_score is in the DB but MISSING from this interface
}

export async function getPodcasts(params: GetPodcastsParams): Promise<GetPodcastsResult>;
```

DB schema (supabase/migrations/20260125_centralized_podcasts_database.sql):
- `podcast_reach_score INTEGER` column exists in podcasts table
- `demographics JSONB` column exists in podcasts table
- `demographics_episodes_analyzed INTEGER` column exists
- Data is populated during cache via `upsert_podcast` function

Podscan API endpoint for related podcasts:
- `GET /podcasts/{podcast_id}/related_podcasts`
- Authenticated with Bearer token same as other endpoints
- Returns array of PodcastData objects

PodcastDatabase.tsx structure:
- ~2300 lines, uses React Query, shadcn/ui, lucide-react icons
- Table row actions dropdown at line 2232-2248 (MoreVertical icon trigger)
- Currently only has "View Details" and "Copy Email" items
- Table headers at line 2072-2130 with sortable columns
- SortOption type: 'name' | 'host' | 'audience' | 'rating' | 'episodes' | 'dateAdded'
- ColumnVisibility interface controls which columns show
- Available shadcn components: Dialog, Sheet, Badge, Tooltip, Progress, Skeleton
- handleSort function at line 564 toggles sortBy/sortOrder state
- Sort mapping in podcastDatabase.ts getPodcasts() at line 143-149
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add getRelatedPodcasts service + PRS to data layer</name>
  <files>src/services/podscan.ts, src/services/podcastDatabase.ts</files>
  <action>
**In src/services/podscan.ts:**

1. Add a `getRelatedPodcasts()` function after the existing `getPodcastById()` function (after line 250). It should:
   - Accept `podcastId: string` parameter
   - Call `GET ${PODSCAN_API_BASE}/podcasts/${podcastId}/related_podcasts` with the same auth headers pattern as other functions
   - Return `Promise<PodcastData[]>`
   - Extract the podcasts array from response (try `data.related_podcasts || data.podcasts || data` like other functions handle varied response shapes)
   - Handle errors with console.error and throw, matching the pattern of `getPodcastById()`

```typescript
export async function getRelatedPodcasts(podcastId: string): Promise<PodcastData[]> {
  const url = `${PODSCAN_API_BASE}/podcasts/${podcastId}/related_podcasts`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    console.error('Podscan API error:', response.status, response.statusText);
    throw new Error(`Failed to fetch related podcasts: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.related_podcasts || data.podcasts || data || [];
}
```

**In src/services/podcastDatabase.ts:**

2. Add `podcast_reach_score: number | null` to the `PodcastDatabaseItem` interface (after `audience_size` field, around line 35).

3. In the `getPodcasts()` function's sort column mapping (line 143-149), add a case for PRS:
   - Add `sortBy === 'prs' ? 'podcast_reach_score' :` to the ternary chain before the fallback `sortBy`

4. Update the `exportPodcastsToCSV` function's headers and rows arrays to include PRS:
   - Add 'PRS' header after 'Rating'
   - Add `p.podcast_reach_score || ''` to the corresponding row position
  </action>
  <verify>
    <automated>cd /Users/jonathangarces/Desktop/getonapod-app && npx tsc --noEmit --pretty 2>&1 | head -30</automated>
  </verify>
  <done>
    - getRelatedPodcasts() exported from podscan.ts
    - PodcastDatabaseItem has podcast_reach_score field
    - getPodcasts supports sortBy='prs' mapping to podcast_reach_score column
    - CSV export includes PRS data
  </done>
</task>

<task type="auto">
  <name>Task 2: Add PRS column, Find Similar dialog, and Demographics sheet to PodcastDatabase UI</name>
  <files>src/pages/admin/PodcastDatabase.tsx</files>
  <action>
This task adds all three UI features to PodcastDatabase.tsx. The file is large (~2300 lines), so be precise about insertion points.

**A. New imports (top of file):**

Add to lucide-react imports: `Sparkles, UserSearch, ChevronRight`
Add new service imports:
```typescript
import { getRelatedPodcasts, getPodcastDemographics, type PodcastData, type PodcastDemographics } from '@/services/podscan'
```
Add shadcn imports:
```typescript
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
```

**B. Update SortOption type (line 86):**

Change to: `type SortOption = 'name' | 'host' | 'audience' | 'rating' | 'episodes' | 'dateAdded' | 'prs'`

**C. Update ColumnVisibility interface (line 89) and defaults:**

Add `prs: boolean` to ColumnVisibility. Set default to `true` in both the localStorage-loaded default and the fallback default (around line 144-161). Also add the 'prs' toggle to the column visibility dropdown menu (around line 1559-1571).

**D. New state variables (add after line 232, the isExporting state):**

```typescript
// Find Similar State
const [findSimilarOpen, setFindSimilarOpen] = useState(false)
const [findSimilarPodcast, setFindSimilarPodcast] = useState<PodcastDatabaseItem | null>(null)
const [relatedPodcasts, setRelatedPodcasts] = useState<PodcastData[]>([])
const [isLoadingRelated, setIsLoadingRelated] = useState(false)

// Demographics State
const [demographicsOpen, setDemographicsOpen] = useState(false)
const [demographicsPodcast, setDemographicsPodcast] = useState<PodcastDatabaseItem | null>(null)
const [demographics, setDemographics] = useState<PodcastDemographics | null>(null)
const [isLoadingDemographics, setIsLoadingDemographics] = useState(false)
```

**E. Handler functions (add after the export handlers, before the return statement):**

```typescript
// Find Similar handler
const handleFindSimilar = async (podcast: PodcastDatabaseItem) => {
  setFindSimilarPodcast(podcast)
  setFindSimilarOpen(true)
  setIsLoadingRelated(true)
  setRelatedPodcasts([])
  try {
    const related = await getRelatedPodcasts(podcast.podscan_id)
    setRelatedPodcasts(related)
  } catch (error) {
    console.error('Failed to fetch related podcasts:', error)
    toast.error('Failed to load related podcasts')
  } finally {
    setIsLoadingRelated(false)
  }
}

// Demographics handler
const handleViewDemographics = async (podcast: PodcastDatabaseItem) => {
  setDemographicsPodcast(podcast)
  setDemographicsOpen(true)
  setIsLoadingDemographics(true)
  setDemographics(null)
  try {
    const data = await getPodcastDemographics(podcast.podscan_id)
    setDemographics(data)
  } catch (error) {
    console.error('Failed to fetch demographics:', error)
    toast.error('Failed to load demographics')
  } finally {
    setIsLoadingDemographics(false)
  }
}
```

**F. PRS Table Header (insert after the Episodes TableHead block, around line 2125, before the Compatibility/isMatchMode TableHead):**

```tsx
{columnVisibility.prs && (
  <TableHead
    className="cursor-pointer select-none hover:bg-muted/50"
    onClick={() => handleSort('prs')}
  >
    <div className="flex items-center">
      PRS
      <SortIndicator column="prs" />
    </div>
  </TableHead>
)}
```

**G. PRS Table Cell (insert after the Episodes TableCell block, around line 2202, before the Compatibility/isMatchMode TableCell):**

```tsx
{columnVisibility.prs && (
  <TableCell className={getDensityClass()}>
    {podcast.podcast_reach_score ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Badge
              variant={
                podcast.podcast_reach_score >= 70 ? 'default' :
                podcast.podcast_reach_score >= 40 ? 'secondary' :
                'outline'
              }
              className="cursor-help"
            >
              {podcast.podcast_reach_score}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-sm">Podcast Reach Score (0-100)</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : (
      <span className="text-xs text-muted-foreground">N/A</span>
    )}
  </TableCell>
)}
```

**H. Actions Dropdown Enhancement (modify the DropdownMenuContent at line 2238-2247):**

Replace the existing dropdown content with:
```tsx
<DropdownMenuContent align="end">
  <DropdownMenuItem onClick={() => handleFindSimilar(podcast)}>
    <Sparkles className="h-4 w-4 mr-2" />
    Find Similar
  </DropdownMenuItem>
  <DropdownMenuItem onClick={() => handleViewDemographics(podcast)}>
    <UserSearch className="h-4 w-4 mr-2" />
    Demographics
  </DropdownMenuItem>
  <DropdownMenuSeparator />
  <DropdownMenuItem>
    View Details
  </DropdownMenuItem>
  {podcast.podscan_email && (
    <DropdownMenuItem onClick={() => {
      navigator.clipboard.writeText(podcast.podscan_email!)
      toast.success('Email copied to clipboard')
    }}>
      <Mail className="h-4 w-4 mr-2" />
      Copy Email
    </DropdownMenuItem>
  )}
</DropdownMenuContent>
```

**I. Find Similar Dialog (add just before the closing `</DashboardLayout>` tag at the end of the component):**

```tsx
{/* Find Similar Dialog */}
<Dialog open={findSimilarOpen} onOpenChange={setFindSimilarOpen}>
  <DialogContent className="max-w-2xl max-h-[80vh]">
    <DialogHeader>
      <DialogTitle>Similar to: {findSimilarPodcast?.podcast_name}</DialogTitle>
      <DialogDescription>
        Podcasts with similar audience and content
      </DialogDescription>
    </DialogHeader>
    <ScrollArea className="max-h-[60vh]">
      {isLoadingRelated ? (
        <div className="space-y-3 p-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : relatedPodcasts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No related podcasts found
        </div>
      ) : (
        <div className="space-y-2 p-1">
          {relatedPodcasts.map((rp, idx) => (
            <div
              key={rp.podcast_id || idx}
              className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
            >
              <img
                src={rp.podcast_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(rp.podcast_name)}&background=random&size=40`}
                alt={rp.podcast_name}
                className="w-10 h-10 rounded object-cover"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{rp.podcast_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {rp.publisher_name || 'Unknown host'}
                  {rp.reach?.audience_size ? ` · ${(rp.reach.audience_size / 1000).toFixed(0)}K listeners` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {rp.podcast_reach_score && (
                  <Badge variant="secondary" className="text-xs">
                    PRS {rp.podcast_reach_score}
                  </Badge>
                )}
                {rp.podcast_categories?.slice(0, 1).map(cat => (
                  <Badge key={cat.category_id} variant="outline" className="text-xs">
                    {cat.category_name}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </ScrollArea>
  </DialogContent>
</Dialog>
```

**J. Demographics Sheet (add right after the Find Similar Dialog):**

```tsx
{/* Demographics Sheet */}
<Sheet open={demographicsOpen} onOpenChange={setDemographicsOpen}>
  <SheetContent className="w-[450px] sm:w-[540px] overflow-y-auto">
    <SheetHeader>
      <SheetTitle>{demographicsPodcast?.podcast_name}</SheetTitle>
      <SheetDescription>Audience Demographics</SheetDescription>
    </SheetHeader>
    <div className="mt-6 space-y-6">
      {isLoadingDemographics ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      ) : !demographics ? (
        <div className="text-center py-8 text-muted-foreground">
          <UserSearch className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No demographics data available for this podcast.</p>
          <p className="text-xs mt-1">Demographics are only available for podcasts with sufficient episode data.</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border bg-muted/30">
              <div className="text-xs text-muted-foreground mb-1">Primary Age</div>
              <div className="font-semibold">{demographics.age}</div>
            </div>
            <div className="p-3 rounded-lg border bg-muted/30">
              <div className="text-xs text-muted-foreground mb-1">Gender Skew</div>
              <div className="font-semibold">{demographics.gender_skew}</div>
            </div>
            <div className="p-3 rounded-lg border bg-muted/30">
              <div className="text-xs text-muted-foreground mb-1">Purchasing Power</div>
              <div className="font-semibold">{demographics.purchasing_power}</div>
            </div>
            <div className="p-3 rounded-lg border bg-muted/30">
              <div className="text-xs text-muted-foreground mb-1">Education</div>
              <div className="font-semibold">{demographics.education_level}</div>
            </div>
          </div>

          {/* Episodes Analyzed */}
          <div className="text-xs text-muted-foreground">
            Based on {demographics.episodes_analyzed} of {demographics.total_episodes} episodes analyzed
          </div>

          {/* Age Distribution */}
          {demographics.age_distribution?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Age Distribution</h4>
              <div className="space-y-2">
                {demographics.age_distribution.map(item => (
                  <div key={item.age} className="flex items-center gap-2">
                    <span className="text-xs w-16 text-muted-foreground">{item.age}</span>
                    <Progress value={item.percentage} className="flex-1 h-2" />
                    <span className="text-xs w-10 text-right">{item.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Industry Breakdown */}
          {demographics.professional_industry?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Industry Breakdown</h4>
              <div className="space-y-2">
                {demographics.professional_industry.slice(0, 6).map(item => (
                  <div key={item.industry} className="flex items-center gap-2">
                    <span className="text-xs w-28 text-muted-foreground truncate">{item.industry}</span>
                    <Progress value={item.percentage} className="flex-1 h-2" />
                    <span className="text-xs w-10 text-right">{item.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Geographic Distribution */}
          {demographics.geographic_distribution?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Geographic Distribution</h4>
              <div className="space-y-2">
                {demographics.geographic_distribution.slice(0, 5).map(item => (
                  <div key={item.region} className="flex items-center gap-2">
                    <span className="text-xs w-28 text-muted-foreground truncate">{item.region}</span>
                    <Progress value={item.percentage} className="flex-1 h-2" />
                    <span className="text-xs w-10 text-right">{item.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Family Status */}
          {demographics.family_status_distribution?.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Family Status</h4>
              <div className="flex flex-wrap gap-2">
                {demographics.family_status_distribution.map(item => (
                  <Badge key={item.status} variant="outline">
                    {item.status} ({item.percentage}%)
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Technology Adoption */}
          {demographics.technology_adoption && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Technology Adoption</h4>
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="font-medium text-sm">{demographics.technology_adoption.profile}</div>
                <div className="text-xs text-muted-foreground mt-1">{demographics.technology_adoption.reasoning}</div>
              </div>
            </div>
          )}

          {/* Brand Relationship */}
          {demographics.brand_relationship && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Brand Relationship</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded border">
                  <div className="text-muted-foreground">Loyalty</div>
                  <div className="font-medium">{demographics.brand_relationship.loyalty_level}</div>
                </div>
                <div className="p-2 rounded border">
                  <div className="text-muted-foreground">Price Sensitivity</div>
                  <div className="font-medium">{demographics.brand_relationship.price_sensitivity}</div>
                </div>
                <div className="p-2 rounded border">
                  <div className="text-muted-foreground">Switching</div>
                  <div className="font-medium">{demographics.brand_relationship.brand_switching_frequency}</div>
                </div>
                <div className="p-2 rounded border">
                  <div className="text-muted-foreground">Advocacy</div>
                  <div className="font-medium">{demographics.brand_relationship.advocacy_potential}</div>
                </div>
              </div>
            </div>
          )}

          {/* Living Environment */}
          {demographics.living_environment && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Living Environment</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs w-16 text-muted-foreground">Urban</span>
                  <Progress value={demographics.living_environment.urban} className="flex-1 h-2" />
                  <span className="text-xs w-10 text-right">{demographics.living_environment.urban}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-16 text-muted-foreground">Suburban</span>
                  <Progress value={demographics.living_environment.suburban} className="flex-1 h-2" />
                  <span className="text-xs w-10 text-right">{demographics.living_environment.suburban}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs w-16 text-muted-foreground">Rural</span>
                  <Progress value={demographics.living_environment.rural} className="flex-1 h-2" />
                  <span className="text-xs w-10 text-right">{demographics.living_environment.rural}%</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  </SheetContent>
</Sheet>
```

**K. Column Visibility Dropdown Enhancement:**

In the column visibility dropdown (around line 1558-1571), add a new DropdownMenuItem for PRS after the episodes toggle:
```tsx
<DropdownMenuItem onClick={() => toggleColumn('prs')}>
  {columnVisibility.prs ? '✓' : '  '} PRS Score
</DropdownMenuItem>
```

Also make sure the `toggleColumn` function (find it in the component) handles 'prs' - it should already work if ColumnVisibility is updated correctly since it likely uses a generic key approach.
  </action>
  <verify>
    <automated>cd /Users/jonathangarces/Desktop/getonapod-app && npx tsc --noEmit --pretty 2>&1 | head -50 && npm run build 2>&1 | tail -20</automated>
  </verify>
  <done>
    - PRS column visible in table, sortable by clicking header, toggleable via column visibility dropdown
    - "Find Similar" and "Demographics" items appear in every podcast row's actions dropdown
    - Clicking "Find Similar" opens a Dialog showing related podcasts with loading skeleton, empty state, and podcast cards (image, name, host, audience, PRS badge, category)
    - Clicking "Demographics" opens a right Sheet panel showing audience demographics with loading skeleton, empty state, and full demographic breakdown (age, gender, purchasing power, education, age distribution bars, industry breakdown, geographic distribution, family status, tech adoption, brand relationship, living environment)
    - "Copy Email" now actually copies to clipboard (was missing onClick handler)
    - TypeScript compiles without errors, build succeeds
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no type errors
2. `npm run build` succeeds
3. Navigate to /admin/podcast-database and verify:
   - PRS column is visible with badge values
   - Clicking PRS header sorts the table
   - Actions dropdown shows "Find Similar" and "Demographics" options
   - "Find Similar" opens a dialog with related podcasts (if podcast has a podscan_id)
   - "Demographics" opens a right sheet with audience data (or "no data" message)
</verification>

<success_criteria>
- PRS score column displays in table with color-coded badges and sortable header
- Find Similar dialog shows loading state, related podcasts with images/details, or empty state
- Demographics sheet shows comprehensive audience breakdown with progress bars and summary cards
- All three features accessible from the per-row actions dropdown
- No TypeScript errors, build passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/1-add-find-similar-demographics-panel-prs-/1-SUMMARY.md`
</output>
