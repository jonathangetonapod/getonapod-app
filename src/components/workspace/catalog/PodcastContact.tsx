import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PodcastEmailChip } from './PodcastEmailChip'
import { podcastHostEmailStatus, podcastInboxStatus } from '@/lib/podcastCatalogDisplay'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

export function PodcastContact({ podcast, kind, onCopy, onFind }: {
  podcast: WorkspacePodcastCatalogItem
  kind: 'inbox' | 'host'
  onCopy: (email: string) => void
  onFind?: () => void
}) {
  const host = kind === 'host'
  const status = host ? podcastHostEmailStatus(podcast) : podcastInboxStatus(podcast)
  const same = host && status.email && status.email.trim().toLowerCase() === podcast.free_podscan_email?.trim().toLowerCase()
  const profile = podcast.direct_linkedin_url
  const safeProfile = profile && /^https:\/\/www\.linkedin\.com\/in\/[a-zA-Z0-9_%-]+\/?$/u.test(profile) ? profile : null
  return (
    <div className="min-w-0 space-y-1" aria-label={host ? 'Host email' : 'Podcast inbox'}>
      {status.email ? <>
        <PodcastEmailChip status={status} />
        <button type="button" className="block max-w-full truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
          title={`Copy ${status.email}`} aria-label={`Copy ${host ? 'host email' : 'podcast inbox'}: ${status.email}`}
          onClick={() => onCopy(status.email!)}>{same ? 'Same as podcast inbox' : status.email}</button>
      </> : host && onFind ? (
        <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={onFind}>Find host email</Button>
      ) : <span className="text-xs text-muted-foreground">{host ? 'Not found yet' : 'Not available'}</span>}
      {host && safeProfile && <a href={safeProfile} target="_blank" rel="noreferrer" className="block text-xs text-primary hover:underline">LinkedIn profile</a>}
    </div>
  )
}

export function ContactHeading({ kind }: { kind: 'inbox' | 'host' }) {
  return <Tooltip>
    <TooltipTrigger asChild><span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2">{kind === 'inbox' ? 'Podcast inbox' : 'Host email'}</span></TooltipTrigger>
    <TooltipContent>{kind === 'inbox' ? 'Public podcast inbox supplied by Podscan.' : 'Verified direct contact saved to this podcast. New lookups use Claude and Blitz.'}</TooltipContent>
  </Tooltip>
}

export function PodcastContacts({ podcast, onCopy, onFind }: Omit<Parameters<typeof PodcastContact>[0], 'kind'>) {
  return <div className="min-w-0 space-y-3">
    {(['inbox', 'host'] as const).map(kind => <div key={kind} className="min-w-0 space-y-1">
      <div className="text-xs font-medium text-muted-foreground"><ContactHeading kind={kind} /></div>
      <PodcastContact podcast={podcast} kind={kind} onCopy={onCopy} onFind={onFind} />
    </div>)}
  </div>
}
