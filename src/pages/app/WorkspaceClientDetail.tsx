import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Linkedin,
  Loader2,
  Mail,
  MessageSquareText,
  Mic2,
  Radio,
  Search,
  Sparkles,
  UserRound,
  Video,
} from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { safeExternalUrl } from '@/lib/externalUrl'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import { MY_WORKSPACE_BASE_HREF, selectedWorkspaceBaseHref } from '@/lib/workspaceRoutes'
import {
  getWorkspaceClientDetail,
  type WorkspaceClientBooking,
  type WorkspaceClientOnboardingSummary,
} from '@/services/clients'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface WorkspaceClientDetailProps {
  platformWorkspaceId?: string
}

const bookingStatusStyles: Record<WorkspaceClientBooking['status'], string> = {
  conversation_started: 'border-amber-200 bg-amber-50 text-amber-800',
  in_progress: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  booked: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  recorded: 'border-blue-200 bg-blue-50 text-blue-800',
  published: 'border-violet-200 bg-violet-50 text-violet-800',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
}

const onboardingStatusStyles: Record<WorkspaceClientOnboardingSummary['status'], string> = {
  invited: 'border-sky-200 bg-sky-50 text-sky-800',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-800',
  submitted: 'border-violet-200 bg-violet-50 text-violet-800',
  changes_requested: 'border-orange-200 bg-orange-50 text-orange-800',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  expired: 'border-slate-200 bg-slate-50 text-slate-600',
  revoked: 'border-red-200 bg-red-50 text-red-800',
}

function labelForStatus(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not yet'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function scheduledDate(booking: WorkspaceClientBooking): string | null {
  return booking.recording_date || booking.scheduled_date
}

function isUpcoming(booking: WorkspaceClientBooking): boolean {
  const value = scheduledDate(booking)
  if (!value || ['cancelled', 'published'].includes(booking.status)) return false
  const date = new Date(`${value.slice(0, 10)}T23:59:59`)
  return !Number.isNaN(date.getTime()) && date.getTime() >= Date.now()
}

