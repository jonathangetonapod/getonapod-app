import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { PodcastEmailChip } from '@/components/workspace/catalog/PodcastEmailChip'
import { PodcastPrimaryAction } from '@/components/workspace/catalog/PodcastPrimaryAction'
import { PodcastRowMenu } from '@/components/workspace/catalog/PodcastRowMenu'
import {
  categoryNames,
  formatAudience,
  formatRelativeAge,
  podcastEmailStatus,
  podcastInitials,
  podcastRating,
} from '@/lib/podcastCatalogDisplay'
import { cn } from '@/lib/utils'
import { openOnEnter, ROW_COLUMNS, type PodcastResultProps } from '@/components/workspace/catalog/podcastResult'

/*
 * One show per line, about 64px tall, so a screen holds ten of them and each
 * can be judged at a glance. Under 768px only what decides the next move
 * stays: the show, its contact, and the action. The rest is in the details.
 */
export const PodcastCatalogRow = ({
  podcast,
  relationship,
  selectable,
  selected,
  onSelectedChange,
  action,
  onOpenDetails,
  onCopyEmail,
}: PodcastResultProps) => {
  const categories = categoryNames(podcast).slice(0, 2)
  const email = podcastEmailStatus(podcast)
  const rating = podcastRating(podcast)
  const lastEpisode = formatRelativeAge(podcast.last_posted_at)
  const host = podcast.host_name || podcast.publisher_name
  return (
    <li
      tabIndex={0}
      aria-label={podcast.podcast_name}
      onKeyDown={(event) => openOnEnter(event, onOpenDetails)}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:min-h-16',
        selected && 'bg-primary/[0.04]',
      )}
    >
      {selectable && (
        <Checkbox
          aria-label={`Select ${podcast.podcast_name}`}
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
        />
      )}
      <Avatar className="h-10 w-10 shrink-0 rounded-md border">
        {podcast.podcast_image_url && <AvatarImage src={podcast.podcast_image_url} alt="" className="object-cover" />}
        <AvatarFallback className="rounded-md text-xs font-semibold">{podcastInitials(podcast.podcast_name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenDetails}
            className="line-clamp-2 min-w-0 text-left text-sm font-semibold hover:underline focus-visible:underline focus-visible:outline-none md:truncate"
          >
            {podcast.podcast_name}
          </button>
          {relationship && (
            <Badge variant="outline" className={cn('hidden shrink-0 px-1.5 py-0 text-[11px] font-normal sm:inline-flex', relationship.className)}>
              {relationship.label}
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{host || 'Host not listed'}</p>
        <PodcastEmailChip status={email} className="mt-1 md:hidden" />
      </div>
      <div className={cn(ROW_COLUMNS.categories, 'gap-1 overflow-hidden')}>
        {categories.map((name) => (
          <Badge key={name} variant="secondary" className="max-w-[5rem] truncate px-1.5 py-0 text-[11px] font-normal">
            <span className="truncate">{name}</span>
          </Badge>
        ))}
      </div>
      <p className={cn(ROW_COLUMNS.audience, 'text-sm font-medium tabular-nums')}>{formatAudience(podcast.audience_size) || '—'}</p>
      <p className={cn(ROW_COLUMNS.rating, 'text-sm text-muted-foreground')}>{rating?.label || '—'}</p>
      <p className={cn(ROW_COLUMNS.lastEpisode, 'text-sm text-muted-foreground')}>{lastEpisode || '—'}</p>
      <div className={cn(ROW_COLUMNS.email, 'hidden md:block')}>
        <PodcastEmailChip status={email} />
      </div>
      <div className={ROW_COLUMNS.action}>
        <PodcastPrimaryAction action={action} podcastName={podcast.podcast_name} />
      </div>
      <div className={ROW_COLUMNS.menu}>
        <PodcastRowMenu podcast={podcast} email={email.email} onOpenDetails={onOpenDetails} onCopyEmail={onCopyEmail} />
      </div>
    </li>
  )
}

/** Labels over the row columns; desktop only, where there are columns to label. */
export const PodcastCatalogRowHeader = ({ selectable }: { selectable: boolean }) => (
  <div aria-hidden="true" className="hidden items-center gap-3 border-b px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:flex">
    {selectable && <span className="w-4 shrink-0" />}
    <span className="w-10 shrink-0" />
    <span className="min-w-0 flex-1">Show</span>
    <span className={ROW_COLUMNS.categories}>Categories</span>
    <span className={ROW_COLUMNS.audience}>Audience</span>
    <span className={ROW_COLUMNS.rating}>Rating</span>
    <span className={ROW_COLUMNS.lastEpisode}>Last episode</span>
    <span className={ROW_COLUMNS.email}>Email</span>
    <span className={ROW_COLUMNS.action} />
    <span className={ROW_COLUMNS.menu} />
  </div>
)

/** A row's shape while the first page loads, so the list does not jump when it lands. */
export const PodcastCatalogRowSkeleton = () => (
  <div className="flex items-center gap-3 px-3 py-2.5 md:min-h-16">
    <Skeleton className="h-4 w-4 rounded-sm" />
    <Skeleton className="h-10 w-10 rounded-md" />
    <div className="min-w-0 flex-1 space-y-1.5">
      <Skeleton className="h-3.5 w-2/5" />
      <Skeleton className="h-3 w-1/4" />
    </div>
    <Skeleton className={cn(ROW_COLUMNS.categories, 'h-4')} />
    <Skeleton className={cn(ROW_COLUMNS.audience, 'h-4')} />
    <Skeleton className={cn(ROW_COLUMNS.rating, 'h-4')} />
    <Skeleton className={cn(ROW_COLUMNS.lastEpisode, 'h-4')} />
    <Skeleton className={cn(ROW_COLUMNS.email, 'hidden h-5 md:block')} />
    <Skeleton className="h-8 w-24 shrink-0 md:w-32" />
  </div>
)
