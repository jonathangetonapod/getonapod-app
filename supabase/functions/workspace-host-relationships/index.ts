// The relationship book: the agency's contact record for podcast hosts.
//
// An agency pitches the same show for many clients over years. What it knows
// about a host — who they are, what they said on a call, which client belongs
// in front of them next — is the asset that compounds, and until now it lived
// only in people's heads. Derived outreach state (campaigns, conversations,
// bookings) is computed by workspace_podcast_relationships_v1 and is never
// written here; these actions curate only what a person decides.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

import {
  errorResponse,
  HttpError,
  jsonResponse,
  optionalString,
  optionsResponse,
  parseJsonObject,
  requireAuthenticatedUser,
  requireEmail,
  requireOnlyKeys,
  requireString,
  requireUuid,
  requireWorkspaceFeatureAccess,
  workspaceCredentialIsFresh,
  writeAudit,
} from '../_shared/workspaceAuth.ts'
import {
  addInstantlyBlockListEntry,
  decryptInstantlyApiKey,
  removeInstantlyBlockListEntry,
} from '../_shared/instantly.ts'

const METHODS = ['POST'] as const
const MANAGER_ROLES = new Set(['owner', 'admin', 'platform_admin'])
// Every stage the book offers as an override. 'warm' predates the shared
// vocabulary; it is still accepted and reads as Nurturing.
const MANUAL_STAGES = new Set([
  'new', 'pitched', 'in_conversation', 'nurturing', 'warm', 'placed', 'not_a_fit', 'do_not_contact',
])
const EVENT_KINDS = new Set(['note', 'call', 'meeting'])
const CLIENT_INTENTS = new Set(['considering', 'pitched', 'placed', 'declined', 'ruled_out'])
// An operator may record any of these; only the inbox prefilter writes
// 'inbox_auto' as a source, so a manual add can never impersonate one.
const SUPPRESSION_REASONS = new Set(['opted_out', 'bounced', 'manual'])

function podcastId(value: unknown): string {
  const id = requireString(value, 'podcast_id', { max: 200 })
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new HttpError(400, 'INVALID_FIELD', 'podcast_id is invalid')
  }
  return id
}

function parseManualStage(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  const stage = requireString(value, 'manual_stage', { max: 40 })
  if (!MANUAL_STAGES.has(stage)) {
    throw new HttpError(400, 'INVALID_FIELD', 'manual_stage is not a known relationship stage')
  }
  return stage
}

function optionalContactEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  return requireEmail(value)
}

function optionalTimestamp(value: unknown, field: string): string | null {
  const raw = optionalString(value, field, 40)
  if (!raw) return null
  const milliseconds = Date.parse(raw)
  if (!Number.isFinite(milliseconds)) {
    throw new HttpError(400, 'INVALID_FIELD', `${field} must be a valid timestamp`)
  }
  return new Date(milliseconds).toISOString()
}

// Cover art is rendered into an <img src>, so only http(s) is accepted here.
// A catalog row carrying a javascript: or data: URL must fall back to initials.
function imageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = value.trim()
  if (!/^https?:\/\//i.test(url)) return null
  return url.slice(0, 2_000)
}

function newManualPodcastId(): string {
  return `manual-${crypto.randomUUID()}`
}

interface MatchedShow {
  podcastId: string
  podcastName: string | null
  hostName: string | null
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
}

/**
 * One show per address, or nothing. An address pitched for two shows matches
 * neither: a host shown under the wrong show is worse than one left unnamed.
 */
function uniqueShows(rows: Array<{ key: string; show: MatchedShow | null }>): Map<string, MatchedShow> {
  const byKey = new Map<string, Map<string, MatchedShow>>()
  for (const { key, show } of rows) {
    if (!show) continue
    const shows = byKey.get(key) ?? new Map<string, MatchedShow>()
    if (!shows.has(show.podcastId)) shows.set(show.podcastId, show)
    byKey.set(key, shows)
  }
  const unique = new Map<string, MatchedShow>()
  for (const [key, shows] of byKey) {
    if (shows.size === 1) unique.set(key, [...shows.values()][0])
  }
  return unique
}

// Mailbox providers, where sharing a domain says nothing about sharing a show.
const SHARED_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com',
  'gmx.net', 'yandex.com', 'zoho.com', 'mail.com', 'fastmail.com', 'hey.com', 'comcast.net',
])
const MAX_DOMAIN_LOOKUPS = 20

/**
 * The show behind each address that has none on its row, so a host added by
 * email alone shows its show name and cover.
 *
 * In order: this workspace's own pitches to that address; then the shared
 * catalog, but only for an address the workspace already holds (its
 * campaigns pitched it or its inbox read it), so typing an email into the
 * book never reveals what the catalog files it under; then this workspace's
 * own pitches to the same company domain. Read-only: the row is not changed,
 * and naming the show by hand always wins.
 */
