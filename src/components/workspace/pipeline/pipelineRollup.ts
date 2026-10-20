import type { ClientPodcastSystemClient, ClientPodcastSystemItem } from '@/services/clientPodcastSystem'

/** Where a client's next action is done: a shortlist row, or a tab on the client record. */
export type NextActionTarget =
  | { kind: 'item'; itemId: string }
  | { kind: 'record'; tab: 'profile' | 'shortlist' | 'intake' }
  | null

export interface ClientRollup {
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

/** The portfolio stats double as filters on the client list. */
export type PipelineKpi = 'active' | 'attention' | 'conversations' | 'recordings' | 'published'

export const PIPELINE_KPI_LABELS: Record<PipelineKpi, string> = {
  active: 'Active clients',
  attention: 'Need attention',
  conversations: 'Open conversations',
  recordings: 'Upcoming recordings',
  published: 'Published episodes',
}

export function matchesKpi(rollup: ClientRollup, kpi: PipelineKpi): boolean {
  const active = rollup.client.status === 'active'
  if (kpi === 'active') return active
  if (kpi === 'attention') return active && rollup.needsAttention
  if (kpi === 'conversations') return active && rollup.conversations > 0
  if (kpi === 'recordings') return active && rollup.upcomingRecordings > 0
  return rollup.published > 0
}

export function kpiCounts(rollups: ClientRollup[]): Record<PipelineKpi, number> {
  const active = rollups.filter((rollup) => rollup.client.status === 'active')
  return {
    active: active.length,
    attention: active.filter((rollup) => rollup.needsAttention).length,
    conversations: active.reduce((sum, rollup) => sum + rollup.conversations, 0),
    recordings: active.reduce((sum, rollup) => sum + rollup.upcomingRecordings, 0),
    published: rollups.reduce((sum, rollup) => sum + rollup.published, 0),
  }
}

/*
 * How pressing a next action is. There is no due date on a next action yet,
 * so this reads the existing tone: an outreach conflict blocks all further
 * work, other urgent actions (host replies, an unprepared recording) are due
 * soon, and everything else is routine.
 * TODO: switch to real due dates (overdue / due this week) once next actions carry one.
 */
export type ActionUrgency = 'blocking' | 'soon' | 'routine'

export function actionUrgency(rollup: ClientRollup): ActionUrgency {
  const { tone, target } = rollup.nextAction
  if (tone !== 'urgent') return 'routine'
  const item = target?.kind === 'item' ? rollup.items.find((candidate) => candidate.id === target.itemId) : null
  if (item && (item.has_conflict || item.campaign?.status === 'failed')) return 'blocking'
  return 'soon'
}

const URGENCY_RANK: Record<ActionUrgency, number> = { blocking: 0, soon: 1, routine: 2 }

/** Clients with a pending next action, most pressing first, then the longest untouched. */
export function actionQueue(rollups: ClientRollup[]): ClientRollup[] {
  return rollups
    .filter((rollup) => rollup.client.status === 'active' && rollup.nextAction.tone !== 'clear')
    .sort((left, right) => (
      URGENCY_RANK[actionUrgency(left)] - URGENCY_RANK[actionUrgency(right)]
      || (left.lastActivityAt || '').localeCompare(right.lastActivityAt || '')
      || left.client.name.localeCompare(right.client.name)
    ))
}

export interface FunnelStage {
  label: string
  count: number
}

export function funnelStages(rollup: ClientRollup): FunnelStage[] {
  return [
    { label: 'Podcasts', count: rollup.items.length },
    { label: 'To review', count: rollup.awaitingReview },
    { label: 'Approved', count: rollup.preparation },
    { label: 'Outreach', count: rollup.activeOutreach },
    { label: 'Replies', count: rollup.conversations },
    { label: 'Placements', count: rollup.placements },
  ]
}

/*
 * The stage where the count falls furthest below the one before it. The
 * counts are where podcasts sit now, not how many passed through, so this is
 * a pointer rather than a conversion rate. "Podcasts" is the total of every
 * stage, so the comparison starts at To review → Approved.
 */
export function bottleneckIndex(stages: FunnelStage[]): number | null {
  let worst: number | null = null
  let worstDrop = 0
  for (let index = 2; index < stages.length; index += 1) {
    const drop = stages[index - 1].count - stages[index].count
    if (drop > worstDrop) {
      worstDrop = drop
      worst = index
    }
  }
  return worst
}

export function initials(value: string): string {
  return value.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C'
}

export function formattedDate(value: string | null | undefined, includeTime = false): string {
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

export function statusClassName(status: string): string {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'paused') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

export function onboardingLabel(client: ClientPodcastSystemClient): string {
  if (!client.onboarding) return 'Not started'
  if (client.onboarding.status === 'changes_requested') return 'Changes requested'
  if (client.onboarding.status === 'in_progress') return 'In progress'
  return client.onboarding.status.charAt(0).toUpperCase() + client.onboarding.status.slice(1)
}

/** Days without activity before an active client reads as going quiet, then as gone quiet. */
export const QUIET_CLIENT_DAYS = { warn: 7, alert: 14 } as const

export type QuietLevel = 'recent' | 'warn' | 'alert'

const DAY_MS = 86_400_000

export function daysSince(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return null
  return Math.max(0, Math.floor((now - time) / DAY_MS))
}

export function relativeDays(days: number | null): string {
  if (days === null) return 'No activity yet'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

/** Only an active client can go quiet; paused and churned are quiet on purpose. */
export function quietLevel(rollup: ClientRollup, days: number | null): QuietLevel {
  if (rollup.client.status !== 'active' || days === null) return 'recent'
  if (days > QUIET_CLIENT_DAYS.alert) return 'alert'
  if (days > QUIET_CLIENT_DAYS.warn) return 'warn'
  return 'recent'
}

export interface SetupItem {
  key: 'profile' | 'onboarding' | 'dashboard' | 'portal'
  label: string
  detail: string
  /** Null when it is not this person's to see, so it neither counts nor links. */
  done: boolean | null
  tab: 'profile' | 'intake' | 'sharing'
}

export function setupItems(client: ClientPodcastSystemClient, canManage: boolean): SetupItem[] {
  return [
    {
      key: 'profile',
      label: 'Guest profile',
      detail: client.profile.ready ? 'Reply brief ready' : `${client.profile.completed_fields}/${client.profile.total_fields} sections complete`,
      done: client.profile.ready,
      tab: 'profile',
    },
    {
      key: 'onboarding',
      label: 'Onboarding',
      detail: canManage ? onboardingLabel(client) : 'Owner/admin only',
      done: canManage ? client.onboarding?.status === 'approved' : null,
      tab: 'intake',
    },
    {
      key: 'dashboard',
      label: 'Approval dashboard',
      detail: client.dashboard_configured ? 'Live' : 'Not set up',
      done: client.dashboard_configured,
      tab: 'sharing',
    },
    {
      key: 'portal',
      label: 'Client portal',
      detail: client.portal.enabled ? 'Enabled' : 'Off',
      done: client.portal.enabled,
      tab: 'sharing',
    },
  ]
}
