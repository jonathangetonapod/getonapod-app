import { toast } from 'sonner'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  ExternalLink,
  Inbox,
  ListChecks,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ClientActivityCalendar } from '@/components/workspace/ClientActivityCalendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ClientBookingDialog } from '@/components/workspace/ClientBookingDialog'
import { ConversationBadge, OpportunityDetailSheet, StageBadge } from '@/components/workspace/OpportunityDetailSheet'
import { safeExternalUrl } from '@/lib/externalUrl'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import {
  getWorkspaceClientPodcastSystem,
  type ClientPodcastSystemClient,
  type ClientPodcastSystemItem,
} from '@/services/clientPodcastSystem'

interface WorkspaceClientPodcastSystemProps {
  platformWorkspaceId?: string
}

/** Where a client's next action is done: a shortlist row, or a tab on the client record. */
type NextActionTarget =
  | { kind: 'item'; itemId: string }
  | { kind: 'record'; tab: 'profile' | 'shortlist' | 'intake' }
  | null

interface ClientRollup {
  client: ClientPodcastSystemClient
  items: ClientPodcastSystemItem[]
  awaitingReview: number
  preparation: number
  activeOutreach: number
  conversations: number
  placements: number
  published: number
  upcomingRecordings: number
  needsAttentionItems: ClientPodcastSystemItem[]
  needsAttention: boolean
  nextAction: {
    label: string
    detail: string
    tone: 'urgent' | 'work' | 'clear'
    target: NextActionTarget
  }
  lastActivityAt: string | null
}

type ClientStatusFilter = 'active' | 'paused' | 'churned' | 'all'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ATTENTION_PREVIEW = 12

function initials(value: string): string {
  return value.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C'
}

