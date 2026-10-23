import { Copy, ExternalLink, Mail, Rss } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PodcastEmailLine } from '@/components/workspace/catalog/PodcastEmailChip'
import { PodcastPrimaryAction, type PodcastPrimaryActionState } from '@/components/workspace/catalog/PodcastPrimaryAction'
import { categoryNames, isStaleCatalogDate, podcastEmailStatus, podcastInitials } from '@/lib/podcastCatalogDisplay'
import { safeExternalUrl } from '@/lib/externalUrl'
import type { RelationshipBadge } from '@/lib/relationshipLabels'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

interface PodcastCatalogDetailsDialogProps {
  podcast: WorkspacePodcastCatalogItem | null
  relationship: RelationshipBadge | null
  onClose: () => void
  /** The same primary action the row offers, so adding never means closing this first. */
  action?: PodcastPrimaryActionState
  onCopyEmail?: (email: string) => void
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

const day = (value: string | null) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/**
 * Everything the catalogue already knows about one show.
 *
 * The row has to stay scannable, so it shows a description clipped to two
 * lines and four numbers. Everything else the catalogue holds — the feed, the
 * language, when it last published, how many shortlists already use it — was
 * fetched, carried to the browser and then never displayed, so the only way to
 * judge a show properly was to open it somewhere else entirely.
 *
 * No request of its own: every field here arrived with the row.
 */
export function PodcastCatalogDetailsDialog({
  podcast,
  relationship,
  onClose,
  action,
  onCopyEmail,
}: PodcastCatalogDetailsDialogProps) {
  if (!podcast) return null

  const categories = categoryNames(podcast)
  const email = podcastEmailStatus(podcast)
  const publicUrl = safeExternalUrl(podcast.podcast_url || podcast.website || '')
  const feedUrl = safeExternalUrl(podcast.rss_feed || '')
  const stats: Array<{ label: string; value: string; hint?: string }> = [
    { label: 'Audience', value: podcast.audience_size ? compact.format(podcast.audience_size) : '—' },
    { label: 'Episodes', value: podcast.episode_count ? compact.format(podcast.episode_count) : '—' },
    { label: 'Apple rating', value: podcast.itunes_rating ? Number(podcast.itunes_rating).toFixed(1) : '—' },
    { label: 'Spotify rating', value: podcast.spotify_rating ? Number(podcast.spotify_rating).toFixed(1) : '—' },
    {
      label: 'Reach score',
      value: podcast.podcast_reach_score ? String(podcast.podcast_reach_score) : '—',
      hint: 'A popularity score that comes with the show data. Higher means more popular.',
    },
    { label: 'Last published', value: day(podcast.last_posted_at) },
    { label: 'Language', value: podcast.language || '—' },
    { label: 'Region', value: podcast.region || '—' },
  ]

  return (
    <Dialog open={Boolean(podcast)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
        // Focus the dialog itself, not its first stat tile, or the tile's
        // tooltip opens over the details the moment they appear.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        }}
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <Avatar className="h-14 w-14 shrink-0 rounded-xl border">
              {podcast.podcast_image_url && <AvatarImage src={podcast.podcast_image_url} alt="" className="object-cover" />}
              <AvatarFallback className="rounded-xl font-bold">{podcastInitials(podcast.podcast_name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <DialogTitle className="text-left text-xl">{podcast.podcast_name}</DialogTitle>
              <DialogDescription className="text-left">
                {podcast.host_name || podcast.publisher_name || 'Publisher not listed'}
              </DialogDescription>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {/* The same words the relationship book uses, so a host this
                    workspace has already burned reads the same here. */}
                {relationship && (
                  <Badge variant="outline" className={relationship.className}>{relationship.label}</Badge>
                )}
                {!podcast.is_active && <Badge variant="outline" className="border-muted bg-muted/40">Inactive</Badge>}
                {categories.map((name) => (
                  <Badge key={name} variant="secondary" className="font-normal">{name}</Badge>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          <p className="text-sm leading-6 text-muted-foreground">
            {podcast.podcast_description || 'No public show description is available yet.'}
          </p>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat) => {
              const tile = (
                <div key={stat.label} tabIndex={stat.hint ? 0 : undefined} className="rounded-lg border bg-muted/20 p-2.5">
                  <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{stat.value}</dd>
                </div>
              )
              return stat.hint ? (
                <Tooltip key={stat.label}>
                  <TooltipTrigger asChild>{tile}</TooltipTrigger>
                  <TooltipContent className="max-w-xs">{stat.hint}</TooltipContent>
                </Tooltip>
              ) : tile
            })}
          </dl>

          <div className="space-y-2">
            <p className="text-sm font-medium">Contact</p>
            <PodcastEmailLine status={email} onCopy={(address) => onCopyEmail?.(address)} />
          </div>

          {/* Why this row is in a shared catalogue at all: somebody's shortlist
              put it there, and that is worth knowing before adding it again. */}
          <p className="text-xs leading-5 text-muted-foreground">
            <span className="font-medium text-foreground">Notes: </span>
            {podcast.shortlist_uses > 0
              ? `On ${podcast.shortlist_uses.toLocaleString()} ${podcast.shortlist_uses === 1 ? 'shortlist' : 'shortlists'}`
              : 'Not on any shortlist yet'}
            {podcast.workspace_uses > 0 && ` across ${podcast.workspace_uses.toLocaleString()} ${podcast.workspace_uses === 1 ? 'workspace' : 'workspaces'}`}.
            {podcast.catalog_updated_at && (
              <span className={isStaleCatalogDate(podcast.catalog_updated_at) ? 'font-medium text-amber-700' : undefined}>
                {` Catalog data refreshed ${day(podcast.catalog_updated_at)}.`}
              </span>
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            {publicUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />Open the show
                </a>
              </Button>
            )}
            {feedUrl && (
              <Button asChild variant="outline" size="sm">
                <a href={feedUrl} target="_blank" rel="noreferrer">
                  <Rss className="mr-2 h-4 w-4" />RSS feed
                </a>
              </Button>
            )}
            {email.email && (
              <Button asChild variant="outline" size="sm">
                <a href={`mailto:${email.email}`}>
                  <Mail className="mr-2 h-4 w-4" />Email the show
                </a>
              </Button>
            )}
          </div>
        </div>

        {action && (
          <DialogFooter className="sticky -bottom-6 -mx-6 -mb-6 flex-row justify-between gap-2 sm:justify-between sm:space-x-0 border-t bg-background px-6 py-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!email.email}
              onClick={() => { if (email.email) onCopyEmail?.(email.email) }}
            >
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />Copy email
            </Button>
            <PodcastPrimaryAction action={action} podcastName={podcast.podcast_name} />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
