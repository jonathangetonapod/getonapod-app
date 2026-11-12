import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Archive, CheckCircle2, ExternalLink, Eye, EyeOff, FileText, Loader2, Mail, MailCheck, MoreHorizontal,
  PenLine, Radio, RotateCcw, Star, ThumbsDown, ThumbsUp, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { isTargetInActiveOutreach, pitchActionLabel } from '@/lib/campaignTargetState'
import { safeExternalUrl } from '@/lib/externalUrl'
import { shortlistContactEmail } from '@/lib/shortlistEmail'
import { compactNumber, qualityFlags, researchStatusLabel } from '@/lib/shortlistRow'
import { pitchBadgeLabel } from '@/lib/shortlistPitchStatus'
import { clientPitchHref } from '@/lib/workspaceRoutes'
import { cn } from '@/lib/utils'
import { FitScoreBadge } from '@/components/workspace/ShortlistFit'
import type { ClientShortlistFitProfile, ClientShortlistPodcast } from '@/services/clientShortlist'
import type { WorkspaceCampaignTarget } from '@/services/workspaceCampaigns'

/*
 * One fixed column grid from 1100px up (the 1126px laptop view included), so
 * no label or badge can slide under another. Narrower, each row stacks as a
 * card with its own labels.
 */
const GRID = 'min-[1100px]:grid min-[1100px]:grid-cols-[20px_minmax(0,1fr)_36px_56px_56px_44px_92px_92px_136px] min-[1100px]:items-center min-[1100px]:gap-x-3'
const MOBILE_LABEL = 'text-xs text-muted-foreground min-[1100px]:hidden'
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const SHORT_PITCH_LABELS: Record<string, string> = {
  'Write Pitch': 'Write', 'Write Re-pitch': 'Re-pitch', 'View Pitch': 'View', 'Continue Draft': 'Continue',
}

export const FeedbackBadge = ({ podcast }: { podcast: Pick<ClientShortlistPodcast, 'feedback_status'> }) => {
  if (podcast.feedback_status === 'approved') {
    return <Badge className="whitespace-nowrap border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50"><CheckCircle2 className="mr-1 h-3 w-3" />Approved</Badge>
  }
  if (podcast.feedback_status === 'rejected') {
    return <Badge className="whitespace-nowrap border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-50"><ThumbsDown className="mr-1 h-3 w-3" />Passed</Badge>
  }
  return <Badge variant="outline" className="whitespace-nowrap text-muted-foreground">To review</Badge>
}

export const PodcastArtwork = ({ podcast, className }: { podcast: Pick<ClientShortlistPodcast, 'podcast_image_url' | 'podcast_name'>; className?: string }) => {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [podcast.podcast_image_url])
  if (!podcast.podcast_image_url || failed) {
    return <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted', className)}><Radio className="h-5 w-5 text-muted-foreground" /></div>
  }
  return <img src={podcast.podcast_image_url} alt="" className={cn('h-12 w-12 shrink-0 rounded-xl object-cover', className)} loading="lazy" onError={() => setFailed(true)} />
}

/** Hover shows the address; a tap or click copies it, so touch screens can reach it too. */
const EmailCell = ({ podcast }: { podcast: ClientShortlistPodcast }) => {
  const email = shortlistContactEmail(podcast)
  if (!email) return <span className="text-xs text-muted-foreground">None<span className="sr-only"> — no contact email</span></span>
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email)
      toast.success(`Copied ${email}`)
    } catch {
      toast.info(email)
    }
  }
  return (
    <div className="flex min-w-0 items-center gap-1">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={() => void copy()} className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50', FOCUS_RING)} aria-label={`Contact email for ${podcast.podcast_name}: ${email}`}>
              <Mail className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{email} · click to copy</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span aria-hidden="true" className="truncate text-xs text-muted-foreground min-[1100px]:hidden">{email}</span>
    </div>
  )
}

interface ShortlistTableProps {
  podcasts: ClientShortlistPodcast[]
  selectedIds: Set<string>
  onToggle: (podcastId: string, checked: boolean) => void
  fitProfile: ClientShortlistFitProfile | null
  targetsByPodcast: Map<string, WorkspaceCampaignTarget>
  pitchDataAvailable: boolean
  pitchError: boolean
  pendingPodcastId: string | null
  workspaceBaseHref: string
  clientId: string
  onOpenDetails: (podcast: ClientShortlistPodcast) => void
  onDecision: (podcast: ClientShortlistPodcast, status: 'approved' | 'rejected') => void
  onToggleFeatured: (podcast: ClientShortlistPodcast) => void
  onRestore: (podcast: ClientShortlistPodcast) => void
  onArchive: (podcast: ClientShortlistPodcast) => void
  onDelete: (podcast: ClientShortlistPodcast) => void
}

