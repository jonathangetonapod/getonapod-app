import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { hashPortalSessionToken } from '../_shared/portalSecurity.ts'
import {
  createAdminClient,
  errorResponse,
  HttpError,
  jsonResponse,
  optionsResponse,
  parseJsonObject,
  requireOnlyKeys,
  requirePlatformAdmin,
  requireUuid,
} from '../_shared/workspaceAuth.ts'
import { ensureWorkspaceOriginAllowed } from '../_shared/cors.ts'
import { reservePublicRate } from '../_shared/publicRateLimit.ts'
import { sendAppEmail } from '../_shared/appEmail.ts'

const METHODS = ['POST'] as const

// Every field in this payload is safe to show to the end client. Operator
// notes, research documents, pitch copy, and contact emails must never be
// added here.
const PORTAL_BOOKING_FIELDS = [
  'id',
  'podcast_name',
  'podcast_url',
  'host_name',
  'scheduled_date',
  'recording_date',
  'publish_date',
  'status',
  'episode_url',
  'podcast_image_url',
  'podcast_description',
  'audience_size',
  'itunes_rating',
  'episode_count',
  'created_by_client',
  'shortlist_podcast_id',
].join(',')

// Each add-on request emails the workspace owner, so a portal session must not
// be able to turn it into a mail cannon or an unbounded log.
const ADDON_REQUEST_DAILY_LIMIT = 5
const ADDON_REQUEST_LIFETIME_LIMIT = 200

function clampText(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : null
}

/** An http(s) URL, or null. Anything else (javascript:, data:) is refused. */
function httpUrlOrNull(value: unknown, field: string): string | null {
  const text = clampText(value, 2_000)
  if (!text) return null
  let parsed: URL
  try {
    parsed = new URL(text.trim())
  } catch {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an http or https link`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be an http or https link`)
  }
  return parsed.toString()
}

function clampCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    // Portal pages are served from tenant custom domains too, and the
    // preflight is the first request that origin ever makes, so it has to
    // warm the allowlist itself or the domain never works.
    await ensureWorkspaceOriginAllowed(createAdminClient(), req)
    return optionsResponse(req, METHODS)
  }

  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed')
    }

    const body = await parseJsonObject(req, 4_096)
    requireOnlyKeys(body, ['clientId', 'sessionToken', 'addon_request', 'calendar_event', 'delete_event_id', 'notifications_enabled'])
    const clientId = requireUuid(body.clientId, 'clientId')
    const sessionToken = body.sessionToken === undefined
      ? null
      : requireUuid(body.sessionToken, 'sessionToken')
    const admin = createAdminClient()
    await ensureWorkspaceOriginAllowed(admin, req)

    if (sessionToken) {
      const sessionTokenHash = await hashPortalSessionToken(sessionToken)
      const { data: session, error } = await admin
        .from('client_portal_sessions')
        .select('client_id,clients(portal_access_enabled,workspace:workspaces!clients_workspace_id_fkey(status))')
        .eq('session_token', sessionTokenHash)
        .eq('client_id', clientId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()

      const client = session?.clients as {
        portal_access_enabled?: boolean
        workspace?: { status?: string } | null
      } | null
      if (
        error
        || !session
        || !client?.portal_access_enabled
        || client.workspace?.status !== 'active'
      ) {
        throw new HttpError(401, 'INVALID_PORTAL_SESSION', 'Your portal session has ended. Sign in again to continue')
      }
    } else {
      // No portal token means this is the explicit operator impersonation path.
      await requirePlatformAdmin(req)
    }

    if (body.notifications_enabled !== undefined) {
      // We email these clients now, so they get a switch to stop us.
      if (typeof body.notifications_enabled !== 'boolean') {
        throw new HttpError(400, 'INVALID_FIELD', 'notifications_enabled must be true or false')
      }
      const { error: prefError } = await admin
        .from('clients')
        .update({ notifications_enabled: body.notifications_enabled })
        .eq('id', clientId)
      if (prefError) {
        throw new HttpError(503, 'PREFERENCE_SAVE_FAILED', 'That setting could not be saved — try again')
      }
      return jsonResponse(req, METHODS, 200, { success: true, notifications_enabled: body.notifications_enabled })
    }

    if (body.delete_event_id !== undefined) {
      // Clients can only remove entries they added themselves.
      const eventId = requireUuid(body.delete_event_id, 'delete_event_id')
      const { error: removeError } = await admin
        .from('bookings')
        .delete()
        .eq('id', eventId)
        .eq('client_id', clientId)
        .eq('created_by_client', true)
      if (removeError) {
        throw new HttpError(503, 'EVENT_REMOVE_FAILED', 'That event could not be removed — try again')
      }
      return jsonResponse(req, METHODS, 200, { success: true })
    }

    if (body.calendar_event !== undefined) {
      const raw = body.calendar_event
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new HttpError(400, 'INVALID_FIELD', 'calendar_event must be an object')
      }
      const event = raw as Record<string, unknown>
      const podcastName = clampText(event.podcast_name, 300)
      if (!podcastName) {
        throw new HttpError(400, 'INVALID_FIELD', 'A podcast name is required')
      }
      const kind = event.kind === 'release' ? 'release' : 'recording'
      const date = clampText(event.date, 10)
      if (!date || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || Number.isNaN(Date.parse(date))) {
        throw new HttpError(400, 'INVALID_FIELD', 'A valid date is required')
      }
      // A self-managed calendar should not become an unbounded write surface.
      const { count } = await admin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('created_by_client', true)
      if ((count ?? 0) >= 200) {
        throw new HttpError(409, 'EVENT_LIMIT_REACHED', 'You have reached the limit for events you can add')
      }

      const { data: created, error: createError } = await admin
        .from('bookings')
        .insert({
          client_id: clientId,
          podcast_name: podcastName,
          host_name: clampText(event.host_name, 200),
          podcast_url: httpUrlOrNull(event.podcast_url, 'podcast_url'),
          episode_url: kind === 'release' ? httpUrlOrNull(event.episode_url, 'episode_url') : null,
          notes: clampText(event.notes, 2_000),
          // A recording the client arranged is a confirmed booking; an
          // episode they know is going live is a scheduled release.
          status: kind === 'release' ? 'recorded' : 'booked',
          scheduled_date: kind === 'recording' ? date : null,
          recording_date: kind === 'recording' ? date : null,
          publish_date: kind === 'release' ? date : null,
          created_by_client: true,
        })
        .select(PORTAL_BOOKING_FIELDS)
        .maybeSingle()
      if (createError || !created) {
        throw new HttpError(503, 'EVENT_CREATE_FAILED', 'That event could not be added — try again')
      }
      return jsonResponse(req, METHODS, 200, { booking: created })
    }

    if (body.addon_request !== undefined) {
      // The client asked for an add-on (e.g. the clipping service): record it
      // and notify the workspace owner. No payment is involved.
      const raw = body.addon_request
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new HttpError(400, 'INVALID_FIELD', 'addon_request must be an object')
      }
      const request = raw as Record<string, unknown>
      const packageName = clampText(request.package_name, 100)
      if (!packageName) {
        throw new HttpError(400, 'INVALID_FIELD', 'addon_request.package_name is required')
      }
      const episodeName = clampText(request.episode_name, 300)

      const { data: clientRecord, error: clientLookupError } = await admin
        .from('clients')
        .select('id,name,workspace_id')
        .eq('id', clientId)
        .maybeSingle()
      if (clientLookupError || !clientRecord) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client not found')
      }

      // Lifetime ceiling on stored requests, then a per-client daily limit.
      // The limiter fails closed: every accepted request sends an email.
      const { count: priorRequests, error: countError } = await admin
        .from('client_portal_activity_log')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('action', 'addon_request')
      if (countError) {
        throw new HttpError(503, 'ADDON_REQUEST_FAILED', 'Your request could not be recorded — try again')
      }
      if ((priorRequests ?? 0) >= ADDON_REQUEST_LIFETIME_LIMIT) {
        throw new HttpError(409, 'ADDON_REQUEST_LIMIT_REACHED', 'You have reached the limit for add-on requests. Contact your team directly.')
      }
      // The request is recorded first and the daily slot reserved after.
      // Reserving first consumed a slot for a request whose insert then
      // failed, so a database hiccup used up the client's day. A row whose
      // reservation is refused or errors is removed again, so a refused
      // request leaves nothing behind.
      const { data: logRow, error: logError } = await admin
        .from('client_portal_activity_log')
        .insert({
          client_id: clientId,
          action: 'addon_request',
          metadata: {
            package_name: packageName,
            episode_name: episodeName,
          },
        })
        .select('id')
        .single()
      if (logError || !logRow) {
        throw new HttpError(503, 'ADDON_REQUEST_FAILED', 'Your request could not be recorded — try again')
      }
      const withdrawRequest = async () => {
        const { error: withdrawError } = await admin
          .from('client_portal_activity_log')
          .delete()
          .eq('id', logRow.id)
          .eq('client_id', clientId)
        if (withdrawError) console.error('[Portal Experience] Refused add-on request could not be withdrawn')
      }
      let addonAllowed = false
      try {
        addonAllowed = await reservePublicRate(admin, [{
          bucket: `portal-addon:${clientId}`,
          limit: ADDON_REQUEST_DAILY_LIMIT,
          windowSeconds: 24 * 60 * 60,
        }])
      } catch {
        await withdrawRequest()
        throw new HttpError(503, 'ADDON_REQUEST_FAILED', 'Your request could not be recorded — try again')
      }
      if (!addonAllowed) {
        await withdrawRequest()
        throw new HttpError(429, 'ADDON_REQUEST_RATE_LIMITED', 'You have sent several requests today. Your team has them; try again tomorrow if you need another.')
      }

      // Best-effort owner notification; the recorded request is the source
      // of truth even when email is not configured.
      if (clientRecord.workspace_id) {
        const { data: owner } = await admin
          .from('workspace_memberships')
          .select('email_normalized')
          .eq('workspace_id', clientRecord.workspace_id)
          .eq('role', 'owner')
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()
        if (owner?.email_normalized) {
          await sendAppEmail({
            event: 'portal.addon_request',
            idempotencyKey: `portal-addon:${clientRecord.workspace_id}:${clientId}:${logRow.id}`,
            to: [owner.email_normalized],
            data: {
              client_name: clientRecord.name,
              package_name: packageName,
              episode_name: episodeName || null,
            },
          })
        }
      }
      return jsonResponse(req, METHODS, 200, { success: true })
    }

    const [
      clientResult,
      bookingsResult,
      shortlistResult,
      feedbackResult,
      campaignResult,
      targetsResult,
      pitchProfileResult,
    ] = await Promise.all([
      admin
        .from('clients')
        .select('id,name,photo_url,bio,media_kit_url,calendar_link,dashboard_slug,dashboard_tagline,notifications_enabled')
        .eq('id', clientId)
        .maybeSingle(),
      admin
        .from('bookings')
        .select(PORTAL_BOOKING_FIELDS)
        .eq('client_id', clientId)
        /*
         * Nulls first, deliberately: client-created release events carry no
         * scheduled_date, and nulls-last put them at the back of the 500-row
         * window — so past the cap, the client's own additions were the first
         * rows silently dropped. Nulls-first sacrifices the oldest dated
         * bookings instead, which is the right thing to lose.
         */
        .order('scheduled_date', { ascending: false, nullsFirst: true })
        .limit(500),
      admin
        .from('client_dashboard_podcasts')
        /*
         * All rows, visibility included — split in code below. The review
         * counts must see only visible rows, but the booking enrichment must
         * not: archiving a shortlist row after its show was booked is routine
         * cleanup, and filtering here stripped the booking's artwork,
         * audience and rating — quietly shrinking the combined-audience
         * number the dashboard shows the client.
         */
        .select('id,podcast_id,podcast_image_url,podcast_name,podcast_description,audience_size,itunes_rating,episode_count,visibility')
        .eq('client_id', clientId)
        .limit(2_000),
      admin
        .from('client_podcast_feedback')
        .select('podcast_id,status')
        .eq('client_id', clientId)
        .limit(2_000),
      admin
        .from('workspace_client_campaigns')
        .select('status,analytics')
        .eq('client_id', clientId)
        .maybeSingle(),
      admin
        .from('workspace_client_campaign_targets')
        .select('id,shortlist_podcast_id,podcast_name,status,launched_at,last_activity_at,email_open_count,email_reply_count')
        .eq('client_id', clientId)
        .limit(5_000),
      admin
        .from('workspace_client_pitch_profiles')
        .select('professional_bio,positioning_summary,key_messages,story_angles,talking_points,ideal_audience,approved_at')
        .eq('client_id', clientId)
        .maybeSingle(),
    ])

    if (clientResult.error || !clientResult.data) {
      throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Client not found')
    }
    if (bookingsResult.error) {
      throw new HttpError(500, 'BOOKINGS_LOOKUP_FAILED', 'Bookings could not be loaded')
    }
    // A failed section query must fail the request — returning zeros would
    // show the client a confidently wrong dashboard.
    if (shortlistResult.error || feedbackResult.error || targetsResult.error || campaignResult.error) {
      throw new HttpError(500, 'OVERVIEW_LOOKUP_FAILED', 'Your overview could not be loaded')
    }

    const clientRow = clientResult.data as Record<string, unknown>

    // Review queue: visible shortlist podcasts joined against the client's
    // approve/reject feedback, mirroring what /client/:slug shows them.
    const feedbackByPodcast = new Map<string, string>()
    for (const row of (feedbackResult.data ?? []) as Array<Record<string, unknown>>) {
      if (typeof row.podcast_id === 'string' && typeof row.status === 'string') {
        feedbackByPodcast.set(row.podcast_id, row.status)
      }
    }
    let approvedCount = 0
    let rejectedCount = 0
    let awaitingCount = 0
    const shortlistRows = (shortlistResult.data ?? []) as Array<Record<string, unknown>>
    // Review is about what the client can still act on: visible rows only.
    const visibleRows = shortlistRows.filter((row) => row.visibility === 'visible')
    for (const row of visibleRows) {
      const status = typeof row.podcast_id === 'string' ? feedbackByPodcast.get(row.podcast_id) : undefined
      if (status === 'approved') approvedCount += 1
      else if (status === 'rejected') rejectedCount += 1
      else awaitingCount += 1
    }

    // Outreach summary: high-level journey numbers only — no pitch copy,
    // contact emails, or failure diagnostics.
    let outreach: Record<string, number> | null = null
    if (campaignResult.data) {
      const analytics = (campaignResult.data.analytics ?? {}) as Record<string, unknown>
      const targetRows = (targetsResult.data ?? []) as Array<Record<string, unknown>>
      const countByStatus = (status: string): number =>
        targetRows.filter((row) => row.status === status).length
      outreach = {
        emails_sent: clampCount(analytics.emails_sent_count),
        podcasts_contacted: clampCount(analytics.contacted_count),
        replies: clampCount(analytics.reply_count_unique),
        meetings_booked: clampCount(analytics.total_meeting_booked),
        in_outreach_count: countByStatus('in_outreach'),
        replied_count: countByStatus('replied'),
        completed_count: countByStatus('completed'),
      }
    }

    // Per-podcast outreach activity, client-safe: which shows were messaged
    // and how the conversation is going. Internal failures stay hidden — the
    // workspace resolves those, the client just sees the show as preparing.
    const imageByShortlistId = new Map<string, string>()
    const shortlistById = new Map<string, Record<string, unknown>>()
    // Enrichment reads every row, archived included: a booking keeps its
    // artwork and audience whatever later housekeeping did to the shortlist.
    for (const row of shortlistRows) {
      if (typeof row.id !== 'string') continue
      shortlistById.set(row.id, row)
      if (typeof row.podcast_image_url === 'string' && row.podcast_image_url) {
        imageByShortlistId.set(row.id, row.podcast_image_url.slice(0, 2_000))
      }
    }
    // Artwork, audience and rating live on the shortlist row — booking columns
    // for them are never written, so resolve through the link and fall back.
    const enrichedBookings = ((bookingsResult.data ?? []) as unknown as Array<Record<string, unknown>>).map((booking) => {
      const shortlist = typeof booking.shortlist_podcast_id === 'string'
        ? shortlistById.get(booking.shortlist_podcast_id)
        : null
      if (!shortlist) return booking
      const inherit = (key: string) => booking[key] ?? shortlist[key] ?? null
      return {
        ...booking,
        podcast_image_url: inherit('podcast_image_url'),
        podcast_description: inherit('podcast_description'),
        audience_size: inherit('audience_size'),
        itunes_rating: inherit('itunes_rating'),
        episode_count: inherit('episode_count'),
      }
    })
    // One journey per show: an outreach target whose booking already exists is
    // the same podcast, so the client never sees it as two separate things.
    const bookedShortlistIds = new Set(
      enrichedBookings.flatMap((booking) => (
        typeof booking.shortlist_podcast_id === 'string' ? [booking.shortlist_podcast_id] : []
      )),
    )
    const targetStage = (status: unknown): string | null => {
      if (status === 'in_outreach') return 'contacted'
      if (status === 'replied') return 'replied'
      if (status === 'completed') return 'completed'
      if (status === 'failed') return null
      return 'preparing'
    }
    const outreachTargets = ((targetsResult.data ?? []) as Array<Record<string, unknown>>)
      .flatMap((row) => {
        const stage = targetStage(row.status)
        if (!stage || typeof row.podcast_name !== 'string' || !row.podcast_name) return []
        if (typeof row.shortlist_podcast_id === 'string' && bookedShortlistIds.has(row.shortlist_podcast_id)) {
          return []
        }
        return [{
          id: typeof row.id === 'string' ? row.id : '',
          podcast_name: row.podcast_name.slice(0, 300),
          podcast_image_url: typeof row.shortlist_podcast_id === 'string'
            ? imageByShortlistId.get(row.shortlist_podcast_id) ?? null
            : null,
          stage,
          first_message_at: typeof row.launched_at === 'string' ? row.launched_at : null,
          last_activity_at: typeof row.last_activity_at === 'string' ? row.last_activity_at : null,
          opens: clampCount(row.email_open_count),
          replies: clampCount(row.email_reply_count),
        }]
      })
      .sort((a, b) => String(b.first_message_at ?? '').localeCompare(String(a.first_message_at ?? '')))
      .slice(0, 200)

    // The guest profile is only shared once the workspace approved it.
    let pitchProfile: Record<string, unknown> | null = null
    if (!pitchProfileResult.error && pitchProfileResult.data?.approved_at) {
      const profile = pitchProfileResult.data as Record<string, unknown>
      pitchProfile = {
        professional_bio: clampText(profile.professional_bio, 4_000),
        positioning_summary: clampText(profile.positioning_summary, 2_000),
        key_messages: stringList(profile.key_messages, 12, 400),
        story_angles: stringList(profile.story_angles, 12, 400),
        talking_points: stringList(profile.talking_points, 12, 400),
        ideal_audience: clampText(profile.ideal_audience, 2_000),
      }
    }

    return jsonResponse(req, METHODS, 200, {
      profile: {
        name: clampText(clientRow.name, 200) ?? 'Client',
        photo_url: clampText(clientRow.photo_url, 2_000),
        bio: clampText(clientRow.bio, 4_000),
        media_kit_url: clampText(clientRow.media_kit_url, 2_000),
        calendar_link: clampText(clientRow.calendar_link, 2_000),
        dashboard_tagline: clampText(clientRow.dashboard_tagline, 400),
        notifications_enabled: clientRow.notifications_enabled !== false,
      },
      review: {
        dashboard_slug: clampText(clientRow.dashboard_slug, 200),
        total_visible: visibleRows.length,
        awaiting_count: awaitingCount,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
      },
      outreach,
      outreach_targets: outreachTargets,
      pitch_profile: pitchProfile,
      bookings: enrichedBookings,
    })
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
