import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Mail,
  MessageSquare,
  Mic2,
  Plus,
  Search,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getClientShortlist, type ClientShortlistPodcast } from '@/services/clientShortlist'
import {
  getWorkspaceClientDetail,
  type WorkspaceClient,
  type WorkspaceClientDetail,
} from '@/services/clients'

type CampaignFilter = 'all' | 'attention' | 'draft' | 'active' | 'setup'
type CampaignStatus = 'Needs attention' | 'Draft' | 'Active' | 'Not started'

interface WorkspaceCampaignsProps {
  workspaceId: string
  clients: WorkspaceClient[]
  clientsLoading: boolean
  clientsError: Error | null
  baseHref: string
  onRetryClients: () => void
}

interface CampaignSummary {
  client: WorkspaceClient
  detail: WorkspaceClientDetail | null
  shortlist: ClientShortlistPodcast[]
  loading: boolean
  error: boolean
  status: CampaignStatus
  approvedPodcasts: number
  missingContacts: number
  currentWaveCount: number
  currentWaveLabel: string
  nextAction: string
}

const filterLabels: Array<{ value: CampaignFilter; label: string }> = [
  { value: 'all', label: 'All campaigns' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'setup', label: 'Not started' },
]

const statusClasses: Record<CampaignStatus, string> = {
  'Needs attention': 'border-amber-200 bg-amber-50 text-amber-800',
  Draft: 'border-sky-200 bg-sky-50 text-sky-800',
  Active: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Not started': 'border-slate-200 bg-slate-50 text-slate-700',
}

function startOfWeek(value: string): Date | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + offset)
  return date
}

function formatWave(start: Date | null): string {
  if (!start) return 'No wave yet'
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const sameMonth = start.getMonth() === end.getMonth()
  const startLabel = start.toLocaleDateString(undefined, sameMonth
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString(undefined, sameMonth
    ? { day: 'numeric' }
    : { month: 'short', day: 'numeric' })
  return `${startLabel}–${endLabel}`
}

function summarizeCampaign(
  client: WorkspaceClient,
  data: { detail: WorkspaceClientDetail; podcasts: ClientShortlistPodcast[] } | undefined,
  loading: boolean,
  error: boolean,
): CampaignSummary {
  const shortlist = data?.podcasts || []
  const approved = shortlist.filter((podcast) => (
    podcast.visibility === 'visible' && podcast.feedback_status === 'approved'
  ))
  const missingContacts = approved.filter((podcast) => !podcast.podcast_email).length
  const latestWave = approved
    .map((podcast) => startOfWeek(podcast.created_at))
    .filter((date): date is Date => Boolean(date))
    .sort((left, right) => right.getTime() - left.getTime())[0] || null
  const currentWaveCount = latestWave
    ? approved.filter((podcast) => startOfWeek(podcast.created_at)?.getTime() === latestWave.getTime()).length
    : 0
  const outreach = data?.detail.outreach
  const status: CampaignStatus = outreach?.pending_review_count
    ? 'Needs attention'
    : outreach && outreach.initial_emails_sent > 0
      ? 'Active'
      : approved.length > 0
        ? 'Draft'
        : 'Not started'
  const nextAction = outreach?.pending_review_count
    ? `Review ${outreach.pending_review_count} pitch${outreach.pending_review_count === 1 ? '' : 'es'}`
    : missingContacts > 0
      ? `Find ${missingContacts} contact${missingContacts === 1 ? '' : 's'}`
      : approved.length > 0
        ? 'Review custom pitches'
        : 'Add approved podcasts'

  return {
    client,
    detail: data?.detail || null,
    shortlist,
    loading,
    error,
    status,
    approvedPodcasts: approved.length,
    missingContacts,
    currentWaveCount,
    currentWaveLabel: formatWave(latestWave),
    nextAction,
  }
}

function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge variant="outline" className={statusClasses[status]}>{status}</Badge>
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: number | string
  detail: string
  icon: typeof Mail
}) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </CardContent>
    </Card>
  )
}