async function matchShowsByEmail(
  admin: SupabaseClient,
  workspaceId: string,
  emails: string[],
): Promise<Map<string, MatchedShow>> {
  const matches = new Map<string, MatchedShow>()
  if (emails.length === 0) return matches
  const targetShow = (row: Record<string, unknown>): MatchedShow | null => (
    typeof row.podcast_id === 'string' && row.podcast_id
      ? { podcastId: row.podcast_id, podcastName: text(row.podcast_name, 500), hostName: text(row.host_name, 300) }
      : null
  )

  const { data: targets } = await admin.from('workspace_client_campaign_targets')
    .select('podcast_id, podcast_name, host_name, normalized_contact_email')
    .eq('workspace_id', workspaceId).in('normalized_contact_email', emails).limit(2_000)
  const targetRows = (targets ?? []) as Array<Record<string, unknown>>
  const pitched = new Set(targetRows.map((row) => String(row.normalized_contact_email)))
  for (const [email, show] of uniqueShows(targetRows.map((row) => ({
    key: String(row.normalized_contact_email),
    show: targetShow(row),
  })))) {
    if (show.podcastName) matches.set(email, show)
  }

  const { data: threads } = await admin.from('workspace_inbox_thread_state')
    .select('lead_email')
    .eq('workspace_id', workspaceId).in('lead_email', emails).limit(2_000)
  const held = new Set([...pitched, ...((threads ?? []) as Array<Record<string, unknown>>)
    .flatMap((row) => typeof row.lead_email === 'string' ? [row.lead_email.trim().toLowerCase()] : [])])
  const catalogEmails = emails.filter((email) => !matches.has(email) && held.has(email))
  if (catalogEmails.length > 0) {
    const { data: contacts } = await admin.from('podcast_direct_contacts')
      .select('normalized_email, host_name, podcasts:podcast_id (podscan_id, podcast_name, host_name)')
      .in('normalized_email', catalogEmails).limit(2_000)
    for (const [email, show] of uniqueShows(((contacts ?? []) as Array<Record<string, unknown>>).map((row) => {
      const podcast = (Array.isArray(row.podcasts) ? row.podcasts[0] : row.podcasts) as
        Record<string, unknown> | null | undefined
      const podscanId = text(podcast?.podscan_id, 200)
      return {
        key: String(row.normalized_email),
        show: podscanId
          ? {
            podcastId: podscanId,
            podcastName: text(podcast?.podcast_name, 500),
            hostName: text(row.host_name, 300) ?? text(podcast?.host_name, 300),
          }
          : null,
      }
    }))) {
      if (show.podcastName) matches.set(email, show)
    }
  }

  // A domain is only checked when it is a company's own: the pattern below
  // can then hold no LIKE wildcard, and a freemail domain matches nothing.
  const domains = [...new Set(emails.filter((email) => !matches.has(email)).map((email) => email.split('@')[1] ?? ''))]
    .filter((domain) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/u.test(domain) && !SHARED_MAIL_DOMAINS.has(domain))
    .slice(0, MAX_DOMAIN_LOOKUPS)
  for (const domain of domains) {
    const { data: sameDomain } = await admin.from('workspace_client_campaign_targets')
      .select('podcast_id, podcast_name, host_name')
      .eq('workspace_id', workspaceId).like('normalized_contact_email', `%@${domain}`).limit(200)
    const show = uniqueShows(((sameDomain ?? []) as Array<Record<string, unknown>>).map((row) => ({
      key: domain,
      show: targetShow(row),
    }))).get(domain)
    if (!show?.podcastName) continue
    for (const email of emails) {
      // A domain match names the show, not the person: the host on that
      // pitch may be someone else at the same company.
      if (!matches.has(email) && email.endsWith(`@${domain}`)) matches.set(email, { ...show, hostName: null })
    }
  }
  return matches
}

/**
 * Tell Instantly to stop sending to this address, or to allow it again.
 *
 * Our suppression table only ever stopped us adding a lead. A campaign already
 * running inside Instantly kept mailing an address on the list, because
 * Instantly had never been told — so the promise on that page, that an opt-out
 * silences an address for every client, was only true of the things we had not
 * done yet.
 *
 * Never throws. The local row is the record of the opt-out and must be written
 * whatever the provider says; a failure here is reported back so the operator
 * knows the far side is out of step, rather than swallowed into a green tick.
 */
