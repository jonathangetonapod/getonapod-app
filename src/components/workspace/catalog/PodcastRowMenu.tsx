import { Copy, ExternalLink, Info, MoreHorizontal, Rss } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { safeExternalUrl } from '@/lib/externalUrl'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

/** The secondary moves on a show, kept behind one button so the row has one primary. */
export const PodcastRowMenu = ({
  podcast,
  onOpenDetails,
  onCopyEmail,
}: {
  podcast: WorkspacePodcastCatalogItem
  email: string | null
  onOpenDetails: () => void
  onCopyEmail: (email: string) => void
}) => {
  const showUrl = safeExternalUrl(podcast.podcast_url || podcast.website || '')
  const feedUrl = safeExternalUrl(podcast.rss_feed || '')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`More actions for ${podcast.podcast_name}`}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onOpenDetails}>
          <Info className="mr-2 h-4 w-4" aria-hidden="true" />See details
        </DropdownMenuItem>
        {([
          ['podcast inbox', podcast.free_podscan_email], ['host email', podcast.direct_email],
        ] as const).map(([label, address]) => <DropdownMenuItem key={label} disabled={!address} onSelect={() => { if (address) onCopyEmail(address) }}>
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />Copy {label}
        </DropdownMenuItem>)}
        {showUrl ? (
          <DropdownMenuItem asChild>
            <a href={showUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />Open show</a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled><ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />Open show</DropdownMenuItem>
        )}
        {feedUrl ? (
          <DropdownMenuItem asChild>
            <a href={feedUrl} target="_blank" rel="noreferrer"><Rss className="mr-2 h-4 w-4" aria-hidden="true" />RSS feed</a>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled><Rss className="mr-2 h-4 w-4" aria-hidden="true" />RSS feed</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
