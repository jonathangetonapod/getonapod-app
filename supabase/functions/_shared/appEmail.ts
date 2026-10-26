// Every transactional email the platform sends leaves through one n8n webhook.
//
// The edge functions say what happened and hand over the facts; n8n owns the
// copy, the layout and the mailbox (Google Workspace). So this module carries
// data, never markup: escaping and rendering happen in the workflow, and a
// copy change is an n8n edit rather than a deploy.
//
// The contract with the workflow, which it answers in under two seconds:
//   200 {status:'sent', provider_message_id}  the mailbox took it (or already
//                                              had, for this idempotency key)
//   503 provider_unavailable                  definitely not sent; safe to retry
//   409 in_progress                           the same key is mid-send elsewhere
//   400 / 401 / 502                           final; retrying will not help
//
// Fail-soft by design: an unset webhook is a 'skipped' send, not an error, so
// a missing setting can never fail the request that triggered the email.

// A hung workflow must not hold the calling request open.
const APP_EMAIL_TIMEOUT_MS = 8_000

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u

export type AppEmailEvent =
  | 'portal.invite'
  | 'portal.password_reset'
  | 'portal.addon_request'
  | 'onboarding.invitation'
  | 'onboarding.changes_requested'
  | 'client.shortlist_ready'
  | 'client.booking_confirmed'
  | 'client.episode_published'
  | 'workspace.client_approved'
  | 'billing.auto_refill_paused'
  | 'clips.lead_alert'
  | 'clips.lead_confirmation'

export interface AppEmailResult {
  status: 'sent' | 'failed' | 'skipped'
  providerMessageId: string | null
  error: string | null
  /**
   * The workflow said the message definitely did not go out, so a later
   * attempt cannot produce a second copy. A timeout is never retryable: the
   * email may have left.
   */
  retryable: boolean
  reason?: 'not_configured'
}

function webhookSettings(): { url: string; secret: string } | null {
  const url = Deno.env.get('N8N_EMAIL_WEBHOOK_URL')?.trim() ?? ''
  const secret = Deno.env.get('N8N_EMAIL_WEBHOOK_SECRET')?.trim() ?? ''
  if (!url || !secret) return null
  try {
    if (new URL(url).protocol !== 'https:') return null
  } catch {
    return null
  }
  return { url, secret }
}

/** Whether email can leave at all, so a page can say so before the first send. */
export function appEmailConfigured(): boolean {
  return webhookSettings() !== null
}

export function validEmailAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length <= 254 && EMAIL_PATTERN.test(trimmed) ? trimmed : null
}

/** A From display name: one line, no quoting characters, bounded. */
function senderDisplayName(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').replace(/[\r\n]/gu, ' ').replace(/["\\]/gu, '').trim().slice(0, 120)
  return cleaned || null
}

export async function sendAppEmail(input: {
  event: AppEmailEvent
  to: string[]
  data: Record<string, unknown>
  /** The display name on the From line; null signs it as Get On A Pod. */
  senderName?: string | null
  replyTo?: string | null
  /**
   * Same key, same email: the workflow sends it at most once. Pass one when
   * the caller can be retried for the same event; a fresh one is used otherwise.
   */
  idempotencyKey?: string
}): Promise<AppEmailResult> {
  const settings = webhookSettings()
  if (!settings) {
    return { status: 'skipped', providerMessageId: null, error: null, retryable: false, reason: 'not_configured' }
  }

  const to = [...new Set(input.to.map(validEmailAddress).filter((email): email is string => Boolean(email)))].slice(0, 10)
  if (to.length === 0) {
    return { status: 'failed', providerMessageId: null, error: 'No valid recipient', retryable: false }
  }

  try {
    const response = await fetch(settings.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': settings.secret },
      body: JSON.stringify({
        event: input.event,
        idempotency_key: (input.idempotencyKey || `${input.event}:${crypto.randomUUID()}`).slice(0, 300),
        to,
        reply_to: validEmailAddress(input.replyTo),
        sender_name: senderDisplayName(input.senderName),
        data: input.data,
      }),
      signal: AbortSignal.timeout(APP_EMAIL_TIMEOUT_MS),
    })
    const payload = await response.json().catch(() => null) as
      | { status?: unknown; provider_message_id?: unknown; error?: unknown }
      | null
    if (response.ok && payload?.status === 'sent') {
      return {
        status: 'sent',
        providerMessageId: typeof payload.provider_message_id === 'string'
          ? payload.provider_message_id.slice(0, 255)
          : null,
        error: null,
        retryable: false,
      }
    }
    if (response.status === 503) {
      return { status: 'failed', providerMessageId: null, error: 'Email provider was temporarily unavailable', retryable: true }
    }
    console.error(`[App Email] ${input.event} was not sent (HTTP ${response.status})`)
    return { status: 'failed', providerMessageId: null, error: 'Email provider rejected the message', retryable: false }
  } catch {
    console.error(`[App Email] ${input.event} delivery was unavailable`)
    return { status: 'failed', providerMessageId: null, error: 'Email provider was unavailable', retryable: false }
  }
}