export const ShortlistTable = (props: ShortlistTableProps) => {
  const { podcasts } = props
  return (
    <div role="table" aria-label="Shortlisted podcasts" className="rounded-xl border">
      <div role="rowgroup"><div role="row" className={cn('hidden border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground', GRID)}>
        <div role="columnheader"><span className="sr-only">Select</span></div>
        <div role="columnheader">Podcast</div>
        <div role="columnheader">Email</div>
        <div role="columnheader">Fit</div>
        <div role="columnheader">Audience</div>
        <div role="columnheader">Rating</div>
        <div role="columnheader">Client decision</div>
        <div role="columnheader">Pitch</div>
        <div role="columnheader" className="text-right">Actions</div>
      </div></div>
      <div role="rowgroup" className="divide-y">
        {podcasts.map((podcast) => <ShortlistRow key={podcast.podcast_id} podcast={podcast} {...props} />)}
      </div>
    </div>
  )
}

const ShortlistRow = ({
  podcast, selectedIds, onToggle, fitProfile, targetsByPodcast, pitchDataAvailable, pitchError, pendingPodcastId,
  workspaceBaseHref, clientId, onOpenDetails, onDecision, onToggleFeatured, onRestore, onArchive, onDelete,
}: ShortlistTableProps & { podcast: ClientShortlistPodcast }) => {
  const target = targetsByPodcast.get(podcast.id)
  const inOutreach = isTargetInActiveOutreach(target)
  const hasDraft = Boolean(target?.pitch_subject?.trim() || target?.pitch_body?.trim())
  const pitchLabel = !inOutreach && hasDraft ? 'Continue Draft' : pitchActionLabel({ inActiveOutreach: inOutreach, previouslyContacted: Boolean(podcast.prior_outreach_at) })
  const flags = qualityFlags(podcast)
  const research = researchStatusLabel(podcast.research_progress)
  const hostLine = [podcast.host_name, podcast.publisher_name].filter((part, index, parts) => part && parts.indexOf(part) === index).join(' · ')
  const externalHref = safeExternalUrl(podcast.podcast_url)
  const pending = pendingPodcastId === podcast.podcast_id

  return (
    <div role="row" className={cn('grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 gap-y-2 px-3 py-3', GRID)}>
      <div role="cell" className="pt-1 min-[1100px]:pt-0">
        <Checkbox className="h-5 w-5 min-[1100px]:h-4 min-[1100px]:w-4" checked={selectedIds.has(podcast.podcast_id)} onCheckedChange={(checked) => onToggle(podcast.podcast_id, checked === true)} aria-label={`Select ${podcast.podcast_name}`} />
      </div>
      <div role="cell" className="min-w-0">
        <button type="button" className={cn('flex w-full min-w-0 items-start gap-3 rounded-md text-left', FOCUS_RING)} onClick={() => onOpenDetails(podcast)} aria-label={`View details for ${podcast.podcast_name}`} aria-describedby={`host-${podcast.podcast_id}`}>
          <PodcastArtwork podcast={podcast} className="hidden h-10 w-10 rounded-lg 2xl:flex" />
          <span className="min-w-0">
            <span className="flex items-start gap-1.5">
              <span className="line-clamp-2 break-words font-semibold leading-snug" title={podcast.podcast_name}>{podcast.podcast_name}</span>
              {podcast.is_featured && <span role="img" aria-label={`${podcast.podcast_name} is featured`} title="Featured" className="mt-0.5 shrink-0"><Star aria-hidden="true" className="h-3.5 w-3.5 fill-amber-400 text-amber-500" /></span>}
            </span>
            <span id={`host-${podcast.podcast_id}`} className="block truncate text-sm text-muted-foreground" title={hostLine || undefined}>{hostLine || 'Host unavailable'}</span>
          </span>
        </button>
        {(podcast.prior_outreach_at || flags.notPosting || flags.companyFeed) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {podcast.prior_outreach_at && <Badge role="img" aria-label={`${podcast.podcast_name} was previously contacted`} variant="outline" className="border-sky-200 bg-sky-50 px-1.5 py-0 text-[11px] text-sky-800"><MailCheck className="mr-1 h-3 w-3" />Previously contacted</Badge>}
            {flags.notPosting && <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[11px] text-amber-900" title="No episode in the last 90 days">Not posting</Badge>}
            {flags.companyFeed && <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[11px] text-amber-900" title="Looks like a company's own feed, not a hosted show that books guests">Company feed</Badge>}
          </div>
        )}
        {podcast.feedback_notes && <p className="mt-1 line-clamp-1 text-xs italic text-muted-foreground">Client note: “{podcast.feedback_notes}”</p>}
      </div>

      {/* Below 1100px these cells form a labelled grid under the name. */}
      <div role="none" className="col-span-2 col-start-1 grid grid-cols-3 gap-x-3 gap-y-2 pl-8 sm:grid-cols-6 min-[1100px]:contents">
        <div role="cell"><p className={MOBILE_LABEL}>Email</p><EmailCell podcast={podcast} /></div>
        <div role="cell"><p className={MOBILE_LABEL}>Fit</p><FitScoreBadge podcast={podcast} profile={fitProfile} /></div>
        <div role="cell"><p className={MOBILE_LABEL}>Audience</p><p className="text-sm font-medium tabular-nums">{compactNumber(podcast.audience_size)}</p></div>
        <div role="cell"><p className={MOBILE_LABEL}>Rating</p><p className="text-sm font-medium tabular-nums">{podcast.itunes_rating ? Number(podcast.itunes_rating).toFixed(1) : '—'}</p></div>
        <div role="cell" className="min-w-0">
          <p className={MOBILE_LABEL}>Client decision</p>
          <div className="flex items-center gap-1.5">
            <FeedbackBadge podcast={podcast} />
            {podcast.visibility === 'archived' && <span role="img" aria-label="Hidden from client (archived)" title="Hidden from client (archived)"><EyeOff aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" /></span>}
          </div>
        </div>
        <div role="cell" className="min-w-0">
          <p className={MOBILE_LABEL}>Pitch</p>
          <p className="text-xs font-medium leading-tight">{pitchDataAvailable ? pitchBadgeLabel(target) : pitchError ? 'Unavailable' : 'Loading…'}</p>
          {research && research !== 'Research complete' && <p className="mt-0.5 text-[11px] leading-tight text-amber-800"><span className="sr-only">Research status: </span>{research}</p>}
        </div>
      </div>

      <div role="cell" className="col-span-2 flex items-center justify-end gap-1.5 min-[1100px]:col-span-1">
        <span className="sr-only min-[1100px]:hidden">Actions</span>
        {podcast.visibility === 'visible' && podcast.feedback_status === 'approved' && (
          <Button asChild variant="outline" size="sm" className={cn('h-8 px-2.5', pitchLabel === 'Write Re-pitch' && 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 hover:text-amber-950')}>
            {/* A page, not a modal: it can be opened in a new tab, left while research runs, and returned to. */}
            <Link to={clientPitchHref(workspaceBaseHref, clientId, podcast.id)} aria-label={`${pitchLabel === 'Write Re-pitch' ? 'Re-pitch' : pitchLabel} for ${podcast.podcast_name}`}>
              {pitchLabel === 'View Pitch' ? <Eye className="mr-1.5 h-3.5 w-3.5 text-sky-600" /> : <PenLine className={cn('mr-1.5 h-3.5 w-3.5', pitchLabel === 'Write Re-pitch' ? 'text-amber-700' : 'text-primary')} />}
              {SHORT_PITCH_LABELS[pitchLabel] ?? pitchLabel}
            </Link>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={pending}>
              <span className="sr-only">Actions for {podcast.podcast_name}</span>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => onOpenDetails(podcast)}><FileText className="mr-2 h-4 w-4" />View details &amp; notes</DropdownMenuItem>
            {externalHref && <DropdownMenuItem asChild><a href={externalHref} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open podcast website</a></DropdownMenuItem>}
            <DropdownMenuSeparator />
            {podcast.feedback_status !== 'approved' && <DropdownMenuItem onClick={() => onDecision(podcast, 'approved')}><ThumbsUp className="mr-2 h-4 w-4 text-emerald-600" />Mark approved</DropdownMenuItem>}
            {podcast.feedback_status !== 'rejected' && <DropdownMenuItem onClick={() => onDecision(podcast, 'rejected')}><ThumbsDown className="mr-2 h-4 w-4 text-rose-600" />Mark passed</DropdownMenuItem>}
            <DropdownMenuSeparator />
            {podcast.visibility === 'visible' && <DropdownMenuItem onClick={() => onToggleFeatured(podcast)}><Star className="mr-2 h-4 w-4" />{podcast.is_featured ? 'Remove from featured' : 'Add to featured'}</DropdownMenuItem>}
            {podcast.visibility === 'archived' ? (
              <DropdownMenuItem onClick={() => onRestore(podcast)}><RotateCcw className="mr-2 h-4 w-4" />Restore to list</DropdownMenuItem>
            ) : (
              <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => onArchive(podcast)}><Archive className="mr-2 h-4 w-4" />Archive podcast</DropdownMenuItem></>
            )}
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(podcast)}><Trash2 className="mr-2 h-4 w-4" />Delete permanently</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
