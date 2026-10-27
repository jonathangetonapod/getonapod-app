import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Activity,
  BookUser,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  NotebookPen,
  PhoneCall,
  Plus,
  Search,
  ShieldCheck,
  UserRoundPlus,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { OutreachSuppressionsDialog } from '@/components/workspace/OutreachSuppressionsDialog'
import {
  EditShowDetailsDialog,
  SnoozeUntilDialog,
  type ShowDetails,
} from '@/components/workspace/RelationshipEditDialogs'
import { RelationshipRow } from '@/components/workspace/RelationshipRow'
import {
  WorkspaceLayout,
  type PlatformWorkspaceConfig,
} from '@/components/workspace/WorkspaceLayout'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/contexts/AuthContext'
import { decodeFeedText } from '@/lib/feedText'
import {
  RELATIONSHIP_STAGES,
  autoStage,
  manualStage,
  relationshipStage,
  relationshipTitle,
  stageLabel,
  type RelationshipNextStep,
  type RelationshipStage,
} from '@/lib/relationshipLabels'
import {
  FOLLOW_UP_AFTER_DAYS,
  followUpOverdue,
  lastMessageSender,
  needsAttention,
  relativeTime,
} from '@/lib/relationshipAttention'
import { sortRelationships, type RelationshipSort } from '@/lib/relationshipSort'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref, workspaceModuleHref } from '@/lib/workspaceRoutes'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients } from '@/services/clients'
import {
  addHostRelationshipNote,
  createHostRelationship,
  dismissHostRelationship,
  getHostRelationship,
  linkHostRelationshipClient,
  listHostRelationshipsPage,
  saveHostRelationship,
  unlinkHostRelationshipClient,
  type HostRelationshipClientIntent,
  type HostRelationshipManualStage,
  type HostRelationshipSummary,
} from '@/services/hostRelationships'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// The book grows with every host the agency ever contacts, and folding the
// legacy outreach ledger in took this workspace from 1 row to 106 in a day.
// Ten large cards per page meant eleven pages to scroll; a denser row lets a
// page hold enough to actually scan.
const RELATIONSHIPS_PER_PAGE = 25

type NoteKind = 'note' | 'call' | 'meeting'
type RelationshipFilter = 'all' | 'needs_attention' | 'follow_up_overdue' | RelationshipStage

/** The filters that matter day to day, as tabs. The rest of the stages sit in a dropdown. */
const FILTER_TABS = ['all', 'needs_attention', 'in_conversation', 'follow_up_overdue', 'placed'] as const
const DROPDOWN_STAGES = RELATIONSHIP_STAGES.filter((stage) => !(FILTER_TABS as readonly string[]).includes(stage))
type RelationshipView = 'overview' | 'notes' | 'threads' | 'activity'
type SaveState = 'idle' | 'saving' | 'saved'

interface RelationshipActivityItem {
  id: string
  kind: 'note' | 'call' | 'meeting' | 'stage_change' | 'system' | 'email'
  title: string
  body: string | null
  occurredAt: string
  clientName: string | null
  campaignName: string | null
  sendStatus: string | null
}

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
}

/**
 * Campaign names carry their send status as a prefix, as in
 * "(failed) Titan | (Sunnova, Mosaic)". Split it so the status never reads
 * inline as if it were the activity itself.
 */
function splitCampaign(name: string | null): { campaignName: string | null; sendStatus: string | null } {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return { campaignName: null, sendStatus: null }
  const match = /^\(([a-z _-]+)\)\s*(.*)$/iu.exec(trimmed)
  return match
    ? { campaignName: match[2] || null, sendStatus: match[1].toLowerCase() }
    : { campaignName: trimmed, sendStatus: null }
}

const EVENT_TITLES: Record<Exclude<RelationshipActivityItem['kind'], 'email'>, string> = {
  note: 'Internal note added',
  call: 'Call logged',
  meeting: 'Meeting logged',
  stage_change: 'Stage changed',
  system: 'Relationship updated',
}

const FILTER_LABELS: Record<RelationshipFilter, string> = {
  all: 'All',
  needs_attention: 'Needs attention',
  follow_up_overdue: 'Follow-up overdue',
  new: stageLabel('new'),
  pitched: stageLabel('pitched'),
  in_conversation: stageLabel('in_conversation'),
  nurturing: stageLabel('nurturing'),
  placed: stageLabel('placed'),
  not_a_fit: stageLabel('not_a_fit'),
  do_not_contact: stageLabel('do_not_contact'),
}

function ActivityItemView({ item, compact = false }: { item: RelationshipActivityItem; compact?: boolean }) {
  const Icon = item.kind === 'email'
    ? Mail
    : item.kind === 'call'
      ? PhoneCall
      : item.kind === 'meeting'
        ? CalendarDays
        : item.kind === 'note'
          ? NotebookPen
          : Activity
  const meta = [item.clientName, formatDate(item.occurredAt)].filter(Boolean).join(' · ')
  const details = [
    item.campaignName ? `Campaign: ${item.campaignName}` : null,
    item.sendStatus ? `Send status: ${item.sendStatus}` : null,
  ].filter(Boolean)
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <p className="text-sm font-medium">{item.title}</p>
        {details.length > 0
          ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <p tabIndex={0} className="mt-0.5 w-fit cursor-default text-xs text-muted-foreground underline decoration-dotted underline-offset-2">
                  {meta}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {details.map((line) => <p key={line}>{line}</p>)}
              </TooltipContent>
            </Tooltip>
          )
          : <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
        {item.body && (
          <p className={`mt-1.5 whitespace-pre-wrap text-sm leading-6 text-foreground/80 ${compact ? 'line-clamp-2' : ''}`}>
            {item.body}
          </p>
        )}
      </div>
    </div>
  )
}

function matchesFilter(row: HostRelationshipSummary, filter: RelationshipFilter, now: Date): boolean {
  if (filter === 'all') return true
  if (filter === 'needs_attention') return needsAttention(row, now)
  if (filter === 'follow_up_overdue') return followUpOverdue(row, now)
  return relationshipStage(row) === filter
}