function formattedDate(value: string | null | undefined, includeTime = false): string {
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

function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function statusClassName(status: string): string {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'paused') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function onboardingLabel(client: ClientPodcastSystemClient): string {
  if (!client.onboarding) return 'Not started'
  if (client.onboarding.status === 'changes_requested') return 'Changes requested'
  if (client.onboarding.status === 'in_progress') return 'In progress'
  return client.onboarding.status.charAt(0).toUpperCase() + client.onboarding.status.slice(1)
}

function ClientAvatar({ client }: { client: ClientPodcastSystemClient }) {
  const imageUrl = safeExternalUrl(client.photo_url)
  return (
    <Avatar className="h-11 w-11 shrink-0 border bg-background">
      {imageUrl && <AvatarImage src={imageUrl} alt="" className="object-cover" />}
      <AvatarFallback>{initials(client.name)}</AvatarFallback>
    </Avatar>
  )
}

function PodcastIdentity({ item }: { item: ClientPodcastSystemItem }) {
  const imageUrl = safeExternalUrl(item.podcast.image_url)
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-10 w-10 shrink-0 rounded-lg border">
        {imageUrl && <AvatarImage src={imageUrl} alt="" className="object-cover" />}
        <AvatarFallback className="rounded-lg text-xs">{initials(item.podcast.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">{item.podcast.name}</p>
        <p className="truncate text-xs text-muted-foreground">{item.client.name} · {item.podcast.host_name || item.podcast.publisher_name || 'Host not identified'}</p>
      </div>
    </div>
  )
}

function buildClientRollup(
  client: ClientPodcastSystemClient,
  allItems: ClientPodcastSystemItem[],
  today: string,
): ClientRollup {
  const items = allItems.filter((item) => item.client.id === client.id)
  const conflicts = items.filter((item) => item.has_conflict || item.campaign?.status === 'failed')
  const conversations = items.filter((item) => !item.terminal && item.stage === 'conversation')
  const unpreparedBooking = items.find((item) => (
    !item.terminal
    && item.stage === 'booked'
    && item.booking
    && !item.booking.prep_sent
  ))
  const awaitingReview = items.filter((item) => !item.terminal && item.stage === 'awaiting_review')
  const contactNeeded = items.filter((item) => !item.terminal && item.stage === 'contact_needed')
  const researchNeeded = items.filter((item) => !item.terminal && item.stage === 'research_needed')
  const ready = items.filter((item) => !item.terminal && item.stage === 'ready')
  const recorded = items.filter((item) => !item.terminal && item.stage === 'recorded')
  const onboardingNeedsWork = client.onboarding && ['invited', 'in_progress', 'submitted', 'changes_requested'].includes(client.onboarding.status)

  let nextAction: ClientRollup['nextAction']
  if (client.status !== 'active') {
    nextAction = {
      label: client.status === 'paused' ? 'Client work is paused' : 'Client is no longer active',
      detail: 'No new operational work is being prioritized.',
      tone: 'clear',
      target: null,
    }
  } else if (conflicts[0]) {
    nextAction = {
      label: 'Resolve an outreach history issue',
      detail: `${conflicts.length} podcast ${conflicts.length === 1 ? 'record needs' : 'records need'} review before more activity.`,
      tone: 'urgent',
      target: { kind: 'item', itemId: conflicts[0].id },
    }
  } else if (conversations[0]) {
    nextAction = {
      label: 'Respond to a podcast host',
      detail: `${conversations.length} active ${conversations.length === 1 ? 'conversation needs' : 'conversations need'} attention.`,
      tone: 'urgent',
      target: { kind: 'item', itemId: conversations[0].id },
    }
  } else if (unpreparedBooking) {
    nextAction = {
      label: 'Prepare the client for a recording',
      detail: `${unpreparedBooking.podcast.name} is booked and preparation is not marked complete.`,
      tone: 'urgent',
      target: { kind: 'item', itemId: unpreparedBooking.id },
    }
  } else if (client.onboarding?.status === 'submitted') {
    nextAction = {
      label: 'Review submitted onboarding',
      detail: 'The client has submitted their information for workspace review.',
      tone: 'work',
      target: { kind: 'record', tab: 'intake' },
    }
  } else if (!client.profile.ready) {
    nextAction = {
      label: 'Complete the guest profile',
      detail: `${client.profile.completed_fields} of ${client.profile.total_fields} host-ready context sections are complete.`,
      tone: 'work',
      target: { kind: 'record', tab: 'profile' },
    }
  } else if (onboardingNeedsWork) {
    nextAction = {
      label: 'Move onboarding forward',
      detail: `The current onboarding status is ${onboardingLabel(client).toLowerCase()}.`,
      tone: 'work',
      target: { kind: 'record', tab: 'intake' },
    }
  } else if (awaitingReview[0]) {
    nextAction = {
      label: 'Get client podcast decisions',
      detail: `${awaitingReview.length} ${awaitingReview.length === 1 ? 'podcast is' : 'podcasts are'} awaiting review.`,
      tone: 'work',
      target: { kind: 'item', itemId: awaitingReview[0].id },
    }
  } else if (contactNeeded[0]) {
    nextAction = {
      label: 'Find a host email',
      detail: `${contactNeeded.length} approved ${contactNeeded.length === 1 ? 'podcast needs' : 'podcasts need'} a usable contact.`,
      tone: 'work',
      target: { kind: 'item', itemId: contactNeeded[0].id },
    }
  } else if (researchNeeded[0]) {
    nextAction = {
      label: 'Finish a host-ready pitch',
      detail: `${researchNeeded.length} ${researchNeeded.length === 1 ? 'opportunity needs' : 'opportunities need'} research or pitch review.`,
      tone: 'work',
      target: { kind: 'item', itemId: researchNeeded[0].id },
    }
  } else if (ready[0]) {
    nextAction = {
      label: 'Launch reviewed outreach',
      detail: `${ready.length} ${ready.length === 1 ? 'pitch is' : 'pitches are'} ready to launch.`,
      tone: 'work',
      target: { kind: 'item', itemId: ready[0].id },
    }
  } else if (recorded[0]) {
    nextAction = {
      label: 'Confirm publication details',
      detail: `${recorded.length} recorded ${recorded.length === 1 ? 'appearance is' : 'appearances are'} awaiting publication.`,
      tone: 'work',
      target: { kind: 'item', itemId: recorded[0].id },
    }
  } else if (items.length === 0) {
    nextAction = {
      label: 'Add the first podcasts',
      detail: 'Start building a focused shortlist for this client.',
      tone: 'work',
      target: { kind: 'record', tab: 'shortlist' },
    }
  } else {
    nextAction = {
      label: 'No urgent action',
      detail: 'The current client workflow has no blocked or time-sensitive work.',
      tone: 'clear',
      target: null,
    }
  }

  const needsAttentionItems = items.filter((item) => (
    !item.terminal
    && (
      item.has_conflict
      || item.campaign?.status === 'failed'
      || ['awaiting_review', 'contact_needed', 'research_needed', 'ready', 'conversation', 'recorded'].includes(item.stage)
      || (item.stage === 'booked' && !item.booking?.prep_sent)
    )
  ))

  return {
    client,
    items,
    awaitingReview: awaitingReview.length,
    preparation: items.filter((item) => !item.terminal && ['approved', 'contact_needed', 'research_needed', 'ready'].includes(item.stage)).length,
    activeOutreach: items.filter((item) => !item.terminal && item.stage === 'outreach').length,
    conversations: conversations.length,
    placements: items.filter((item) => item.booking && item.booking.status !== 'cancelled').length,
    published: items.filter((item) => item.stage === 'published').length,
    upcomingRecordings: items.filter((item) => (
      !item.terminal
      && Boolean(item.booking?.recording_date)
      && item.booking!.recording_date! >= today
    )).length,
    needsAttentionItems,
    needsAttention: client.status === 'active' && nextAction.tone !== 'clear',
    nextAction,
    lastActivityAt: [client.last_activity_at, ...items.map((item) => item.last_activity_at)]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) || null,
  }
}

function PortfolioMetric({
  icon: Icon,
  label,
  value,
  detail,
  className,
}: {
  icon: typeof Users
  label: string
  value: number
  detail: string
  className: string
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{detail}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${className}`}><Icon className="h-4 w-4" /></div>
      </CardContent>
    </Card>
  )
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background/70 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value.toLocaleString()}</p>
    </div>
  )
}

function OpportunityList({
  items,
  onOpen,
}: {
  items: ClientPodcastSystemItem[]
  onOpen: (item: ClientPodcastSystemItem) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
        <ListChecks className="h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 font-medium">Nothing needs attention here</p>
        <p className="mt-1 text-sm text-muted-foreground">New decisions, conversations, and delivery work will appear here.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onOpen(item)} className="flex w-full flex-col gap-3 rounded-xl border p-3 text-left transition-colors hover:border-primary/40 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><PodcastIdentity item={item} /></div>
          <div className="flex flex-wrap gap-1.5"><StageBadge stage={item.stage} /><ConversationBadge item={item} />{item.has_conflict && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Check history</Badge>}</div>
          <p className="w-full text-xs text-muted-foreground sm:w-52">{item.next_action || 'No action required'}</p>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

function ReadinessLine({ client, canManage }: { client: ClientPodcastSystemClient; canManage: boolean }) {
  const facts = [
    client.profile.ready ? 'Reply brief ready' : 'Reply brief needs context',
    `Onboarding ${canManage ? onboardingLabel(client).toLowerCase() : 'owner/admin only'}`,
    client.dashboard_configured ? 'Dashboard live' : 'Dashboard not set up',
    client.portal.enabled ? 'Portal enabled' : 'Portal off',
  ]
  return <p className="mt-1 truncate text-xs text-muted-foreground">{facts.join(' · ')}</p>
}

function AllClientsView({
  rollups,
  items,
  baseHref,
  canManage,
  focusClientId,
  onChooseClient,
  onOpenItem,
}: {
  rollups: ClientRollup[]
  items: ClientPodcastSystemItem[]
  baseHref: string
  canManage: boolean
  /** A client the address names: the queue narrows to them until cleared. */
  focusClientId: string | null
  onChooseClient: (clientId: string) => void
  onOpenItem: (itemId: string) => void
}) {
  const [portfolioView, setPortfolioView] = useState<'clients' | 'calendar'>('clients')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ClientStatusFilter>('all')
  const [attentionExpanded, setAttentionExpanded] = useState(false)
  const normalizedSearch = search.trim().toLowerCase()
  const filtered = rollups.filter((rollup) => {
    if (focusClientId && rollup.client.id !== focusClientId) return false
    if (status !== 'all' && rollup.client.status !== status) return false
    if (!normalizedSearch) return true
    return [
      rollup.client.name,
      rollup.client.email,
      rollup.client.contact_person,
      rollup.client.website,
      rollup.client.profile.positioning,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch)
  })
  const activeRollups = rollups.filter((rollup) => rollup.client.status === 'active')
  // Attention follows the client filters, so narrowing to one client narrows
  // the work list with it. Clients are already ordered by urgency.
  const attentionItems = filtered
    .filter((rollup) => rollup.client.status === 'active')
    .flatMap((rollup) => rollup.needsAttentionItems)
  const visibleAttention = attentionExpanded ? attentionItems : attentionItems.slice(0, ATTENTION_PREVIEW)
  const focusRollup = focusClientId ? rollups.find((rollup) => rollup.client.id === focusClientId) || null : null

  return (
    <div className="space-y-6">
      <section aria-label="Client portfolio summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PortfolioMetric icon={Users} label="Active clients" value={activeRollups.length} detail="Currently receiving service" className="bg-sky-50 text-sky-700" />
        <PortfolioMetric icon={AlertCircle} label="Need attention" value={activeRollups.filter((rollup) => rollup.needsAttention).length} detail="Have a clear next action" className="bg-amber-50 text-amber-700" />
        <PortfolioMetric icon={Inbox} label="Open conversations" value={activeRollups.reduce((sum, rollup) => sum + rollup.conversations, 0)} detail="Host or scheduling replies" className="bg-fuchsia-50 text-fuchsia-700" />
        <PortfolioMetric icon={CalendarDays} label="Upcoming recordings" value={activeRollups.reduce((sum, rollup) => sum + rollup.upcomingRecordings, 0)} detail="Confirmed recording dates" className="bg-emerald-50 text-emerald-700" />
        <PortfolioMetric icon={Radio} label="Published episodes" value={rollups.reduce((sum, rollup) => sum + rollup.published, 0)} detail="Recorded client outcomes" className="bg-violet-50 text-violet-700" />
      </section>

      <Tabs value={portfolioView} onValueChange={(value) => setPortfolioView(value as 'clients' | 'calendar')}>
        <TabsList className="h-auto justify-start">
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-5">
          <ClientActivityCalendar items={items} onOpenItem={onOpenItem} />
        </TabsContent>

        <TabsContent value="clients" className="mt-5 space-y-6">
          {focusRollup && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-sm">Showing <span className="font-semibold">{focusRollup.client.name}</span> only.</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link to={`${baseHref}/clients/${encodeURIComponent(focusRollup.client.id)}`}>Client record</Link></Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChooseClient('all')}><Users className="mr-2 h-4 w-4" />Show all clients</Button>
              </div>
            </div>
          )}

          <Card>
            <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>All clients</CardTitle>
                <CardDescription>Clients needing action appear first. Each next action opens where the work is done.</CardDescription>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <div className="relative sm:w-64">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input aria-label="Search clients" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients" className="pl-9" />
                </div>
                <Select value={focusClientId || 'all'} onValueChange={onChooseClient}>
                  <SelectTrigger aria-label="Filter by client" className="sm:w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    {rollups.map((rollup) => <SelectItem key={rollup.client.id} value={rollup.client.id}>{rollup.client.name} · {rollup.client.status}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={(value) => setStatus(value as ClientStatusFilter)}>
                  <SelectTrigger aria-label="Filter clients by status" className="sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active clients</SelectItem>
                    <SelectItem value="paused">Paused clients</SelectItem>
                    <SelectItem value="churned">Churned clients</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
                  <Users className="h-9 w-9 text-muted-foreground/50" />
                  <p className="mt-3 font-medium">No clients match this view</p>
                  <p className="mt-1 text-sm text-muted-foreground">Try another status or search term.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((rollup) => {
                    const { client, nextAction } = rollup
                    const { target } = nextAction
                    const website = safeExternalUrl(client.website)
                    const recordHref = `${baseHref}/clients/${encodeURIComponent(client.id)}`
                    return (
                      <article key={client.id} className="rounded-2xl border bg-card p-4 transition-colors hover:border-primary/30 sm:p-5">
                        <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <ClientAvatar client={client} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h2 className="truncate text-lg font-semibold">{client.name}</h2>
                                <Badge variant="outline" className={statusClassName(client.status)}>{client.status}</Badge>
                                <Badge variant="outline" className={client.profile.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-violet-200 bg-violet-50 text-violet-800'}>
                                  {client.profile.ready ? 'Guest profile ready' : `${client.profile.completed_fields}/${client.profile.total_fields} profile sections`}
                                </Badge>
                              </div>
                              <p className="mt-1 truncate text-sm text-muted-foreground">{client.email || client.contact_person || 'No primary contact saved'}</p>
                              <ReadinessLine client={client} canManage={canManage} />
                              {website && <a href={website} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center truncate text-xs text-primary hover:underline">{client.website}<ExternalLink className="ml-1 h-3 w-3" /></a>}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 xl:w-[560px]">
                            <MiniMetric label="Podcasts" value={rollup.items.length} />
                            <MiniMetric label="To review" value={rollup.awaitingReview} />
                            <MiniMetric label="Approved" value={rollup.preparation} />
                            <MiniMetric label="Outreach" value={rollup.activeOutreach} />
                            <MiniMetric label="Replies" value={rollup.conversations} />
                            <MiniMetric label="Placements" value={rollup.placements} />
                          </div>

                          <div className={`xl:w-80 rounded-xl border p-3 ${nextAction.tone === 'urgent' ? 'border-amber-200 bg-amber-50' : nextAction.tone === 'work' ? 'border-violet-200 bg-violet-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next action</p>
                            <p className="mt-1 text-sm font-semibold">{nextAction.label}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{nextAction.detail}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs text-muted-foreground">Last activity {formattedDate(rollup.lastActivityAt, true)}</p>
                          <div className="flex flex-wrap gap-2">
                            <Button asChild variant="ghost" size="sm"><Link to={recordHref}>Client record</Link></Button>
                            {target?.kind === 'item' && (
                              <Button type="button" size="sm" onClick={() => onOpenItem(target.itemId)} aria-label={`Open ${client.name} next action`}>Open opportunity<ArrowRight className="ml-2 h-4 w-4" /></Button>
                            )}
                            {target?.kind === 'record' && (
                              <Button asChild size="sm"><Link to={`${recordHref}?tab=${target.tab}`} aria-label={`Open ${client.name} next action`}>Open<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                            )}
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>The podcast work most likely to need a decision or follow-up next{focusRollup ? ` for ${focusRollup.client.name}` : ', across every active client'}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <OpportunityList items={visibleAttention} onOpen={(item) => onOpenItem(item.id)} />
              {attentionItems.length > ATTENTION_PREVIEW && (
                <Button type="button" variant="outline" size="sm" onClick={() => setAttentionExpanded((current) => !current)}>
                  {attentionExpanded ? 'Show fewer' : `Show all ${attentionItems.length}`}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

const WorkspaceClientPodcastSystem = ({ platformWorkspaceId }: WorkspaceClientPodcastSystemProps) => {
  const { isPlatformAdmin, membership, user, workspace } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || '').toLowerCase()
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const baseHref = isPlatformWorkspace ? selectedWorkspaceBaseHref(selectedWorkspaceId) : MY_WORKSPACE_BASE_HREF
  const requestedClientId = (searchParams.get('client') || '').toLowerCase()
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  // Logging a placement from an opportunity carries the podcast across, so
  // the same show never has to be retyped to become a booking.
  const [placementItem, setPlacementItem] = useState<ClientPodcastSystemItem | null>(null)
  const today = localToday()

  const systemQuery = useQuery({
    queryKey: ['workspace-client-podcast-system', user?.id || 'unknown', workspaceId],
    queryFn: () => getWorkspaceClientPodcastSystem(workspaceId),
    enabled: validWorkspaceId,
    retry: false,
    staleTime: 30_000,
  })
  const system = systemQuery.data
  const canManage = Boolean(system?.can_manage || isPlatformAdmin || membership?.role === 'owner' || membership?.role === 'admin')
  const rollups = useMemo(() => (system?.clients || [])
    .map((client) => buildClientRollup(client, system?.items || [], today))
    .sort((left, right) => {
      const statusOrder = { active: 0, paused: 1, churned: 2 } as Record<string, number>
      const statusDifference = (statusOrder[left.client.status] ?? 3) - (statusOrder[right.client.status] ?? 3)
      if (statusDifference !== 0) return statusDifference
      if (left.needsAttention !== right.needsAttention) return left.needsAttention ? -1 : 1
      return (right.lastActivityAt || '').localeCompare(left.lastActivityAt || '') || left.client.name.localeCompare(right.client.name)
    }), [system?.clients, system?.items, today])
  const focusRollup = UUID_PATTERN.test(requestedClientId)
    ? rollups.find((rollup) => rollup.client.id === requestedClientId) || null
    : null
  // Arriving from a reply in the inbox: open the placement that reply
  // belongs to, resolved by the show, since the inbox knows the podcast and
  // not the shortlist row.
  const requestedPodcastId = (searchParams.get('podcast') || '').trim().toLowerCase()
  const linkedItem = requestedPodcastId && requestedClientId
    ? system?.items.find((item) => (
      item.client.id === requestedClientId
      && item.podcast.podscan_id.trim().toLowerCase() === requestedPodcastId
    )) || null
    : null
  const selectedItem = system?.items.find((item) => item.id === selectedItemId)
    || linkedItem
    || null

  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceId,
        workspaceName: system?.workspace.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          system?.workspace.id,
          system?.workspace.logo_path,
          system?.workspace.logo_updated_at,
        ),
        baseHref,
      }
    : undefined

  const chooseClient = (clientId: string) => {
    const next = new URLSearchParams(searchParams)
    if (clientId === 'all') next.delete('client')
    else next.set('client', clientId)
    setSearchParams(next, { replace: false })
    setSelectedItemId(null)
  }

  useEffect(() => {
    if (!system || !requestedClientId || focusRollup) return
    const next = new URLSearchParams(searchParams)
    next.delete('client')
    // The podcast param rides on the client: with no resolvable client it can
    // never open anything, and it used to linger in the address doing nothing.
    next.delete('podcast')
    setSearchParams(next, { replace: true })
  }, [requestedClientId, searchParams, focusRollup, setSearchParams, system])

  // A deep link naming a show this client's shortlist does not carry, such as
  // an inbound "View placement" for a show never shortlisted here, must not
  // sit silently in the address while the page looks like nothing happened.
  useEffect(() => {
    if (!system || !requestedPodcastId || !requestedClientId || linkedItem) return
    if (!focusRollup) return
    toast.info('That show is not on this client’s list, so there is no placement to open.')
    const next = new URLSearchParams(searchParams)
    next.delete('podcast')
    setSearchParams(next, { replace: true })
  }, [linkedItem, requestedClientId, requestedPodcastId, searchParams, focusRollup, setSearchParams, system])

  if (!validWorkspaceId) {
    return <WorkspaceLayout platformWorkspace={platformWorkspace}><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card></WorkspaceLayout>
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pipeline</h1>
          <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={`${baseHref}/clients`}><Users className="mr-2 h-4 w-4" />Clients</Link></Button><Button asChild><Link to={`${baseHref}/podcast-finder`}><Search className="mr-2 h-4 w-4" />Find podcasts</Link></Button></div>
        </div>

        {systemQuery.isLoading ? (
          <Card><CardContent className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">Building the pipeline…</span></CardContent></Card>
        ) : systemQuery.error || !system ? (
          <Card className="border-destructive/30"><CardContent className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><AlertCircle className="h-9 w-9 text-destructive" /><h2 className="mt-4 text-lg font-semibold">Pipeline unavailable</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{systemQuery.error instanceof Error ? systemQuery.error.message : 'The workspace pipeline could not be loaded.'}</p><Button type="button" variant="outline" className="mt-4" onClick={() => void systemQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card>
        ) : system.clients.length === 0 ? (
          <Card><CardContent className="flex min-h-80 flex-col items-center justify-center px-6 text-center"><Users className="h-10 w-10 text-muted-foreground/50" /><h2 className="mt-4 text-xl font-semibold">No clients in this workspace yet</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Create the first client account to start onboarding, building a guest profile, and finding podcast opportunities.</p><Button asChild className="mt-5"><Link to={`${baseHref}/clients`}>Open Clients</Link></Button></CardContent></Card>
        ) : (
          <AllClientsView
            rollups={rollups}
            items={system.items}
            baseHref={baseHref}
            canManage={canManage}
            focusClientId={focusRollup?.client.id || null}
            onChooseClient={chooseClient}
            onOpenItem={setSelectedItemId}
          />
        )}
      </div>

      <OpportunityDetailSheet
        item={selectedItem}
        baseHref={baseHref}
        canManage={canManage}
        onLogPlacement={setPlacementItem}
        onOpenChange={(open) => {
          if (open) return
          setSelectedItemId(null)
          // Without this the linked placement reopens on every render.
          if (requestedPodcastId) {
            const next = new URLSearchParams(searchParams)
            next.delete('podcast')
            setSearchParams(next, { replace: true })
          }
        }}
      />
      {placementItem && (
        <ClientBookingDialog
          open={Boolean(placementItem)}
          onOpenChange={(open) => { if (!open) setPlacementItem(null) }}
          workspaceId={workspaceId}
          clientId={placementItem.client.id}
          clientName={placementItem.client.name}
          booking={placementItem.booking
            ? {
              id: placementItem.booking.id,
              client_id: placementItem.client.id,
              podcast_id: placementItem.podcast.podscan_id ?? null,
              /*
               * The shortlist row, not the catalog show. item.id is the
               * client_dashboard_podcasts row; item.podcast.id is the global
               * podcasts row, and bookings_shortlist_podcast_fk points at the
               * former by (client_id, shortlist_podcast_id). Sending the
               * catalog id meant every placement logged from this page failed
               * the constraint and came back "The placement could not be
               * saved", the whole action, not an edge case.
               */
              shortlist_podcast_id: placementItem.id,
              podcast_name: placementItem.podcast.name,
              podcast_url: placementItem.podcast.url ?? null,
              host_name: placementItem.booking.host_name,
              scheduled_date: placementItem.booking.scheduled_date,
              recording_date: placementItem.booking.recording_date,
              publish_date: placementItem.booking.publish_date,
              status: placementItem.booking.status,
              episode_url: placementItem.booking.episode_url,
              prep_sent: placementItem.booking.prep_sent,
              notes: placementItem.booking.notes,
              created_at: placementItem.booking.created_at,
              updated_at: placementItem.booking.updated_at,
            }
            : {
              // Not yet a booking: seed the form from the opportunity so the
              // operator only chooses a stage and a date.
              id: '',
              client_id: placementItem.client.id,
              podcast_id: placementItem.podcast.podscan_id ?? null,
              // The shortlist row, not the catalog show (see above).
              shortlist_podcast_id: placementItem.id,
              podcast_name: placementItem.podcast.name,
              podcast_url: placementItem.podcast.url ?? null,
              host_name: null,
              scheduled_date: null,
              recording_date: null,
              publish_date: null,
              status: 'conversation_started',
              episode_url: null,
              prep_sent: false,
              notes: null,
              created_at: '',
              updated_at: '',
            }}
          onSaved={() => { setPlacementItem(null); void systemQuery.refetch() }}
        />
      )}
    </WorkspaceLayout>
  )
}

export default WorkspaceClientPodcastSystem
