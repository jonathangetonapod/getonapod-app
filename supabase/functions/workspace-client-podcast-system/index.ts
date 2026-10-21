import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import {
  type AuthContext,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireOnlyKeys,
  requireUuid,
  requireWorkspaceFeatureAccess,
} from '../_shared/workspaceAuth.ts'

const METHODS = ['POST'] as const
const PAGE_SIZE = 1_000
const MAX_ROWS_PER_SOURCE = 10_000
const LOOKUP_CHUNK_SIZE = 200
const MANAGER_ROLES = new Set(['owner', 'admin', 'platform_admin'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const AI_SDR_PROFILE_FIELDS = [
  'positioning',
  'topics_and_angles',
  'listener_takeaways',
  'proof_points',
  'ideal_opportunities',
  'booking_details',
] as const
const AI_SDR_CORE_FIELDS = [
  'positioning',
  'topics_and_angles',
  'listener_takeaways',
  'booking_details',
] as const
const STAGES = [
  'awaiting_review',
  'approved',
  'contact_needed',
  'research_needed',
  'ready',
  'outreach',
  'conversation',
  'booked',
  'recorded',
  'published',
] as const

type LifecycleStage = typeof STAGES[number]
type LifecycleOutcome = 'rejected' | 'cancelled' | 'archived' | null

interface ClientRow {
  id: string
  name: string
  status: string
  photo_url: string | null
  email: string | null
  contact_person: string | null
  website: string | null
  bio: string | null
  calendar_link: string | null
  media_kit_url: string | null
  dashboard_slug: string | null
  portal_access_enabled: boolean
  portal_last_login_at: string | null
  ai_sdr_profile: Record<string, unknown> | null
  ai_sdr_profile_updated_at: string | null
  created_at: string
  updated_at: string
}

interface OnboardingRow {
  id: string
  client_id: string
  status: 'invited' | 'in_progress' | 'submitted' | 'changes_requested' | 'approved' | 'expired' | 'revoked'
  invited_at: string
  submitted_at: string | null
  approved_at: string | null
  updated_at: string
  archived_at: string | null
}

interface ShortlistRow {
  id: string
  client_id: string
  podcast_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  audience_size: number | null
  ai_clean_description: string | null
  ai_fit_reasons: string[] | null
  ai_pitch_angles: Array<{ title?: unknown; description?: unknown }> | null
  ai_analyzed_at: string | null
  visibility: 'visible' | 'archived'
  operator_notes: string | null
  created_at: string
  updated_at: string
}

interface CatalogRow {
  id: string
  podscan_id: string
  podcast_name: string
  podcast_description: string | null
  podcast_image_url: string | null
  podcast_url: string | null
  publisher_name: string | null
  host_name: string | null
  audience_size: number | null
  podscan_email: string | null
  last_posted_at: string | null
}

interface AnalysisRow {
  client_id: string
  podcast_id: string
  ai_clean_description: string | null
  ai_fit_reasons: string[] | null
  ai_pitch_angles: Array<{ title?: unknown; description?: unknown }> | null
  ai_analyzed_at: string | null
  updated_at: string | null
}

interface FeedbackRow {
  client_id: string
  podcast_id: string
  status: 'approved' | 'rejected' | null
  notes: string | null
  updated_at: string | null
}

interface LegacyOutreachRow {
  client_id: string
  podcast_id: string
  webhook_sent_at: string | null
  created_at: string | null
}

/** One timestamped thing that happened to a client, from any source. */
interface ClientEventRow {
  client_id: string
  at: string | null
}

interface CampaignTargetRow {
  id: string
  campaign_id: string
  client_id: string
  shortlist_podcast_id: string
  status: 'draft' | 'ready' | 'launching' | 'in_outreach' | 'replied' | 'completed' | 'failed'
  host_name: string | null
  contact_email: string | null
  research_notes: string | null
  pitch_subject: string | null
  pitch_body: string | null
  email_open_count: number
  email_reply_count: number
  launched_at: string | null
  last_activity_at: string | null
  last_error: string | null
  updated_at: string
}

interface BookingRow {
  id: string
  client_id: string
  podcast_id: string | null
  podcast_name: string
  podcast_url: string | null
  host_name: string | null
  scheduled_date: string | null
  recording_date: string | null
  publish_date: string | null
  status: 'conversation_started' | 'in_progress' | 'booked' | 'recorded' | 'published' | 'cancelled'
  episode_url: string | null
  prep_sent: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

interface DirectContactRow {
  podcast_id: string
  email: string
  host_name: string | null
  verification_status: string
  last_verified_at: string | null
}

interface LifecycleBooking {
  id: string
  match: 'podcast_id' | 'podcast_name'
  status: BookingRow['status']
  host_name: string | null
  scheduled_date: string | null
  recording_date: string | null
  publish_date: string | null
  episode_url: string | null
  prep_sent: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

interface PageResult<T> {
  data: T[] | null
  error: unknown
}

interface Loaded<T> {
  rows: T[]
  truncated: boolean
}

/**
 * Pages through a source up to `budget` rows. Reaching the budget no longer
 * refuses the whole page: a large workspace gets the newest rows and a
 * truncated flag the UI states, rather than a 409 and nothing at all.
 */
async function loadAll<T>(
  unavailableCode: string,
  loader: (from: number, to: number) => PromiseLike<PageResult<T>>,
  budget = MAX_ROWS_PER_SOURCE,
): Promise<Loaded<T>> {
  const rows: T[] = []
  for (let from = 0; from < budget; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, budget) - 1
    const result = await loader(from, to)
    if (result.error) {
      throw new HttpError(500, unavailableCode, 'The Client Command Center could not be loaded')
    }
    const page = result.data || []
    rows.push(...page)
    if (page.length < to - from + 1) return { rows, truncated: false }
  }
  // Exactly at the budget: one more row decides whether anything was left out.
  const peek = await loader(budget, budget)
  if (peek.error) {
    throw new HttpError(500, unavailableCode, 'The Client Command Center could not be loaded')
  }
  return { rows, truncated: (peek.data || []).length > 0 }
}

/**
 * The same, for a source filtered by client. The client ids go out in chunks
 * so a workspace with many clients never builds an `in` filter longer than a
 * request line can carry. The row budget is shared across chunks.
 */
async function loadForClients<T>(
  unavailableCode: string,
  clientIds: string[],
  loader: (clientIdChunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<Loaded<T>> {
  const rows: T[] = []
  for (const clientIdChunk of chunks(clientIds)) {
    const remaining = MAX_ROWS_PER_SOURCE - rows.length
    if (remaining <= 0) return { rows, truncated: true }
    const result = await loadAll(unavailableCode, (from, to) => loader(clientIdChunk, from, to), remaining)
    rows.push(...result.rows)
    if (result.truncated) return { rows, truncated: true }
  }
  return { rows, truncated: false }
}

/**
 * Index rows by key keeping the FIRST row seen. Every source is read newest
 * first, so the first row for a key is the current one; a plain Map built
 * from the array kept the last, which was the oldest.
 */
function firstByKey<T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T> {
  const result = new Map<K, T>()
  for (const row of rows) {
    const key = keyOf(row)
    if (!result.has(key)) result.set(key, row)
  }
  return result
}

/**
 * A source that only feeds last activity. Losing it should mark the answer
 * partial, not take the whole pipeline down with it.
 */
async function optionalLoad<T>(load: Promise<Loaded<T>>): Promise<Loaded<T>> {
  try {
    return await load
  } catch {
    return { rows: [], truncated: true }
  }
}

function chunks<T>(values: T[]): T[][] {
  const result: T[][] = []
  for (let offset = 0; offset < values.length; offset += LOOKUP_CHUNK_SIZE) {
    result.push(values.slice(offset, offset + LOOKUP_CHUNK_SIZE))
  }
  return result
}

async function loadCatalog(
  admin: AuthContext['admin'],
  podcastIds: string[],
): Promise<CatalogRow[]> {
  const rowsById = new Map<string, CatalogRow>()
  for (const podcastIdChunk of chunks(podcastIds)) {
    const { data, error } = await admin
      .from('podcasts')
      .select('id,podscan_id,podcast_name,podcast_description,podcast_image_url,podcast_url,publisher_name,host_name,audience_size,podscan_email,last_posted_at')
      .in('podscan_id', podcastIdChunk)
    if (error) {
      throw new HttpError(500, 'CLIENT_PODCAST_CATALOG_UNAVAILABLE', 'The Client Command Center could not be loaded')
    }
    for (const row of (data || []) as unknown as CatalogRow[]) rowsById.set(row.id, row)
  }
  const canonicalIds = podcastIds.filter((podcastId) => UUID_PATTERN.test(podcastId))
  for (const podcastIdChunk of chunks(canonicalIds)) {
    const { data, error } = await admin
      .from('podcasts')
      .select('id,podscan_id,podcast_name,podcast_description,podcast_image_url,podcast_url,publisher_name,host_name,audience_size,podscan_email,last_posted_at')
      .in('id', podcastIdChunk)
    if (error) {
      throw new HttpError(500, 'CLIENT_PODCAST_CATALOG_UNAVAILABLE', 'The Client Command Center could not be loaded')
    }
    for (const row of (data || []) as unknown as CatalogRow[]) rowsById.set(row.id, row)
  }
  return Array.from(rowsById.values())
}

async function loadDirectContacts(
  admin: AuthContext['admin'],
  podcastIds: string[],
): Promise<DirectContactRow[]> {
  const rows: DirectContactRow[] = []
  for (const podcastIdChunk of chunks(podcastIds)) {
    const { data, error } = await admin
      .from('podcast_direct_contacts')
      .select('podcast_id,email,host_name,verification_status,last_verified_at')
      .in('podcast_id', podcastIdChunk)
      .eq('verification_status', 'verified')
      .order('last_verified_at', { ascending: false, nullsFirst: false })
    if (error) {
      throw new HttpError(500, 'CLIENT_PODCAST_CONTACTS_UNAVAILABLE', 'The Client Command Center could not be loaded')
    }
    rows.push(...(data || []) as unknown as DirectContactRow[])
  }
  return rows
}

interface ThreadStateRow {
  thread_key: string
  client_id: string
  podcast_id: string | null
  status: string | null
  updated_at: string | null
}

/**
 * What is known about the conversation with this host.
 *
 * Two independent signals, and they answer different questions. A thread row
 * means the reply has been read into the inbox and can be opened directly. A
 * campaign reply count means the last Instantly sync saw a reply, which can be
 * true before anyone has opened Master Inbox — so a placement can honestly
 * report "the host replied" while having no thread to link to yet.
 */
function conversationFor(
  thread: ThreadStateRow | null,
  target: CampaignTargetRow | null | undefined,
): {
  thread_key: string | null
  status: string | null
  replied: boolean
  updated_at: string | null
} | null {
  const replyCount = target?.email_reply_count ?? 0
  if (!thread && replyCount < 1) return null
  return {
    thread_key: thread?.thread_key ?? null,
    status: thread?.status ?? null,
    replied: replyCount > 0 || Boolean(thread),
    updated_at: thread?.updated_at ?? target?.last_activity_at ?? null,
  }
}

function recordKey(clientId: string, podcastId: string): string {
  return `${clientId}:${podcastId.trim().toLowerCase()}`
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function validEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() || ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) || null
}

function aiSdrReadiness(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const completedFields = AI_SDR_PROFILE_FIELDS.filter((field) => (
    typeof source[field] === 'string' && source[field].trim().length > 0
  ))
  const missingCoreFields = AI_SDR_CORE_FIELDS.filter((field) => !completedFields.includes(field))
  return {
    ready: missingCoreFields.length === 0,
    completed_fields: completedFields.length,
    total_fields: AI_SDR_PROFILE_FIELDS.length,
  }
}

function profileText(value: unknown, field: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const text = (value as Record<string, unknown>)[field]
  return typeof text === 'string' && text.trim() ? text.trim() : null
}

function pitchAngles(value: AnalysisRow['ai_pitch_angles'] | ShortlistRow['ai_pitch_angles']): Array<{ title: string; description: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((angle) => {
    if (!angle || typeof angle !== 'object') return []
    const title = typeof angle.title === 'string' ? angle.title.trim() : ''
    const description = typeof angle.description === 'string' ? angle.description.trim() : ''
    return title && description ? [{ title, description }] : []
  }).slice(0, 3)
}

function bookingStage(booking: BookingRow | null): LifecycleStage | null {
  if (!booking) return null
  if (booking.status === 'published') return 'published'
  if (booking.status === 'recorded') return 'recorded'
  if (booking.status === 'booked') return 'booked'
  if (booking.status === 'conversation_started' || booking.status === 'in_progress') return 'conversation'
  return null
}

function targetStage(target: CampaignTargetRow | null): LifecycleStage | null {
  if (!target) return null
  if (target.status === 'replied') return 'conversation'
  if (['launching', 'in_outreach', 'completed'].includes(target.status)) return 'outreach'
  if (target.status === 'ready') return 'ready'
  if (!validEmail(target.contact_email)) return 'contact_needed'
  return 'research_needed'
}

function deriveStage(input: {
  booking: BookingRow | null
  target: CampaignTargetRow | null
  legacyOutreach: LegacyOutreachRow | null
  feedback: FeedbackRow | null
}): LifecycleStage {
  return bookingStage(input.booking)
    || targetStage(input.target)
    || (input.legacyOutreach ? 'outreach' : null)
    || (input.feedback?.status === 'approved' ? 'approved' : null)
    || 'awaiting_review'
}

function deriveOutcome(shortlist: ShortlistRow, feedback: FeedbackRow | null, booking: BookingRow | null): LifecycleOutcome {
  if (booking?.status === 'cancelled') return 'cancelled'
  if (feedback?.status === 'rejected') return 'rejected'
  if (shortlist.visibility === 'archived') return 'archived'
  return null
}

function nextAction(stage: LifecycleStage, outcome: LifecycleOutcome, target: CampaignTargetRow | null, booking: BookingRow | null): string | null {
  if (outcome) return null
  if (target?.status === 'failed') return 'Resolve the campaign delivery issue'
  if (stage === 'awaiting_review') return 'Get the client decision'
  if (stage === 'approved') return 'Prepare contact, research, and pitch'
  if (stage === 'contact_needed') return 'Add a verified contact email'
  if (stage === 'research_needed') return 'Complete and review the pitch package'
  if (stage === 'ready') return 'Launch the reviewed campaign pitch'
  if (stage === 'outreach') return 'Monitor outreach and follow-ups'
  if (stage === 'conversation') return 'Reply and move toward scheduling'
  if (stage === 'booked') return booking?.prep_sent ? 'Confirm the recording details' : 'Prepare the client for the recording'
  if (stage === 'recorded') return 'Confirm the publication date and episode link'
  return null
}

function terminal(stage: LifecycleStage, outcome: LifecycleOutcome): boolean {
  return stage === 'published' || outcome !== null
}

function presentedBooking(
  booking: BookingRow,
  match: LifecycleBooking['match'],
): LifecycleBooking {
  return {
    id: booking.id,
    match,
    status: booking.status,
    host_name: booking.host_name,
    scheduled_date: booking.scheduled_date,
    recording_date: booking.recording_date,
    publish_date: booking.publish_date,
    episode_url: booking.episode_url,
    prep_sent: booking.prep_sent,
    notes: booking.notes,
    created_at: booking.created_at,
    updated_at: booking.updated_at,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)

  try {
    if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')

    const body = await parseJsonObject(req, 4_096)
    requireOnlyKeys(body, ['action', 'workspace_id', 'client_id'])
    if (body.action !== 'list') {
      throw new HttpError(400, 'INVALID_ACTION', 'Unknown Client Command Center action')
    }

    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')
    // Optional: one client's pipeline, for the client detail page, which
    // otherwise downloaded the whole workspace to show a single client.
    const onlyClientId = body.client_id === undefined || body.client_id === null
      ? null
      : requireUuid(body.client_id, 'client_id')
    const context = await requireAuthenticatedUser(req)
    const access = await requireWorkspaceFeatureAccess(context, workspaceId)
    const canManage = MANAGER_ROLES.has(access.role)

    const clientsLoaded = await loadAll<ClientRow>('CLIENT_PODCAST_CLIENTS_UNAVAILABLE', (from, to) => {
      let query = context.admin
        .from('clients')
        .select('id,name,status,photo_url,email,contact_person,website,bio,calendar_link,media_kit_url,dashboard_slug,portal_access_enabled,portal_last_login_at,ai_sdr_profile,ai_sdr_profile_updated_at,created_at,updated_at')
        .eq('workspace_id', workspaceId)
      if (onlyClientId) query = query.eq('id', onlyClientId)
      return query
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<PageResult<ClientRow>>
    })
    const clients = clientsLoaded.rows
    const clientIds = clients.map((client) => client.id)
    if (onlyClientId && clientIds.length === 0) {
      throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
    }

    if (clientIds.length === 0) {
      return jsonResponse(req, METHODS, 200, {
        workspace: {
          id: access.workspace.id,
          name: access.workspace.name,
          // The shell brands itself from this, and this page was the only one
          // not sending it, so a platform admin walking into the command center
          // watched the tenant's logo drop to initials and come back on the
          // next page. Already loaded by the access check; only ever omitted.
          logo_path: access.workspace.logo_path ?? null,
          logo_updated_at: access.workspace.logo_updated_at ?? null,
        },
        viewer_role: access.role,
        can_manage: canManage,
        generated_at: new Date().toISOString(),
        truncated: false,
        truncated_sources: [],
        clients: [],
        summary: {
          total: 0,
          active: 0,
          completed: 0,
          needs_attention: 0,
          upcoming_recordings: 0,
          awaiting_publication: 0,
          stage_counts: Object.fromEntries(STAGES.map((stage) => [stage, 0])),
        },
        items: [],
      })
    }

    const [
      shortlistLoaded,
      feedbackLoaded,
      legacyOutreachLoaded,
      targetsLoaded,
      bookingsLoaded,
      analysesLoaded,
      onboardingLoaded,
      statusEventsLoaded,
      legacyMessagesLoaded,
    ] = await Promise.all([
      loadForClients<ShortlistRow>('CLIENT_PODCAST_SHORTLIST_UNAVAILABLE', clientIds, (ids, from, to) => (
        context.admin
          .from('client_dashboard_podcasts')
          .select('id,client_id,podcast_id,podcast_name,podcast_description,podcast_image_url,podcast_url,publisher_name,audience_size,ai_clean_description,ai_fit_reasons,ai_pitch_angles,ai_analyzed_at,visibility,operator_notes,created_at,updated_at')
          .in('client_id', ids)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<PageResult<ShortlistRow>>
      )),
      loadForClients<FeedbackRow>('CLIENT_PODCAST_FEEDBACK_UNAVAILABLE', clientIds, (ids, from, to) => (
        context.admin
          .from('client_podcast_feedback')
          .select('client_id,podcast_id,status,notes,updated_at')
          .in('client_id', ids)
          .order('updated_at', { ascending: false })
          .range(from, to) as unknown as PromiseLike<PageResult<FeedbackRow>>
      )),
      loadForClients<LegacyOutreachRow>('CLIENT_PODCAST_OUTREACH_UNAVAILABLE', clientIds, (ids, from, to) => (
        context.admin
          .from('podcast_outreach_actions')
          .select('client_id,podcast_id,webhook_sent_at,created_at')
          .in('client_id', ids)
          .eq('action', 'sent')
          .gte('webhook_response_status', 200)
          .lt('webhook_response_status', 300)
          .order('updated_at', { ascending: false })
          .range(from, to) as unknown as PromiseLike<PageResult<LegacyOutreachRow>>
      )),
      loadAll<CampaignTargetRow>('CLIENT_PODCAST_CAMPAIGNS_UNAVAILABLE', (from, to) => {
        let query = context.admin
          .from('workspace_client_campaign_targets')
          .select('id,campaign_id,client_id,shortlist_podcast_id,status,host_name,contact_email,research_notes,pitch_subject,pitch_body,email_open_count,email_reply_count,launched_at,last_activity_at,last_error,updated_at')
          .eq('workspace_id', workspaceId)
        if (onlyClientId) query = query.eq('client_id', onlyClientId)
        return query
          .order('updated_at', { ascending: false })
          .range(from, to) as unknown as PromiseLike<PageResult<CampaignTargetRow>>
      }),
      loadForClients<BookingRow>('CLIENT_PODCAST_BOOKINGS_UNAVAILABLE', clientIds, (ids, from, to) => (
        context.admin
          .from('bookings')
          .select('id,client_id,podcast_id,podcast_name,podcast_url,host_name,scheduled_date,recording_date,publish_date,status,episode_url,prep_sent,notes,created_at,updated_at')
          .in('client_id', ids)
          .order('updated_at', { ascending: false })
          .range(from, to) as unknown as PromiseLike<PageResult<BookingRow>>
      )),
      loadForClients<AnalysisRow>('CLIENT_PODCAST_ANALYSES_UNAVAILABLE', clientIds, (ids, from, to) => (
        context.admin
          .from('client_podcast_analyses')
          .select('client_id,podcast_id,ai_clean_description,ai_fit_reasons,ai_pitch_angles,ai_analyzed_at,updated_at')
          .in('client_id', ids)
          .order('updated_at', { ascending: false })
          .range(from, to) as unknown as PromiseLike<PageResult<AnalysisRow>>
      )),
      loadForClients<OnboardingRow>('CLIENT_PODCAST_ONBOARDING_UNAVAILABLE', clientIds, (ids, from, to) => (
        context.admin
          .from('workspace_onboarding_instances')
          .select('id,client_id,status,invited_at,submitted_at,approved_at,updated_at,archived_at')
          .eq('workspace_id', workspaceId)
          .in('client_id', ids)
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<PageResult<OnboardingRow>>
      )),
      // Status changes, and outreach sent by the legacy Email Bison flow, which
      // records its sends here rather than in podcast_outreach_actions. Both
      // count as client activity and nothing else on this page reads them.
      optionalLoad(loadForClients<ClientEventRow>('CLIENT_PODCAST_STATUS_EVENTS_UNAVAILABLE', clientIds, (ids, from, to) => (
        context.admin
          .from('workspace_client_status_events')
          .select('client_id,at:created_at')
          .eq('workspace_id', workspaceId)
          .in('client_id', ids)
          .order('created_at', { ascending: false })
          .range(from, to) as unknown as PromiseLike<PageResult<ClientEventRow>>
      ))),
      optionalLoad(loadForClients<ClientEventRow>('CLIENT_PODCAST_LEGACY_MESSAGES_UNAVAILABLE', clientIds, (ids, from, to) => (
        context.admin
          .from('outreach_messages')
          .select('client_id,at:sent_at')
          .in('client_id', ids)
          .eq('status', 'sent')
          .not('sent_at', 'is', null)
          .order('sent_at', { ascending: false })
          .range(from, to) as unknown as PromiseLike<PageResult<ClientEventRow>>
      ))),
    ])
    const shortlist = shortlistLoaded.rows
    const feedback = feedbackLoaded.rows
    const legacyOutreach = legacyOutreachLoaded.rows
    const targets = targetsLoaded.rows
    const bookings = bookingsLoaded.rows
    const analyses = analysesLoaded.rows
    const onboarding = onboardingLoaded.rows

    // The conversation each placement already has in Master Inbox. Threads
    // record the show they came from at ingestion, so this is a join rather
    // than a provider call — and it is what turns "open the client's inbox and
    // hunt" into opening the one thread that belongs to this host.
    const THREAD_LIMIT = 5_000
    let threadQuery = context.admin
      .from('workspace_inbox_thread_state')
      .select('thread_key,client_id,podcast_id,status,updated_at')
      .eq('workspace_id', workspaceId)
      .not('podcast_id', 'is', null)
    if (onlyClientId) threadQuery = threadQuery.eq('client_id', onlyClientId)
    const { data: threadStateRows, error: threadStateError } = await threadQuery
      .order('updated_at', { ascending: false })
      .limit(THREAD_LIMIT)
    // Replies the inbox could not tie to a show still happened to the client,
    // so last activity reads them even though no opportunity can link to them.
    let unlinkedThreadQuery = context.admin
      .from('workspace_inbox_thread_state')
      .select('client_id,updated_at')
      .eq('workspace_id', workspaceId)
      .is('podcast_id', null)
    if (onlyClientId) unlinkedThreadQuery = unlinkedThreadQuery.eq('client_id', onlyClientId)
    const { data: unlinkedThreadRows, error: unlinkedThreadError } = await unlinkedThreadQuery
      .order('updated_at', { ascending: false })
      .limit(THREAD_LIMIT)
    const threadByClientPodcast = new Map<string, ThreadStateRow>()
    for (const row of (threadStateRows || []) as unknown as ThreadStateRow[]) {
      if (!row.podcast_id) continue
      // Ordered newest first, so the first row for a pair is the live one.
      const key = recordKey(row.client_id, row.podcast_id)
      if (!threadByClientPodcast.has(key)) threadByClientPodcast.set(key, row)
    }

    // Which sources were cut short, so the page can say its counts are partial
    // instead of presenting them as the whole workspace.
    const truncatedSources = [
      ['clients', clientsLoaded.truncated],
      ['shortlist', shortlistLoaded.truncated],
      ['feedback', feedbackLoaded.truncated],
      ['legacy_outreach', legacyOutreachLoaded.truncated],
      ['campaign_targets', targetsLoaded.truncated],
      ['bookings', bookingsLoaded.truncated],
      ['analyses', analysesLoaded.truncated],
      ['onboarding', onboardingLoaded.truncated],
      // A failed thread read leaves conversations unknown, which is also partial.
      ['inbox_threads', Boolean(threadStateError) || (threadStateRows || []).length >= THREAD_LIMIT],
      ['inbox_activity', Boolean(unlinkedThreadError) || (unlinkedThreadRows || []).length >= THREAD_LIMIT],
      ['status_events', statusEventsLoaded.truncated],
      ['legacy_outreach_messages', legacyMessagesLoaded.truncated],
    ].flatMap(([source, cut]) => (cut ? [source as string] : []))

    const uniquePodcastIds = Array.from(new Set([
      ...shortlist.map((podcast) => podcast.podcast_id),
      ...bookings.flatMap((booking) => booking.podcast_id ? [booking.podcast_id] : []),
    ]))
    const catalog = await loadCatalog(context.admin, uniquePodcastIds)
    const directContacts = await loadDirectContacts(context.admin, catalog.map((podcast) => podcast.id))

    const clientsById = new Map(clients.map((client) => [client.id, client]))
    const catalogByPodscanId = new Map(catalog.map((podcast) => [podcast.podscan_id, podcast]))
    const catalogById = new Map(catalog.map((podcast) => [podcast.id, podcast]))
    const feedbackByKey = firstByKey(feedback, (row) => recordKey(row.client_id, row.podcast_id))
    const outreachByKey = firstByKey(legacyOutreach, (row) => recordKey(row.client_id, row.podcast_id))
    const targetByShortlistId = firstByKey(targets, (row) => row.shortlist_podcast_id)
    const analysisByKey = firstByKey(analyses, (row) => recordKey(row.client_id, row.podcast_id))
    const directContactByPodcastId = firstByKey(directContacts, (row) => row.podcast_id)
    const onboardingByClientId = new Map<string, OnboardingRow>()
    for (const row of onboarding) {
      if (!row.archived_at && !onboardingByClientId.has(row.client_id)) {
        onboardingByClientId.set(row.client_id, row)
      }
    }
    const bookingById = new Map<string, BookingRow>()
    const bookingByName = new Map<string, BookingRow>()
    bookings.forEach((booking) => {
      if (booking.podcast_id) {
        const key = recordKey(booking.client_id, booking.podcast_id)
        if (!bookingById.has(key)) bookingById.set(key, booking)
      }
      const nameKey = recordKey(booking.client_id, normalizedName(booking.podcast_name))
      if (!bookingByName.has(nameKey)) bookingByName.set(nameKey, booking)
    })

    // A client's last activity is the newest thing that actually happened to
    // them: outreach sent, a host reply, a status change, a client decision, an
    // onboarding step or a placement. Not clients.updated_at or a shortlist
    // row's updated_at, which move with every edit and every backfill — a
    // migration that touched every client had every card showing the day it ran.
    const clientActivity = new Map<string, string>()
    const noteActivity = (clientId: string, values: Array<string | null | undefined>) => {
      const latest = latestTimestamp([clientActivity.get(clientId), ...values])
      if (latest) clientActivity.set(clientId, latest)
    }
    for (const row of [...statusEventsLoaded.rows, ...legacyMessagesLoaded.rows]) {
      noteActivity(row.client_id, [row.at])
    }
    for (const row of [
      ...((threadStateRows || []) as unknown as ThreadStateRow[]),
      ...((unlinkedThreadRows || []) as unknown as Array<Pick<ThreadStateRow, 'client_id' | 'updated_at'>>),
    ]) {
      noteActivity(row.client_id, [row.updated_at])
    }
    for (const row of onboarding) {
      if (!row.archived_at) noteActivity(row.client_id, [row.invited_at, row.submitted_at, row.approved_at, row.updated_at])
    }

    const matchedBookingIds = new Set<string>()
    const shortlistItems = shortlist.map((row) => {
      const client = clientsById.get(row.client_id)
      const podcast = catalogByPodscanId.get(row.podcast_id) || null
      const feedbackRow = feedbackByKey.get(recordKey(row.client_id, row.podcast_id)) || null
      const legacyOutreachRow = outreachByKey.get(recordKey(row.client_id, row.podcast_id)) || null
      const target = targetByShortlistId.get(row.id) || null
      const analysis = podcast
        ? analysisByKey.get(recordKey(row.client_id, podcast.id)) || null
        : null
      const directContact = podcast ? directContactByPodcastId.get(podcast.id) || null : null
      const booking = bookingById.get(recordKey(row.client_id, row.podcast_id))
        || (podcast ? bookingById.get(recordKey(row.client_id, podcast.id)) : null)
        || bookingByName.get(recordKey(row.client_id, normalizedName(podcast?.podcast_name || row.podcast_name)))
        || null
      const bookingMatch = booking
        ? booking.podcast_id && [row.podcast_id.toLowerCase(), podcast?.id.toLowerCase()].filter(Boolean).includes(booking.podcast_id.toLowerCase())
          ? 'podcast_id'
          : 'podcast_name'
        : null
      if (booking) matchedBookingIds.add(booking.id)
      const stage = deriveStage({ booking, target, legacyOutreach: legacyOutreachRow, feedback: feedbackRow })
      const outcome = deriveOutcome(row, feedbackRow, booking)
      const directEmail = validEmail(directContact?.email)
      const campaignEmail = validEmail(target?.contact_email)
      const freeEmail = validEmail(podcast?.podscan_email)
      const contactSource = campaignEmail
        ? 'campaign'
        : directEmail
          ? 'direct'
          : freeEmail
            ? 'podscan'
            : 'none'
      const contactEmail = campaignEmail || directEmail || freeEmail
      const analysisSource = analysis ? 'normalized' : row.ai_analyzed_at ? 'legacy_cache' : 'none'
      const analysisAt = analysis?.ai_analyzed_at || row.ai_analyzed_at
      const fitReasons = analysis?.ai_fit_reasons || row.ai_fit_reasons || []
      const outreachStarted = Boolean(legacyOutreachRow || target?.launched_at || ['launching', 'in_outreach', 'replied', 'completed'].includes(target?.status || ''))
      const progressedBeyondReview = ['outreach', 'conversation', 'booked', 'recorded', 'published'].includes(stage)
      const hasConflict = (
        feedbackRow?.status === 'rejected'
        && (outreachStarted || progressedBeyondReview)
      ) || (
        outcome === 'archived'
        && (
          outreachStarted
          || progressedBeyondReview
          || Boolean(target && !['completed', 'failed'].includes(target.status))
        )
      )
      const itemTerminal = terminal(stage, outcome)
      const lastActivityAt = latestTimestamp([
        row.updated_at,
        feedbackRow?.updated_at,
        legacyOutreachRow?.webhook_sent_at,
        legacyOutreachRow?.created_at,
        target?.last_activity_at,
        target?.updated_at,
        booking?.updated_at,
        analysis?.updated_at,
      ])
      noteActivity(row.client_id, [
        feedbackRow?.updated_at,
        legacyOutreachRow?.webhook_sent_at || legacyOutreachRow?.created_at,
        target?.launched_at,
        target?.last_activity_at,
        booking?.updated_at,
      ])

      return {
        id: row.id,
        client: {
          id: row.client_id,
          name: client?.name || 'Unknown client',
          status: client?.status || 'unknown',
          photo_url: client?.photo_url || null,
        },
        podcast: {
          id: podcast?.id || null,
          podscan_id: row.podcast_id,
          name: podcast?.podcast_name || row.podcast_name,
          description: podcast?.podcast_description ?? row.podcast_description,
          image_url: podcast?.podcast_image_url ?? row.podcast_image_url,
          url: podcast?.podcast_url ?? row.podcast_url,
          publisher_name: podcast?.publisher_name ?? row.publisher_name,
          host_name: target?.host_name || directContact?.host_name || podcast?.host_name || null,
          audience_size: podcast?.audience_size ?? row.audience_size,
          last_posted_at: podcast?.last_posted_at || null,
        },
        stage,
        outcome,
        terminal: itemTerminal,
        has_conflict: hasConflict,
        next_action: nextAction(stage, outcome, target, booking),
        contact: {
          available: Boolean(contactEmail),
          source: contactSource,
          email: canManage ? contactEmail : null,
          verified_at: contactSource === 'direct' ? directContact?.last_verified_at || null : null,
        },
        decision: {
          status: feedbackRow?.status || null,
          notes: feedbackRow?.notes || null,
          updated_at: feedbackRow?.updated_at || null,
        },
        analysis: {
          source: analysisSource,
          clean_description: analysis?.ai_clean_description || row.ai_clean_description || null,
          fit_reasons: fitReasons.filter((reason): reason is string => typeof reason === 'string' && Boolean(reason.trim())).slice(0, 6),
          pitch_angles: pitchAngles(analysis?.ai_pitch_angles || row.ai_pitch_angles),
          analyzed_at: analysisAt,
        },
        campaign: target ? {
          id: target.campaign_id,
          target_id: target.id,
          status: target.status,
          research_ready: Boolean(target.research_notes?.trim()),
          pitch_ready: Boolean(target.pitch_subject?.trim() && target.pitch_body?.trim()),
          open_count: target.email_open_count,
          reply_count: target.email_reply_count,
          launched_at: target.launched_at,
          last_activity_at: target.last_activity_at,
          last_error: target.last_error,
        } : null,
        legacy_outreach_at: legacyOutreachRow?.webhook_sent_at || legacyOutreachRow?.created_at || null,
        conversation: conversationFor(
          threadByClientPodcast.get(recordKey(row.client_id, row.podcast_id)) || null,
          target,
        ),
        booking: booking && bookingMatch ? presentedBooking(booking, bookingMatch) : null,
        operator_notes: row.operator_notes,
        shortlist_created_at: row.created_at,
        shortlist_updated_at: row.updated_at,
        last_activity_at: lastActivityAt,
      }
    })

    const orphanBookingItems = bookings
      .filter((booking) => !matchedBookingIds.has(booking.id))
      .map((booking) => {
        const client = clientsById.get(booking.client_id)
        const podcast = booking.podcast_id
          ? catalogByPodscanId.get(booking.podcast_id) || catalogById.get(booking.podcast_id) || null
          : null
        const analysis = podcast
          ? analysisByKey.get(recordKey(booking.client_id, podcast.id)) || null
          : null
        const directContact = podcast ? directContactByPodcastId.get(podcast.id) || null : null
        const directEmail = validEmail(directContact?.email)
        const freeEmail = validEmail(podcast?.podscan_email)
        const contactEmail = directEmail || freeEmail
        const contactSource: 'direct' | 'podscan' | 'none' = directEmail
          ? 'direct'
          : freeEmail
            ? 'podscan'
            : 'none'
        const stage = bookingStage(booking) || 'booked'
        const outcome: LifecycleOutcome = booking.status === 'cancelled' ? 'cancelled' : null
        const bookingMatch: LifecycleBooking['match'] = booking.podcast_id && podcast
          ? 'podcast_id'
          : 'podcast_name'
        const fitReasons = analysis?.ai_fit_reasons || []
        noteActivity(booking.client_id, [booking.updated_at])

        return {
          id: `booking:${booking.id}`,
          client: {
            id: booking.client_id,
            name: client?.name || 'Unknown client',
            status: client?.status || 'unknown',
            photo_url: client?.photo_url || null,
          },
          podcast: {
            id: podcast?.id || null,
            podscan_id: podcast?.podscan_id || booking.podcast_id || `booking:${booking.id}`,
            name: podcast?.podcast_name || booking.podcast_name,
            description: podcast?.podcast_description || null,
            image_url: podcast?.podcast_image_url || null,
            url: podcast?.podcast_url || booking.podcast_url,
            publisher_name: podcast?.publisher_name || null,
            host_name: booking.host_name || directContact?.host_name || podcast?.host_name || null,
            audience_size: podcast?.audience_size || null,
            last_posted_at: podcast?.last_posted_at || null,
          },
          stage,
          outcome,
          terminal: terminal(stage, outcome),
          has_conflict: false,
          next_action: nextAction(stage, outcome, null, booking),
          contact: {
            available: Boolean(contactEmail),
            source: contactSource,
            email: canManage ? contactEmail : null,
            verified_at: contactSource === 'direct' ? directContact?.last_verified_at || null : null,
          },
          decision: { status: null, notes: null, updated_at: null },
          analysis: {
            source: analysis ? 'normalized' as const : 'none' as const,
            clean_description: analysis?.ai_clean_description || null,
            fit_reasons: fitReasons.filter((reason): reason is string => typeof reason === 'string' && Boolean(reason.trim())).slice(0, 6),
            pitch_angles: pitchAngles(analysis?.ai_pitch_angles || null),
            analyzed_at: analysis?.ai_analyzed_at || null,
          },
          campaign: null,
          legacy_outreach_at: null,
          booking: presentedBooking(booking, bookingMatch),
          operator_notes: null,
          shortlist_created_at: booking.created_at,
          shortlist_updated_at: booking.updated_at,
          last_activity_at: booking.updated_at,
        }
      })

    const items = [...shortlistItems, ...orphanBookingItems].sort((left, right) => {
      if (left.has_conflict !== right.has_conflict) return left.has_conflict ? -1 : 1
      if (left.terminal !== right.terminal) return left.terminal ? 1 : -1
      const leftIndex = STAGES.indexOf(left.stage)
      const rightIndex = STAGES.indexOf(right.stage)
      if (leftIndex !== rightIndex) return rightIndex - leftIndex
      return (right.last_activity_at || '').localeCompare(left.last_activity_at || '')
    })

    const today = new Date().toISOString().slice(0, 10)
    const stageCounts = Object.fromEntries(STAGES.map((stage) => [
      stage,
      items.filter((item) => item.stage === stage).length,
    ]))
    const active = items.filter((item) => !item.terminal).length
    const completed = items.length - active
    const needsAttention = items.filter((item) => (
      !item.terminal
      && (item.has_conflict || item.campaign?.status === 'failed' || item.stage === 'conversation')
    )).length

    return jsonResponse(req, METHODS, 200, {
      workspace: {
        id: access.workspace.id,
        name: access.workspace.name,
        logo_path: access.workspace.logo_path ?? null,
        logo_updated_at: access.workspace.logo_updated_at ?? null,
      },
      viewer_role: access.role,
      can_manage: canManage,
      generated_at: new Date().toISOString(),
      truncated: truncatedSources.length > 0,
      truncated_sources: truncatedSources,
      clients: clients.map((client) => {
        const clientItems = items.filter((item) => item.client.id === client.id)
        const clientOnboarding = onboardingByClientId.get(client.id) || null
        const readiness = aiSdrReadiness(client.ai_sdr_profile)
        return {
          id: client.id,
          name: client.name,
          status: client.status,
          photo_url: client.photo_url,
          email: client.email,
          contact_person: client.contact_person,
          website: client.website,
          bio: client.bio,
          profile: {
            ...readiness,
            positioning: profileText(client.ai_sdr_profile, 'positioning'),
            updated_at: client.ai_sdr_profile_updated_at,
            has_calendar: Boolean(client.calendar_link),
            has_media_kit: Boolean(client.media_kit_url),
          },
          dashboard_configured: Boolean(client.dashboard_slug),
          portal: {
            enabled: Boolean(client.portal_access_enabled),
            last_login_at: client.portal_last_login_at,
          },
          onboarding: access.role === 'member' || !clientOnboarding ? null : {
            id: clientOnboarding.id,
            status: clientOnboarding.status,
            invited_at: clientOnboarding.invited_at,
            submitted_at: clientOnboarding.submitted_at,
            approved_at: clientOnboarding.approved_at,
            updated_at: clientOnboarding.updated_at,
          },
          podcast_count: clientItems.length,
          created_at: client.created_at,
          updated_at: client.updated_at,
          last_activity_at: clientActivity.get(client.id) || null,
        }
      }),
      summary: {
        total: items.length,
        active,
        completed,
        needs_attention: needsAttention,
        upcoming_recordings: items.filter((item) => (
          !item.terminal
          && Boolean(item.booking?.recording_date)
          && item.booking!.recording_date! >= today
        )).length,
        awaiting_publication: items.filter((item) => item.stage === 'recorded' && !item.booking?.episode_url).length,
        stage_counts: stageCounts,
      },
      items,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
