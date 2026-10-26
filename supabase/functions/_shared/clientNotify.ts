// White-labelled milestone emails for end clients.
//
// The platform knew about every meaningful moment in a client's journey and
// told them about none of it. This module is the one place that speaks: it
// resolves the recipient, claims the event so it can only be announced once,
// sends under the workspace's own name, and records the outcome. The wording
// and layout live in the n8n email workflow (see appEmail.ts); this module
// decides who hears what, and hands over the facts.
//
// Every entry point is best-effort by contract. A notification must never fail
// the mutation that triggered it — callers await the promise but the promise
// resolves rather than throws, and the send log carries the failure.

import { type AppEmailEvent, sendAppEmail } from './appEmail.ts'
import { workspaceLinkOrigin } from './workspaceOrigin.ts'

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export type ClientNotificationKind =
  | 'shortlist_ready'
  | 'booking_confirmed'
  | 'episode_published'
  | 'client_approved'

export interface ClientNotificationResult {
  status: 'sent' | 'failed' | 'skipped' | 'duplicate'
  reason?: string
}

interface Recipient {
  email: string
  name: string
  workspaceName: string
  /** The agency's contact address, or null when it has not set one. */
  replyTo: string | null
  reviewUrl: string | null
  portalUrl: string | null
}

function appOrigin(): string | null {
  for (const candidate of [Deno.env.get('APP_URL'), Deno.env.get('WEB_URL')]) {
    if (!candidate?.trim()) continue
    try {
      const parsed = new URL(candidate)
      const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      if (parsed.protocol === 'https:' || (local && parsed.protocol === 'http:')) return parsed.origin
    } catch {
      // Try the next configured application URL.
    }
  }
  return null
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

async function resolveRecipient(
  admin: AdminClient,
  workspaceId: string,
  clientId: string,
): Promise<Recipient | null> {
  const { data: client } = await admin
    .from('clients')
    .select('id,workspace_id,name,email,contact_person,dashboard_slug,dashboard_enabled,portal_access_enabled,password_set_at,notifications_enabled')
    .eq('id', clientId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!client || client.workspace_id !== workspaceId) return null
  if (client.notifications_enabled === false) return null

  const email = typeof client.email === 'string' ? client.email.trim() : ''
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)) return null

  const { data: workspace } = await admin
    .from('workspaces')
    .select('id,name,client_contact_email')
    .eq('id', workspaceId)
    .maybeSingle()

  // Client-facing, so it carries the agency's own hostname when they have one.
  const origin = await workspaceLinkOrigin(admin, workspaceId).catch(() => appOrigin())
  const slug = typeof client.dashboard_slug === 'string' ? client.dashboard_slug : null
  // Two front doors: the portal for clients who have a password, the public
  // capability URL for everyone else. Never link to a page they cannot open.
  const portalUrl = origin && client.portal_access_enabled && client.password_set_at
    ? `${origin}/portal/login${slug ? `?b=${encodeURIComponent(slug)}` : ''}`
    : null
  const reviewUrl = origin && slug && client.dashboard_enabled
    ? `${origin}/client/${encodeURIComponent(slug)}`
    : null

  const contact = typeof client.contact_person === 'string' ? client.contact_person.trim() : ''
  return {
    email,
    name: (contact || String(client.name || '').trim() || 'there').split(' ')[0],
    workspaceName: String(workspace?.name || 'Your podcast team').trim() || 'Your podcast team',
    // Where a reply lands. The prospect page tells people to reply to the
    // email that brought them here; without this it went nowhere.
    replyTo: typeof workspace?.client_contact_email === 'string' && workspace.client_contact_email.includes('@')
      ? workspace.client_contact_email.trim()
      : null,
    reviewUrl,
    portalUrl,
  }
}

