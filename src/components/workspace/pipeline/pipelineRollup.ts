import type { ClientPodcastSystemClient, ClientPodcastSystemItem } from '@/services/clientPodcastSystem'

/** Where a queue action is done: a shortlist row, a tab on the client record, or another page. */
export type ActionTarget =
  | { kind: 'item'; itemId: string }
  | { kind: 'record'; tab: 'profile' | 'shortlist' | 'intake'; filter?: 'not_reviewed' }
  | { kind: 'href'; href: string }

/*
 * What kind of work an action is, which is also its place in the queue: an
 * outreach issue blocks everything after it, a recorded episode is waiting on
 * one fact, a booked recording has a date coming, a host reply has a person
 * waiting, and a review batch waits on the client. Client-level work comes last.
 */
export type ActionKind = 'issue' | 'recorded' | 'booked' | 'conversation' | 'review' | 'client'

const KIND_RANK: Record<ActionKind, number> = {
  issue: 0,
  recorded: 1,
  booked: 2,
  conversation: 3,
  review: 4,
  client: 5,
}

export interface PipelineAction {
  /** Stable across renders, so the card chip can find its row. */
  id: string
  kind: ActionKind
  client: ClientPodcastSystemClient
  title: string
  detail: string
  /** The button: a verb and a count, never "Open". */
  verb: string
  /** Only a true blocker is drawn red. */
  blocking: boolean
  target: ActionTarget
}

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
  /** Every queue row this client owns, most pressing first. Empty unless active. */
  actions: PipelineAction[]
  needsAttention: boolean
  lastActivityAt: string | null
  /** Outreach, a booking or a later stage exists, so the client is underway. */
  pipelineStarted: boolean
}

// Stages that mean the client is already underway, so a missing intake was done some other way.
const STARTED_STAGES = new Set(['outreach', 'conversation', 'booked', 'recorded', 'published'])

const plural = (count: number, one: string, many: string) => `${count.toLocaleString()} ${count === 1 ? one : many}`

/** The client's first name as a possessive: "Dallas's". */
export function possessive(name: string): string {
  return `${name.trim().split(/\s+/u)[0] || name}'s`
}

/*
 * The work on one active client that needs a person today. Prep work that
 * moves at the operator's own pace (finding an email, finishing a pitch,
 * launching outreach) is not here: it lives behind the Approved count on the
 * card. Reply brief and onboarding gaps live on the Setup chip. Listing them
 * again here was how the page came to say the same thing four times.
 */
export function clientActions(
  client: ClientPodcastSystemClient,
  items: ClientPodcastSystemItem[],
  baseHref: string,
): PipelineAction[] {
  if (client.status !== 'active') return []
  const open = items.filter((item) => !item.terminal)
  const actions: PipelineAction[] = []
  const issues = open.filter((item) => item.has_conflict || item.campaign?.status === 'failed')
  if (issues.length > 0) {
    actions.push({
      id: `${client.id}:issue`,
      kind: 'issue',
      client,
      title: 'Resolve an outreach history issue',
      detail: `${plural(issues.length, 'podcast record needs', 'podcast records need')} review before more outreach.`,
      verb: `Review ${plural(issues.length, 'record', 'records')}`,
      blocking: true,
      target: { kind: 'item', itemId: issues[0].id },
    })
  }
  const flagged = new Set(issues.map((item) => item.id))
  for (const item of open) {
    if (flagged.has(item.id) || item.stage !== 'recorded') continue
    actions.push({
      id: `${client.id}:recorded:${item.id}`,
      kind: 'recorded',
      client,
      title: item.podcast.name,
      detail: item.booking?.publish_date
        ? `Recorded. Add the episode link once it is live on ${formattedDate(item.booking.publish_date)}.`
        : 'Recorded. Confirm when the episode goes live.',
      verb: item.booking?.publish_date ? 'Add episode link' : 'Confirm publish date',
      blocking: false,
      target: { kind: 'item', itemId: item.id },
    })
  }
  for (const item of open) {
    if (flagged.has(item.id) || item.stage !== 'booked' || item.booking?.prep_sent) continue
    const recording = item.booking?.recording_date || item.booking?.scheduled_date
    actions.push({
      id: `${client.id}:booked:${item.id}`,
      kind: 'booked',
      client,
      title: item.podcast.name,
      detail: recording ? `Booked for ${formattedDate(recording)}. Prep is not marked sent.` : 'Booked. Prep is not marked sent.',
      verb: 'Prep the client',
      blocking: false,
      target: { kind: 'item', itemId: item.id },
    })
  }
  const conversations = open.filter((item) => !flagged.has(item.id) && item.stage === 'conversation')
  if (conversations.length > 0) {
    actions.push({
      id: `${client.id}:conversation`,
      kind: 'conversation',
      client,
      title: conversations.length === 1 ? conversations[0].podcast.name : 'Hosts waiting on a reply',
      detail: conversations.length === 1
        ? 'The host replied.'
        : `${plural(conversations.length, 'host has', 'hosts have')} replied.`,
      verb: `Reply to ${plural(conversations.length, 'host', 'hosts')}`,
      blocking: false,
      // One reply opens where it is answered; several are read in the inbox.
      target: conversations.length === 1
        ? { kind: 'item', itemId: conversations[0].id }
        : { kind: 'href', href: `${baseHref}/master-inbox?client=${encodeURIComponent(client.id)}` },
    })
  }
  const awaitingReview = open.filter((item) => !flagged.has(item.id) && item.stage === 'awaiting_review')
  if (awaitingReview.length > 0) {
    actions.push({
      id: `${client.id}:review`,
      kind: 'review',
      client,
      title: `${plural(awaitingReview.length, 'podcast', 'podcasts')} waiting on ${possessive(client.name)} review`,
      detail: 'One batch on the client’s approval list.',
      verb: 'Open review batch',
      blocking: false,
      target: { kind: 'record', tab: 'shortlist', filter: 'not_reviewed' },
    })
  }
  if (client.onboarding?.status === 'submitted') {
    actions.push({
      id: `${client.id}:onboarding`,
      kind: 'client',
      client,
      title: 'Onboarding submitted',
      detail: 'The client sent their intake for review.',
      verb: 'Review onboarding',
      blocking: false,
      target: { kind: 'record', tab: 'intake' },
    })
  }
  if (items.length === 0) {
    actions.push({
      id: `${client.id}:first-podcasts`,
      kind: 'client',
      client,
      title: 'No podcasts yet',
      detail: 'Start a focused shortlist for this client.',
      verb: 'Add podcasts',
      blocking: false,
      target: { kind: 'record', tab: 'shortlist' },
    })
  }
  return actions
}

