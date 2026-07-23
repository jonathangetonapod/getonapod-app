import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Mic2,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { safeExternalUrl } from '@/lib/externalUrl'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import { getClientShortlist, type ClientShortlistPodcast } from '@/services/clientShortlist'
import { getWorkspaceClientDetail } from '@/services/clients'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type PitchFilter = 'all' | 'needs-contact' | 'needs-pitch' | 'needs-review' | 'in-outreach' | 'replied' | 'booked'
type PitchStage = 'needs-contact' | 'needs-pitch'

interface WorkspaceCampaignDetailProps {
  platformWorkspaceId?: string
}

const pitchFilters: Array<{ value: PitchFilter; label: string }> = [
  { value: 'all', label: 'All podcasts' },
  { value: 'needs-contact', label: 'Needs contact' },
  { value: 'needs-pitch', label: 'Needs pitch' },
  { value: 'needs-review', label: 'Needs review' },
  { value: 'in-outreach', label: 'In outreach' },
  { value: 'replied', label: 'Replied' },
  { value: 'booked', label: 'Booked' },
]

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not yet'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function weekStart(value: string): Date | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const day = date.getDay()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day))
  return date
}

function waveKey(value: string): string {
  return weekStart(value)?.toISOString().slice(0, 10) || 'unknown'
}

function waveLabel(key: string): string {
  const start = new Date(`${key}T00:00:00`)
  if (Number.isNaN(start.getTime())) return 'Unknown wave'
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString(undefined, start.getMonth() === end.getMonth()
    ? { day: 'numeric' }
    : { month: 'short', day: 'numeric' })
  return `${startLabel}–${endLabel}`
}

function pitchStage(podcast: ClientShortlistPodcast): PitchStage {
  return podcast.podcast_email ? 'needs-pitch' : 'needs-contact'
}

function stageLabel(stage: PitchStage): string {
  return stage === 'needs-contact' ? 'Needs contact' : 'Needs pitch'
}

function stageClass(stage: PitchStage): string {
  return stage === 'needs-contact'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-sky-200 bg-sky-50 text-sky-800'
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: number | string; detail: string; icon: typeof Mic2 }) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
        <Icon className="h-4 w-4 text-muted-foreground/60" />
      </CardContent>
    </Card>
  )
}

