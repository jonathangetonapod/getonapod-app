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
//   503 DELIVERY_NOT_ATTEMPTED + retryable:true  no claim/send was attempted
//   409 DELIVERY_UNCONFIRMED                  delivery unknown; hold, do not resend
//   409 IDEMPOTENCY_CONFLICT                  key reused with different content
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
  | 'billing.checkout_link'
  | 'clips.lead_alert'
  | 'clips.lead_confirmation'

export interface AppEmailResult {
  status: 'sent' | 'failed' | 'skipped' | 'unknown'
  providerMessageId: string | null
  error: string | null
  /**
   * The workflow said the message definitely did not go out, so a later
   * attempt cannot produce a second copy. A timeout is never retryable: the
   * email may have left.
   */
  retryable: boolean
  reason?: 'not_configured'
  code?: 'DELIVERY_UNCONFIRMED' | 'IDEMPOTENCY_CONFLICT'
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
   * Stable business-operation key. Replays must reuse it; changed content is rejected.
   * Without one, identical semantic payloads share a content-derived key. A new
   * intentional message needs a new operation identity, not an automatic retry.
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

  const payload = {
    event: input.event, to, reply_to: validEmailAddress(input.replyTo),
    sender_name: senderDisplayName(input.senderName), data: input.data,
  }
  // No random fallback and no truncation: retries of the same content retain
  // their key, and distinct long keys cannot silently collapse into one.
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
    if (value !== null && typeof value === 'object') return '{' + Object.entries(value)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}'
    return JSON.stringify(value)
  }
  const unknown = (): AppEmailResult => ({ status: 'unknown', providerMessageId: null,
    error: 'Email delivery is unknown. Check delivery before sending another message.',
    retryable: false, code: 'DELIVERY_UNCONFIRMED' })
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(JSON.parse(JSON.stringify(payload)))))
    const key = input.idempotencyKey ?? `${input.event}:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`
    if (!key || key.length > 500 || key.trim() !== key) {
      return { status: 'failed', providerMessageId: null, error: 'Invalid email operation key', retryable: false }
    }
    const response = await fetch(settings.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': settings.secret },
      body: JSON.stringify({ ...payload, idempotency_key: key }),
      signal: AbortSignal.timeout(APP_EMAIL_TIMEOUT_MS),
    })
    const result = await response.json().catch(() => null) as
      | { status?: unknown; provider_message_id?: unknown; error?: unknown; code?: unknown; retryable?: unknown; success?: unknown }
      | null
    // Inspect application codes before HTTP status, including misleading HTTP 2xx.
    if (result?.code === 'IDEMPOTENCY_CONFLICT') {
      return { status: 'failed', providerMessageId: null, retryable: false,
        code: 'IDEMPOTENCY_CONFLICT', error: 'This email operation key was used with different content. Review the original attempt.' }
    }
    if (result?.status === 'unknown' || ['DELIVERY_UNCONFIRMED', 'DELIVERY_IN_PROGRESS'].includes(String(result?.code))
      || response.status === 409) return unknown()
    if (response.ok && result?.status === 'sent' && !result.error && !result.code && result.success !== false
      && typeof result.provider_message_id === 'string' && result.provider_message_id.trim()) {
      return { status: 'sent', providerMessageId: result.provider_message_id.slice(0, 255), error: null, retryable: false }
    }
    if (response.status === 503 && result?.code === 'DELIVERY_NOT_ATTEMPTED' && result.retryable === true) {
      return { status: 'failed', providerMessageId: null, error: 'Email delivery was not attempted', retryable: true }
    }
    if ([400, 401, 410, 422].includes(response.status)
      || (response.status === 502 && result?.code === 'DELIVERY_REJECTED')) {
      return { status: 'failed', providerMessageId: null, error: 'Email delivery was rejected', retryable: false }
    }
    return unknown()
  } catch {
    // A transport failure does not establish whether Gmail accepted the message.
    return unknown()
  }
}