export function buildClientRollup(
  client: ClientPodcastSystemClient,
  allItems: ClientPodcastSystemItem[],
  today: string,
  baseHref: string,
): ClientRollup {
  const items = allItems.filter((item) => item.client.id === client.id)
  const open = items.filter((item) => !item.terminal)
  const actions = clientActions(client, items, baseHref)
  return {
    client,
    items,
    awaitingReview: open.filter((item) => item.stage === 'awaiting_review').length,
    preparation: open.filter((item) => ['approved', 'contact_needed', 'research_needed', 'ready'].includes(item.stage)).length,
    activeOutreach: open.filter((item) => item.stage === 'outreach').length,
    conversations: open.filter((item) => item.stage === 'conversation').length,
    placements: items.filter((item) => item.booking && item.booking.status !== 'cancelled').length,
    published: items.filter((item) => item.stage === 'published').length,
    upcomingRecordings: open.filter((item) => (
      Boolean(item.booking?.recording_date) && item.booking!.recording_date! >= today
    )).length,
    actions,
    needsAttention: actions.length > 0,
    // The server's client-level value counts only real events; folding in
    // each item's last_activity_at brought back shortlist edits and backfills.
    lastActivityAt: client.last_activity_at,
    pipelineStarted: items.some((item) => (
      Boolean(item.booking || item.legacy_outreach_at || item.campaign?.launched_at)
      || STARTED_STAGES.has(item.stage)
    )),
  }
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
  if (kpi === 'attention') return rollup.needsAttention
  if (kpi === 'conversations') return active && rollup.conversations > 0
  if (kpi === 'recordings') return active && rollup.upcomingRecordings > 0
  return rollup.published > 0
}

/** "Need attention" is the queue's own length, so the two can never disagree. */
export function kpiCounts(rollups: ClientRollup[], queue: PipelineAction[]): Record<PipelineKpi, number> {
  const active = rollups.filter((rollup) => rollup.client.status === 'active')
  return {
    active: active.length,
    attention: queue.length,
    conversations: active.reduce((sum, rollup) => sum + rollup.conversations, 0),
    recordings: active.reduce((sum, rollup) => sum + rollup.upcomingRecordings, 0),
    published: rollups.reduce((sum, rollup) => sum + rollup.published, 0),
  }
}