const WorkspaceCampaignDetail = ({ platformWorkspaceId }: WorkspaceCampaignDetailProps) => {
  const { clientId: routeClientId = '' } = useParams<{ clientId: string }>()
  const [searchParams] = useSearchParams()
  const { user, workspace } = useAuth()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? platformWorkspaceId : workspace?.id || '').toLowerCase()
  const clientId = routeClientId.toLowerCase()
  const validAddress = UUID_PATTERN.test(workspaceId) && UUID_PATTERN.test(clientId)
  const baseHref = isPlatformWorkspace ? selectedWorkspaceBaseHref(workspaceId) : MY_WORKSPACE_BASE_HREF

  const campaignQuery = useQuery({
    queryKey: [isPlatformWorkspace ? 'platform' : 'tenant', user?.id || 'unknown', 'workspace', workspaceId, 'campaign-layout', clientId],
    queryFn: async () => {
      const [detail, shortlist] = await Promise.all([
        getWorkspaceClientDetail(workspaceId, clientId),
        getClientShortlist(workspaceId, clientId),
      ])
      if (
        detail.workspace.id !== workspaceId
        || detail.client.id !== clientId
        || shortlist.client.id !== clientId
      ) {
        throw new Error('The campaign workspace did not match the client address.')
      }
      return { detail, shortlist }
    },
    enabled: validAddress,
    retry: false,
    gcTime: isPlatformWorkspace ? 0 : undefined,
  })

  const data = campaignQuery.data
  const detail = data?.detail
  const client = detail?.client
  const effectiveWorkspace = detail?.workspace
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isPlatformWorkspace
    ? {
        workspaceName: effectiveWorkspace?.name || 'Client workspace',
        logoUrl: workspaceLogoUrl(
          effectiveWorkspace?.id,
          effectiveWorkspace?.logo_path,
          effectiveWorkspace?.logo_updated_at,
        ),
        baseHref,
      }
    : undefined

  const queryPodcastIds = useMemo(() => new Set(
    (searchParams.get('podcasts') || '').split(',').map((value) => value.trim()).filter(Boolean),
  ), [searchParams])
  const campaignPodcasts = useMemo(() => (data?.shortlist.podcasts || []).filter((podcast) => (
    podcast.visibility === 'visible'
    && (podcast.feedback_status === 'approved' || queryPodcastIds.has(podcast.id))
  )), [data?.shortlist.podcasts, queryPodcastIds])
  const waves = useMemo(() => Array.from(new Set(campaignPodcasts.map((podcast) => waveKey(podcast.created_at))))
    .filter((key) => key !== 'unknown')
    .sort((left, right) => right.localeCompare(left)), [campaignPodcasts])
  const currentWaveKey = waves[0] || ''
  const [waveFilter, setWaveFilter] = useState<'current' | 'all' | string>('current')
  const [pitchFilter, setPitchFilter] = useState<PitchFilter>('all')
  const [selectedPodcastId, setSelectedPodcastId] = useState<string | null>(null)
  const [subjectDraft, setSubjectDraft] = useState('')
  const [pitchDraft, setPitchDraft] = useState('')

  const selectedPodcast = campaignPodcasts.find((podcast) => podcast.id === selectedPodcastId) || null
  useEffect(() => {
    setSubjectDraft('')
    setPitchDraft('')
  }, [selectedPodcastId])

  const wavePodcasts = campaignPodcasts.filter((podcast) => {
    if (waveFilter === 'all') return true
    if (waveFilter === 'current') return !currentWaveKey || waveKey(podcast.created_at) === currentWaveKey
    return waveKey(podcast.created_at) === waveFilter
  })
  const filteredPodcasts = wavePodcasts.filter((podcast) => {
    if (pitchFilter === 'all') return true
    if (pitchFilter === 'needs-contact' || pitchFilter === 'needs-pitch') return pitchStage(podcast) === pitchFilter
    return false
  })
  const filterCount = (filter: PitchFilter): number => {
    if (filter === 'all') return wavePodcasts.length
    if (filter === 'needs-contact' || filter === 'needs-pitch') {
      return wavePodcasts.filter((podcast) => pitchStage(podcast) === filter).length
    }
    if (filter === 'needs-review') return detail?.outreach.pending_review_count || 0
    return 0
  }

  if (!isPlatformWorkspace && !workspace) {
    return <WorkspaceLayout><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card></WorkspaceLayout>
  }

  if (!validAddress) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Campaign unavailable</CardTitle><CardDescription>The campaign address is invalid.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link to={`${baseHref}/client-campaigns`}>Back to campaigns</Link></Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  if (campaignQuery.isLoading) {
    return <WorkspaceLayout platformWorkspace={platformWorkspace}><div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></WorkspaceLayout>
  }

  if (campaignQuery.error || !detail || !client) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Campaign unavailable</CardTitle><CardDescription>{campaignQuery.error instanceof Error ? campaignQuery.error.message : 'This client campaign could not be loaded.'}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button asChild variant="outline"><Link to={`${baseHref}/client-campaigns`}>Back to campaigns</Link></Button><Button variant="outline" onClick={() => void campaignQuery.refetch()}>Try again</Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  const missingContacts = campaignPodcasts.filter((podcast) => !podcast.podcast_email).length
  const finderHref = `${baseHref}/podcast-finder?client=${encodeURIComponent(client.id)}`
  const clientHref = `${baseHref}/clients/${client.id}`
  const bookedCount = detail.bookings.filter((booking) => ['booked', 'recorded', 'published'].includes(booking.status)).length
  const campaignStatus = detail.outreach.pending_review_count > 0
    ? 'Needs attention'
    : detail.outreach.initial_emails_sent > 0
      ? 'Active'
      : campaignPodcasts.length > 0
        ? 'Draft'
        : 'Not started'
  const campaignStatusClass = campaignStatus === 'Active'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : campaignStatus === 'Needs attention'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-slate-200 bg-slate-50 text-slate-700'

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-14">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
          <Link to={`${baseHref}/client-campaigns`}><ArrowLeft className="mr-2 h-4 w-4" />Back to campaigns</Link>
        </Button>

        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-primary">Client campaign</p>
              <Badge variant="outline" className={campaignStatusClass}>{campaignStatus}</Badge>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">Instantly not connected</Badge>
            </div>
            <h1 className="mt-2 truncate text-3xl font-bold tracking-tight">{client.name} Podcast Outreach</h1>
            <p className="mt-2 text-sm text-muted-foreground">One ongoing campaign · weekly podcast waves · a custom reviewed pitch for every show</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to={clientHref}><UserRound className="mr-2 h-4 w-4" />Open client</Link></Button>
            <Button asChild><Link to={finderHref}><Plus className="mr-2 h-4 w-4" />Add podcasts</Link></Button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Eligible podcasts" value={campaignPodcasts.length} detail="Client-positive or owner-selected" icon={Mic2} />
          <Metric label="Needs contact" value={missingContacts} detail="Resolve before pitch approval" icon={Search} />
          <Metric label="Needs review" value={detail.outreach.pending_review_count} detail="Existing custom pitch queue" icon={AlertCircle} />
          <Metric label="Contacted" value={detail.outreach.podcasts_contacted} detail={`${bookedCount} booking${bookedCount === 1 ? '' : 's'} recorded`} icon={Send} />
        </div>

        <Tabs defaultValue="queue" className="space-y-4">
          <div className="overflow-x-auto pb-1">
            <TabsList className="h-auto min-w-max justify-start" aria-label="Campaign sections">
              <TabsTrigger value="queue">Pitch Queue</TabsTrigger>
              <TabsTrigger value="activity">Outreach Activity</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="settings">Campaign Settings</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="queue" className="mt-0 space-y-4">
            <Card className="overflow-hidden">
              <div className="border-b border-border bg-muted/15 p-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="min-w-48">
                      <Select value={waveFilter} onValueChange={setWaveFilter}>
                        <SelectTrigger aria-label="Select outreach wave"><CalendarDays className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="current">Current wave{currentWaveKey ? ` · ${waveLabel(currentWaveKey)}` : ''}</SelectItem>
                          <SelectItem value="all">All outreach waves</SelectItem>
                          {waves.slice(1).map((key) => <SelectItem key={key} value={key}>{waveLabel(key)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="hidden text-xs text-muted-foreground sm:block">{wavePodcasts.length} podcast{wavePodcasts.length === 1 ? '' : 's'} in view</p>
                  </div>
                  <div className="flex max-w-full gap-2 overflow-x-auto pb-1 xl:pb-0" aria-label="Pitch queue filters">
                    {pitchFilters.map((filter) => (
                      <Button
                        key={filter.value}
                        type="button"
                        size="sm"
                        variant={pitchFilter === filter.value ? 'secondary' : 'ghost'}
                        className="shrink-0"
                        onClick={() => setPitchFilter(filter.value)}
                      >
                        {filter.label}<span className="ml-1.5 text-xs text-muted-foreground">{filterCount(filter.value)}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {campaignPodcasts.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                  <Mic2 className="h-9 w-9 text-muted-foreground/50" />
                  <h2 className="mt-3 font-semibold">No podcasts in this campaign</h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">Add podcasts through Podcast Finder, then collect a positive client decision or explicitly select an owner override.</p>
                  <Button asChild variant="outline" className="mt-4"><Link to={finderHref}>Open Podcast Finder</Link></Button>
                </div>
              ) : filteredPodcasts.length === 0 ? (
                <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground/50" />
                  <h2 className="mt-3 font-semibold">Nothing needs this action</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Choose another pitch status or outreach wave.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2 p-3 md:hidden">
                    {filteredPodcasts.map((podcast) => {
                      const stage = pitchStage(podcast)
                      return (
                        <button key={podcast.id} type="button" onClick={() => setSelectedPodcastId(podcast.id)} className="w-full rounded-xl border p-4 text-left hover:bg-muted/30">
                          <div className="flex items-start justify-between gap-3"><p className="font-semibold">{podcast.podcast_name}</p><Badge variant="outline" className={stageClass(stage)}>{stageLabel(stage)}</Badge></div>
                          <p className="mt-2 text-xs text-muted-foreground">{podcast.publisher_name || 'Host not identified'} · {podcast.podcast_email || 'Contact needed'}</p>
                          <p className="mt-3 text-sm font-medium text-primary">Open pitch workspace<ArrowRight className="ml-1 inline h-3.5 w-3.5" /></p>
                        </button>
                      )
                    })}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader><TableRow><TableHead className="min-w-64">Podcast</TableHead><TableHead className="min-w-48">Host / contact</TableHead><TableHead>Client decision</TableHead><TableHead>Pitch status</TableHead><TableHead>Outreach</TableHead><TableHead>Last activity</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {filteredPodcasts.map((podcast) => {
                          const stage = pitchStage(podcast)
                          const podcastUrl = podcast.podcast_url ? safeExternalUrl(podcast.podcast_url) : null
                          return (
                            <TableRow key={podcast.id}>
                              <TableCell><div className="flex items-center gap-3">{podcast.podcast_image_url ? <img src={podcast.podcast_image_url} alt="" className="h-10 w-10 rounded-lg border object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><Mic2 className="h-4 w-4" /></div>}<div className="min-w-0"><p className="font-semibold">{podcast.podcast_name}</p>{podcastUrl && <a href={podcastUrl} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary">Open podcast<ExternalLink className="ml-1 inline h-3 w-3" /></a>}</div></div></TableCell>
                              <TableCell><p className="font-medium">{podcast.publisher_name || 'Host needed'}</p><p className="text-xs text-muted-foreground">{podcast.podcast_email || 'Email not found'}</p></TableCell>
                              <TableCell><Badge variant="outline" className={podcast.feedback_status === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>{podcast.feedback_status === 'approved' ? 'Positive' : 'Owner selected'}</Badge></TableCell>
                              <TableCell><Badge variant="outline" className={stageClass(stage)}>{stageLabel(stage)}</Badge></TableCell>
                              <TableCell><span className="text-sm text-muted-foreground">Not started</span></TableCell>
                              <TableCell><span className="text-sm text-muted-foreground">{formatDate(podcast.feedback_updated_at || podcast.updated_at)}</span></TableCell>
                              <TableCell className="text-right"><Button type="button" size="sm" variant="ghost" className="text-primary" onClick={() => setSelectedPodcastId(podcast.id)}>Review pitch<ArrowRight className="ml-2 h-3.5 w-3.5" /></Button></TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.7fr)]">
              <Card><CardHeader><CardTitle>Outreach timeline</CardTitle><CardDescription>Every pitch, send, follow-up, reply, and booking will appear in chronological order.</CardDescription></CardHeader><CardContent><div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center"><Activity className="h-8 w-8 text-muted-foreground/50" /><p className="mt-3 font-semibold">No Instantly activity synced</p><p className="mt-1 max-w-md text-sm text-muted-foreground">Existing verified totals remain visible, but provider-level events will appear only after the connection is active.</p></div></CardContent></Card>
              <Card><CardHeader><CardTitle>Verified activity</CardTitle><CardDescription>Current workspace totals for this client.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Initial emails sent</span><strong>{detail.outreach.initial_emails_sent}</strong></div><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Podcasts contacted</span><strong>{detail.outreach.podcasts_contacted}</strong></div><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Last outreach</span><strong className="text-sm">{formatDate(detail.outreach.last_sent_at)}</strong></div></CardContent></Card>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="mt-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Contacted" value={detail.outreach.podcasts_contacted} detail="Unique podcasts" icon={Mail} /><Metric label="Replies" value="—" detail="Available after Instantly sync" icon={MessageSquare} /><Metric label="Positive replies" value="—" detail="Available after Instantly sync" icon={Inbox} /><Metric label="Bookings" value={bookedCount} detail="Booked, recorded, or published" icon={CalendarDays} /></div>
            <Card><CardHeader><CardTitle>Campaign performance</CardTitle><CardDescription>Response rate, positive-reply rate, and bookings by wave will appear here once Instantly events are available.</CardDescription></CardHeader><CardContent><div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed"><p className="text-sm text-muted-foreground">Performance chart awaiting campaign sync</p></div></CardContent></Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle>Campaign identity</CardTitle><CardDescription>This client uses one ongoing podcast outreach campaign.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="campaign-detail-name">Campaign name</Label><Input id="campaign-detail-name" value={`${client.name} Podcast Outreach`} readOnly /></div><div className="flex items-center justify-between rounded-xl border p-3"><div><p className="text-sm font-medium">Campaign status</p><p className="text-xs text-muted-foreground">Status follows verified outreach activity.</p></div><Badge variant="outline" className={campaignStatusClass}>{campaignStatus}</Badge></div></CardContent></Card>
              <Card><CardHeader><CardTitle>Sending behavior</CardTitle><CardDescription>Follow-ups, schedules, and sending accounts are managed by Instantly.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex items-start gap-3 rounded-xl border p-3"><Settings2 className="mt-0.5 h-4 w-4 text-muted-foreground" /><div><p className="text-sm font-medium">Instantly-managed execution</p><p className="mt-1 text-xs leading-5 text-muted-foreground">GOAP owns podcast selection and custom pitch approval. Instantly will own follow-up execution after approval.</p></div></div><Button variant="outline" disabled>Archive campaign</Button></CardContent></Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={Boolean(selectedPodcast)} onOpenChange={(open) => { if (!open) setSelectedPodcastId(null) }}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl lg:max-w-3xl">
          {selectedPodcast && (
            <>
              <SheetHeader className="border-b p-5 pr-12 sm:p-6 sm:pr-12">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={stageClass(pitchStage(selectedPodcast))}>{stageLabel(pitchStage(selectedPodcast))}</Badge><Badge variant="outline">{selectedPodcast.feedback_status === 'approved' ? 'Client positive' : 'Owner selected'}</Badge></div>
                <SheetTitle className="text-2xl">{selectedPodcast.podcast_name}</SheetTitle>
                <SheetDescription>Review the podcast context, confirm the contact, and prepare its custom pitch.</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 p-5 sm:p-6">
                <section className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Host contact</p><p className="mt-2 font-semibold">{selectedPodcast.publisher_name || 'Host not identified'}</p><p className="mt-1 text-sm text-muted-foreground">{selectedPodcast.podcast_email || 'No contact email found'}</p></div>{selectedPodcast.podcast_email ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-amber-600" />}</div>
                  {!selectedPodcast.podcast_email && <Button asChild variant="outline" size="sm" className="mt-4"><Link to={finderHref}><Search className="mr-2 h-4 w-4" />Find contact</Link></Button>}
                </section>

                {(selectedPodcast.ai_fit_reasons?.length || selectedPodcast.ai_pitch_angles?.length) && (
                  <section className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h3 className="font-semibold">Pitch context</h3></div>
                    {selectedPodcast.ai_fit_reasons?.length ? <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this show fits</p><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{selectedPodcast.ai_fit_reasons.slice(0, 3).map((reason) => <li key={reason} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{reason}</li>)}</ul></div> : null}
                    {selectedPodcast.ai_pitch_angles?.length ? <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested talking points</p><div className="mt-2 space-y-2">{selectedPodcast.ai_pitch_angles.slice(0, 3).map((angle) => <div key={angle.title} className="rounded-lg bg-background p-3"><p className="text-sm font-medium">{angle.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{angle.description}</p></div>)}</div></div> : null}
                  </section>
                )}

                <section className="space-y-4">
                  <div><h3 className="font-semibold">Custom pitch</h3><p className="mt-1 text-sm text-muted-foreground">Every podcast receives its own subject and opening message.</p></div>
                  <div className="space-y-2"><Label htmlFor="pitch-subject">Subject line</Label><Input id="pitch-subject" value={subjectDraft} onChange={(event) => setSubjectDraft(event.target.value)} placeholder={`Podcast guest idea for ${selectedPodcast.podcast_name}`} /></div>
                  <div className="space-y-2"><Label htmlFor="pitch-body">Email pitch</Label><Textarea id="pitch-body" value={pitchDraft} onChange={(event) => setPitchDraft(event.target.value)} placeholder="Write or generate a custom pitch using the client profile and podcast context…" className="min-h-64 resize-y" /></div>
                  <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">Draft saving and approval activate with the Instantly campaign connection. Follow-ups will be managed by Instantly after the first pitch is approved.</div>
                </section>
              </div>

              <div className="sticky bottom-0 flex flex-col gap-2 border-t bg-background/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">No message will be sent from this layout preview.</p>
                <div className="flex gap-2"><Button variant="outline" disabled>Save draft</Button><Button disabled><Send className="mr-2 h-4 w-4" />Approve &amp; start outreach</Button></div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </WorkspaceLayout>
  )
}

export default WorkspaceCampaignDetail
