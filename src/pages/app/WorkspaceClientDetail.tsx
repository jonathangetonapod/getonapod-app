import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSpreadsheet,
  Globe2,
  KeyRound,
  LayoutDashboard,
  Linkedin,
  Loader2,
  Mail,
  Mic2,
  Radio,
  Search,
  UserRound,
  Video,
} from 'lucide-react'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
  const mediaKitUrl = client.media_kit_url ? safeExternalUrl(client.media_kit_url) : null
  const websiteUrl = client.website ? safeExternalUrl(client.website) : null
  const linkedInUrl = client.linkedin_url ? safeExternalUrl(client.linkedin_url) : null
  const dashboardHref = client.dashboard_enabled && client.dashboard_slug
    ? `/client/${encodeURIComponent(client.dashboard_slug)}`
    : null
  const onboardingHref = `${baseHref}/onboarding?client=${encodeURIComponent(client.id)}${onboarding ? `&instance=${encodeURIComponent(onboarding.id)}` : ''}`
  const finderHref = `${baseHref}/podcast-finder?client=${encodeURIComponent(client.id)}`
  const clientInitials = client.name.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C'

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

        <section aria-labelledby="podcast-progress-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 id="podcast-progress-heading" className="text-xl font-semibold">Podcast progress</h2><p className="text-sm text-muted-foreground">The core campaign stages from the legacy client view.</p></div>
            <Badge variant="outline">{bookings.length} total</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Booked', value: progress.booked, icon: CalendarDays, className: 'text-emerald-600 bg-emerald-50' },
              { label: 'In progress', value: progress.inProgress, icon: Clock3, className: 'text-amber-600 bg-amber-50' },
              { label: 'Recorded', value: progress.recorded, icon: Video, className: 'text-blue-600 bg-blue-50' },
              { label: 'Published', value: progress.published, icon: Radio, className: 'text-violet-600 bg-violet-50' },
            ].map((item) => (
              <Card key={item.label}><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-1 text-3xl font-bold">{item.value}</p></div><div className={`rounded-xl p-3 ${item.className}`}><item.icon className="h-5 w-5" /></div></CardContent></Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="client-tools-heading">
          <div className="mb-3"><h2 id="client-tools-heading" className="text-xl font-semibold">Client tools and access</h2><p className="text-sm text-muted-foreground">Everything connected to this client, collected in one place.</p></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ResourceCard
              icon={BookOpenCheck}
              title="Onboarding form"
              description={onboarding ? `Latest activity for ${onboarding.recipient_name}.` : 'Start or review this client’s intake and approved profile.'}
              status={onboarding ? labelForStatus(onboarding.status) : 'Not started'}
              statusClassName={onboarding ? onboardingStatusStyles[onboarding.status] : undefined}
            >
              <Button asChild variant="outline" className="w-full"><Link to={onboardingHref}>{onboarding ? 'Review onboarding' : 'Open onboarding'}</Link></Button>
            </ResourceCard>

            <ResourceCard
              icon={KeyRound}
              title="Client portal"
              description={client.email ? `Portal access for ${client.email}.` : 'Add a client email before enabling portal login.'}
              status={client.portal_access_enabled ? 'Enabled' : 'Disabled'}
              statusClassName={client.portal_access_enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}
            >
              <div className="mb-3 space-y-1 text-xs text-muted-foreground">
                <p>{canManage ? (client.password_set_at ? `Password set ${formatDate(client.password_set_at)}` : 'Password not configured') : 'Owners and admins manage portal credentials'}</p>
                <p>{client.portal_last_login_at ? `Last login ${formatDate(client.portal_last_login_at)}` : 'No recorded portal login'}</p>
              </div>
              <div className="grid gap-2">
                <Button asChild variant="outline" className="w-full"><a href="/portal/login" target="_blank" rel="noreferrer">Open portal login<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button>
                {canManage && <Button disabled variant="ghost" className="w-full">Password controls · Next</Button>}
              </div>
            </ResourceCard>

            <ResourceCard
              icon={FileSpreadsheet}
              title="Google Sheet"
              description="The podcast export and working list connected to this client."
              status={googleSheetUrl ? 'Connected' : 'Not connected'}
              statusClassName={googleSheetUrl ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}
            >
              {googleSheetUrl ? <Button asChild variant="outline" className="w-full"><a href={googleSheetUrl} target="_blank" rel="noreferrer">Open Google Sheet<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button> : <Button disabled variant="outline" className="w-full">Connect a Google Sheet</Button>}
            </ResourceCard>

            <ResourceCard
              icon={LayoutDashboard}
              title="Podcast dashboard"
              description="The client-facing podcast approval and campaign dashboard."
              status={dashboardHref ? 'Live' : client.dashboard_slug ? 'Hidden' : 'Not configured'}
              statusClassName={dashboardHref ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : undefined}
            >
              {dashboardHref ? <Button asChild variant="outline" className="w-full"><a href={dashboardHref} target="_blank" rel="noreferrer">Open client dashboard<ExternalLink className="ml-2 h-3.5 w-3.5" /></a></Button> : <Button disabled variant="outline" className="w-full">Dashboard setup · Next</Button>}
            </ResourceCard>
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
            <CardHeader><CardTitle>Profile and assets</CardTitle><CardDescription>Core information used across research and outreach.</CardDescription></CardHeader>
            <CardContent className="space-y-4 text-sm">
              {client.bio ? <div><p className="font-medium">Approved bio</p><p className="mt-1 line-clamp-5 leading-6 text-muted-foreground">{client.bio}</p></div> : <div className="rounded-xl border border-dashed p-3"><p className="font-medium">No approved bio</p><p className="text-muted-foreground">Complete onboarding before running personalized research.</p></div>}
              <div className="grid gap-2 border-t pt-4">
                {websiteUrl && <a href={websiteUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted"><span className="inline-flex items-center gap-2"><Globe2 className="h-4 w-4 text-muted-foreground" />Website</span><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></a>}
                {linkedInUrl && <a href={linkedInUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted"><span className="inline-flex items-center gap-2"><Linkedin className="h-4 w-4 text-muted-foreground" />LinkedIn</span><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></a>}
                {mediaKitUrl && <a href={mediaKitUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-muted"><span className="inline-flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-muted-foreground" />Media kit</span><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></a>}
                {!websiteUrl && !linkedInUrl && !mediaKitUrl && <p className="text-muted-foreground">No external profile links are connected yet.</p>}
              </div>
              {client.notes && <div className="border-t pt-4"><p className="font-medium">Internal notes</p><p className="mt-1 whitespace-pre-wrap leading-6 text-muted-foreground">{client.notes}</p></div>}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle>All podcast activity</CardTitle><CardDescription>Booked, in progress, recorded, published, and cancelled appearances.</CardDescription></div><Badge variant="outline">{bookings.length}</Badge></CardHeader>
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
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceClientDetail
