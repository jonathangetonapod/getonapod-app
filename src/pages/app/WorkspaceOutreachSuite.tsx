import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowRight,
  Inbox,
  Layers3,
  Loader2,
  Mailbox,
  Megaphone,
  PlugZap,
  Send,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { WorkspaceLayout, type PlatformWorkspaceConfig } from '@/components/workspace/WorkspaceLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'
import {
  MY_WORKSPACE_BASE_HREF,
  selectedWorkspaceBaseHref,
  workspaceModuleHref,
  type WorkspaceModule,
} from '@/lib/workspaceRoutes'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type OutreachWorkspaceModule = Extract<
  WorkspaceModule,
  'client-campaigns' | 'master-inbox' | 'mailboxes'
>

interface WorkspaceOutreachSuiteProps {
  module: OutreachWorkspaceModule
  platformWorkspaceId?: string
}

interface SuiteItem {
  module: OutreachWorkspaceModule
  name: string
  shortDescription: string
  icon: LucideIcon
}

interface ModuleConfig extends SuiteItem {
  eyebrow: string
  description: string
  metrics: Array<{ label: string; detail: string }>
}

const suiteItems = [
  {
    module: 'client-campaigns',
    name: 'Client Campaigns',
    shortDescription: 'Launch and monitor outreach by client.',
    icon: Megaphone,
  },
  {
    module: 'master-inbox',
    name: 'Master Inbox',
    shortDescription: 'Handle every reply in one queue.',
    icon: Inbox,
  },
  {
    module: 'mailboxes',
    name: 'Mailboxes',
    shortDescription: 'Protect sender health and capacity.',
    icon: Mailbox,
  },
] as const satisfies readonly SuiteItem[]

const moduleConfigs: Record<OutreachWorkspaceModule, ModuleConfig> = {
  'client-campaigns': {
    ...suiteItems[0],
    eyebrow: 'Outreach command center',
    description: 'Plan, launch, and monitor Instantly-powered outreach without losing the client context behind each campaign.',
    metrics: [
      { label: 'Campaigns', detail: 'Synced from Instantly' },
      { label: 'Active clients', detail: 'Assigned to outreach' },
      { label: 'Replies', detail: 'Across all campaigns' },
    ],
  },
  'master-inbox': {
    ...suiteItems[1],
    eyebrow: 'One reply queue',
    description: 'Review conversations across every client and campaign, with the context needed to respond quickly and accurately.',
    metrics: [
      { label: 'Unread', detail: 'New conversations' },
      { label: 'Interested', detail: 'Positive intent' },
      { label: 'Needs response', detail: 'Open follow-up work' },
    ],
  },
  mailboxes: {
    ...suiteItems[2],
    eyebrow: 'Sending infrastructure',
    description: 'See every sending account, its warmup and health signals, capacity, and the clients it supports.',
    metrics: [
      { label: 'Connected', detail: 'Sending accounts' },
      { label: 'Healthy', detail: 'Ready to send' },
      { label: 'Daily capacity', detail: 'Across the workspace' },
    ],
  },
}

const MetricStrip = ({ metrics }: { metrics: ModuleConfig['metrics'] }) => (
  <div className="grid gap-3 sm:grid-cols-3">
    {metrics.map((metric) => (
      <Card key={metric.label} className="border-border/70 shadow-none">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">—</p>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground/60" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{metric.detail} after connection</p>
        </CardContent>
      </Card>
    ))}
  </div>
)

const DetailList = ({
  items,
}: {
  items: Array<{ title: string; description: string; icon: LucideIcon }>
}) => (
  <div className="divide-y divide-border">
    {items.map((item) => {
      const Icon = item.icon
      return (
        <div key={item.title} className="flex gap-3 py-4 first:pt-0 last:pb-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{item.title}</p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p>
          </div>
        </div>
      )
    })}
  </div>
)

const CampaignsContent = ({ baseHref }: { baseHref: string }) => (
  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/20 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Campaign roster</CardTitle>
          <CardDescription>Client assignments, sending state, volume, and performance will live here.</CardDescription>
        </div>
        <Badge variant="outline" className="mt-3 w-fit sm:mt-0">Awaiting first sync</Badge>
      </CardHeader>
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Megaphone className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">No Instantly campaigns synced yet</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Once this workspace is connected, campaigns will be matched to GOAP clients and managed from this roster.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to={workspaceModuleHref(baseHref, 'clients')}>
            Review workspace clients<ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Campaign operations</CardTitle>
        <CardDescription>The workspace view is designed around the decisions your team makes every day.</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailList items={[
          { title: 'Client ownership', description: 'Tie every campaign to one client and preserve workspace boundaries.', icon: Users },
          { title: 'Sequence visibility', description: 'See launch state, lead volume, sending progress, and next steps.', icon: Layers3 },
          { title: 'Reply performance', description: 'Follow positive replies and open conversations into the Master Inbox.', icon: Inbox },
        ]} />
      </CardContent>
    </Card>
  </div>
)

