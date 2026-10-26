import { ArrowDown, ArrowUp } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ROW_COLUMNS, ROW_LAYOUT } from '@/components/workspace/catalog/podcastResult'
import { cn } from '@/lib/utils'
import type { WorkspacePodcastCatalogSort } from '@/services/workspacePodcastCatalog'

interface SortableColumn {
  label: string
  sort: WorkspacePodcastCatalogSort
  className: string
  /** What the number is and where it comes from, for the columns that need saying. */
  hint?: string
}

const NAME_COLUMN: SortableColumn = { label: 'Show', sort: 'name', className: ROW_COLUMNS.show }
const NUMBER_COLUMNS: SortableColumn[] = [
  {
    label: 'Audience',
    sort: 'audience',
    className: ROW_COLUMNS.audience,
    hint: 'Estimated audience size for the show, from Podscan. An estimate, not a download count.',
  },
  {
    label: 'Rating',
    sort: 'rating',
    className: ROW_COLUMNS.rating,
    hint: 'Apple Podcasts star rating, or Spotify where a show has no Apple rating. Hover a rating to see both.',
  },
  {
    label: 'Reach',
    sort: 'reach',
    className: ROW_COLUMNS.reach,
    hint: 'Podscan’s reach score, 0 to 100. Higher means more popular.',
  },
  { label: 'Last episode', sort: 'recent', className: ROW_COLUMNS.lastEpisode },
]

const ColumnSortButton = ({
  column,
  sort,
  onSortChange,
}: {
  column: SortableColumn
  sort: WorkspacePodcastCatalogSort
  onSortChange: (sort: WorkspacePodcastCatalogSort) => void
}) => {
  const active = sort === column.sort
  const Arrow = column.sort === 'name' ? ArrowUp : ArrowDown
  const button = (
    <button
      type="button"
      onClick={() => onSortChange(column.sort)}
      aria-pressed={active}
      aria-label={`Sort by ${column.label}`}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'text-foreground',
        column.hint && 'underline decoration-dotted underline-offset-2',
      )}
    >
      {column.label}
      {active && <Arrow className="h-3 w-3" aria-hidden="true" />}
    </button>
  )
  return (
    <div className={column.className}>
      {column.hint ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent className="max-w-xs normal-case tracking-normal">{column.hint}</TooltipContent>
        </Tooltip>
      ) : button}
    </div>
  )
}

/*
 * Labels over the row columns; desktop only, where there are columns to label.
 * Each number column sorts by itself, the same sorts the menu offers.
 */
export const PodcastCatalogRowHeader = ({
  selectable,
  sort,
  onSortChange,
}: {
  selectable: boolean
  sort: WorkspacePodcastCatalogSort
  onSortChange: (sort: WorkspacePodcastCatalogSort) => void
}) => (
  <div className={cn(ROW_LAYOUT, 'hidden border-b py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:flex')}>
    {selectable && <span className={ROW_COLUMNS.select} />}
    <span className={ROW_COLUMNS.artwork} />
    <ColumnSortButton column={NAME_COLUMN} sort={sort} onSortChange={onSortChange} />
    <span className={ROW_COLUMNS.categories}>Categories</span>
    {NUMBER_COLUMNS.map((column) => (
      <ColumnSortButton key={column.sort} column={column} sort={sort} onSortChange={onSortChange} />
    ))}
    <span className={ROW_COLUMNS.email}>Email</span>
    <span className={ROW_COLUMNS.action} />
    <span className={ROW_COLUMNS.menu} />
  </div>
)

/*
 * A row's shape while the first page loads: the same columns, widths and
 * padding as a real row, so nothing moves when the rows land.
 */
export const PodcastCatalogRowSkeleton = ({ selectable }: { selectable: boolean }) => (
  <div className={cn(ROW_LAYOUT, 'py-2.5 md:min-h-16')}>
    {selectable && <Skeleton className={cn(ROW_COLUMNS.select, 'h-4 rounded-sm')} />}
    <Skeleton className={cn(ROW_COLUMNS.artwork, 'h-10 rounded-md')} />
    <div className={cn(ROW_COLUMNS.show, 'space-y-1.5')}>
      <Skeleton className="h-3.5 w-2/5" />
      <Skeleton className="h-3 w-1/4" />
    </div>
    <Skeleton className={cn(ROW_COLUMNS.categories, 'h-4')} />
    <Skeleton className={cn(ROW_COLUMNS.audience, 'h-4')} />
    <Skeleton className={cn(ROW_COLUMNS.rating, 'h-4')} />
    <Skeleton className={cn(ROW_COLUMNS.reach, 'h-4')} />
    <Skeleton className={cn(ROW_COLUMNS.lastEpisode, 'h-4')} />
    <div className={cn(ROW_COLUMNS.email, 'hidden md:block')}><Skeleton className="h-5 w-24" /></div>
    <div className={ROW_COLUMNS.action}><Skeleton className="h-8 w-24 md:w-32" /></div>
    <div className={ROW_COLUMNS.menu}><Skeleton className="h-8 w-8" /></div>
  </div>
)