const WorkspaceCampaigns = ({
  workspaceId,
  clients,
  clientsLoading,
  clientsError,
  baseHref,
  onRetryClients,
}: WorkspaceCampaignsProps) => {
  const navigate = useNavigate()
  const activeClients = useMemo(
    () => clients.filter((client) => client.status === 'active'),
    [clients],
  )
  const campaignQueries = useQueries({
    queries: activeClients.map((client) => ({
      queryKey: ['workspace-campaign-layout', workspaceId, client.id],
      queryFn: async () => {
        const [detail, shortlist] = await Promise.all([
          getWorkspaceClientDetail(workspaceId, client.id),
          getClientShortlist(workspaceId, client.id),
        ])
        if (
          detail.workspace.id !== workspaceId
          || detail.client.id !== client.id
          || shortlist.client.id !== client.id
        ) {
          throw new Error('The campaign summary did not match the workspace client.')
        }
        return { detail, podcasts: shortlist.podcasts }
      },
      retry: false,
      staleTime: 30_000,
    })),
  })
  const summaries = activeClients.map((client, index) => summarizeCampaign(
    client,
    campaignQueries[index]?.data,
    Boolean(campaignQueries[index]?.isLoading),
    Boolean(campaignQueries[index]?.error),
  ))

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CampaignFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [selectedClientId, setSelectedClientId] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [selectedPodcastIds, setSelectedPodcastIds] = useState<Set<string>>(new Set())
  const [initializedClientId, setInitializedClientId] = useState('')

  const selectedClient = activeClients.find((client) => client.id === selectedClientId) || null
  const creationShortlistQuery = useQuery({
    queryKey: ['workspace-campaign-create', workspaceId, selectedClientId, 'shortlist'],
    queryFn: () => getClientShortlist(workspaceId, selectedClientId),
    enabled: createOpen && createStep === 2 && Boolean(selectedClientId),
    retry: false,
  })
  const creationPodcasts = (creationShortlistQuery.data?.podcasts || [])
    .filter((podcast) => podcast.visibility === 'visible')
    .sort((left, right) => {
      const leftApproved = left.feedback_status === 'approved' ? 1 : 0
      const rightApproved = right.feedback_status === 'approved' ? 1 : 0
      return rightApproved - leftApproved || left.display_order - right.display_order
    })

  useEffect(() => {
    if (!creationShortlistQuery.data || initializedClientId === selectedClientId) return
    setSelectedPodcastIds(new Set(
      creationShortlistQuery.data.podcasts
        .filter((podcast) => podcast.visibility === 'visible' && podcast.feedback_status === 'approved')
        .map((podcast) => podcast.id),
    ))
    setInitializedClientId(selectedClientId)
  }, [creationShortlistQuery.data, initializedClientId, selectedClientId])

  const normalizedSearch = search.trim().toLowerCase()
  const filteredSummaries = summaries.filter((summary) => {
    const matchesSearch = !normalizedSearch
      || summary.client.name.toLowerCase().includes(normalizedSearch)
      || `${summary.client.name} podcast outreach`.toLowerCase().includes(normalizedSearch)
    const matchesFilter = filter === 'all'
      || (filter === 'attention' && summary.status === 'Needs attention')
      || (filter === 'draft' && summary.status === 'Draft')
      || (filter === 'active' && summary.status === 'Active')
      || (filter === 'setup' && summary.status === 'Not started')
    return matchesSearch && matchesFilter
  }).sort((left, right) => {
    const priority: Record<CampaignStatus, number> = {
      'Needs attention': 0,
      Draft: 1,
      Active: 2,
      'Not started': 3,
    }
    return priority[left.status] - priority[right.status]
      || left.client.name.localeCompare(right.client.name)
  })

  const activeCount = summaries.filter((summary) => summary.status === 'Active').length
  const reviewCount = summaries.reduce((total, summary) => (
    total + (summary.detail?.outreach.pending_review_count || 0)
  ), 0)
  const sentCount = summaries.reduce((total, summary) => (
    total + (summary.detail?.outreach.initial_emails_sent || 0)
  ), 0)

  const resetCreateDialog = () => {
    setCreateOpen(false)
    setCreateStep(1)
    setSelectedClientId('')
    setCampaignName('')
    setSelectedPodcastIds(new Set())
    setInitializedClientId('')
  }

  const selectClient = (clientId: string) => {
    const client = activeClients.find((candidate) => candidate.id === clientId)
    setSelectedClientId(clientId)
    setCampaignName(client ? `${client.name} Podcast Outreach` : '')
    setSelectedPodcastIds(new Set())
    setInitializedClientId('')
  }

  const openDraftWorkspace = () => {
    if (!selectedClientId) return
    const selectedIds = Array.from(selectedPodcastIds)
    const query = selectedIds.length > 0
      ? `?podcasts=${encodeURIComponent(selectedIds.join(','))}`
      : ''
    resetCreateDialog()
    navigate(`${baseHref}/client-campaigns/${selectedClientId}${query}`)
  }

  if (clientsError) {
    return (
      <Card>
        <CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <div><p className="font-semibold">Campaign clients could not be loaded</p><p className="text-sm text-muted-foreground">{clientsError.message}</p></div>
          <Button variant="outline" onClick={onRetryClients}>Try again</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Campaign operations</h2>
          <p className="mt-1 text-sm text-muted-foreground">One ongoing podcast outreach campaign for every active client.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={clientsLoading || activeClients.length === 0}>
          <Plus className="mr-2 h-4 w-4" />New campaign
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Active campaigns" value={activeCount} detail="Currently sending outreach" icon={CheckCircle2} />
        <SummaryMetric label="Needs review" value={reviewCount} detail="Custom pitches awaiting a decision" icon={AlertCircle} />
        <SummaryMetric label="Initial emails sent" value={sentCount} detail="Verified workspace outreach" icon={Mail} />
        <SummaryMetric label="Positive replies" value="—" detail="Available after Instantly sync" icon={MessageSquare} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-muted/15 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients or campaigns…" className="pl-9" />
            </div>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:pb-0" aria-label="Campaign status filters">
              {filterLabels.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={filter === item.value ? 'secondary' : 'ghost'}
                  className="shrink-0"
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {clientsLoading ? (
          <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : activeClients.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <Mic2 className="h-9 w-9 text-muted-foreground/50" />
            <h3 className="mt-3 font-semibold">No active clients</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Add or reactivate a client before creating a podcast outreach campaign.</p>
            <Button asChild variant="outline" className="mt-4"><Link to={`${baseHref}/clients`}>Open clients</Link></Button>
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
            <Search className="h-8 w-8 text-muted-foreground/50" />
            <h3 className="mt-3 font-semibold">No campaigns match this view</h3>
            <p className="mt-1 text-sm text-muted-foreground">Clear the search or choose another status.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 md:hidden">
              {filteredSummaries.map((summary) => (
                <Link key={summary.client.id} to={`${baseHref}/client-campaigns/${summary.client.id}`} className="block rounded-xl border p-4 transition-colors hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate font-semibold">{summary.client.name}</p><p className="truncate text-xs text-muted-foreground">{summary.client.name} Podcast Outreach</p></div>
                    {summary.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CampaignStatusBadge status={summary.status} />}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Current wave</p><p className="mt-1 font-medium">{summary.currentWaveLabel}</p></div>
                    <div><p className="text-xs text-muted-foreground">Approved podcasts</p><p className="mt-1 font-medium">{summary.approvedPodcasts}</p></div>
                    <div className="col-span-2"><p className="text-xs text-muted-foreground">Next action</p><p className="mt-1 font-medium text-primary">{summary.error ? 'Campaign data unavailable' : summary.nextAction}</p></div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Client / campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-36">Current wave</TableHead>
                    <TableHead>Pitch readiness</TableHead>
                    <TableHead>Contacted</TableHead>
                    <TableHead>Replies</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead className="min-w-44">Next action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSummaries.map((summary) => {
                    const outreach = summary.detail?.outreach
                    const bookings = summary.detail?.bookings.filter((booking) => (
                      ['booked', 'recorded', 'published'].includes(booking.status)
                    )).length || 0
                    const ready = outreach?.approved_count || 0
                    const reviewTotal = ready + (outreach?.pending_review_count || 0)
                    return (
                      <TableRow key={summary.client.id} className="group">
                        <TableCell>
                          <Link to={`${baseHref}/client-campaigns/${summary.client.id}`} className="font-semibold hover:text-primary hover:underline">{summary.client.name}</Link>
                          <p className="mt-0.5 text-xs text-muted-foreground">{summary.client.name} Podcast Outreach</p>
                        </TableCell>
                        <TableCell>{summary.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : summary.error ? <Badge variant="destructive">Unavailable</Badge> : <CampaignStatusBadge status={summary.status} />}</TableCell>
                        <TableCell><p className="font-medium">{summary.currentWaveLabel}</p><p className="text-xs text-muted-foreground">{summary.currentWaveCount} podcast{summary.currentWaveCount === 1 ? '' : 's'}</p></TableCell>
                        <TableCell><p className="font-medium">{reviewTotal > 0 ? `${ready}/${reviewTotal} ready` : `${summary.approvedPodcasts} eligible`}</p><p className="text-xs text-muted-foreground">{summary.missingContacts > 0 ? `${summary.missingContacts} missing contact` : 'Contact-ready'}</p></TableCell>
                        <TableCell>{outreach?.podcasts_contacted ?? '—'}</TableCell>
                        <TableCell><span className="text-muted-foreground">—</span></TableCell>
                        <TableCell>{bookings}</TableCell>
                        <TableCell><Button asChild variant="ghost" size="sm" className="-ml-3 justify-start text-primary"><Link to={`${baseHref}/client-campaigns/${summary.client.id}`}>{summary.error ? 'Try campaign workspace' : summary.nextAction}<ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) resetCreateDialog(); else setCreateOpen(true) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <span>Step {createStep} of 2</span>
              <span className="text-muted-foreground">Create client campaign</span>
            </div>
            <DialogTitle>{createStep === 1 ? 'Choose the client' : 'Choose the first podcast wave'}</DialogTitle>
            <DialogDescription>
              {createStep === 1
                ? 'Each active client has one ongoing podcast outreach campaign.'
                : 'Client-positive podcasts are selected automatically. Add an owner-approved exception when needed.'}
            </DialogDescription>
          </DialogHeader>

          {createStep === 1 ? (
            <div className="space-y-5 py-2">
              <div className="space-y-2">
                <Label htmlFor="campaign-client">Client</Label>
                <Select value={selectedClientId} onValueChange={selectClient}>
                  <SelectTrigger id="campaign-client"><SelectValue placeholder="Select an active client" /></SelectTrigger>
                  <SelectContent>
                    {activeClients.map((client) => <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign name</Label>
                <Input id="campaign-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} disabled={!selectedClient} />
                <p className="text-xs text-muted-foreground">Use the client’s ongoing campaign for every weekly outreach wave.</p>
              </div>
            </div>
          ) : creationShortlistQuery.isLoading ? (
            <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : creationShortlistQuery.error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">The client’s podcast list could not be loaded.</div>
          ) : creationPodcasts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 font-semibold">No shortlisted podcasts yet</p>
              <p className="mt-1 text-sm text-muted-foreground">You can open the campaign workspace now and add podcasts through Podcast Finder.</p>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3 text-sm">
                <span><strong>{selectedPodcastIds.size}</strong> podcast{selectedPodcastIds.size === 1 ? '' : 's'} selected</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedPodcastIds(new Set())}>Start empty</Button>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {creationPodcasts.map((podcast) => {
                  const approved = podcast.feedback_status === 'approved'
                  const checked = selectedPodcastIds.has(podcast.id)
                  return (
                    <label key={podcast.id} className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 hover:bg-muted/30">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => setSelectedPodcastIds((current) => {
                          const next = new Set(current)
                          if (value) next.add(podcast.id)
                          else next.delete(podcast.id)
                          return next
                        })}
                        aria-label={`Select ${podcast.podcast_name}`}
                      />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{podcast.podcast_name}</p><p className="truncate text-xs text-muted-foreground">{podcast.podcast_email || 'Contact needed'}</p></div>
                      <Badge variant="outline" className={approved ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>{approved ? 'Client positive' : 'Owner override'}</Badge>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            The campaign workspace is available now. Saving pitches and starting outreach remain disabled until Instantly campaign storage is connected.
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={createStep === 1 ? resetCreateDialog : () => setCreateStep(1)}>{createStep === 1 ? 'Cancel' : 'Back'}</Button>
            {createStep === 1 ? (
              <Button type="button" disabled={!selectedClientId || !campaignName.trim()} onClick={() => setCreateStep(2)}>Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>
            ) : (
              <Button type="button" disabled={creationShortlistQuery.isLoading} onClick={openDraftWorkspace}>Open draft workspace<ArrowRight className="ml-2 h-4 w-4" /></Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default WorkspaceCampaigns