/**
 * What an empty filter says, and the one thing to do instead. An empty
 * Needs attention list is good news and reads that way.
 */
const EMPTY_FILTER: Partial<Record<RelationshipFilter, { title: string; body: string; action: 'pitch' | 'all' }>> = {
  needs_attention: {
    title: 'No hosts need attention. Nice.',
    body: 'Nobody is waiting on a reply and no follow-up is overdue. A good time to pitch someone new.',
    action: 'pitch',
  },
  follow_up_overdue: {
    title: 'No follow-ups overdue.',
    body: `Every pitch has a reply or is under ${FOLLOW_UP_AFTER_DAYS} days old.`,
    action: 'all',
  },
  in_conversation: {
    title: 'No live conversations right now.',
    body: 'Conversations show here once a host replies to a pitch.',
    action: 'pitch',
  },
  placed: {
    title: 'No placements yet.',
    body: 'Hosts you place a client with show here.',
    action: 'pitch',
  },
}

const FilterEmptyState = ({
  filter,
  search,
  pitchHref,
  onClearSearch,
  onShowAll,
}: {
  filter: RelationshipFilter
  search: string
  pitchHref: string
  onClearSearch: () => void
  onShowAll: () => void
}) => {
  const copy = search
    ? { title: `No hosts match "${search}".`, body: 'Search covers show names, hosts, emails and clients.', action: 'search' as const }
    : EMPTY_FILTER[filter] ?? {
      title: `No hosts at ${FILTER_LABELS[filter]}.`,
      body: 'Nothing in the book is at this stage right now.',
      action: 'all' as const,
    }
  return (
    <Card>
      <CardContent className="flex flex-col items-center p-8 text-center">
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{copy.body}</p>
        <div className="mt-4">
          {copy.action === 'search' && <Button type="button" size="sm" variant="outline" onClick={onClearSearch}>Clear search</Button>}
          {copy.action === 'all' && <Button type="button" size="sm" variant="outline" onClick={onShowAll}>Show all hosts</Button>}
          {copy.action === 'pitch' && (
            <Button asChild size="sm">
              <Link to={pitchHref}>Pitch a client</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface WorkspaceRelationshipsProps {
  platformWorkspaceId?: string
}

const WorkspaceRelationships = ({ platformWorkspaceId }: WorkspaceRelationshipsProps) => {
  const { isPlatformAdmin, membership, user, workspace } = useAuth()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const workspaceId = (isPlatformWorkspace ? selectedWorkspaceId : workspace?.id || '').toLowerCase()
  const validWorkspaceId = UUID_PATTERN.test(workspaceId)
  const canManage = Boolean(
    isPlatformWorkspace
    || isPlatformAdmin
    || membership?.role === 'owner'
    || membership?.role === 'admin',
  )
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [relationshipFilter, setRelationshipFilter] = useState<RelationshipFilter>('all')
  const [relationshipSort, setRelationshipSort] = useState<RelationshipSort>('attention')
  const [relationshipPage, setRelationshipPage] = useState(1)
  const [openPodcastId, setOpenPodcastId] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<RelationshipView>('overview')
  const [threadSearch, setThreadSearch] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [noteKind, setNoteKind] = useState<NoteKind>('note')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [summaryState, setSummaryState] = useState<SaveState>('idle')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [clientIntent, setClientIntent] = useState<HostRelationshipClientIntent>('considering')
  const [focusClientPicker, setFocusClientPicker] = useState(false)
  const [confirmDoNotContact, setConfirmDoNotContact] = useState<{ podcastId: string; title: string } | null>(null)
  const [snoozeTarget, setSnoozeTarget] = useState<{ podcastId: string; title: string } | null>(null)
  const [editTarget, setEditTarget] = useState<{ podcastId: string; details: ShowDetails } | null>(null)
  const [confirmUnlink, setConfirmUnlink] = useState<{ podcastId: string; clientId: string; name: string } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [suppressionsOpen, setSuppressionsOpen] = useState(false)
  const [newShowName, setNewShowName] = useState('')
  const [newHostName, setNewHostName] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [newStage, setNewStage] = useState<RelationshipStage>('nurturing')
  const [newSummary, setNewSummary] = useState('')
  const clientPickerRef = useRef<HTMLButtonElement>(null)

  const selectedWorkspaceQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace', selectedWorkspaceId, 'relationships'],
    queryFn: ({ signal }) => getAdminWorkspaceView(selectedWorkspaceId, signal),
    enabled: isPlatformWorkspace && validWorkspaceId,
    retry: false,
    gcTime: 0,
  })
  const selectedWorkspaceReady = !isPlatformWorkspace || Boolean(selectedWorkspaceQuery.data?.workspace)
  // Paged from the server. The book used to stop at 500 rows without saying
  // so; now each page carries the whole-book total and state counts, and the
  // rest loads on request.
  const bookQuery = useInfiniteQuery({
    queryKey: ['host-relationships', workspaceId, 'book'],
    queryFn: ({ pageParam }) => listHostRelationshipsPage(workspaceId, { offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.has_more && lastPage.next_offset !== null ? lastPage.next_offset : undefined),
    enabled: validWorkspaceId && selectedWorkspaceReady,
    retry: false,
  })
  const detailQuery = useQuery({
    queryKey: ['host-relationship', workspaceId, openPodcastId],
    queryFn: () => getHostRelationship(workspaceId, openPodcastId!),
    enabled: validWorkspaceId && selectedWorkspaceReady && Boolean(openPodcastId),
    retry: false,
  })
  const tenantClientsQuery = useQuery({
    queryKey: ['host-relationships', workspaceId, 'clients'],
    queryFn: () => getWorkspaceClients(workspaceId),
    enabled: validWorkspaceId && selectedWorkspaceReady && canManage && !isPlatformWorkspace && Boolean(openPodcastId),
    retry: false,
  })

  // Stable identity so the derived memos below only recompute on new data.
  const relationships = useMemo(
    () => bookQuery.data?.pages.flatMap((page) => page.relationships) ?? [],
    [bookQuery.data],
  )
  const firstBookPage = bookQuery.data?.pages[0]
  const bookTotal = firstBookPage?.total ?? relationships.length
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const now = new Date()
    return relationships.filter((row) => (
      matchesFilter(row, relationshipFilter, now)
      && (
        !term
        || decodeFeedText(row.podcast_name ?? '').toLowerCase().includes(term)
        || decodeFeedText(row.host_name ?? '').toLowerCase().includes(term)
        || (row.contact_email ?? '').toLowerCase().includes(term)
        || (row.client_names ?? []).some((name) => name.toLowerCase().includes(term))
      )
    ))
  }, [relationshipFilter, relationships, search])
  const sorted = useMemo(() => sortRelationships(filtered, relationshipSort), [filtered, relationshipSort])
  const relationshipPageCount = Math.max(1, Math.ceil(sorted.length / RELATIONSHIPS_PER_PAGE))
  const currentRelationshipPage = Math.min(relationshipPage, relationshipPageCount)
  const relationshipPageStart = (currentRelationshipPage - 1) * RELATIONSHIPS_PER_PAGE
  const visibleRelationships = sorted.slice(
    relationshipPageStart,
    relationshipPageStart + RELATIONSHIPS_PER_PAGE,
  )

  // Opening a row that the current page, search, or filter hides showed
  // nothing: the card only renders inside the visible slice, while the detail
  // request still ran for it. A freshly added relationship sorts last (it has
  // no outreach yet) and a banner item can point past the active filter.
  // Widen the view once per opened row until it is on screen; paging away
  // afterwards is left alone.
  const revealedPodcastIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!openPodcastId) {
      revealedPodcastIdRef.current = null
      return
    }
    if (revealedPodcastIdRef.current === openPodcastId) return
    if (!relationships.some((row) => row.podcast_id === openPodcastId)) return
    if (visibleRelationships.some((row) => row.podcast_id === openPodcastId)) {
      revealedPodcastIdRef.current = openPodcastId
      return
    }
    const index = sorted.findIndex((row) => row.podcast_id === openPodcastId)
    if (index === -1) {
      setSearch('')
      setRelationshipFilter('all')
      return
    }
    revealedPodcastIdRef.current = openPodcastId
    setRelationshipPage(Math.floor(index / RELATIONSHIPS_PER_PAGE) + 1)
  }, [openPodcastId, relationships, sorted, visibleRelationships])

  // "Pitch" lands on the client picker, once the panel has drawn it.
  useEffect(() => {
    if (!focusClientPicker || !detailQuery.data) return
    clientPickerRef.current?.focus()
    clientPickerRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFocusClientPicker(false)
  }, [detailQuery.data, focusClientPicker])

  // Needs attention and Follow-up overdue depend on the clock, so they are
  // counted over the rows loaded. In conversation and Placed are whole-book
  // figures from the server, so the tabs are right before every page loads.
  const tabCounts = useMemo(() => {
    const now = new Date()
    return {
      all: bookTotal,
      needs_attention: relationships.filter((row) => needsAttention(row, now)).length,
      in_conversation: firstBookPage?.counts.in_conversation ?? 0,
      follow_up_overdue: relationships.filter((row) => followUpOverdue(row, now)).length,
      placed: firstBookPage?.counts.booked ?? 0,
    }
  }, [bookTotal, firstBookPage, relationships])

  const applyFilter = (filter: RelationshipFilter) => {
    setRelationshipFilter(filter)
    setRelationshipPage(1)
    setOpenPodcastId(null)
  }

  const invalidate = (podcastId: string) => {
    // The book only: the bare prefix also matched this page's client list.
    void queryClient.invalidateQueries({ queryKey: ['host-relationships', workspaceId, 'book'] })
    void queryClient.invalidateQueries({ queryKey: ['host-relationship', workspaceId, podcastId] })
  }
  const noteMutation = useMutation({
    mutationFn: (input: { podcastId: string; body: string; kind: NoteKind }) => (
      addHostRelationshipNote(workspaceId, input)
    ),
    onSuccess: (_result, input) => {
      setNoteDraft('')
      setNoteKind('note')
      toast.success('Interaction added to this relationship.')
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The interaction could not be saved.'),
  })
  const summaryMutation = useMutation({
    mutationFn: (input: { podcastId: string; summary: string }) => saveHostRelationship(workspaceId, input),
    onMutate: () => setSummaryState('saving'),
    onSuccess: (_result, input) => {
      setSummaryState('saved')
      invalidate(input.podcastId)
    },
    onError: (error) => {
      setSummaryState('idle')
      toast.error(error instanceof Error ? error.message : 'The notes could not be saved.')
    },
  })
  const stageMutation = useMutation({
    mutationFn: (input: { podcastId: string; manualStage: HostRelationshipManualStage | null }) => (
      saveHostRelationship(workspaceId, input)
    ),
    onSuccess: (_result, input) => {
      toast.success(input.manualStage === 'do_not_contact'
        ? 'Marked as do not contact. New pitches to this host are blocked.'
        : input.manualStage === 'placed'
          ? 'Marked placed.'
          : input.manualStage === 'not_a_fit' ? 'Marked not a fit.' : 'Stage updated.')
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The stage could not be saved.'),
  })
  const renameMutation = useMutation({
    mutationFn: (input: { podcastId: string; podcastName: string }) => saveHostRelationship(workspaceId, input),
    onSuccess: (_result, input) => {
      toast.success('Show name saved.')
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The show name could not be saved.'),
  })
  const snoozeMutation = useMutation({
    mutationFn: (input: { podcastId: string; snoozedUntil: string | null }) => saveHostRelationship(workspaceId, input),
    onSuccess: (_result, input) => {
      setSnoozeTarget(null)
      toast.success(input.snoozedUntil
        ? `Snoozed until ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(input.snoozedUntil))}.`
        : 'Snooze cleared.')
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The snooze could not be saved.'),
  })
  const detailsMutation = useMutation({
    mutationFn: (input: { podcastId: string; details: ShowDetails }) => saveHostRelationship(workspaceId, {
      podcastId: input.podcastId,
      podcastName: input.details.podcastName.trim() || null,
      hostName: input.details.hostName.trim() || null,
      contactEmail: input.details.contactEmail.trim() || null,
    }),
    onSuccess: (_result, input) => {
      setEditTarget(null)
      toast.success('Show details saved.')
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The show details could not be saved.'),
  })
  const dismissMutation = useMutation({
    mutationFn: ({ podcastId, dismissed }: { podcastId: string; dismissed: boolean; title: string }) => (
      dismissHostRelationship(workspaceId, { podcastId, dismissed })
    ),
    onSuccess: (_result, input) => {
      if (input.dismissed) {
        if (openPodcastId === input.podcastId) setOpenPodcastId(null)
        toast.success(`${input.title} removed. It won't be added back.`, {
          action: {
            label: 'Undo',
            onClick: () => dismissMutation.mutate({ ...input, dismissed: false }),
          },
        })
      } else {
        toast.success(`${input.title} restored.`)
      }
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The host could not be removed.'),
  })
  const clientMutation = useMutation({
    mutationFn: (input: { podcastId: string; clientId: string; intent: HostRelationshipClientIntent }) => (
      linkHostRelationshipClient(workspaceId, input)
    ),
    onSuccess: (_result, input) => {
      setSelectedClientId('')
      setClientIntent('considering')
      toast.success('Client added to this host.')
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The client could not be added.'),
  })
  const unlinkMutation = useMutation({
    mutationFn: (input: { podcastId: string; clientId: string }) => (
      unlinkHostRelationshipClient(workspaceId, input)
    ),
    onSuccess: (_result, input) => {
      toast.success('Client removed from this host.')
      invalidate(input.podcastId)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The client could not be removed from this host.'),
  })
  const createMutation = useMutation({
    mutationFn: () => createHostRelationship(workspaceId, {
      podcastName: newShowName.trim() || null,
      hostName: newHostName.trim() || null,
      contactEmail: newContactEmail.trim() || null,
      // For a host nobody has contacted, New is what activity already says;
      // storing it would pin the host at New after the first pitch.
      manualStage: newStage === 'new' ? null : newStage,
      summary: newSummary.trim() || null,
    }),
    onSuccess: (result) => {
      const summary = newSummary.trim()
      setAddOpen(false)
      setNewShowName('')
      setNewHostName('')
      setNewContactEmail('')
      setNewStage('nurturing')
      setNewSummary('')
      setOpenPodcastId(result.podcast_id)
      setActiveView('overview')
      setThreadSearch('')
      setSummaryDraft(summary)
      setSummaryState('idle')
      toast.success(result.created ? 'Host added.' : 'That host was already here, so we updated it.')
      invalidate(result.podcast_id)
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'The host could not be added.'),
  })

  const openRow = relationships.find((row) => row.podcast_id === openPodcastId) ?? null
  const detail = detailQuery.data ?? null
  const clients = isPlatformWorkspace
    ? selectedWorkspaceQuery.data?.clients ?? []
    : tenantClientsQuery.data ?? []
  const activeClients = clients.filter((client) => client.status === 'active')
  const internalNotes = detail?.events.filter((event) => ['note', 'call', 'meeting'].includes(event.kind)) ?? []
  const threadTerm = threadSearch.trim().toLowerCase()
  const visibleThreads = (detail?.threads ?? []).filter((thread) => (
    !threadTerm
    || [
      thread.subject,
      thread.client_name,
      thread.campaign_name,
      thread.from_email,
      thread.lead_email,
      thread.latest_message_body,
    ].filter(Boolean).join(' ').toLowerCase().includes(threadTerm)
  ))
  const clientNames = new Map((detail?.clients ?? []).map((client) => [client.client_id, client.client_name]))
  const activityItems: RelationshipActivityItem[] = [
    ...(detail?.events ?? []).map((event) => ({
      id: `event:${event.id}`,
      kind: event.kind,
      title: EVENT_TITLES[event.kind],
      body: event.body,
      occurredAt: event.occurred_at,
      clientName: event.client_id ? clientNames.get(event.client_id) ?? null : null,
      campaignName: null,
      sendStatus: null,
    })),
    ...(detail?.threads ?? []).map((thread) => ({
      id: `thread:${thread.thread_key}`,
      kind: 'email' as const,
      title: thread.subject || 'Inbox conversation saved',
      body: thread.latest_message_body,
      occurredAt: thread.latest_message_at || thread.updated_at,
      clientName: thread.client_name,
      ...splitCampaign(thread.campaign_name),
    })),
  ].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))

  const baseHref = isPlatformWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
  const selectedWorkspace = selectedWorkspaceQuery.data?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceId,
        workspaceName: selectedWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          selectedWorkspace?.id,
          selectedWorkspace?.logo_path,
          selectedWorkspace?.logo_updated_at,
        ),
        baseHref,
      }
    : undefined

  const openRelationship = (podcastId: string | null, view: RelationshipView = 'overview') => {
    const row = relationships.find((item) => item.podcast_id === podcastId)
    setOpenPodcastId(podcastId)
    setActiveView(view)
    setThreadSearch('')
    setSummaryDraft(row?.summary ?? '')
    setSummaryState('idle')
    setNoteDraft('')
    setNoteKind('note')
    setSelectedClientId('')
    setClientIntent('considering')
  }
  const handleNextStep = (row: HostRelationshipSummary, step: RelationshipNextStep) => {
    if (step === 'pitch') {
      openRelationship(row.podcast_id)
      if (canManage) {
        setClientIntent('pitched')
        setFocusClientPicker(true)
      }
      return
    }
    // A conversation opens what we have saved.
    openRelationship(row.podcast_id, step === 'conversation' ? 'threads' : 'overview')
  }
  const saveSummary = (podcastId: string) => {
    if (summaryDraft === (openRow?.summary ?? '') || summaryMutation.isPending) return
    summaryMutation.mutate({ podcastId, summary: summaryDraft })
  }

  if (isPlatformWorkspace && selectedWorkspaceQuery.isLoading && validWorkspaceId) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </WorkspaceLayout>
    )
  }

  if (!validWorkspaceId || (isPlatformWorkspace && (selectedWorkspaceQuery.error || !selectedWorkspace))) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card>
          <CardHeader>
            <CardTitle>Workspace unavailable</CardTitle>
            <CardDescription>
              {selectedWorkspaceQuery.error instanceof Error
                ? selectedWorkspaceQuery.error.message
                : 'Your account does not have an active workspace.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </WorkspaceLayout>
    )
  }

  const bookEmpty = !bookQuery.isLoading && !bookQuery.error && relationships.length === 0
  const canAdd = Boolean(newShowName.trim() || newContactEmail.trim())

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <BookUser className="h-6 w-6 text-primary" />Relationships
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every host you pitch, who needs a reply, and what they last said.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {canManage && !bookEmpty && (
              <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />Add relationship
              </Button>
            )}
          </div>
        </div>

        {!canManage && (
          <div className="flex gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>You can use the relationship history while planning pitches. Owners and admins curate stages, notes, and client associations.</p>
          </div>
        )}

        {!bookEmpty && (
          <div className="space-y-3">
            {/* Toggle buttons rather than ARIA tabs: they filter one list
                instead of switching between panels. */}
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="inline-flex min-w-max gap-1 rounded-lg border bg-muted/30 p-1" role="group" aria-label="Filter by status">
                {FILTER_TABS.map((filter) => {
                  const active = relationshipFilter === filter
                  return (
                    <button
                      key={filter}
                      type="button"
                      aria-pressed={active}
                      onClick={() => applyFilter(filter)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {FILTER_LABELS[filter]}{' '}
                      {!bookQuery.isLoading && (
                        <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                          {tabCounts[filter]}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex max-w-2xl flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search relationships"
                  placeholder="Search shows, hosts, emails, or clients"
                  className="pl-9"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setRelationshipPage(1)
                    setOpenPodcastId(null)
                  }}
                />
              </div>
              <Select
                value={(DROPDOWN_STAGES as string[]).includes(relationshipFilter) ? relationshipFilter : ''}
                onValueChange={(value) => applyFilter(value as RelationshipFilter)}
              >
                <SelectTrigger aria-label="Other stages" className="w-full sm:w-44"><SelectValue placeholder="Other stages" /></SelectTrigger>
                <SelectContent>
                  {DROPDOWN_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>{FILTER_LABELS[stage]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={relationshipSort}
                onValueChange={(value) => {
                  setRelationshipSort(value as RelationshipSort)
                  setRelationshipPage(1)
                  setOpenPodcastId(null)
                }}
              >
                <SelectTrigger aria-label="Sort relationships" className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="attention">Needs attention first</SelectItem>
                  <SelectItem value="recent">Recent contact</SelectItem>
                  <SelectItem value="show">Show name A–Z</SelectItem>
                  <SelectItem value="host">Host name A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {relationshipFilter === 'follow_up_overdue' && (
              <p className="text-sm text-muted-foreground">
                Pitches and conversations where you wrote last and have had no reply in {FOLLOW_UP_AFTER_DAYS} days or more.
              </p>
            )}
          </div>
        )}

        {relationshipFilter === 'do_not_contact' && (
          <p className="text-sm text-muted-foreground">
            Blocked addresses that are not in the book are on the{' '}
            <button type="button" className="font-medium text-primary hover:underline" onClick={() => setSuppressionsOpen(true)}>
              do-not-contact list
            </button>.
          </p>
        )}

        {bookQuery.isLoading && (
          <div className="flex items-center gap-2 rounded-xl border p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading the relationship book…
          </div>
        )}
        {bookQuery.error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-destructive">The relationship book could not be loaded.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void bookQuery.refetch()}>Try again</Button>
            </CardContent>
          </Card>
        )}
        {bookEmpty && (
          <Card>
            <CardContent className="flex flex-col items-center p-10 text-center">
              <h2 className="text-base font-semibold">No hosts yet</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Add the hosts you're working with. Only hosts someone adds appear here.
              </p>
              {canManage && (
                <Button type="button" size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />Add relationship
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        {!bookQuery.isLoading && !bookQuery.error && !bookEmpty && filtered.length === 0 && (
          <FilterEmptyState
            filter={relationshipFilter}
            search={search.trim()}
            pitchHref={workspaceModuleHref(baseHref, 'clients')}
            onClearSearch={() => setSearch('')}
            onShowAll={() => applyFilter('all')}
          />
        )}

        <div className="space-y-2">
          {visibleRelationships.map((row: HostRelationshipSummary) => {
            const open = row.podcast_id === openPodcastId
            const { title } = relationshipTitle(row)
            const storedStage = manualStage(row.manual_stage)
            const shownStage = relationshipStage(row)
            return (
              <Card
                key={row.podcast_id}
                className={open ? 'overflow-hidden border-primary/40 ring-1 ring-primary/10' : 'transition-colors hover:bg-muted/20'}
              >
                <div className="p-3">
                  <RelationshipRow
                    row={row}
                    open={open}
                    canManage={canManage}
                    onToggle={() => openRelationship(open ? null : row.podcast_id)}
                    onNextStep={(step) => handleNextStep(row, step)}
                    onRename={async (podcastName) => {
                      await renameMutation.mutateAsync({ podcastId: row.podcast_id, podcastName })
                    }}
                    onSnooze={(days) => snoozeMutation.mutate({
                      podcastId: row.podcast_id,
                      snoozedUntil: days === null ? null : new Date(Date.now() + days * 86_400_000).toISOString(),
                    })}
                    onSnoozeUntil={() => setSnoozeTarget({ podcastId: row.podcast_id, title })}
                    onSetStage={(stage) => stageMutation.mutate({ podcastId: row.podcast_id, manualStage: stage })}
                    onEditDetails={() => setEditTarget({
                      podcastId: row.podcast_id,
                      details: {
                        podcastName: decodeFeedText(row.podcast_name ?? ''),
                        hostName: decodeFeedText(row.host_name ?? ''),
                        contactEmail: row.contact_email ?? '',
                      },
                    })}
                    onDismiss={() => dismissMutation.mutate({ podcastId: row.podcast_id, dismissed: true, title })}
                    onMarkDoNotContact={() => setConfirmDoNotContact({ podcastId: row.podcast_id, title })}
                  />
                </div>

                {open && (
                  <CardContent className="space-y-5 border-t pt-4">
                    {detailQuery.isLoading && (
                      <div className="space-y-4" role="status" aria-label="Loading history">
                        <Skeleton className="h-9 w-72 max-w-full" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    )}
                    {detailQuery.error && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                        <p className="text-sm text-destructive">The relationship history could not be loaded.</p>
                        <Button type="button" variant="outline" size="sm" onClick={() => void detailQuery.refetch()}>Try again</Button>
                      </div>
                    )}
                    {detail && (
                      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as RelationshipView)}>
                        <div className="overflow-x-auto border-b">
                          <TabsList aria-label="Relationship CRM sections" className="h-auto min-w-max justify-start bg-transparent p-0">
                            <TabsTrigger value="overview" className="rounded-b-none">Overview</TabsTrigger>
                            <TabsTrigger value="notes" className="rounded-b-none">
                              Notes <span className="ml-1 text-muted-foreground">{internalNotes.length}</span>
                            </TabsTrigger>
                            <TabsTrigger value="threads" className="rounded-b-none">
                              Threads <span className="ml-1 text-muted-foreground">{detail.threads.length}</span>
                            </TabsTrigger>
                            <TabsTrigger value="activity" className="rounded-b-none">
                              Activity <span className="ml-1 text-muted-foreground">{activityItems.length}</span>
                            </TabsTrigger>
                          </TabsList>
                        </div>

                        <TabsContent value="overview" className="mt-5 space-y-6">
                        <section className="rounded-xl border bg-muted/10 p-4" aria-labelledby={`last-message-${row.podcast_id}`}>
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 id={`last-message-${row.podcast_id}`} className="text-sm font-medium">Last message</h3>
                            {row.last_message_body && (
                              <p className="text-xs text-muted-foreground">
                                {[lastMessageSender(row), relativeTime(row.last_message_at ?? row.last_contacted_at)].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                          {row.last_message_body
                            ? <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-foreground/80">{row.last_message_body}</p>
                            : <p className="mt-2 text-sm text-muted-foreground">No message saved for this host yet.</p>}
                          {detail.threads.length > 0 && (
                            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setActiveView('threads')}>
                              View conversation
                            </Button>
                          )}
                        </section>

                        <section className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="relationship-summary">What we know about this host</Label>
                            {summaryState !== 'idle' && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
                                {summaryState === 'saving'
                                  ? <><Loader2 className="h-3 w-3 animate-spin" />Saving…</>
                                  : <><Check className="h-3 w-3" />Saved</>}
                              </span>
                            )}
                          </div>
                          {canManage
                            ? (
                              <Textarea
                                id="relationship-summary"
                                value={summaryDraft}
                                onChange={(event) => {
                                  setSummaryDraft(event.target.value)
                                  setSummaryState('idle')
                                }}
                                onBlur={() => saveSummary(row.podcast_id)}
                                placeholder="How they prefer to be pitched, what they cover, anything worth remembering next time."
                                className="min-h-24 resize-y"
                                maxLength={5_000}
                              />
                            )
                            : (
                              <p id="relationship-summary" className="whitespace-pre-wrap text-sm leading-6">
                                {row.summary || 'Nothing recorded yet.'}
                              </p>
                            )}
                        </section>

                        <section className="max-w-sm space-y-2">
                          <Label htmlFor="relationship-stage">Stage</Label>
                          {canManage
                            ? (
                              <>
                                <Select
                                  value={storedStage ?? 'auto'}
                                  disabled={stageMutation.isPending}
                                  onValueChange={(value) => {
                                    if (value === 'do_not_contact') {
                                      setConfirmDoNotContact({ podcastId: row.podcast_id, title })
                                      return
                                    }
                                    stageMutation.mutate({
                                      podcastId: row.podcast_id,
                                      manualStage: value === 'auto' ? null : value as HostRelationshipManualStage,
                                    })
                                  }}
                                >
                                  <SelectTrigger id="relationship-stage"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="auto">Auto (currently: {stageLabel(autoStage(row.derived_state))})</SelectItem>
                                    {RELATIONSHIP_STAGES.map((stage) => (
                                      <SelectItem key={stage} value={stage}>{stageLabel(stage)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  Auto follows your outreach activity. Pick a stage to override it.
                                </p>
                                {storedStage === 'nurturing' && shownStage !== 'nurturing' && (
                                  <p className="text-xs leading-5 text-muted-foreground">
                                    Showing {stageLabel(shownStage)} because outreach has started.
                                  </p>
                                )}
                              </>
                            )
                            : <p id="relationship-stage" className="text-sm">{stageLabel(shownStage)}</p>}
                        </section>

                        <section>
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Clients on this host <span className="ml-1 font-normal tabular-nums">{detail.clients.length}</span>
                          </h3>
                          {detail.clients.length === 0
                            ? <p className="mt-1.5 text-sm text-muted-foreground">No clients on this host yet.</p>
                            : (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {detail.clients.map((client) => (
                                  <Badge key={client.client_id} variant="secondary" className="gap-1 font-normal">
                                    {client.client_name ?? 'Client'} · {client.intent.replace('_', ' ')}
                                    {canManage && (
                                      <button
                                        type="button"
                                        className="-mr-1 ml-0.5 rounded-full p-0.5 hover:bg-background disabled:opacity-50"
                                        aria-label={`Unlink ${client.client_name ?? 'client'} from this host`}
                                        disabled={unlinkMutation.isPending}
                                        onClick={() => setConfirmUnlink({
                                          podcastId: row.podcast_id,
                                          clientId: client.client_id,
                                          name: client.client_name ?? 'this client',
                                        })}
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    )}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          {canManage && (
                            <div className="mt-3 space-y-2 rounded-xl border bg-muted/10 p-4">
                              <p className="text-sm font-medium">Add a client</p>
                              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
                                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                                  <SelectTrigger ref={clientPickerRef} aria-label="Choose a client"><SelectValue placeholder="Choose a client" /></SelectTrigger>
                                  <SelectContent>
                                    {activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                                <Select value={clientIntent} onValueChange={(value) => setClientIntent(value as HostRelationshipClientIntent)}>
                                  <SelectTrigger aria-label="Choose client intent"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="considering">Considering</SelectItem>
                                    <SelectItem value="pitched">Pitched</SelectItem>
                                    <SelectItem value="placed">Placed</SelectItem>
                                    <SelectItem value="declined">Declined</SelectItem>
                                    <SelectItem value="ruled_out">Ruled out</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={!selectedClientId || clientMutation.isPending}
                                  onClick={() => clientMutation.mutate({
                                    podcastId: row.podcast_id,
                                    clientId: selectedClientId,
                                    intent: clientIntent,
                                  })}
                                >
                                  {clientMutation.isPending
                                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    : <UserRoundPlus className="mr-2 h-4 w-4" />}
                                  Add
                                </Button>
                              </div>
                              {tenantClientsQuery.error && !isPlatformWorkspace && (
                                <p className="text-xs text-destructive">The client list could not be loaded.</p>
                              )}
                            </div>
                          )}
                        </section>

                        <section className="rounded-xl border p-4">
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-sm font-medium">Recent activity</h3>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setActiveView('activity')}>
                              View all <ChevronRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {activityItems.length === 0
                            ? <p className="mt-2 text-sm text-muted-foreground">No activity has been recorded yet.</p>
                            : <div className="mt-3 divide-y">{activityItems.slice(0, 4).map((item) => <ActivityItemView key={item.id} item={item} compact />)}</div>}
                        </section>
                        </TabsContent>

                        <TabsContent value="notes" className="mt-5 space-y-5">
                        {canManage && (
                          <div className="space-y-2">
                            <Label htmlFor="relationship-note">Add an internal note</Label>
                            <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
                              <Select value={noteKind} onValueChange={(value) => setNoteKind(value as NoteKind)}>
                                <SelectTrigger aria-label="Interaction type"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="note">Note</SelectItem>
                                  <SelectItem value="call">Call</SelectItem>
                                  <SelectItem value="meeting">Meeting</SelectItem>
                                </SelectContent>
                              </Select>
                              <Textarea
                                id="relationship-note"
                                value={noteDraft}
                                onChange={(event) => setNoteDraft(event.target.value)}
                                placeholder="Spoke with the producer, asked us to come back in Q3 with an operations guest."
                                className="min-h-20 resize-y"
                                maxLength={5_000}
                              />
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={noteMutation.isPending || !noteDraft.trim()}
                              onClick={() => noteMutation.mutate({
                                podcastId: row.podcast_id,
                                body: noteDraft.trim(),
                                kind: noteKind,
                              })}
                            >
                              {noteMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                              {noteKind === 'note' ? 'Save note' : noteKind === 'call' ? 'Log call' : 'Log meeting'}
                            </Button>
                          </div>
                        )}

                        <div>
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">Internal notes</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">Private to your agency workspace.</p>
                            </div>
                            <span className="text-xs text-muted-foreground">{internalNotes.length} total</span>
                          </div>
                          {internalNotes.length === 0
                            ? <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No internal notes yet.</p>
                            : (
                              <div className="mt-3 divide-y rounded-xl border px-4">
                                {internalNotes.map((event) => (
                                  <div key={event.id} className="py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{EVENT_TITLES[event.kind]}</p>
                                      <p className="text-xs text-muted-foreground">{formatDateTime(event.occurred_at)}</p>
                                    </div>
                                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{event.body}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                        </TabsContent>

                        <TabsContent value="threads" className="mt-5 space-y-4">
                        <div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                              <p className="text-sm font-medium">Saved inbox threads</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">Conversations saved to this relationship.</p>
                            </div>
                            {detail.threads.length > 1 && (
                              <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  aria-label="Search saved threads"
                                  value={threadSearch}
                                  onChange={(event) => setThreadSearch(event.target.value)}
                                  placeholder="Search threads"
                                  className="h-9 pl-8"
                                />
                              </div>
                            )}
                          </div>
                          {detail.threads.length === 0
                            ? <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No conversation has been saved yet.</p>
                            : visibleThreads.length === 0
                              ? <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No saved threads match that search.</p>
                            : (
                              <ul className="mt-3 space-y-2">
                                {visibleThreads.map((thread) => (
                                  <li key={thread.thread_key} className="rounded-lg border bg-muted/10 p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{thread.subject || '(no subject)'}</p>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                          {thread.client_name || 'Unassigned client'}
                                          {thread.campaign_name ? ` · ${thread.campaign_name}` : ''}
                                          {(thread.from_email || thread.lead_email) ? ` · ${thread.from_email || thread.lead_email}` : ''}
                                        </p>
                                      </div>
                                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                                        {formatDate(thread.latest_message_at)}
                                      </span>
                                    </div>
                                    {thread.latest_message_body && (
                                      <details className="mt-2 text-sm">
                                        <summary className="cursor-pointer text-xs font-medium text-primary">View saved message</summary>
                                        <p className="mt-2 whitespace-pre-wrap border-l-2 pl-3 leading-6 text-foreground/80">
                                          {thread.latest_message_body}
                                        </p>
                                      </details>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                        </div>
                        </TabsContent>

                        <TabsContent value="activity" className="mt-5">
                        <div>
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">Activity log</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">Internal notes and saved conversations, newest first.</p>
                            </div>
                            <span className="text-xs text-muted-foreground">{activityItems.length} activities</span>
                          </div>
                          {activityItems.length === 0
                            ? <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
                            : (
                              <div className="mt-4 divide-y rounded-xl border px-4 pt-4">
                                {activityItems.map((item) => <ActivityItemView key={item.id} item={item} />)}
                              </div>
                            )}
                        </div>
                        </TabsContent>
                      </Tabs>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>

        {sorted.length > RELATIONSHIPS_PER_PAGE && (
          <nav
            aria-label="Relationship pagination"
            className="flex flex-col gap-3 rounded-xl border bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-muted-foreground">
              Showing {relationshipPageStart + 1}–{Math.min(relationshipPageStart + RELATIONSHIPS_PER_PAGE, sorted.length)} of {sorted.length} relationships
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentRelationshipPage === 1}
                onClick={() => {
                  setRelationshipPage(currentRelationshipPage - 1)
                  setOpenPodcastId(null)
                }}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />Previous
              </Button>
              <span className="min-w-20 text-center text-sm text-muted-foreground">
                Page {currentRelationshipPage} of {relationshipPageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentRelationshipPage === relationshipPageCount}
                onClick={() => {
                  setRelationshipPage(currentRelationshipPage + 1)
                  setOpenPodcastId(null)
                }}
              >
                Next<ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </nav>
        )}

        {bookQuery.hasNextPage && (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {relationships.length} of {bookTotal} relationships loaded. Search, filters and sorting cover the loaded rows.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={bookQuery.isFetchingNextPage}
              onClick={() => void bookQuery.fetchNextPage()}
            >
              {bookQuery.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load more relationships
            </Button>
          </div>
        )}

        <SnoozeUntilDialog
          title={snoozeTarget?.title ?? null}
          saving={snoozeMutation.isPending}
          onOpenChange={(open) => { if (!open) setSnoozeTarget(null) }}
          onSave={(wakeAt) => {
            if (snoozeTarget) snoozeMutation.mutate({ podcastId: snoozeTarget.podcastId, snoozedUntil: wakeAt.toISOString() })
          }}
        />
        <EditShowDetailsDialog
          initial={editTarget?.details ?? null}
          saving={detailsMutation.isPending}
          onOpenChange={(open) => { if (!open) setEditTarget(null) }}
          onSave={(details) => {
            if (editTarget) detailsMutation.mutate({ podcastId: editTarget.podcastId, details })
          }}
        />

        <OutreachSuppressionsDialog
          workspaceId={workspaceId}
          canManage={canManage}
          open={suppressionsOpen}
          onOpenChange={setSuppressionsOpen}
        />

        <AlertDialog open={Boolean(confirmDoNotContact)} onOpenChange={(open) => { if (!open) setConfirmDoNotContact(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Block new pitches to this host?</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmDoNotContact?.title} will be marked do not contact. You can undo this from the stage control.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (confirmDoNotContact) {
                    stageMutation.mutate({ podcastId: confirmDoNotContact.podcastId, manualStage: 'do_not_contact' })
                  }
                  setConfirmDoNotContact(null)
                }}
              >
                Block pitches
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={Boolean(confirmUnlink)} onOpenChange={(open) => { if (!open) setConfirmUnlink(null) }}>
          <AlertDialogContent aria-describedby={undefined}>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {confirmUnlink?.name} from this host?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmUnlink) {
                    unlinkMutation.mutate({ podcastId: confirmUnlink.podcastId, clientId: confirmUnlink.clientId })
                  }
                  setConfirmUnlink(null)
                }}
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-xl">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (canAdd) createMutation.mutate()
              }}
            >
              <DialogHeader>
                <DialogTitle>Add a relationship</DialogTitle>
                <DialogDescription>
                  Add a host you're working with, by show name, email, or both.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="new-relationship-show">
                    Show name <span aria-hidden="true" className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="new-relationship-show"
                    value={newShowName}
                    onChange={(event) => setNewShowName(event.target.value)}
                    placeholder="Show name"
                    maxLength={500}
                    aria-describedby="new-relationship-required"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-relationship-host">Host name</Label>
                  <Input
                    id="new-relationship-host"
                    value={newHostName}
                    onChange={(event) => setNewHostName(event.target.value)}
                    placeholder="Host name"
                    maxLength={300}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-relationship-email">
                    Host email <span aria-hidden="true" className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="new-relationship-email"
                    type="email"
                    value={newContactEmail}
                    onChange={(event) => setNewContactEmail(event.target.value)}
                    placeholder="host@example.com"
                    maxLength={254}
                    aria-describedby="new-relationship-required"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="new-relationship-stage">Stage</Label>
                  <Select value={newStage} onValueChange={(value) => setNewStage(value as RelationshipStage)}>
                    <SelectTrigger id="new-relationship-stage"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIP_STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>{stageLabel(stage)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="new-relationship-summary">Notes</Label>
                  <Textarea
                    id="new-relationship-summary"
                    value={newSummary}
                    onChange={(event) => setNewSummary(event.target.value)}
                    placeholder="What should the team remember about this host?"
                    className="min-h-28 resize-y"
                    maxLength={5_000}
                  />
                </div>
              </div>
              <DialogFooter className="mt-5 sm:items-start">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)} disabled={createMutation.isPending}>Cancel</Button>
                <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                  <Button type="submit" disabled={!canAdd || createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add relationship
                  </Button>
                  <p
                    id="new-relationship-required"
                    className={`text-xs text-muted-foreground ${canAdd ? 'invisible' : ''}`}
                  >
                    Add a show name or a host email to continue.
                  </p>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      </TooltipProvider>
    </WorkspaceLayout>
  )
}

export default WorkspaceRelationships