function ResourceCard({
  icon: Icon,
  title,
  description,
  status,
  statusClassName,
  children,
}: {
  icon: typeof BookOpenCheck
  title: string
  description: string
  status: string
  statusClassName?: string
  children: React.ReactNode
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
          <Badge variant="outline" className={statusClassName}>{status}</Badge>
        </div>
        <CardTitle className="pt-2 text-lg">{title}</CardTitle>
        <CardDescription className="min-h-10 leading-5">{description}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">{children}</CardContent>
    </Card>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  iconClassName,
}: {
  icon: typeof BookOpenCheck
  label: string
  value: number | string
  detail?: string
  iconClassName: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
          {detail && <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
        <div className={`shrink-0 rounded-xl p-3 ${iconClassName}`}><Icon className="h-5 w-5" /></div>
      </CardContent>
    </Card>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="max-w-[65%] break-words text-right text-sm font-medium">{value}</span>
    </div>
  )
}

const WorkspaceClientDetail = ({ platformWorkspaceId }: WorkspaceClientDetailProps) => {
  const { clientId = '' } = useParams<{ clientId: string }>()
  const { user, workspace } = useAuth()
  const isPlatformWorkspace = platformWorkspaceId !== undefined
  const workspaceId = (isPlatformWorkspace ? platformWorkspaceId : workspace?.id || '').toLowerCase()
  const canonicalClientId = clientId.toLowerCase()
  const validAddress = UUID_PATTERN.test(workspaceId) && UUID_PATTERN.test(canonicalClientId)
  const baseHref = isPlatformWorkspace
    ? selectedWorkspaceBaseHref(workspaceId)
    : MY_WORKSPACE_BASE_HREF

  const detailQuery = useQuery({
    queryKey: [isPlatformWorkspace ? 'platform' : 'tenant', user?.id || 'unknown', 'workspace', workspaceId, 'client', canonicalClientId],
    queryFn: () => getWorkspaceClientDetail(workspaceId, canonicalClientId),
    enabled: validAddress,
    retry: false,
    gcTime: isPlatformWorkspace ? 0 : undefined,
  })

  const detail = detailQuery.data
  const client = detail?.client
  const bookings = useMemo(() => detail?.bookings || [], [detail?.bookings])
  const onboarding = detail?.onboarding || null
  const upcomingBookings = useMemo(
    () => bookings.filter(isUpcoming).sort((left, right) => (
      new Date(scheduledDate(left) || '').getTime() - new Date(scheduledDate(right) || '').getTime()
    )).slice(0, 4),
    [bookings],
  )
  const progress = useMemo(() => ({
    booked: bookings.filter((booking) => booking.status === 'booked').length,
    inProgress: bookings.filter((booking) => ['conversation_started', 'in_progress'].includes(booking.status)).length,
    recorded: bookings.filter((booking) => booking.status === 'recorded').length,
    published: bookings.filter((booking) => booking.status === 'published').length,
  }), [bookings])

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

  if (!isPlatformWorkspace && !workspace) {
    return <WorkspaceLayout><Card><CardHeader><CardTitle>Workspace unavailable</CardTitle><CardDescription>Your account does not have an active workspace.</CardDescription></CardHeader></Card></WorkspaceLayout>
  }

  if (!validAddress) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Client unavailable</CardTitle><CardDescription>The client address is invalid.</CardDescription></CardHeader><CardContent><Button asChild variant="outline"><Link to={`${baseHref}/clients`}>Back to clients</Link></Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  if (detailQuery.isLoading) {
    return <WorkspaceLayout platformWorkspace={platformWorkspace}><div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></WorkspaceLayout>
  }

  if (detailQuery.error || !detail || !client) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card><CardHeader><CardTitle>Client unavailable</CardTitle><CardDescription>{detailQuery.error instanceof Error ? detailQuery.error.message : 'This client could not be loaded.'}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button asChild variant="outline"><Link to={`${baseHref}/clients`}>Back to clients</Link></Button><Button variant="outline" onClick={() => void detailQuery.refetch()}>Try again</Button></CardContent></Card>
      </WorkspaceLayout>
    )
  }

  const googleSheetUrl = client.google_sheet_url ? safeExternalUrl(client.google_sheet_url) : null
  const canManage = detail.can_manage
  const dashboard = detail.dashboard
  const mediaKitUrl = client.media_kit_url ? safeExternalUrl(client.media_kit_url) : null
  const websiteUrl = client.website ? safeExternalUrl(client.website) : null
  const linkedInUrl = client.linkedin_url ? safeExternalUrl(client.linkedin_url) : null
  const calendarUrl = client.calendar_link ? safeExternalUrl(client.calendar_link) : null
  const dashboardPreviewHref = client.dashboard_slug
    ? `/client/${encodeURIComponent(client.dashboard_slug)}`
    : null
  const dashboardHref = client.dashboard_enabled && client.dashboard_slug
    ? dashboardPreviewHref
    : null
  const prospectDashboardHref = client.prospect_dashboard_slug
    ? `/prospect/${encodeURIComponent(client.prospect_dashboard_slug)}`
    : null
  const onboardingHref = `${baseHref}/onboarding?client=${encodeURIComponent(client.id)}${onboarding ? `&instance=${encodeURIComponent(onboarding.id)}` : ''}`
  const finderHref = `${baseHref}/podcast-finder?client=${encodeURIComponent(client.id)}`
  const clientInitials = client.name.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C'
  const reviewCompletion = dashboard.podcast_count > 0
    ? Math.round((dashboard.reviewed_count / dashboard.podcast_count) * 100)
    : 0
  const analysisCompletion = dashboard.podcast_count > 0
    ? Math.round((dashboard.analyzed_count / dashboard.podcast_count) * 100)
    : 0
  const dashboardStatus = dashboard.enabled && dashboard.configured
    ? 'Live'
    : dashboard.configured
      ? 'Hidden'
      : 'Not configured'
  const dashboardStatusClassName = dashboard.enabled && dashboard.configured
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : dashboard.configured
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : undefined

  const copyPublicLink = async (path: string, label: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard is unavailable')
      const appOrigin = import.meta.env.VITE_APP_URL || window.location.origin
      await navigator.clipboard.writeText(new URL(path, appOrigin).toString())
      toast.success(`${label} copied.`)
    } catch {
      toast.error('Copy failed. Open the page and copy the address manually.')
    }
  }

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="mx-auto w-full max-w-[1500px] space-y-6 pb-16">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground">
          <Link to={`${baseHref}/clients`}><ArrowLeft className="mr-2 h-4 w-4" />Back to clients</Link>
        </Button>

        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-primary via-violet-500 to-fuchsia-400" />
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              {client.photo_url ? (
                <img src={client.photo_url} alt={client.name} className="h-16 w-16 shrink-0 rounded-2xl border object-cover sm:h-20 sm:w-20" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary sm:h-20 sm:w-20 sm:text-2xl">{clientInitials}</div>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{client.name}</h1>
                  <Badge variant={client.status === 'active' ? 'default' : 'secondary'} className="capitalize">{client.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Client command center · {detail.workspace.name}</p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {client.contact_person && <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{client.contact_person}</span>}
                  {client.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{client.email}</span>}
                  <span>Added {formatDate(client.created_at)}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link to={onboardingHref}><BookOpenCheck className="mr-2 h-4 w-4" />Onboarding</Link></Button>
              <Button asChild><Link to={finderHref}><Search className="mr-2 h-4 w-4" />Podcast Finder</Link></Button>
            </div>
          </div>
        </section>

        <Tabs defaultValue="overview" className="space-y-5">
          <div className="overflow-x-auto pb-1">
            <TabsList aria-label="Client command center sections" className="h-auto min-w-max justify-start gap-1 p-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="approval">Approval dashboard</TabsTrigger>
              <TabsTrigger value="portal">Client portal</TabsTrigger>
              <TabsTrigger value="podcasts">Podcast activity</TabsTrigger>
              <TabsTrigger value="files">Onboarding &amp; files</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-0 space-y-6">
            <section aria-labelledby="podcast-progress-heading">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 id="podcast-progress-heading" className="text-xl font-semibold">Campaign snapshot</h2>
                  <p className="text-sm text-muted-foreground">Every active placement stage for this client.</p>
                </div>
                <Badge variant="outline">{bookings.length} total</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={CalendarDays} label="Booked" value={progress.booked} iconClassName="bg-emerald-50 text-emerald-600" />
                <MetricCard icon={Clock3} label="In progress" value={progress.inProgress} iconClassName="bg-amber-50 text-amber-600" />
                <MetricCard icon={Video} label="Recorded" value={progress.recorded} iconClassName="bg-blue-50 text-blue-600" />
                <MetricCard icon={Radio} label="Published" value={progress.published} iconClassName="bg-violet-50 text-violet-600" />
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
              <Card>
                <CardHeader><CardTitle>Upcoming recordings</CardTitle><CardDescription>Next scheduled appearances for this client.</CardDescription></CardHeader>
                <CardContent>
                  {upcomingBookings.length === 0 ? (
                    <div className="flex min-h-40 flex-col items-center justify-center text-center"><Mic2 className="mb-3 h-9 w-9 text-muted-foreground/50" /><p className="font-medium">No upcoming recordings</p><p className="text-sm text-muted-foreground">Scheduled bookings will appear here automatically.</p></div>
                  ) : (
                    <div className="space-y-3">{upcomingBookings.map((booking) => (
                      <div key={booking.id} className="flex items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4"><div className="min-w-0"><p className="truncate font-medium">{booking.podcast_name}</p><p className="mt-1 text-sm text-muted-foreground">{booking.host_name ? `Hosted by ${booking.host_name} · ` : ''}{formatDate(scheduledDate(booking))}</p></div><Badge variant="outline" className={bookingStatusStyles[booking.status]}>{labelForStatus(booking.status)}</Badge></div>
                    ))}</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Client readiness</CardTitle><CardDescription>The systems needed to run this account.</CardDescription></CardHeader>
                <CardContent>
                  <DetailRow label="Approval dashboard" value={<Badge variant="outline" className={dashboardStatusClassName}>{dashboardStatus}</Badge>} />
                  <DetailRow label="Client portal" value={<Badge variant="outline" className={client.portal_access_enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>{client.portal_access_enabled ? 'Enabled' : 'Disabled'}</Badge>} />
                  <DetailRow label="Onboarding" value={onboarding ? labelForStatus(onboarding.status) : 'Not started'} />
                  <DetailRow label="Google Sheet" value={googleSheetUrl ? 'Connected' : 'Not connected'} />
                  <DetailRow label="Podcast review" value={dashboard.podcast_count > 0 ? `${dashboard.reviewed_count} of ${dashboard.podcast_count}` : 'No shortlist yet'} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="approval" className="mt-0 space-y-6">
            <Card className="overflow-hidden border-primary/20">
              <div className="bg-gradient-to-br from-primary/10 via-violet-500/5 to-fuchsia-400/10 p-5 sm:p-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><LayoutDashboard className="h-5 w-5" /></div>
                      <Badge variant="outline" className={dashboardStatusClassName}>{dashboardStatus}</Badge>
                      {dashboard.podcast_count > 0 && <Badge variant="secondary">{dashboard.podcast_count} podcasts</Badge>}
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight">Podcast approval dashboard</h2>
                    <p className="mt-2 leading-6 text-muted-foreground">
                      {dashboard.tagline || `A private shortlist where ${client.name} can review, approve, reject, and comment on podcast opportunities.`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline"><Link to={finderHref}><Search className="mr-2 h-4 w-4" />Manage shortlist</Link></Button>
                    {dashboardHref && <Button variant="outline" onClick={() => void copyPublicLink(dashboardHref, 'Dashboard link')}><Copy className="mr-2 h-4 w-4" />Copy link</Button>}
                    {dashboardHref && <Button asChild><a href={dashboardHref} target="_blank" rel="noreferrer"><Eye className="mr-2 h-4 w-4" />Open as client</a></Button>}
                  </div>
                </div>
              </div>
            </Card>

            <section aria-labelledby="review-progress-heading">
              <div className="mb-3">
                <h3 id="review-progress-heading" className="text-xl font-semibold">Shortlist decisions</h3>
                <p className="text-sm text-muted-foreground">Client feedback from the legacy approval experience, summarized here.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={Mic2} label="Shortlisted" value={dashboard.podcast_count} iconClassName="bg-slate-100 text-slate-700" />
                <MetricCard icon={CheckCircle2} label="Approved" value={dashboard.approved_count} iconClassName="bg-emerald-50 text-emerald-600" />
                <MetricCard icon={MessageSquareText} label="Rejected" value={dashboard.rejected_count} iconClassName="bg-rose-50 text-rose-600" />
                <MetricCard icon={Clock3} label="To review" value={dashboard.to_review_count} iconClassName="bg-amber-50 text-amber-600" />
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
              <Card>
                <CardHeader><CardTitle>Review completion</CardTitle><CardDescription>How far the client has moved through the current shortlist.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">Decisions completed</span><span className="text-muted-foreground">{dashboard.reviewed_count}/{dashboard.podcast_count} · {reviewCompletion}%</span></div>
                    <Progress value={reviewCompletion} className="h-2.5" aria-label="Podcast review completion" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm"><span className="inline-flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-violet-600" />AI fit insights ready</span><span className="text-muted-foreground">{dashboard.analyzed_count}/{dashboard.podcast_count} · {analysisCompletion}%</span></div>
                    <Progress value={analysisCompletion} className="h-2.5 [&>div]:bg-violet-600" aria-label="AI fit analysis completion" />
                  </div>
                  {dashboard.podcast_count === 0 && (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No podcasts are on this client’s approval shortlist yet. Use Podcast Finder to add the next weekly discovery batch.</div>
                  )}
                  <div className="flex flex-wrap gap-2 border-t pt-5">
                    <Button asChild><Link to={finderHref}><Search className="mr-2 h-4 w-4" />Find podcasts</Link></Button>
                    {googleSheetUrl && <Button asChild variant="outline"><a href={googleSheetUrl} target="_blank" rel="noreferrer"><FileSpreadsheet className="mr-2 h-4 w-4" />Open working sheet</a></Button>}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6">
                <Card>
                  <CardHeader><CardTitle>Client engagement</CardTitle><CardDescription>How the approval dashboard is being used.</CardDescription></CardHeader>
                  <CardContent>
                    <DetailRow label="Dashboard views" value={dashboard.view_count.toLocaleString()} />
                    <DetailRow label="Last viewed" value={formatDateTime(dashboard.last_viewed_at)} />
                    <DetailRow label="Last decision" value={formatDateTime(dashboard.last_feedback_at)} />
                    <DetailRow label="Shortlist synced" value={formatDateTime(dashboard.last_synced_at)} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Dashboard setup</CardTitle><CardDescription>Visibility, address, and client-facing copy.</CardDescription></CardHeader>
                  <CardContent>
                    <DetailRow label="Visibility" value={<Badge variant="outline" className={dashboardStatusClassName}>{dashboardStatus}</Badge>} />
                    <DetailRow label="Address" value={dashboardPreviewHref || 'Not generated'} />
                    <DetailRow label="Personalized tagline" value={dashboard.tagline || 'Using the standard client introduction'} />
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="portal" className="mt-0 space-y-6">
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-sky-50 p-3 text-sky-700"><KeyRound className="h-6 w-6" /></div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">Client portal</h2><Badge variant="outline" className={client.portal_access_enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>{client.portal_access_enabled ? 'Enabled' : 'Disabled'}</Badge></div>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">The authenticated delivery view for bookings, upcoming recordings, published appearances, and client resources.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void copyPublicLink('/portal/login', 'Portal login link')}><Copy className="mr-2 h-4 w-4" />Copy login link</Button>
                  <Button asChild><a href="/portal/login" target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open portal login</a></Button>
                </div>
              </div>
            </Card>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard icon={Mic2} label="Total placements" value={bookings.length} iconClassName="bg-slate-100 text-slate-700" />
              <MetricCard icon={CalendarDays} label="Upcoming / active" value={progress.booked + progress.inProgress} iconClassName="bg-amber-50 text-amber-600" />
              <MetricCard icon={Radio} label="Published" value={progress.published} iconClassName="bg-violet-50 text-violet-600" />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Portal access</CardTitle><CardDescription>Login readiness and recent client activity.</CardDescription></CardHeader>
                <CardContent>
                  <DetailRow label="Login email" value={client.email || 'No email configured'} />
                  <DetailRow label="Access" value={client.portal_access_enabled ? 'Enabled' : 'Disabled'} />
                  <DetailRow label="Password" value={client.password_set_at ? `Configured ${formatDate(client.password_set_at)}` : 'Not configured'} />
                  <DetailRow label="Last login" value={formatDateTime(client.portal_last_login_at)} />
                  <div className="mt-5 rounded-xl border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
                    {canManage ? 'Workspace-safe password reset controls are intentionally kept separate from the public portal. Current credential status is shown here without exposing a password.' : 'Workspace owners and admins manage client portal credentials.'}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>What the client sees next</CardTitle><CardDescription>The nearest scheduled placement activity.</CardDescription></CardHeader>
                <CardContent>
                  {upcomingBookings.length === 0 ? (
                    <div className="flex min-h-44 flex-col items-center justify-center text-center"><CalendarDays className="mb-3 h-9 w-9 text-muted-foreground/50" /><p className="font-medium">No upcoming placement</p><p className="text-sm text-muted-foreground">Newly scheduled bookings will appear in the client portal.</p></div>
                  ) : (
                    <div className="space-y-3">{upcomingBookings.map((booking) => (
                      <div key={booking.id} className="flex items-center justify-between gap-4 rounded-xl border p-4"><div className="min-w-0"><p className="truncate font-medium">{booking.podcast_name}</p><p className="mt-1 text-sm text-muted-foreground">{formatDate(scheduledDate(booking))}</p></div><Badge variant="outline" className={bookingStatusStyles[booking.status]}>{labelForStatus(booking.status)}</Badge></div>
                    ))}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="podcasts" className="mt-0 space-y-6">
            <section aria-labelledby="podcast-activity-heading">
              <div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="podcast-activity-heading" className="text-xl font-semibold">Podcast activity</h2><p className="text-sm text-muted-foreground">The complete booking and publishing lifecycle.</p></div><Badge variant="outline">{bookings.length} total</Badge></div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard icon={CalendarDays} label="Booked" value={progress.booked} iconClassName="bg-emerald-50 text-emerald-600" />
                <MetricCard icon={Clock3} label="In progress" value={progress.inProgress} iconClassName="bg-amber-50 text-amber-600" />
                <MetricCard icon={Video} label="Recorded" value={progress.recorded} iconClassName="bg-blue-50 text-blue-600" />
                <MetricCard icon={Radio} label="Published" value={progress.published} iconClassName="bg-violet-50 text-violet-600" />
              </div>
            </section>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle>All placements</CardTitle><CardDescription>Booked, in progress, recorded, published, and cancelled appearances.</CardDescription></div><Button asChild variant="outline" size="sm"><Link to={finderHref}><Search className="mr-2 h-4 w-4" />Find more</Link></Button></CardHeader>
              <CardContent>
                {bookings.length === 0 ? (
                  <div className="flex min-h-44 flex-col items-center justify-center text-center"><CheckCircle2 className="mb-3 h-9 w-9 text-muted-foreground/50" /><p className="font-medium">No podcast activity yet</p><p className="text-sm text-muted-foreground">Find podcasts for this client, then track each opportunity here.</p><Button asChild variant="outline" className="mt-4"><Link to={finderHref}>Open Podcast Finder</Link></Button></div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Podcast</TableHead><TableHead>Host</TableHead><TableHead>Scheduled</TableHead><TableHead>Status</TableHead><TableHead>Episode</TableHead></TableRow></TableHeader>
                      <TableBody>{bookings.map((booking) => {
                        const podcastUrl = booking.podcast_url ? safeExternalUrl(booking.podcast_url) : null
                        const episodeUrl = booking.episode_url ? safeExternalUrl(booking.episode_url) : null
                        return (
                          <TableRow key={booking.id}>
                            <TableCell><div className="font-medium">{podcastUrl ? <a href={podcastUrl} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">{booking.podcast_name}</a> : booking.podcast_name}</div>{booking.notes && <p className="mt-1 max-w-md truncate text-xs text-muted-foreground">{booking.notes}</p>}</TableCell>
                            <TableCell>{booking.host_name || '—'}</TableCell>
                            <TableCell>{formatDate(scheduledDate(booking))}</TableCell>
                            <TableCell><Badge variant="outline" className={bookingStatusStyles[booking.status]}>{labelForStatus(booking.status)}</Badge></TableCell>
                            <TableCell>{episodeUrl ? <a href={episodeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Listen<ExternalLink className="h-3.5 w-3.5" /></a> : '—'}</TableCell>
                          </TableRow>
                        )
                      })}</TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="mt-0 space-y-6">
            <section aria-labelledby="client-resources-heading">
              <div className="mb-3"><h2 id="client-resources-heading" className="text-xl font-semibold">Onboarding and connected files</h2><p className="text-sm text-muted-foreground">The source material behind research, outreach, and client delivery.</p></div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ResourceCard icon={BookOpenCheck} title="Onboarding form" description={onboarding ? `Latest activity for ${onboarding.recipient_name}.` : 'Start or review this client’s intake and approved profile.'} status={onboarding ? labelForStatus(onboarding.status) : 'Not started'} statusClassName={onboarding ? onboardingStatusStyles[onboarding.status] : undefined}>
                  <Button asChild variant="outline" className="w-full"><Link to={onboardingHref}>{onboarding ? 'Review onboarding' : 'Open onboarding'}</Link></Button>
                </ResourceCard>
                <ResourceCard icon={FileSpreadsheet} title="Google Sheet" description="The exported shortlist and working podcast list for this client." status={googleSheetUrl ? 'Connected' : 'Not connected'} statusClassName={googleSheetUrl ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>
                  {googleSheetUrl ? <Button asChild variant="outline" className="w-full"><a href={googleSheetUrl} target="_blank" rel="noreferrer">Open Google Sheet<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button> : <Button disabled variant="outline" className="w-full">No sheet connected</Button>}
                </ResourceCard>
                <ResourceCard icon={Activity} title="Media kit" description="The approved bio, positioning, and speaking assets shared with hosts." status={mediaKitUrl ? 'Connected' : 'Not connected'} statusClassName={mediaKitUrl ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}>
                  {mediaKitUrl ? <Button asChild variant="outline" className="w-full"><a href={mediaKitUrl} target="_blank" rel="noreferrer">Open media kit<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button> : <Button disabled variant="outline" className="w-full">No media kit connected</Button>}
                </ResourceCard>
                <ResourceCard icon={LayoutDashboard} title="Original prospect page" description="The pre-client sales dashboard remains separate from active delivery." status={prospectDashboardHref ? 'Linked' : 'Not linked'} statusClassName={prospectDashboardHref ? 'border-sky-200 bg-sky-50 text-sky-800' : undefined}>
                  {prospectDashboardHref ? <Button asChild variant="outline" className="w-full"><a href={prospectDashboardHref} target="_blank" rel="noreferrer">Open prospect page<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button> : <Button disabled variant="outline" className="w-full">No prospect page linked</Button>}
                </ResourceCard>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
              <Card>
                <CardHeader><CardTitle>Approved client profile</CardTitle><CardDescription>Positioning used across discovery and outreach.</CardDescription></CardHeader>
                <CardContent className="space-y-5">
                  {client.bio ? <p className="whitespace-pre-wrap leading-7 text-muted-foreground">{client.bio}</p> : <div className="rounded-xl border border-dashed p-4"><p className="font-medium">No approved bio</p><p className="mt-1 text-sm text-muted-foreground">Complete onboarding before running personalized research.</p></div>}
                  <div className="grid gap-2 border-t pt-4 sm:grid-cols-2">
                    {websiteUrl && <a href={websiteUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border px-3 py-3 hover:bg-muted"><span className="inline-flex items-center gap-2"><Globe2 className="h-4 w-4 text-muted-foreground" />Website</span><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></a>}
                    {linkedInUrl && <a href={linkedInUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border px-3 py-3 hover:bg-muted"><span className="inline-flex items-center gap-2"><Linkedin className="h-4 w-4 text-muted-foreground" />LinkedIn</span><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></a>}
                    {calendarUrl && <a href={calendarUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg border px-3 py-3 hover:bg-muted"><span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" />Calendar</span><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></a>}
                    {!websiteUrl && !linkedInUrl && !calendarUrl && <p className="text-sm text-muted-foreground">No external profile links are connected yet.</p>}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Internal account notes</CardTitle><CardDescription>Workspace-only context for this client.</CardDescription></CardHeader>
                <CardContent>{client.notes ? <p className="whitespace-pre-wrap leading-7 text-muted-foreground">{client.notes}</p> : <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No internal notes have been added.</div>}</CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceClientDetail
