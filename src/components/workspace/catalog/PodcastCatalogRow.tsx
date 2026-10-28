import { PodcastArtwork } from '@/components/workspace/catalog/PodcastArtwork'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PodcastContact, PodcastContacts } from './PodcastContact'
import { PodcastPrimaryAction } from '@/components/workspace/catalog/PodcastPrimaryAction'
import { PodcastRowMenu } from '@/components/workspace/catalog/PodcastRowMenu'
import {
  categoryNames,
  formatAudience,
  formatRelativeAge,
  podcastEmailStatus,
  podcastRating,
} from '@/lib/podcastCatalogDisplay'
import { categoryDisplayNames } from '@/lib/podcastCategories'
import { cn } from '@/lib/utils'
import { openOnEnter, ROW_COLUMNS, ROW_LAYOUT, type PodcastResultProps } from '@/components/workspace/catalog/podcastResult'

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
  onFindHostEmail,
}: PodcastResultProps) => {
  const categories = categoryDisplayNames(categoryNames(podcast)).slice(0, 2)
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
        ROW_LAYOUT,
        'py-2.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:min-h-16',
        selected && 'bg-primary/[0.04]',
      )}
    >
      {selectable && (
        <Checkbox
          aria-label={`Select ${podcast.podcast_name}`}
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
          className={ROW_COLUMNS.select}
        />
      )}
      <PodcastArtwork
        imageUrl={podcast.podcast_image_url}
        name={podcast.podcast_name}
        displaySize={40}
        className={cn(ROW_COLUMNS.artwork, 'h-10 rounded-md border')}
        fallbackClassName="rounded-md text-xs font-semibold"
      />
      <div className={ROW_COLUMNS.show}>
        <div className="flex min-w-0 items-center gap-2">
          {/* The whole name on hover, where the column cuts it short. */}
          <button
            type="button"
            onClick={onOpenDetails}
            title={podcast.podcast_name}
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
        <p className="truncate text-xs text-muted-foreground" title={host || undefined}>{host || 'Host not listed'}</p>
        <div className="mt-2 md:hidden"><PodcastContacts podcast={podcast} onCopy={onCopyEmail} onFind={onFindHostEmail} /></div>
      </div>
      <div className={cn(ROW_COLUMNS.categories, 'gap-1 overflow-hidden')}>
        {categories.map((name) => (
          <Badge key={name} variant="secondary" className="max-w-[5rem] truncate px-1.5 py-0 text-[11px] font-normal" title={name}>
            <span className="truncate">{name}</span>
          </Badge>
        ))}
      </div>
      <p className={cn(ROW_COLUMNS.audience, 'text-sm font-medium tabular-nums')}>{formatAudience(podcast.audience_size) || '—'}</p>
      <div className={cn(ROW_COLUMNS.rating, 'text-sm text-muted-foreground')}>
        {rating ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="cursor-help rounded-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {rating.label}
              </span>
            </TooltipTrigger>
            <TooltipContent>{rating.detail}</TooltipContent>
          </Tooltip>
        ) : '—'}
      </div>
      <p className={cn(ROW_COLUMNS.reach, 'text-sm tabular-nums text-muted-foreground')}>{podcast.podcast_reach_score ?? '—'}</p>
      <p className={cn(ROW_COLUMNS.lastEpisode, 'text-sm text-muted-foreground')}>{lastEpisode || '—'}</p>
      {(['inbox', 'host'] as const).map(kind => <div key={kind} className={cn(ROW_COLUMNS.email, 'hidden md:block')}>
        <PodcastContact podcast={podcast} kind={kind} onCopy={onCopyEmail} onFind={onFindHostEmail} />
      </div>)}
      <div className={ROW_COLUMNS.action}>
        <PodcastPrimaryAction action={action} podcastName={podcast.podcast_name} />
      </div>
      <div className={ROW_COLUMNS.menu}>
        <PodcastRowMenu podcast={podcast} email={email.email} onOpenDetails={onOpenDetails} onCopyEmail={onCopyEmail} />
      </div>
    </li>
  )
}