async function syncInstantlyBlockList(
  admin: SupabaseClient,
  workspaceId: string,
  contactEmail: string,
  intent: 'block' | 'unblock',
): Promise<{ synced: boolean; reason: string | null }> {
  try {
    const { data: connection } = await admin
      .from('workspace_instantly_integrations')
      .select('api_key_ciphertext, api_key_iv, status')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (!connection?.api_key_ciphertext || !connection?.api_key_iv) {
      return { synced: false, reason: 'Instantly is not connected for this workspace' }
    }
    const apiKey = await decryptInstantlyApiKey({
      ciphertext: connection.api_key_ciphertext,
      iv: connection.api_key_iv,
    })
    if (intent === 'block') {
      await addInstantlyBlockListEntry(apiKey, contactEmail)
    } else {
      await removeInstantlyBlockListEntry(apiKey, contactEmail)
    }
    return { synced: true, reason: null }
  } catch (error) {
    return {
      synced: false,
      reason: error instanceof Error ? error.message.slice(0, 200) : 'Instantly refused the request',
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return optionsResponse(req, METHODS)
  try {
    const body = await parseJsonObject(req)
    const action = typeof body.action === 'string' ? body.action : ''
    const workspaceId = requireUuid(body.workspace_id, 'workspace_id')

    const authContext = await requireAuthenticatedUser(req)
    if (!workspaceCredentialIsFresh(authContext)) {
      throw new HttpError(401, 'REAUTHENTICATION_REQUIRED', 'Your sign-in is out of date. Sign out and sign in again to continue')
    }
    const access = await requireWorkspaceFeatureAccess(authContext, workspaceId)
    const admin = authContext.admin
    // Reading the book is part of deciding who to pitch, so every workspace
    // member may look. Curation is a manager action.
    const requireManager = () => {
      if (!MANAGER_ROLES.has(access.role)) {
        throw new HttpError(403, 'WORKSPACE_ACCESS_REQUIRED', 'Workspace manager access is required')
      }
    }

    if (action === 'list') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'limit', 'offset'])
      const limit = typeof body.limit === 'number' && Number.isInteger(body.limit)
        ? Math.max(1, Math.min(body.limit, 500))
        : 500
      const offset = typeof body.offset === 'number' && Number.isInteger(body.offset)
        ? Math.max(0, Math.min(body.offset, 1_000_000))
        : 0
      // Paged: a book past one page used to lose the rest without a word, and
      // the header counted only what arrived. v2 added whole-book totals; v3
      // adds the clients, latest message and reply thread each row shows; v4
      // drops rows marked not a host and carries each row's snooze.
      const { data, error } = await admin.rpc('workspace_host_relationship_book_v4', {
        p_workspace_id: workspaceId,
        p_limit: limit,
        p_offset: offset,
      })
      if (error) {
        throw new HttpError(500, 'RELATIONSHIP_LIST_FAILED', 'The relationship book could not be loaded')
      }
      const pageRows = (data ?? []) as Array<Record<string, unknown>>
      const firstRow = pageRows[0]
      let total = typeof firstRow?.total_count === 'number' ? firstRow.total_count : null
      if (total === null) {
        // An empty page past the end carries no window counts; the book's own
        // row count is the same figure, since each show is one row.
        const { count } = await admin.from('workspace_host_relationships')
          .select('podcast_id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .is('dismissed_at', null)
        total = typeof count === 'number' ? count : offset + pageRows.length
      }
      const counts = {
        in_conversation: typeof firstRow?.in_conversation_count === 'number' ? firstRow.in_conversation_count : 0,
        booked: typeof firstRow?.booked_count === 'number' ? firstRow.booked_count : 0,
        engaged: typeof firstRow?.engaged_count === 'number' ? firstRow.engaged_count : 0,
      }
      const relationships = pageRows.map((row) => {
        const {
          total_count: _total,
          in_conversation_count: _live,
          booked_count: _booked,
          engaged_count: _engaged,
          ...rest
        } = row
        return rest
      })
      // Rows known only by address get the show their address points to.
      const unnamedEmails = [...new Set(relationships.flatMap((row) => (
        (typeof row.podcast_name !== 'string' || row.podcast_name.trim() === '')
        && typeof row.contact_email === 'string' && row.contact_email.includes('@')
          ? [row.contact_email.trim().toLowerCase()]
          : []
      )))]
      const matchedShows = await matchShowsByEmail(admin, workspaceId, unnamedEmails)
      const matchFor = (row: Record<string, unknown>): MatchedShow | null => (
        (typeof row.podcast_name !== 'string' || row.podcast_name.trim() === '') && typeof row.contact_email === 'string'
          ? matchedShows.get(row.contact_email.trim().toLowerCase()) ?? null
          : null
      )
      const showIds = [...new Set([
        ...relationships.flatMap((row) => typeof row.podcast_id === 'string' ? [row.podcast_id] : []),
        ...[...matchedShows.values()].map((show) => show.podcastId),
      ])]
      const artworkByShow = new Map<string, string>()
      if (showIds.length > 0) {
        const { data: artworkRows } = await admin.from('podcasts')
          .select('podscan_id, podcast_image_url')
          .in('podscan_id', showIds)
        for (const row of artworkRows ?? []) {
          const image = imageUrl(row.podcast_image_url)
          if (typeof row.podscan_id === 'string' && image) {
            artworkByShow.set(row.podscan_id, image)
          }
        }
      }

      // A relationship added by hand, or opened from an inbound reply, carries
      // a generated id that can never join the catalog on podscan_id, so its
      // name is the only remaining link back to the show. Matched exactly, and
      // only when the catalog holds a single show under that name: two shows
      // sharing a title would otherwise put one show's cover on the other's
      // relationship, and a wrong face is worse here than no face at all.
      const unresolvedNames = [
        ...new Set(relationships.flatMap((row) => (
          typeof row.podcast_id === 'string'
          && !artworkByShow.has(row.podcast_id)
          && typeof row.podcast_name === 'string'
          && row.podcast_name.trim() !== ''
            ? [row.podcast_name.trim()]
            : []
        ))),
      ]
      const artworkByName = new Map<string, string | null>()
      if (unresolvedNames.length > 0) {
        const { data: namedRows } = await admin.from('podcasts')
          .select('podcast_name, podcast_image_url')
          .in('podcast_name', unresolvedNames)
        for (const row of namedRows ?? []) {
          if (typeof row.podcast_name !== 'string') continue
          const name = row.podcast_name.trim()
          artworkByName.set(name, artworkByName.has(name) ? null : imageUrl(row.podcast_image_url))
        }
      }

      const nextOffset = offset + relationships.length
      return jsonResponse(req, METHODS, 200, {
        relationships: relationships.map((row) => {
          const byId = typeof row.podcast_id === 'string' ? artworkByShow.get(row.podcast_id) ?? null : null
          const byName = typeof row.podcast_name === 'string'
            ? artworkByName.get(row.podcast_name.trim()) ?? null
            : null
          const matched = matchFor(row)
          if (matched) {
            return {
              ...row,
              podcast_name: matched.podcastName,
              host_name: typeof row.host_name === 'string' && row.host_name.trim() ? row.host_name : matched.hostName,
              podcast_image_url: byId ?? artworkByShow.get(matched.podcastId) ?? null,
              show_matched: true,
            }
          }
          return { ...row, podcast_image_url: byId ?? byName }
        }),
        total,
        offset,
        limit,
        has_more: nextOffset < total,
        next_offset: nextOffset < total ? nextOffset : null,
        counts,
      })
    }

    if (action === 'detail') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'podcast_id'])
      const showId = podcastId(body.podcast_id)
      const [
        bookResult,
        clientsResult,
        eventsResult,
        derivedResult,
        targetsResult,
        threadsResult,
        bookingsResult,
        savedThreadsResult,
      ] = await Promise.all([
        admin.from('workspace_host_relationships')
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, owner_user_id, updated_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId).maybeSingle(),
        admin.from('workspace_host_relationship_clients')
          .select('client_id, intent, note, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId),
        admin.from('workspace_host_relationship_events')
          .select('id, client_id, kind, body, occurred_at, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId)
          .order('occurred_at', { ascending: false }).limit(500),
        admin.rpc('workspace_podcast_relationships_v1', {
          p_workspace_id: workspaceId,
          p_podcast_ids: [showId],
        }),
        admin.from('workspace_client_campaign_targets')
          .select('client_id, email_reply_count, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId)
          .or('launched_at.not.is.null,instantly_lead_id.not.is.null'),
        admin.from('workspace_inbox_thread_state')
          .select('client_id, status, classification, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId),
        admin.from('bookings')
          .select('client_id, status, created_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', showId)
          .neq('status', 'cancelled'),
        admin.from('workspace_host_relationship_threads')
          .select([
            'thread_key', 'client_id', 'provider', 'latest_message_id', 'subject',
            'lead_email', 'from_email', 'to_email', 'latest_message_body',
            'latest_message_at', 'campaign_id', 'campaign_name', 'created_at', 'updated_at',
          ].join(','))
          .eq('workspace_id', workspaceId).eq('podcast_id', showId)
          .order('latest_message_at', { ascending: false, nullsFirst: false })
          .order('updated_at', { ascending: false })
          .limit(250),
      ])
      if (
        bookResult.error || clientsResult.error || eventsResult.error || derivedResult.error
        || targetsResult.error || threadsResult.error || bookingsResult.error || savedThreadsResult.error
      ) {
        throw new HttpError(500, 'RELATIONSHIP_DETAIL_FAILED', 'The relationship could not be loaded')
      }
      const clientHistory = new Map<string, { intent: string; note: string | null; created_at: string }>()
      const putDerivedClient = (clientId: unknown, intent: string, createdAt: unknown) => {
        if (typeof clientId !== 'string') return
        const existing = clientHistory.get(clientId)
        const rank: Record<string, number> = { considering: 0, pitched: 1, declined: 2, placed: 3, ruled_out: 4 }
        if (!existing || (rank[intent] ?? 0) > (rank[existing.intent] ?? 0)) {
          clientHistory.set(clientId, {
            intent,
            note: null,
            created_at: typeof createdAt === 'string' ? createdAt : new Date(0).toISOString(),
          })
        }
      }
      for (const row of (targetsResult.data ?? []) as Array<Record<string, unknown>>) {
        putDerivedClient(row.client_id, 'pitched', row.created_at)
      }
      for (const row of (threadsResult.data ?? []) as Array<Record<string, unknown>>) {
        const label = row.classification && typeof row.classification === 'object'
          ? (row.classification as Record<string, unknown>).label
          : null
        putDerivedClient(
          row.client_id,
          row.status === 'booked' ? 'placed' : ['not_interested', 'not_now'].includes(String(label)) ? 'declined' : 'pitched',
          row.created_at,
        )
      }
      for (const row of (bookingsResult.data ?? []) as Array<Record<string, unknown>>) {
        putDerivedClient(row.client_id, 'placed', row.created_at)
      }
      for (const row of (savedThreadsResult.data ?? []) as unknown as Array<Record<string, unknown>>) {
        putDerivedClient(row.client_id, 'pitched', row.created_at)
      }
      // A person's explicit association wins over an inferred campaign state.
      for (const row of (clientsResult.data ?? []) as Array<Record<string, unknown>>) {
        if (typeof row.client_id !== 'string') continue
        clientHistory.set(row.client_id, {
          intent: typeof row.intent === 'string' ? row.intent : 'considering',
          note: typeof row.note === 'string' ? row.note : null,
          created_at: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
        })
      }
      const clientIds = [...clientHistory.keys()]
      const clientNames = new Map<string, string>()
      if (clientIds.length > 0) {
        const { data: nameRows, error: namesError } = await admin.from('clients')
          .select('id, name')
          .eq('workspace_id', workspaceId)
          .in('id', clientIds)
        if (namesError) {
          throw new HttpError(500, 'RELATIONSHIP_DETAIL_FAILED', 'The relationship could not be loaded')
        }
        for (const row of nameRows ?? []) clientNames.set(row.id, row.name)
      }
      return jsonResponse(req, METHODS, 200, {
        relationship: bookResult.data ?? null,
        derived: (derivedResult.data ?? [])[0] ?? null,
        clients: clientIds.map((clientId) => ({
          client_id: clientId,
          client_name: clientNames.get(clientId) ?? null,
          ...clientHistory.get(clientId),
        })),
        events: eventsResult.data ?? [],
        threads: ((savedThreadsResult.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
          ...row,
          client_name: typeof row.client_id === 'string' ? clientNames.get(row.client_id) ?? null : null,
        })),
      })
    }

    if (action === 'create') {
      requireOnlyKeys(body, [
        'action', 'workspace_id', 'podcast_id', 'podcast_name',
        'host_name', 'contact_email', 'manual_stage', 'summary',
      ])
      requireManager()
      // A host can be added by address alone: the show is often unknown until
      // they reply, and the inbox links the thread to it by that address.
      const showName = optionalString(body.podcast_name, 'podcast_name', 500)
      const hostName = optionalString(body.host_name, 'host_name', 300)
      const contactEmail = optionalContactEmail(body.contact_email)
      if (!showName && !contactEmail) {
        throw new HttpError(400, 'INVALID_FIELD', 'podcast_name or contact_email is required')
      }
      const stage = parseManualStage(body.manual_stage)
      const summary = optionalString(body.summary, 'summary', 5_000)
      const requestedPodcastId = body.podcast_id === undefined || body.podcast_id === null || body.podcast_id === ''
        ? null
        : podcastId(body.podcast_id)

      // Manual entry is duplicate-safe. Canonical show ids win; for a
      // free-form record, an exact show + contact match reopens the existing
      // relationship instead of producing a second copy.
      let existing: Record<string, unknown> | null = null
      if (requestedPodcastId) {
        const { data, error } = await admin.from('workspace_host_relationships')
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, updated_at, dismissed_at')
          .eq('workspace_id', workspaceId).eq('podcast_id', requestedPodcastId).maybeSingle()
        if (error) throw new HttpError(500, 'RELATIONSHIP_CREATE_FAILED', 'The relationship could not be created')
        existing = data as Record<string, unknown> | null
      } else if (contactEmail) {
        const { data, error } = await admin.from('workspace_host_relationships')
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, updated_at, dismissed_at')
          .eq('workspace_id', workspaceId).eq('contact_email', contactEmail).limit(50)
        if (error) throw new HttpError(500, 'RELATIONSHIP_CREATE_FAILED', 'The relationship could not be created')
        existing = ((data ?? []) as Array<Record<string, unknown>>).find((row) => (
          showName
            ? typeof row.podcast_name === 'string' && row.podcast_name.trim().toLowerCase() === showName.toLowerCase()
            // Address only: the unnamed record for that address is the same host.
            : typeof row.podcast_name !== 'string' || row.podcast_name.trim() === ''
        )) ?? null
      } else {
        const { data, error } = await admin.from('workspace_host_relationships')
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, updated_at, dismissed_at')
          .eq('workspace_id', workspaceId).eq('podcast_name', showName).limit(1).maybeSingle()
        if (error) throw new HttpError(500, 'RELATIONSHIP_CREATE_FAILED', 'The relationship could not be created')
        existing = data as Record<string, unknown> | null
      }
      if (existing && typeof existing.podcast_id === 'string') {
        const existingId = existing.podcast_id
        const changes: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        }
        if (showName) changes.podcast_name = showName
        // A duplicate manual add is an intentional enrichment, but blank
        // optional inputs must not erase context the team already recorded.
        if (hostName) changes.host_name = hostName
        if (contactEmail) changes.contact_email = contactEmail
        if (stage) changes.manual_stage = stage
        if (summary) changes.summary = summary
        // Adding a host by hand is a deliberate act, so it brings back a row
        // someone had marked not a host.
        if (existing.dismissed_at) {
          changes.dismissed_at = null
          changes.dismissed_by = null
        }
        const { data, error } = await admin.from('workspace_host_relationships')
          .update(changes)
          .eq('workspace_id', workspaceId).eq('podcast_id', existingId)
          .select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, updated_at')
          .single()
        if (error || !data) {
          throw new HttpError(500, 'RELATIONSHIP_CREATE_FAILED', 'The relationship could not be updated')
        }
        await writeAudit(admin, {
          workspaceId,
          actorUserId: authContext.user.id,
          action: 'workspace.host_relationship.saved',
          entityType: 'podcast',
          entityId: null,
          metadata: {
            podcast_id: existingId,
            source: 'manual_duplicate',
            changed_fields: Object.keys(changes).filter((key) => key !== 'updated_at'),
          },
        })
        return jsonResponse(req, METHODS, 200, { relationship: data, created: false })
      }

      const showId = requestedPodcastId ?? newManualPodcastId()
      const { data, error } = await admin.from('workspace_host_relationships').insert({
        workspace_id: workspaceId,
        podcast_id: showId,
        podcast_name: showName,
        host_name: hostName,
        contact_email: contactEmail,
        manual_stage: stage,
        summary,
        created_by: authContext.user.id,
      }).select('podcast_id, podcast_name, host_name, contact_email, manual_stage, summary, updated_at').single()
      if (error || !data) {
        throw new HttpError(500, 'RELATIONSHIP_CREATE_FAILED', 'The relationship could not be created')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.created',
        entityType: 'podcast',
        entityId: null,
        metadata: {
          podcast_id: showId,
          source: requestedPodcastId ? 'catalog' : 'manual',
          manual_stage: stage,
        },
      })
      return jsonResponse(req, METHODS, 201, { relationship: data, created: true })
    }

    // Relationships are added by hand only. Saving an inbox conversation
    // created a row for whoever replied, which is how a homeowner answering a
    // client's solar cold email ended up in the book as a podcast host. The
    // inbox it served is retired, so the path is closed rather than filtered.
    if (action === 'thread-capture') {
      throw new HttpError(410, 'RELATIONSHIP_CAPTURE_RETIRED', 'Relationships are added by hand. Saving inbox conversations has been retired')
    }

    if (action === 'dismiss') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'podcast_id', 'dismissed'])
      requireManager()
      const showId = podcastId(body.podcast_id)
      if (typeof body.dismissed !== 'boolean') {
        throw new HttpError(400, 'INVALID_FIELD', 'dismissed must be true or false')
      }
      const dismissed = body.dismissed
      // "Not a host" hides the row and keeps it: deleting it would forget the
      // address, and the record could come back. Undo clears the mark.
      const { data, error } = await admin.from('workspace_host_relationships')
        .update({
          dismissed_at: dismissed ? new Date().toISOString() : null,
          dismissed_by: dismissed ? authContext.user.id : null,
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId).eq('podcast_id', showId)
        .select('podcast_id, dismissed_at')
        .maybeSingle()
      if (error) {
        throw new HttpError(500, 'RELATIONSHIP_SAVE_FAILED', 'The relationship could not be updated')
      }
      if (!data) throw new HttpError(404, 'RELATIONSHIP_NOT_FOUND', 'Relationship not found')
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: dismissed ? 'workspace.host_relationship.dismissed' : 'workspace.host_relationship.restored',
        entityType: 'podcast',
        entityId: null,
        metadata: {
          podcast_id: showId,
          reason: 'not_a_host',
        },
      })
      return jsonResponse(req, METHODS, 200, { relationship: data })
    }

    if (action === 'upsert') {
      requireOnlyKeys(body, [
        'action', 'workspace_id', 'podcast_id', 'podcast_name',
        'host_name', 'contact_email', 'manual_stage', 'summary', 'snoozed_until',
      ])
      requireManager()
      const showId = podcastId(body.podcast_id)
      const manualStage = parseManualStage(body.manual_stage)
      const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key)
      const { data: current, error: currentError } = await admin
        .from('workspace_host_relationships')
        .select('manual_stage')
        .eq('workspace_id', workspaceId)
        .eq('podcast_id', showId)
        .maybeSingle()
      if (currentError) {
        throw new HttpError(500, 'RELATIONSHIP_SAVE_FAILED', 'The relationship could not be saved')
      }
      const changes: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (has('podcast_name')) changes.podcast_name = optionalString(body.podcast_name, 'podcast_name', 500)
      if (has('host_name')) changes.host_name = optionalString(body.host_name, 'host_name', 300)
      if (has('contact_email')) {
        changes.contact_email = optionalContactEmail(body.contact_email)
      }
      if (has('manual_stage')) changes.manual_stage = manualStage
      if (has('summary')) changes.summary = optionalString(body.summary, 'summary', 5_000)
      // A snooze only parks the row on this page; null wakes it.
      if (has('snoozed_until')) changes.snoozed_until = optionalTimestamp(body.snoozed_until, 'snoozed_until')
      // Existing rows use UPDATE so omitted properties are unambiguously
      // preserved. INSERT is reserved for a new relationship and stamps its
      // creator once; later edits never rewrite authorship.
      const saveQuery = current
        ? admin.from('workspace_host_relationships')
          .update(changes)
          .eq('workspace_id', workspaceId)
          .eq('podcast_id', showId)
        : admin.from('workspace_host_relationships').insert({
          workspace_id: workspaceId,
          podcast_id: showId,
          created_by: authContext.user.id,
          ...changes,
        })
      const { data, error } = await saveQuery
        .select('podcast_id, manual_stage, summary, updated_at')
        .single()
      if (error || !data) {
        throw new HttpError(500, 'RELATIONSHIP_SAVE_FAILED', 'The relationship could not be saved')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.saved',
        entityType: 'podcast',
        entityId: null,
        metadata: {
          podcast_id: showId,
          changed_fields: Object.keys(changes).filter((key) => key !== 'updated_at'),
        },
      })
      if (has('manual_stage') && current?.manual_stage !== manualStage) {
        const from = typeof current?.manual_stage === 'string' ? current.manual_stage : 'derived activity'
        const to = manualStage ?? 'derived activity'
        const { error: eventError } = await admin.from('workspace_host_relationship_events').insert({
          workspace_id: workspaceId,
          podcast_id: showId,
          kind: 'stage_change',
          body: `Relationship stage changed from ${from} to ${to}.`,
          created_by: authContext.user.id,
        })
        if (eventError) {
          throw new HttpError(500, 'RELATIONSHIP_SAVE_FAILED', 'The relationship stage history could not be saved')
        }
      }
      return jsonResponse(req, METHODS, 200, { relationship: data })
    }

    if (action === 'note-add') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'podcast_id', 'client_id', 'kind', 'body_text'])
      requireManager()
      const showId = podcastId(body.podcast_id)
      const kind = body.kind === undefined || body.kind === null
        ? 'note'
        : requireString(body.kind, 'kind', { max: 20 })
      if (!EVENT_KINDS.has(kind)) {
        throw new HttpError(400, 'INVALID_FIELD', 'kind must be note, call, or meeting')
      }
      const text = requireString(body.body_text, 'body_text', { max: 5_000 })
      const clientId = body.client_id === undefined || body.client_id === null
        ? null
        : requireUuid(body.client_id, 'client_id')
      if (clientId) {
        const { data: client, error: clientError } = await admin
          .from('clients').select('id').eq('id', clientId).eq('workspace_id', workspaceId).maybeSingle()
        if (clientError) {
          throw new HttpError(500, 'RELATIONSHIP_NOTE_FAILED', 'The note could not be saved')
        }
        if (!client) {
          throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
        }
      }
      // The book entry must exist before it can hold history; a note on an
      // uncurated show creates the entry rather than failing.
      const { error: parentError } = await admin.from('workspace_host_relationships').upsert({
        workspace_id: workspaceId,
        podcast_id: showId,
        created_by: authContext.user.id,
      }, { onConflict: 'workspace_id,podcast_id', ignoreDuplicates: true })
      if (parentError) {
        throw new HttpError(500, 'RELATIONSHIP_NOTE_FAILED', 'The note could not be saved')
      }
      const { data, error } = await admin
        .from('workspace_host_relationship_events')
        .insert({
          workspace_id: workspaceId,
          podcast_id: showId,
          client_id: clientId,
          kind,
          body: text,
          created_by: authContext.user.id,
        })
        .select('id, kind, body, occurred_at, client_id')
        .single()
      if (error || !data) {
        throw new HttpError(500, 'RELATIONSHIP_NOTE_FAILED', 'The note could not be saved')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.note_added',
        entityType: 'podcast',
        entityId: null,
        metadata: { podcast_id: showId, kind, client_id: clientId },
      })
      return jsonResponse(req, METHODS, 200, { event: data })
    }

    if (action === 'client-link') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'podcast_id', 'client_id', 'intent', 'note'])
      requireManager()
      const showId = podcastId(body.podcast_id)
      const clientId = requireUuid(body.client_id, 'client_id')
      const intent = body.intent === undefined || body.intent === null
        ? 'considering'
        : requireString(body.intent, 'intent', { max: 20 })
      if (!CLIENT_INTENTS.has(intent)) {
        throw new HttpError(400, 'INVALID_FIELD', 'intent is invalid')
      }
      // Cross-tenant safety: the client must belong to this workspace.
      const { data: client, error: clientError } = await admin
        .from('clients').select('id').eq('id', clientId).eq('workspace_id', workspaceId).maybeSingle()
      if (clientError) {
        throw new HttpError(500, 'RELATIONSHIP_CLIENT_LINK_FAILED', 'The client could not be linked')
      }
      if (!client) {
        throw new HttpError(404, 'CLIENT_NOT_FOUND', 'Workspace client not found')
      }
      const { error: parentError } = await admin.from('workspace_host_relationships').upsert({
        workspace_id: workspaceId,
        podcast_id: showId,
        created_by: authContext.user.id,
      }, { onConflict: 'workspace_id,podcast_id', ignoreDuplicates: true })
      if (parentError) {
        throw new HttpError(500, 'RELATIONSHIP_CLIENT_LINK_FAILED', 'The client could not be linked')
      }
      const { data, error } = await admin
        .from('workspace_host_relationship_clients')
        .upsert({
          workspace_id: workspaceId,
          podcast_id: showId,
          client_id: clientId,
          intent,
          note: optionalString(body.note, 'note', 1_000),
          created_by: authContext.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,podcast_id,client_id' })
        .select('client_id, intent, note')
        .single()
      if (error || !data) {
        throw new HttpError(500, 'RELATIONSHIP_CLIENT_LINK_FAILED', 'The client could not be linked')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.client_linked',
        entityType: 'podcast',
        entityId: null,
        metadata: { podcast_id: showId, client_id: clientId, intent },
      })
      return jsonResponse(req, METHODS, 200, { client: data })
    }

    if (action === 'client-unlink') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'podcast_id', 'client_id'])
      requireManager()
      const showId = podcastId(body.podcast_id)
      const clientId = requireUuid(body.client_id, 'client_id')
      const { error } = await admin
        .from('workspace_host_relationship_clients')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('podcast_id', showId)
        .eq('client_id', clientId)
      if (error) {
        throw new HttpError(500, 'RELATIONSHIP_CLIENT_UNLINK_FAILED', 'The client could not be removed')
      }
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.host_relationship.client_unlinked',
        entityType: 'podcast',
        entityId: null,
        metadata: { podcast_id: showId, client_id: clientId },
      })
      return jsonResponse(req, METHODS, 200, { removed: true })
    }

    // The do-not-contact list. An opt-out is directed at the sender, so a
    // single entry silences the address for every client in the workspace. Any
    // member may read it — knowing not to pitch someone is part of the job —
    // while adding and, above all, removing are manager decisions.
    if (action === 'suppression-list') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'limit'])
      const limit = typeof body.limit === 'number' && Number.isInteger(body.limit)
        ? Math.max(1, Math.min(body.limit, 1_000))
        : 500
      const { data, error } = await admin.rpc('workspace_outreach_suppression_list_v1', {
        p_workspace_id: workspaceId,
        p_limit: limit,
      })
      if (error) {
        throw new HttpError(500, 'SUPPRESSION_LIST_FAILED', 'The do-not-contact list could not be loaded')
      }
      return jsonResponse(req, METHODS, 200, { suppressions: data ?? [] })
    }

    if (action === 'suppression-add') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'contact_email', 'reason', 'note'])
      requireManager()
      const contactEmail = requireEmail(body.contact_email)
      const reason = body.reason === undefined || body.reason === null || body.reason === ''
        ? 'manual'
        : requireString(body.reason, 'reason', { max: 20 })
      if (!SUPPRESSION_REASONS.has(reason)) {
        throw new HttpError(400, 'INVALID_FIELD', 'reason must be opted_out, bounced, or manual')
      }
      // Adding is idempotent and never overwrites an existing entry: the
      // original row dates the opt-out, which is the fact that matters if it is
      // ever questioned, and the inbox prefilter's evidence outranks a later
      // manual note.
      const { error } = await admin
        .from('workspace_outreach_suppressions')
        .upsert({
          workspace_id: workspaceId,
          contact_email: contactEmail,
          reason,
          source: 'manual',
          note: optionalString(body.note, 'note', 1_000),
          created_by: authContext.user.id,
        }, { onConflict: 'workspace_id,contact_email', ignoreDuplicates: true })
      if (error) {
        throw new HttpError(500, 'SUPPRESSION_ADD_FAILED', 'The address could not be added to the do-not-contact list')
      }
      const blocked = await syncInstantlyBlockList(admin, workspaceId, contactEmail, 'block')
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.outreach_suppression.added',
        entityType: 'outreach_suppression',
        entityId: null,
        metadata: {
          contact_email: contactEmail,
          reason,
          instantly_blocked: blocked.synced,
          instantly_error: blocked.reason,
        },
      })
      // Reported rather than hidden: the row is written either way, but a
      // workspace whose provider was not updated is still sending from
      // campaigns already in flight, and only this tells anyone.
      return jsonResponse(req, METHODS, 200, {
        suppressed: true,
        instantly_blocked: blocked.synced,
        instantly_error: blocked.reason,
      })
    }

    if (action === 'suppression-remove') {
      requireOnlyKeys(body, ['action', 'workspace_id', 'contact_email', 'note'])
      requireManager()
      const contactEmail = requireEmail(body.contact_email)
      // Reinstating an address means this platform will email someone it has
      // recorded as not wanting to hear from us. That is the one action here
      // worth making a person write down a reason for, and the deleted row's
      // own evidence is preserved in the audit metadata so the original
      // decision survives the row that carried it.
      const note = requireString(body.note, 'note', { min: 4, max: 1_000 })
      const { data: existing, error: readError } = await admin
        .from('workspace_outreach_suppressions')
        .select('contact_email, reason, source, note, created_at')
        .eq('workspace_id', workspaceId)
        .eq('contact_email', contactEmail)
        .maybeSingle()
      if (readError) {
        throw new HttpError(500, 'SUPPRESSION_REMOVE_FAILED', 'The do-not-contact entry could not be read')
      }
      if (!existing) {
        throw new HttpError(404, 'SUPPRESSION_NOT_FOUND', 'That address is not on the do-not-contact list')
      }
      const { error } = await admin
        .from('workspace_outreach_suppressions')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('contact_email', contactEmail)
      if (error) {
        throw new HttpError(500, 'SUPPRESSION_REMOVE_FAILED', 'The address could not be removed from the do-not-contact list')
      }
      // Reinstating has to reach the provider too, or the address stays blocked
      // in Instantly while this list says it is contactable — the same
      // disagreement as before, pointing the other way.
      const unblocked = await syncInstantlyBlockList(admin, workspaceId, contactEmail, 'unblock')
      await writeAudit(admin, {
        workspaceId,
        actorUserId: authContext.user.id,
        action: 'workspace.outreach_suppression.removed',
        entityType: 'outreach_suppression',
        entityId: null,
        metadata: {
          contact_email: contactEmail,
          instantly_unblocked: unblocked.synced,
          instantly_error: unblocked.reason,
          removal_note: note,
          original_reason: existing.reason,
          original_source: existing.source,
          original_note: existing.note,
          suppressed_at: existing.created_at,
        },
      })
      return jsonResponse(req, METHODS, 200, {
        removed: true,
        instantly_unblocked: unblocked.synced,
        instantly_error: unblocked.reason,
      })
    }

    throw new HttpError(400, 'UNSUPPORTED_ACTION', 'Unsupported action')
  } catch (error) {
    return errorResponse(req, METHODS, error)
  }
})
