import { LayoutGrid, List, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SORT_HINTS, SORT_LABELS } from '@/components/workspace/catalog/catalogFilterLabels'
import { formatDay } from '@/lib/podcastCatalogDisplay'
import { cn } from '@/lib/utils'
import type { WorkspacePodcastCatalogSort } from '@/services/workspacePodcastCatalog'

export type CatalogView = 'list' | 'cards'

/*
 * One line over the results: how many, how fresh, and how they are laid out
 * and ordered. Sort lives here, not among the filters, because it changes the
 * order of what matched and never what matches.
 */
export const PodcastResultsHeader = ({
  selectable,
  allPageSelected,
  onTogglePage,
  from,
  to,
  total,
  loading,
  searching,
  searchActive,
  catalogUpdated,
  fetching,
  onRefresh,
  view,
  onViewChange,
  sort,
  onSortChange,
}: {
  selectable: boolean
  allPageSelected: boolean
  onTogglePage: (checked: boolean) => void
  from: number
  to: number
  total: number
  loading: boolean
  /** A newer page is on its way and the rows on screen are the old ones. */
  searching: boolean
  /** Relevance is only offered while there is a search to rank. */
  searchActive: boolean
  catalogUpdated: string | null
  fetching: boolean
  onRefresh: () => void
  view: CatalogView
  onViewChange: (view: CatalogView) => void
  sort: WorkspacePodcastCatalogSort
  onSortChange: (sort: WorkspacePodcastCatalogSort) => void
}) => (
  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {selectable && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="select-catalog-page"
            checked={allPageSelected}
            onCheckedChange={(checked) => onTogglePage(checked === true)}
            disabled={total === 0}
          />
          <Label htmlFor="select-catalog-page" className="whitespace-nowrap text-sm font-normal">Select this page</Label>
        </div>
      )}
      <div className="text-sm text-muted-foreground" aria-live="polite">
        {loading
          ? 'Loading shows'
          : searching
          ? 'Searching…'
          : total === 0
          ? 'No results'
          : `Showing ${from.toLocaleString()} to ${to.toLocaleString()} of ${total.toLocaleString()}`}
        {catalogUpdated && !searching && (
          <>
            {' · '}
            {/* One date for the whole catalogue, so it does not move with the
                search or the page. Neutral: it is information, not a warning. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="cursor-help whitespace-nowrap underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Catalog synced {formatDay(catalogUpdated)}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                The last time show data was pulled from Podscan. Each show refreshes on its own schedule; a show&apos;s own date is in its details.
              </TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Refresh podcast database" onClick={onRefresh} disabled={fetching}>
        <RefreshCw className={cn('h-4 w-4', fetching && 'animate-spin')} />
      </Button>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={view}
        onValueChange={(value) => { if (value === 'list' || value === 'cards') onViewChange(value) }}
        aria-label="Result layout"
      >
        <ToggleGroupItem value="list" aria-label="List"><List className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">List</span></ToggleGroupItem>
        <ToggleGroupItem value="cards" aria-label="Cards"><LayoutGrid className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">Cards</span></ToggleGroupItem>
      </ToggleGroup>
      <Select value={sort} onValueChange={(value: WorkspacePodcastCatalogSort) => onSortChange(value)}>
        <SelectTrigger className="h-9 w-auto gap-1.5" aria-label={`Sort: ${SORT_LABELS[sort]}`}>
          <SelectValue>
            <span className="text-muted-foreground">Sort:</span> {SORT_LABELS[sort]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {(Object.keys(SORT_LABELS) as WorkspacePodcastCatalogSort[])
            .filter((value) => value !== 'relevance' || searchActive)
            .map((value) => (
            <SelectItem key={value} value={value}>
              {SORT_LABELS[value]}
              {SORT_HINTS[value] && <span className="block text-xs text-muted-foreground">{SORT_HINTS[value]}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  </div>
)