async function deliver(
  admin: AdminClient,
  input: {
    workspaceId: string
    clientId: string
    kind: ClientNotificationKind
    eventKey: string
    recipients: string[]
    workspaceName: string
    replyTo?: string | null
    event: AppEmailEvent
    data: Record<string, unknown>
    metadata?: Record<string, unknown>
  },
): Promise<ClientNotificationResult> {
  // Claim before send: the unique index on (workspace, client, event_key)
  // turns a concurrent or retried caller into a duplicate, not a second email.
  const { error: claimError } = await admin
    .from('client_notifications')
    .insert({
      workspace_id: input.workspaceId,
      client_id: input.clientId,
      kind: input.kind,
      event_key: input.eventKey.slice(0, 200),
      recipient_email: input.recipients[0],
      status: 'sending',
      metadata: input.metadata || {},
    })
  if (claimError) {
    // 23505 is the unique violation: this milestone was already announced.
    if (String((claimError as { code?: string }).code) === '23505') return { status: 'duplicate' }
    console.error('[Client Notify] Could not claim the notification')
    return { status: 'failed', reason: 'claim_failed' }
  }

  const finish = async (
    status: 'sent' | 'failed' | 'skipped',
    extra: { providerMessageId?: string | null; error?: string | null },
  ) => {
    await admin
      .from('client_notifications')
      .update({
        status,
        provider_message_id: extra.providerMessageId ?? null,
        error: extra.error ?? null,
      })
      .eq('workspace_id', input.workspaceId)
      .eq('client_id', input.clientId)
      .eq('event_key', input.eventKey.slice(0, 200))
  }

  const release = async () => {
    const { error } = await admin
      .from('client_notifications')
      .delete()
      .eq('workspace_id', input.workspaceId)
      .eq('client_id', input.clientId)
      .eq('event_key', input.eventKey.slice(0, 200))
      .eq('status', 'sending')
    if (error) {
      console.error('[Client Notify] Could not release the notification claim')
      await finish('failed', { error: 'Email provider was temporarily unavailable' })
    }
  }

  const delivery = await sendAppEmail({
    event: input.event,
    to: input.recipients,
    senderName: input.workspaceName,
    replyTo: input.replyTo,
    data: input.data,
    // The claim already makes this event once-only here; the key makes it
    // once-only in the workflow too, should a retry reach it twice.
    idempotencyKey: `client-notification:${input.workspaceId}:${input.clientId}:${input.eventKey.slice(0, 200)}`,
  })
  if (delivery.status === 'skipped') {
    await finish('skipped', { error: 'Email delivery is not configured' })
    return { status: 'skipped', reason: 'not_configured' }
  }
  if (delivery.status === 'failed') {
    if (delivery.retryable) {
      // The workflow definitively did not send it, so release the claim and
      // let the next trigger for this event try again. A timeout is NOT
      // released: the message may have gone out, and a second copy is worse
      // than a missed one.
      await release()
      return { status: 'failed', reason: 'provider_unavailable' }
    }
    await finish('failed', { error: delivery.error })
    return { status: 'failed', reason: 'provider_rejected' }
  }
  await finish('sent', { providerMessageId: delivery.providerMessageId })
  return { status: 'sent' }
}

/**
 * New shows are waiting on the client's yes or no.
 *
 * Deliberately debounced to one email per client per day: an operator adding
 * shows in three sittings is one piece of news, not three. The count is the
 * client's whole pending queue at send time rather than the size of the batch
 * that triggered it, so the number stays true no matter when it fires.
 */
export async function notifyShortlistReady(
  admin: AdminClient,
  input: { workspaceId: string; clientId: string; day: string },
): Promise<ClientNotificationResult> {
  const recipient = await resolveRecipient(admin, input.workspaceId, input.clientId)
  if (!recipient) return { status: 'skipped', reason: 'no_recipient' }
  const url = recipient.reviewUrl || recipient.portalUrl
  if (!url) return { status: 'skipped', reason: 'no_review_surface' }

  const [{ data: visible }, { data: decided }] = await Promise.all([
    admin
      .from('client_dashboard_podcasts')
      .select('podcast_id')
      .eq('client_id', input.clientId)
      .eq('visibility', 'visible')
      .limit(2_000),
    admin
      .from('client_podcast_feedback')
      .select('podcast_id,status')
      .eq('client_id', input.clientId)
      .limit(2_000),
  ])
  const answered = new Set(
    (decided || [])
      .filter((row: { status?: string | null }) => row.status === 'approved' || row.status === 'rejected')
      .map((row: { podcast_id: string }) => row.podcast_id),
  )
  const count = (visible || []).filter((row: { podcast_id: string }) => !answered.has(row.podcast_id)).length
  if (count < 1) return { status: 'skipped', reason: 'nothing_pending' }

  return deliver(admin, {
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    kind: 'shortlist_ready',
    eventKey: `shortlist:${input.day}`,
    recipients: [recipient.email],
    workspaceName: recipient.workspaceName,
    replyTo: recipient.replyTo,
    event: 'client.shortlist_ready',
    data: {
      workspace_name: recipient.workspaceName,
      greeting_name: recipient.name,
      pending_count: count,
      review_url: url,
    },
    metadata: { pending_count: count },
  })
}

