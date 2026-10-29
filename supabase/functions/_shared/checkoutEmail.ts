import { sendAppEmail, type AppEmailResult } from './appEmail.ts'
import type { CheckoutDatabase } from './subscriptionCheckout.ts'

export type CheckoutEmailStatus = 'sent' | 'failed' | 'skipped' | 'unknown'
export interface CheckoutEmailInput {
  workspaceId: string
  actionKey: string
  to: string
  workspaceName: string
  planName: string
  priceLabel: string
  url: string
}
const TERMINAL = new Set(['sent', 'failed', 'skipped', 'unknown'])
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function status(value: unknown): CheckoutEmailStatus {
  return TERMINAL.has(String(value)) ? value as CheckoutEmailStatus : 'unknown'
}
async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Replayed admin actions read their receipt, even if checkout or branding changed. */
export async function checkoutEmailOutcome(admin: CheckoutDatabase, workspaceId: string, actionKey: string): Promise<CheckoutEmailStatus | null> {
  try {
    const { data, error } = await admin.rpc('workspace_checkout_email_outcome_v1', {
      p_workspace_id: workspaceId, p_action_key: actionKey,
    })
    if (error) return 'unknown'
    return data === null ? null : status(record(data).status)
  } catch { return 'unknown' }
}

/**
 * Claim before sending. A new action may resend a known result, but never evade
 * an unresolved attempt for this checkout/recipient. Only hashes reach storage;
 * neither the bearer checkout URL nor the recipient is persisted here.
 */
export async function sendCheckoutEmail(
  admin: CheckoutDatabase, input: CheckoutEmailInput,
  send: typeof sendAppEmail = sendAppEmail,
): Promise<CheckoutEmailStatus> {
  const to = input.to.trim().toLowerCase()
  const payload = {
    event: 'billing.checkout_link' as const, to: [to],
    data: { workspace_name: input.workspaceName, plan_name: input.planName,
      price_label: input.priceLabel, checkout_url: input.url },
  }
  try {
    const scopeHash = await hash([input.workspaceId, input.url, to])
    const fingerprint = await hash(payload)
    const { data, error } = await admin.rpc('claim_workspace_checkout_email_v1', {
      p_workspace_id: input.workspaceId, p_action_key: input.actionKey,
      p_scope_hash: scopeHash, p_payload_hash: fingerprint,
    })
    if (error) return 'unknown'
    const claim = record(data)
    if (claim.outcome !== 'claimed') {
      // A changed payload or blocked sibling is an unresolved operation, never
      // a reason to rotate the operation key and try the send again.
      return claim.outcome === 'existing' ? status(claim.status) : 'unknown'
    }
    if (typeof claim.owner_token !== 'string' || !claim.owner_token) return 'unknown'
    let delivery: AppEmailResult
    try {
      delivery = await send({ ...payload,
        idempotencyKey: `checkout-email:${input.workspaceId}:${input.actionKey}` })
    } catch {
      delivery = { status: 'unknown', providerMessageId: null, error: null, retryable: false }
    }
    const outcome = delivery.code === 'IDEMPOTENCY_CONFLICT' ? 'unknown' : status(delivery.status)
    const saved = await admin.rpc('complete_workspace_checkout_email_v1', {
      p_workspace_id: input.workspaceId, p_action_key: input.actionKey,
      p_owner_token: claim.owner_token, p_status: outcome,
      p_provider_message_id: outcome === 'sent' ? delivery.providerMessageId : null,
    })
    if (saved.error || record(saved.data).status !== outcome) return 'unknown'
    return outcome
  } catch { return 'unknown' }
}