/** Every action across clients: issues, recorded, booked, replies, review batches, then client work. */
export function actionQueue(rollups: ClientRollup[]): PipelineAction[] {
  const lastActivity = new Map(rollups.map((rollup) => [rollup.client.id, rollup.lastActivityAt || '']))
  return rollups
    .flatMap((rollup) => rollup.actions)
    .sort((left, right) => (
      KIND_RANK[left.kind] - KIND_RANK[right.kind]
      // Within a kind, the client left longest goes first.
      || (lastActivity.get(left.client.id) || '').localeCompare(lastActivity.get(right.client.id) || '')
      || left.client.name.localeCompare(right.client.name)
      || left.title.localeCompare(right.title)
    ))
}

/** The rank of a client's most pressing action, for ordering the client list. */
export function topActionRank(rollup: ClientRollup): number {
  return rollup.actions.reduce((best, action) => Math.min(best, KIND_RANK[action.kind]), Number.POSITIVE_INFINITY)
}

export function actionHref(action: PipelineAction, baseHref: string): string | null {
  const { target } = action
  if (target.kind === 'href') return target.href
  if (target.kind === 'record') {
    const params = new URLSearchParams({ tab: target.tab })
    if (target.filter) params.set('filter', target.filter)
    return `${baseHref}/clients/${encodeURIComponent(action.client.id)}?${params.toString()}`
  }
  return null
}

export interface FunnelStage {
  key: 'podcasts' | 'review' | 'approved' | 'outreach' | 'replies' | 'placements'
  label: string
  count: number
  /** That client's list, filtered to this stage. */
  href: string
}

export function funnelStages(rollup: ClientRollup, baseHref: string): FunnelStage[] {
  const id = encodeURIComponent(rollup.client.id)
  const record = `${baseHref}/clients/${id}`
  return [
    { key: 'podcasts', label: 'Podcasts', count: rollup.items.length, href: `${record}?tab=shortlist` },
    { key: 'review', label: 'To review', count: rollup.awaitingReview, href: `${record}?tab=shortlist&filter=not_reviewed` },
    { key: 'approved', label: 'Approved', count: rollup.preparation, href: `${record}?tab=shortlist&filter=approved` },
    { key: 'outreach', label: 'Outreach', count: rollup.activeOutreach, href: `${baseHref}/client-campaigns/${id}` },
    { key: 'replies', label: 'Replies', count: rollup.conversations, href: `${baseHref}/master-inbox?client=${id}` },
    { key: 'placements', label: 'Placements', count: rollup.placements, href: `${record}?tab=placements` },
  ]
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

/**
 * With no intake on record, a client already in outreach or with placements
 * was onboarded before the intake form existed, or outside it. Calling that
 * "not started" contradicts the rest of the card.
 */
export function onboardingLabel(client: ClientPodcastSystemClient, pipelineStarted: boolean): string {
  if (!client.onboarding) return pipelineStarted ? 'Done outside intake' : 'Not started'
  if (client.onboarding.status === 'changes_requested') return 'Changes requested'
  if (client.onboarding.status === 'in_progress') return 'In progress'
  return client.onboarding.status.charAt(0).toUpperCase() + client.onboarding.status.slice(1)
}

/** Days without activity before an active client reads as stale. */
export const STALE_CLIENT_DAYS = 14

const DAY_MS = 86_400_000

export function daysSince(value: string | null, now = Date.now()): number | null {
  if (!value) return null
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return null
  return Math.max(0, Math.floor((now - time) / DAY_MS))
}

/** Only an active client can go stale; paused and churned are quiet on purpose. */
export function isStale(rollup: ClientRollup, now = Date.now()): boolean {
  const days = daysSince(rollup.lastActivityAt, now)
  return rollup.client.status === 'active' && days !== null && days > STALE_CLIENT_DAYS
}

export interface SetupItem {
  key: 'profile' | 'onboarding' | 'dashboard' | 'portal'
  label: string
  detail: string
  /** Null when it is not this person's to see, so it neither counts nor links. */
  done: boolean | null
  tab: 'profile' | 'intake' | 'sharing'
}

export function setupItems(client: ClientPodcastSystemClient, canManage: boolean, pipelineStarted: boolean): SetupItem[] {
  return [
    {
      key: 'profile',
      label: 'Reply brief',
      detail: client.profile.ready ? 'Reply brief ready' : `${client.profile.completed_fields}/${client.profile.total_fields} sections complete`,
      done: client.profile.ready,
      tab: 'profile',
    },
    {
      key: 'onboarding',
      label: 'Onboarding',
      detail: canManage ? onboardingLabel(client, pipelineStarted) : 'Owner/admin only',
      done: canManage ? client.onboarding?.status === 'approved' || (!client.onboarding && pipelineStarted) : null,
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