/** A recording is on the calendar. */
export async function notifyBookingConfirmed(
  admin: AdminClient,
  input: {
    workspaceId: string
    clientId: string
    bookingId: string
    podcastName: string
    hostName?: string | null
    recordingDate?: string | null
  },
): Promise<ClientNotificationResult> {
  const recipient = await resolveRecipient(admin, input.workspaceId, input.clientId)
  if (!recipient) return { status: 'skipped', reason: 'no_recipient' }

  const show = input.podcastName?.trim() || 'a podcast'
  // The copy branches on these in the workflow: no date means "we are
  // confirming it", and no portal means no calendar to point at.
  return deliver(admin, {
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    kind: 'booking_confirmed',
    eventKey: `booking:${input.bookingId}:booked`,
    recipients: [recipient.email],
    workspaceName: recipient.workspaceName,
    replyTo: recipient.replyTo,
    event: 'client.booking_confirmed',
    data: {
      workspace_name: recipient.workspaceName,
      greeting_name: recipient.name,
      show_name: show,
      host_name: input.hostName?.trim() || null,
      recording_date_label: formatDate(input.recordingDate),
      portal_url: recipient.portalUrl,
    },
    metadata: { booking_id: input.bookingId, recording_date: input.recordingDate || null },
  })
}

/** The episode is live and shareable. */
export async function notifyEpisodePublished(
  admin: AdminClient,
  input: {
    workspaceId: string
    clientId: string
    bookingId: string
    podcastName: string
    episodeUrl?: string | null
  },
): Promise<ClientNotificationResult> {
  const recipient = await resolveRecipient(admin, input.workspaceId, input.clientId)
  if (!recipient) return { status: 'skipped', reason: 'no_recipient' }

  const show = input.podcastName?.trim() || 'your podcast'
  return deliver(admin, {
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    kind: 'episode_published',
    eventKey: `booking:${input.bookingId}:published`,
    recipients: [recipient.email],
    workspaceName: recipient.workspaceName,
    replyTo: recipient.replyTo,
    event: 'client.episode_published',
    data: {
      workspace_name: recipient.workspaceName,
      greeting_name: recipient.name,
      show_name: show,
      episode_url: input.episodeUrl?.trim() || null,
      portal_url: recipient.portalUrl,
    },
    metadata: { booking_id: input.bookingId, episode_url: input.episodeUrl || null },
  })
}

/**
 * The other direction: the client acted, and the team needs to know so the
 * approved shows do not sit unpitched. Goes to workspace managers, not the
 * client, so it is deliberately plain rather than white-labelled marketing.
 */
export async function notifyWorkspaceOfApprovals(
  admin: AdminClient,
  input: { workspaceId: string; clientId: string; day: string },
): Promise<ClientNotificationResult> {
  const { data: client } = await admin
    .from('clients')
    .select('id,workspace_id,name')
    .eq('id', input.clientId)
    .eq('workspace_id', input.workspaceId)
    .maybeSingle()
  if (!client || client.workspace_id !== input.workspaceId) return { status: 'skipped', reason: 'no_client' }

  const { data: workspace } = await admin
    .from('workspaces')
    .select('id,name')
    .eq('id', input.workspaceId)
    .maybeSingle()

  const { data: managers } = await admin
    .from('workspace_memberships')
    .select('workspace_id,email_normalized,role,status')
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'active')
    .in('role', ['owner', 'admin'])
    .limit(10)

  const emails: string[] = [...new Set<string>((managers || [])
    .filter((member: { workspace_id?: string }) => member.workspace_id === input.workspaceId)
    .map((member: { email_normalized?: string }) => String(member.email_normalized || '').trim())
    .filter((email: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(email)))]
  if (emails.length === 0) return { status: 'skipped', reason: 'no_manager_email' }

  const clientName = String(client.name || 'A client').trim()
  const { count } = await admin
    .from('client_podcast_feedback')
    .select('podcast_id', { count: 'exact', head: true })
    .eq('client_id', input.clientId)
    .eq('status', 'approved')
  const approved = typeof count === 'number' ? count : 0
  if (approved < 1) return { status: 'skipped', reason: 'nothing_approved' }
  // Deliberately the platform origin: /app is the agency's own workspace, not
  // a page their client is ever meant to open.
  const origin = appOrigin()
  const url = origin ? `${origin}/app/clients/${input.clientId}` : null
  const workspaceName = String(workspace?.name || 'Your podcast team').trim() || 'Your podcast team'
  return deliver(admin, {
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    kind: 'client_approved',
    eventKey: `approvals:${input.day}`,
    recipients: emails,
    workspaceName,
    event: 'workspace.client_approved',
    data: {
      workspace_name: workspaceName,
      client_name: clientName,
      approved_total: approved,
      client_url: url,
    },
    metadata: { approved_total: approved, recipients: emails.length },
  })
}
