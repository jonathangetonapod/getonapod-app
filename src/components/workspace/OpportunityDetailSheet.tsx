import { Link } from 'react-router-dom'
import {
  AlertCircle,
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  Inbox,
  Megaphone,
  UserRound,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { safeExternalUrl } from '@/lib/externalUrl'
import type {
  ClientPodcastLifecycleOutcome,
  ClientPodcastLifecycleStage,
  ClientPodcastSystemItem,
} from '@/services/clientPodcastSystem'

/*
 * One shortlist row, in full: its stage, contact, research, booking milestones
 * and the places its work continues. The pipeline queue and the client record
 * both open it, so it lives here rather than in either page.
 */

const stageMeta: Record<ClientPodcastLifecycleStage, { label: string; shortLabel: string; className: string }> = {
  awaiting_review: { label: 'Awaiting client review', shortLabel: 'Awaiting review', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  approved: { label: 'Client approved', shortLabel: 'Approved', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  contact_needed: { label: 'Contact needed', shortLabel: 'Needs contact', className: 'border-orange-200 bg-orange-50 text-orange-800' },
  research_needed: { label: 'Research or pitch needed', shortLabel: 'Needs research', className: 'border-sky-200 bg-sky-50 text-sky-800' },
  ready: { label: 'Ready to launch', shortLabel: 'Ready', className: 'border-violet-200 bg-violet-50 text-violet-800' },
  outreach: { label: 'In outreach', shortLabel: 'Outreach', className: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
  conversation: { label: 'Active conversation', shortLabel: 'Conversation', className: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800' },
  booked: { label: 'Booked', shortLabel: 'Booked', className: 'border-green-200 bg-green-50 text-green-800' },
  recorded: { label: 'Recorded', shortLabel: 'Recorded', className: 'border-blue-200 bg-blue-50 text-blue-800' },
  published: { label: 'Published', shortLabel: 'Published', className: 'border-purple-200 bg-purple-50 text-purple-800' },
}

const outcomeMeta: Record<Exclude<ClientPodcastLifecycleOutcome, null>, { label: string; className: string }> = {
  rejected: { label: 'Client passed', className: 'border-rose-200 bg-rose-50 text-rose-800' },
  cancelled: { label: 'Cancelled', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  archived: { label: 'Archived', className: 'border-slate-200 bg-slate-50 text-slate-700' },
}

function formatOpportunityDate(value: string | null | undefined, includeTime = false): string {
  if (!value) return 'Not set'
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    timeZone: 'UTC',
  }).format(date)
}

function compactNumber(value: number | null | undefined): string {
  if (!value) return '—'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function contactLabel(item: ClientPodcastSystemItem): string {
  if (item.contact.source === 'direct') return 'Verified direct'
  if (item.contact.source === 'podscan') return 'Free Podscan'
  if (item.contact.source === 'campaign') return 'Campaign contact'
  return 'No email'
}

/**
 * The inbox, opened on the thread that belongs to this host where one is
 * known. The client-scoped link was the only route, which meant landing in a
 * hundred conversations and searching for the show already on screen.
 */
function inboxHref(baseHref: string, item: ClientPodcastSystemItem): string {
  const params = new URLSearchParams({ client: item.client.id })
  if (item.conversation?.thread_key) params.set('thread', item.conversation.thread_key)
  return `${baseHref}/master-inbox?${params.toString()}`
}

export function StageBadge({ stage }: { stage: ClientPodcastLifecycleStage }) {
  const meta = stageMeta[stage]
  return <Badge variant="outline" className={meta.className}>{meta.shortLabel}</Badge>
}

export function OutcomeBadge({ outcome }: { outcome: ClientPodcastLifecycleOutcome }) {
  if (!outcome) return null
  const meta = outcomeMeta[outcome]
  return <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
}

export function ConversationBadge({ item }: { item: ClientPodcastSystemItem }) {
  if (!item.conversation?.replied) return null
  return (
    <Badge variant="outline" className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800">
      <Inbox className="mr-1 h-3 w-3" />
      {/* A reply can be known from a campaign sync before the inbox has read
          the thread, and only one of those can be opened. */}
      {item.conversation.thread_key ? 'Host replied' : 'Reply not read in yet'}
    </Badge>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0"><span className="text-sm text-muted-foreground">{label}</span><div className="max-w-[65%] text-right text-sm font-medium">{value}</div></div>
}

export interface OpportunityDetailSheetProps {
  /** The row to show; the sheet is closed while this is null. */
  item: ClientPodcastSystemItem | null
  onOpenChange: (open: boolean) => void
  baseHref: string
  /** Owners and admins see contact emails and the placement action. */
  canManage: boolean
  /** Omit to hide the placement action, for a surface that logs placements elsewhere. */
  onLogPlacement?: (item: ClientPodcastSystemItem) => void
}

export const OpportunityDetailSheet = ({
  item,
  onOpenChange,
  baseHref,
  canManage,
  onLogPlacement,
}: OpportunityDetailSheetProps) => {
  const podcastUrl = safeExternalUrl(item?.podcast.url)
  const episodeUrl = safeExternalUrl(item?.booking?.episode_url)
  return (
    <Sheet open={Boolean(item)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl lg:max-w-3xl">
        {item && (
          <>
            <SheetHeader className="border-b p-5 pr-12 sm:p-6 sm:pr-12">
              <div className="flex flex-wrap gap-2"><StageBadge stage={item.stage} /><OutcomeBadge outcome={item.outcome} /><ConversationBadge item={item} />{item.has_conflict && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">History conflict</Badge>}</div>
              <SheetTitle className="text-2xl">{item.podcast.name}</SheetTitle>
              <SheetDescription>{item.client.name} · {stageMeta[item.stage].label}</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 p-5 sm:p-6">
              {item.has_conflict && <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-semibold text-amber-950">Review this history before taking another action</p><p className="mt-1 text-sm leading-6 text-amber-900/80">The current client decision or archive state conflicts with recorded outreach or campaign activity.</p></div></div>}
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Next action</p><p className="mt-2 text-sm font-semibold leading-5">{item.next_action || 'No action required'}</p></CardContent></Card>
                <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Contact</p><p className="mt-2 text-sm font-semibold">{contactLabel(item)}</p>{canManage && item.contact.email && <p className="mt-1 truncate text-xs text-muted-foreground">{item.contact.email}</p>}</CardContent></Card>
                <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Audience</p><p className="mt-2 text-sm font-semibold">{compactNumber(item.podcast.audience_size)}</p><p className="mt-1 text-xs text-muted-foreground">Estimated listeners</p></CardContent></Card>
              </div>
              <section><h2 className="text-lg font-semibold">Workflow facts</h2><div className="mt-3 rounded-xl border px-4"><DetailRow label="Client decision" value={item.decision.status ? <span className="capitalize">{item.decision.status}</span> : 'Awaiting decision'} /><DetailRow label="Campaign" value={item.campaign ? <span className="capitalize">{item.campaign.status.replace(/_/g, ' ')}</span> : 'Not prepared'} /><DetailRow label="Legacy outreach" value={item.legacy_outreach_at ? formatOpportunityDate(item.legacy_outreach_at) : 'None recorded'} /><DetailRow label="Booking" value={item.booking ? <span className="capitalize">{item.booking.status.replace(/_/g, ' ')}</span> : 'Not booked'} /><DetailRow label="Last activity" value={formatOpportunityDate(item.last_activity_at, true)} /></div>{item.booking?.match === 'podcast_name' && <p className="mt-2 text-xs leading-5 text-amber-700">This legacy booking was matched by client and podcast name because it does not carry a canonical podcast ID.</p>}</section>
              <section><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Host-ready research</h2><Badge variant="outline">{item.analysis.source === 'normalized' ? 'Current analysis' : item.analysis.source === 'legacy_cache' ? 'Legacy analysis' : 'Not researched'}</Badge></div>{item.analysis.clean_description ? <p className="mt-3 rounded-xl border bg-muted/15 p-4 text-sm leading-6 text-muted-foreground">{item.analysis.clean_description}</p> : <div className="mt-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No client-specific research is available yet.</div>}{item.analysis.fit_reasons.length > 0 && <div className="mt-4"><h3 className="text-sm font-semibold">Why the guest fits</h3><ul className="mt-2 space-y-2">{item.analysis.fit_reasons.map((reason, index) => <li key={`${reason}-${index}`} className="flex gap-2 text-sm leading-6 text-muted-foreground"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" /><span>{reason}</span></li>)}</ul></div>}</section>
              {item.booking && <section><h2 className="text-lg font-semibold">Booking milestones</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Scheduled</p><p className="mt-1 text-sm font-semibold">{formatOpportunityDate(item.booking.scheduled_date)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Recording</p><p className="mt-1 text-sm font-semibold">{formatOpportunityDate(item.booking.recording_date)}</p></div><div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Publication</p><p className="mt-1 text-sm font-semibold">{formatOpportunityDate(item.booking.publish_date)}</p></div></div></section>}
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline"><Link to={`${baseHref}/clients/${encodeURIComponent(item.client.id)}?tab=shortlist`}><UserRound className="mr-2 h-4 w-4" />Client shortlist</Link></Button>
                <Button asChild variant="outline"><Link to={`${baseHref}/client-campaigns/${encodeURIComponent(item.client.id)}`}><Megaphone className="mr-2 h-4 w-4" />Client campaign</Link></Button>
                <Button asChild variant={item.conversation?.thread_key ? 'default' : 'outline'}><Link to={inboxHref(baseHref, item)}><Inbox className="mr-2 h-4 w-4" />{item.conversation?.thread_key ? 'Open conversation' : 'Inbox'}</Link></Button>
                {canManage && onLogPlacement && <Button type="button" onClick={() => onLogPlacement(item)}><CalendarPlus className="mr-2 h-4 w-4" />{item.booking ? 'Update placement' : 'Log a placement'}</Button>}
                {podcastUrl && <Button asChild variant="ghost"><a href={podcastUrl} target="_blank" rel="noreferrer">Podcast page<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
                {episodeUrl && <Button asChild><a href={episodeUrl} target="_blank" rel="noreferrer">Listen to episode<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}
              </div>
              {!canManage && <div className="flex gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>You can view this opportunity. Owners and admins manage client decisions, campaign preparation, and delivery actions.</p></div>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
