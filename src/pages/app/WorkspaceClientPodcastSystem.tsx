import { toast } from 'sonner'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ListChecks,
  Loader2,
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
import { ClientPipelineRow } from '@/components/workspace/pipeline/ClientPipelineRow'
import { PipelineKpiRow } from '@/components/workspace/pipeline/PipelineKpiRow'
import { TodayQueue } from '@/components/workspace/pipeline/TodayQueue'
import {
  actionQueue,
  initials,
  kpiCounts,
  matchesKpi,
  onboardingLabel,
  type ClientRollup,
  type PipelineKpi,
} from '@/components/workspace/pipeline/pipelineRollup'
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

/** 'current' is every client still being served: active and paused, not churned. */
type ClientStatusFilter = 'current' | 'active' | 'paused' | 'churned' | 'all'

// Stages that mean the client is already underway, so a missing intake was done some other way.
const STARTED_STAGES = new Set(['outreach', 'conversation', 'booked', 'recorded', 'published'])

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ATTENTION_PREVIEW = 12

function localToday(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
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
      label: 'Complete the reply brief',
      detail: `${client.profile.completed_fields} of ${client.profile.total_fields} host-ready context sections are complete.`,
      tone: 'work',
      target: { kind: 'record', tab: 'profile' },
    }
  } else if (onboardingNeedsWork) {
    nextAction = {
      label: 'Move onboarding forward',
      detail: `The current onboarding status is ${onboardingLabel(client, true).toLowerCase()}.`,
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
    // The server's client-level value counts only real events; folding in
    // each item's last_activity_at brought back shortlist edits and backfills.
    lastActivityAt: client.last_activity_at,
    pipelineStarted: items.some((item) => (
      Boolean(item.booking || item.legacy_outreach_at || item.campaign?.launched_at)
      || STARTED_STAGES.has(item.stage)
    )),
  }
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
  const [status, setStatus] = useState<ClientStatusFilter>('current')
  const [kpi, setKpi] = useState<PipelineKpi | null>(null)
  const [churnedOpen, setChurnedOpen] = useState(false)
  const [attentionExpanded, setAttentionExpanded] = useState(false)
  const normalizedSearch = search.trim().toLowerCase()
  const focused = focusClientId ? rollups.filter((rollup) => rollup.client.id === focusClientId) : rollups
  const matching = focused.filter((rollup) => {
    if (kpi && !matchesKpi(rollup, kpi)) return false
    if (!normalizedSearch) return true
    return [
      rollup.client.name,
      rollup.client.email,
      rollup.client.contact_person,
      rollup.client.website,
      rollup.client.profile.positioning,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch)
  })
  /*
   * Churned clients sit in their own collapsed section below the list rather
   * than taking a row's worth of attention each. Choosing Churned in the status
   * filter, or opening one by address, lists them in the main list instead.
   */
  const churnedSeparately = !focusClientId && (status === 'current' || status === 'active' || status === 'all')
  const filtered = focusClientId ? matching : matching.filter((rollup) => {
    if (status === 'all') return rollup.client.status !== 'churned'
    if (status === 'current') return rollup.client.status === 'active' || rollup.client.status === 'paused'
    return rollup.client.status === status
  })
  const churned = churnedSeparately ? matching.filter((rollup) => rollup.client.status === 'churned') : []
  // A stat names its own clients, so it widens the status filter: Published
  // episodes counts paused clients too, and they would otherwise stay hidden
  // behind a narrower status filter. Churned still go in their own section.
  const chooseKpi = (next: PipelineKpi | null) => {
    setKpi(next)
    if (next) setStatus('all')
  }
  const queue = actionQueue(focused)
  // Attention follows the client filters, so narrowing to one client narrows
  // the work list with it. Clients are already ordered by urgency.
  const attentionItems = filtered
    .filter((rollup) => rollup.client.status === 'active')
    .flatMap((rollup) => rollup.needsAttentionItems)
  const visibleAttention = attentionExpanded ? attentionItems : attentionItems.slice(0, ATTENTION_PREVIEW)
  const focusRollup = focusClientId ? rollups.find((rollup) => rollup.client.id === focusClientId) || null : null

  return (
    <div className="space-y-4">
      <PipelineKpiRow counts={kpiCounts(rollups)} selected={kpi} onSelect={chooseKpi} />

      <Tabs value={portfolioView} onValueChange={(value) => setPortfolioView(value as 'clients' | 'calendar')}>
        <TabsList className="h-auto justify-start">
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <ClientActivityCalendar items={items} onOpenItem={onOpenItem} />
        </TabsContent>

        <TabsContent value="clients" className="mt-4 space-y-4">
          {focusRollup && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-sm">Showing <span className="font-semibold">{focusRollup.client.name}</span> only.</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm"><Link to={`${baseHref}/clients/${encodeURIComponent(focusRollup.client.id)}`}>Client record</Link></Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChooseClient('all')}><Users className="mr-2 h-4 w-4" />Show all clients</Button>
              </div>
            </div>
          )}

          <TodayQueue queue={queue} baseHref={baseHref} onOpenItem={onOpenItem} />

          <Card>
            <CardHeader className="gap-3 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-semibold leading-none tracking-tight">All clients</h2>
                <CardDescription className="mt-1 truncate">Clients needing action appear first.</CardDescription>
              </div>
              {/* No client picker here: the header's "Working on" is this list's client filter. */}
              <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                <div className="relative sm:w-64">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input aria-label="Search clients" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients" className="pl-9" />
                </div>
                <Select value={status} onValueChange={(value) => setStatus(value as ClientStatusFilter)}>
                  <SelectTrigger aria-label="Filter clients by status" className="sm:w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Active and paused</SelectItem>
                    <SelectItem value="active">Active clients</SelectItem>
                    <SelectItem value="paused">Paused clients</SelectItem>
                    <SelectItem value="churned">Churned clients</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-6 sm:pb-6">
              {filtered.length === 0 ? (
                <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
                  <Users className="h-9 w-9 text-muted-foreground/50" />
                  <p className="mt-3 font-medium">No clients match this view</p>
                  <p className="mt-1 text-sm text-muted-foreground">Try another filter or search term.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((rollup) => (
                    <ClientPipelineRow key={rollup.client.id} rollup={rollup} baseHref={baseHref} canManage={canManage} onOpenItem={onOpenItem} />
                  ))}
                </div>
              )}
              {churned.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 text-muted-foreground"
                    aria-expanded={churnedOpen}
                    aria-controls="pipeline-churned-clients"
                    onClick={() => setChurnedOpen((current) => !current)}
                  >
                    <ChevronDown className={`transition-transform ${churnedOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    Churned ({churned.length})
                  </Button>
                  {churnedOpen && (
                    <div id="pipeline-churned-clients" className="mt-2 space-y-2">
                      {churned.map((rollup) => (
                        <ClientPipelineRow key={rollup.client.id} rollup={rollup} baseHref={baseHref} canManage={canManage} onOpenItem={onOpenItem} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-2xl font-semibold leading-none tracking-tight">Needs attention</h2>
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
          <div className="flex flex-wrap gap-2"><Button asChild><Link to={`${baseHref}/podcast-finder`}><Search className="mr-2 h-4 w-4" />Find podcasts</Link></Button></div>
        </div>

        {systemQuery.isLoading ? (
          <Card><CardContent className="flex min-h-80 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">Building the pipeline…</span></CardContent></Card>
        ) : systemQuery.error || !system ? (
          <Card className="border-destructive/30"><CardContent className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><AlertCircle className="h-9 w-9 text-destructive" /><h2 className="mt-4 text-lg font-semibold">Pipeline unavailable</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{systemQuery.error instanceof Error ? systemQuery.error.message : 'The workspace pipeline could not be loaded.'}</p><Button type="button" variant="outline" className="mt-4" onClick={() => void systemQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></CardContent></Card>
        ) : system.clients.length === 0 ? (
          <Card><CardContent className="flex min-h-80 flex-col items-center justify-center px-6 text-center"><Users className="h-10 w-10 text-muted-foreground/50" /><h2 className="mt-4 text-xl font-semibold">No clients in this workspace yet</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Create the first client account to start onboarding, building a guest profile, and finding podcast opportunities.</p><Button asChild className="mt-5"><Link to={`${baseHref}/clients`}>Open Clients</Link></Button></CardContent></Card>
        ) : (
          <>
          {system.truncated && (
            <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This workspace has more pipeline records than can be loaded at once, so only the most recent are shown. Open a client to see their full history.
            </p>
          )}
          <AllClientsView
            rollups={rollups}
            items={system.items}
            baseHref={baseHref}
            canManage={canManage}
            focusClientId={focusRollup?.client.id || null}
            onChooseClient={chooseClient}
            onOpenItem={setSelectedItemId}
          />
          </>
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