const InboxContent = () => (
  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Reply queue</CardTitle>
            <CardDescription>One place for replies from every client campaign.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Planned inbox views">
            {['All replies', 'Unread', 'Interested', 'Needs response'].map((label, index) => (
              <Badge key={label} variant={index === 0 ? 'secondary' : 'outline'}>{label}</Badge>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Inbox className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">Your master inbox is ready</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Replies will appear here after the Instantly connection is enabled. Until then, no external conversations are fetched or displayed.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Context travels with every reply</CardTitle>
        <CardDescription>The queue will make the next action clear without opening another system.</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailList items={[
          { title: 'Client and campaign', description: 'Know who the reply belongs to and which message generated it.', icon: Layers3 },
          { title: 'Complete thread', description: 'Read the original outreach and reply history before responding.', icon: Inbox },
          { title: 'Response workflow', description: 'Prioritize interest, unread conversations, and replies needing action.', icon: Send },
        ]} />
      </CardContent>
    </Card>
  </div>
)

const MailboxesContent = () => (
  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/20 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle>Sending accounts</CardTitle>
          <CardDescription>Health, warmup, limits, and assignments across the workspace.</CardDescription>
        </div>
        <Badge variant="outline" className="mt-3 w-fit sm:mt-0">No accounts connected</Badge>
      </CardHeader>
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Mailbox className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold">No mailboxes synced yet</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Instantly sending accounts will appear here only after a secure server-side connection is configured for this workspace.
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Mailbox health signals</CardTitle>
        <CardDescription>Spot capacity and deliverability risks before they affect a campaign.</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailList items={[
          { title: 'Warmup and status', description: 'See which accounts are healthy, paused, or need attention.', icon: Activity },
          { title: 'Daily capacity', description: 'Understand limits at the mailbox and workspace level.', icon: Send },
          { title: 'Client assignment', description: 'Know exactly which campaigns each sending account supports.', icon: Users },
        ]} />
      </CardContent>
    </Card>
  </div>
)

const WorkspaceOutreachSuite = ({ module, platformWorkspaceId }: WorkspaceOutreachSuiteProps) => {
  const { user, workspace } = useAuth()
  const selectedWorkspaceId = (platformWorkspaceId || '').toLowerCase()
  const isSelectedWorkspace = platformWorkspaceId !== undefined
  const validSelectedWorkspaceId = UUID_PATTERN.test(selectedWorkspaceId)
  const config = moduleConfigs[module]

  const selectedWorkspaceQuery = useQuery({
    queryKey: ['platform', user?.id || 'unknown', 'workspace', selectedWorkspaceId, module],
    queryFn: ({ signal }) => getAdminWorkspaceView(selectedWorkspaceId, signal),
    enabled: isSelectedWorkspace && validSelectedWorkspaceId,
    retry: false,
    gcTime: 0,
  })

  const effectiveWorkspace = isSelectedWorkspace
    ? selectedWorkspaceQuery.data?.workspace || null
    : workspace
  const baseHref = isSelectedWorkspace
    ? selectedWorkspaceBaseHref(selectedWorkspaceId)
    : MY_WORKSPACE_BASE_HREF
  const platformWorkspace: PlatformWorkspaceConfig | undefined = isSelectedWorkspace
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

  if (isSelectedWorkspace && selectedWorkspaceQuery.isLoading && validSelectedWorkspaceId) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <div className="flex min-h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      </WorkspaceLayout>
    )
  }

  const unavailable = isSelectedWorkspace
    ? !validSelectedWorkspaceId || selectedWorkspaceQuery.error || !effectiveWorkspace
    : !effectiveWorkspace
  if (unavailable) {
    return (
      <WorkspaceLayout platformWorkspace={platformWorkspace}>
        <Card>
          <CardHeader>
            <CardTitle>Workspace unavailable</CardTitle>
            <CardDescription>
              {selectedWorkspaceQuery.error instanceof Error
                ? selectedWorkspaceQuery.error.message
                : 'This workspace could not be loaded.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </WorkspaceLayout>
    )
  }

  const ActiveIcon = config.icon
  const workspaceLabel = effectiveWorkspace.is_default ? 'My Workspace' : effectiveWorkspace.name

  return (
    <WorkspaceLayout platformWorkspace={platformWorkspace}>
      <div className="min-w-0 space-y-5 sm:space-y-6">
        <section className="relative isolate overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 -z-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Instantly-powered outreach</Badge>
                <span className="text-xs font-medium text-muted-foreground">{workspaceLabel}</span>
              </div>
              <p className="mt-6 text-sm font-semibold text-primary">{config.eyebrow}</p>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                  <ActiveIcon className="h-5 w-5" />
                </div>
                <h1 className="min-w-0 text-3xl font-bold tracking-tight sm:text-4xl">{config.name}</h1>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {config.description}
              </p>
            </div>

            <div data-testid="instantly-connection-state" className="rounded-2xl border border-border/80 bg-background/85 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <PlugZap className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Instantly connection</p>
                  <p className="text-xs text-muted-foreground">Required before the first sync</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/70 px-3 py-2 text-xs font-medium">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                Not connected
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                Credentials will stay server-side and data will be isolated to this workspace.
              </p>
            </div>
          </div>
        </section>

        <nav aria-label="Outreach suite" className="grid gap-3 lg:grid-cols-3">
          {suiteItems.map((item) => {
            const Icon = item.icon
            const active = item.module === module
            return (
              <Link
                key={item.module}
                to={workspaceModuleHref(baseHref, item.module)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-4 transition-colors',
                  active
                    ? 'border-primary/40 bg-primary/[0.04] shadow-sm'
                    : 'border-border hover:border-primary/30 hover:bg-muted/30',
                )}
              >
                <div className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:text-foreground',
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.shortDescription}</p>
                </div>
                <ArrowRight className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground/60')} />
              </Link>
            )
          })}
        </nav>

        <MetricStrip metrics={config.metrics} />

        {module === 'client-campaigns' && <CampaignsContent baseHref={baseHref} />}
        {module === 'master-inbox' && <InboxContent />}
        {module === 'mailboxes' && <MailboxesContent />}

        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="leading-6">
            This is the workspace-safe Instantly foundation. It does not send email, fetch replies, or expose provider credentials until the server-side integration and workspace mappings are released.
          </p>
        </div>
      </div>
    </WorkspaceLayout>
  )
}

export default WorkspaceOutreachSuite
