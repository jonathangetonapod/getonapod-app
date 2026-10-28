import { PodcastArtwork } from '@/components/workspace/catalog/PodcastArtwork'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PodcastContacts } from './PodcastContact'
import { PodcastPrimaryAction } from '@/components/workspace/catalog/PodcastPrimaryAction'
import { PodcastRowMenu } from '@/components/workspace/catalog/PodcastRowMenu'
import { openOnEnter, type PodcastResultProps } from '@/components/workspace/catalog/podcastResult'
import {
  categoryNames,
  formatAudience,
  formatMonth,
  podcastEmailStatus,
  podcastRating,
} from '@/lib/podcastCatalogDisplay'
import { categoryDisplayNames } from '@/lib/podcastCategories'
import { cn } from '@/lib/utils'

/** "5.6M audience · Apple 4.4 · Last episode Feb 2026", leaving out what is unknown. */
function statLine(podcast: PodcastResultProps['podcast']): string {
  const audience = formatAudience(podcast.audience_size)
  const rating = podcastRating(podcast)
  const lastEpisode = formatMonth(podcast.last_posted_at)
  return [
    audience && `${audience} audience`,
    rating?.label,
    lastEpisode && `Last episode ${lastEpisode}`,
  ].filter(Boolean).join(' · ')
}

/*
 * The card is for reading a little more about each show than a row allows:
 * two lines of description and a stat line, not four tiles. The full text and
 * every number live in the details.
 */
export const PodcastCatalogCard = ({
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
  const categories = categoryDisplayNames(categoryNames(podcast))
  const email = podcastEmailStatus(podcast)
  const stats = statLine(podcast)
  return (
    <Card
      tabIndex={0}
      aria-label={podcast.podcast_name}
      onKeyDown={(event) => openOnEnter(event, onOpenDetails)}
      className={cn(
        'overflow-hidden transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'border-primary/50 bg-primary/[0.025]',
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          {selectable && (
            <Checkbox
              aria-label={`Select ${podcast.podcast_name}`}
              checked={selected}
              onCheckedChange={(checked) => onSelectedChange(checked === true)}
              className="mt-1"
            />
          )}
          <PodcastArtwork
            imageUrl={podcast.podcast_image_url}
            name={podcast.podcast_name}
            displaySize={48}
            className="h-12 w-12 shrink-0 rounded-lg border"
            fallbackClassName="rounded-lg font-semibold"
          />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpenDetails}
              title={podcast.podcast_name}
              className="block max-w-full truncate text-left font-semibold hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {podcast.podcast_name}
            </button>
            <p className="truncate text-sm text-muted-foreground">{podcast.host_name || podcast.publisher_name || 'Host not listed'}</p>
          </div>
          <PodcastRowMenu podcast={podcast} email={email.email} onOpenDetails={onOpenDetails} onCopyEmail={onCopyEmail} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {relationship && <Badge variant="outline" className={cn('font-normal', relationship.className)}>{relationship.label}</Badge>}
          {categories.slice(0, 3).map((name) => <Badge key={name} variant="secondary" className="font-normal">{name}</Badge>)}
          {categories.length > 3 && <Badge variant="outline" className="font-normal">+{categories.length - 3}</Badge>}
          {podcast.shortlist_uses > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Badge variant="outline" className="border-sky-200 bg-sky-50 font-normal text-sky-900">
                    On {podcast.shortlist_uses.toLocaleString()} shortlist{podcast.shortlist_uses === 1 ? '' : 's'}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">How many client and prospect shortlists include this show, across all workspaces.</TooltipContent>
            </Tooltip>
          )}
        </div>

        <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
          {podcast.podcast_description || 'No show description yet.'}
        </p>
        {stats && <p className="text-xs text-muted-foreground">{stats}</p>}

        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <PodcastContacts podcast={podcast} onCopy={onCopyEmail} onFind={onFindHostEmail} />
          <PodcastPrimaryAction action={action} podcastName={podcast.podcast_name} className="self-end sm:self-auto" />
        </div>
      </CardContent>
    </Card>
  )
}
