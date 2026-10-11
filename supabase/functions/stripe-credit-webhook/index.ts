// Stripe webhook for credit pack purchases. Signature-verified (manual
// HMAC-SHA256 over the v1 scheme), then checkout.session.completed grants the
// purchased credits idempotently via grant_workspace_credits_v1 keyed on the
// Stripe event id — replays and retries can never double-grant.
//
// Events this endpoint must be subscribed to in the Stripe dashboard:
// checkout.session.completed, payment_intent.succeeded, charge.refunded and
// charge.dispute.created.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

import { createAdminClient } from '../_shared/workspaceAuth.ts'

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false
  let timestamp = ''
  // During a secret rollover Stripe signs with both secrets and sends two v1
  // values; keeping only the last one rejected valid events until it ended.
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2)
    if (!key || !value) continue
    if (key.trim() === 't') timestamp = value.trim()
    if (key.trim() === 'v1') signatures.push(value.trim())
  }
  if (!timestamp || signatures.length === 0) return false
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  )
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  let matched = false
  for (const signature of signatures) {
    if (timingSafeEqual(expected, signature)) matched = true
  }
  return matched
}

serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' })

  const secret = Deno.env.get('STRIPE_CREDIT_WEBHOOK_SECRET')?.trim()
  if (!secret) return json(500, { error: 'SERVER_MISCONFIGURED' })

  // Declared size first, so an oversized body is refused before it is read
  // into memory — this endpoint is reachable without any signature.
  const declaredLength = Number(req.headers.get('content-length') ?? '')
  if (Number.isFinite(declaredLength) && declaredLength > 500_000) {
    return json(400, { error: 'PAYLOAD_TOO_LARGE' })
  }
  const payload = await req.text()
  if (payload.length > 500_000) return json(400, { error: 'PAYLOAD_TOO_LARGE' })
  const verified = await verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret)
  if (!verified) return json(400, { error: 'INVALID_SIGNATURE' })

  let event: {
    id?: string
    type?: string
    data?: { object?: Record<string, unknown> }
  }
  try {
    event = JSON.parse(payload)
  } catch (_error) {
    return json(400, { error: 'INVALID_PAYLOAD' })
  }
  // The event id is the replay protection. A payload without one used to fall
  // back to a random key, which is no protection at all — Stripe always sends
  // an id, so a signed payload missing one is malformed and gets refused, not
  // accommodated.
  if (typeof event.id !== 'string' || !event.id) {
    return json(400, { error: 'INVALID_PAYLOAD' })
  }
  // Money going back is the other half. A refund or a dispute names the
  // payment, not the workspace, so it is matched to the lot that payment
  // bought (stripe_payment_ref, written when the lot is granted).
  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    return await reverseCredits(event as { id: string; type: string; data?: { object?: Record<string, unknown> } })
  }

  // Two ways credits are bought, and they are different Stripe events. A
  // person at a checkout page completes a session; an automatic top-up has
  // nobody present, so it is a payment intent charged off-session against a
  // saved card. Both carry the same metadata and grant through the same
  // idempotent call — the alternative was a second grant path that could
  // drift from this one.
  const AUTOMATIC = 'payment_intent.succeeded'
  if (event.type !== 'checkout.session.completed' && event.type !== AUTOMATIC) {
    return json(200, { received: true, ignored: event.type ?? 'unknown' })
  }

  const session = event.data?.object ?? {}
  const metadata = (session.metadata ?? {}) as Record<string, unknown>
  const workspaceId = typeof metadata.workspace_id === 'string' ? metadata.workspace_id : null
  const credits = Number.parseInt(String(metadata.credits ?? ''), 10)
  // A session reports payment_status; a payment intent reports status. Read
  // whichever this event carries rather than trusting one shape.
  const paymentStatus = event.type === AUTOMATIC
    ? (typeof session.status === 'string' ? session.status : null)
    : (typeof session.payment_status === 'string' ? session.payment_status : null)
  const paidValue = event.type === AUTOMATIC ? 'succeeded' : 'paid'
  // A 100%-off promotion code completes the session with nothing to collect.
  // The pack was still bought — the code is how it was paid for — so it
  // grants like any other purchase. Only a genuinely zero total counts:
  // no_payment_required with an amount due would be something else entirely.
  const freeCheckout = event.type === 'checkout.session.completed'
    && paymentStatus === 'no_payment_required'
    && session.amount_total === 0
  if (!workspaceId || !Number.isInteger(credits) || credits <= 0 || credits > 100_000) {
    console.error('[Stripe Credit Webhook] Completed session missing grant metadata')
    return json(200, { received: true, ignored: 'missing metadata' })
  }
  if (paymentStatus !== paidValue && !freeCheckout) {
    return json(200, { received: true, ignored: `payment_status ${paymentStatus ?? 'unknown'}` })
  }

  const admin = createAdminClient()
  const { data: grant, error } = await admin.rpc('grant_workspace_credits_v1', {
    p_workspace_id: workspaceId,
    p_source: 'purchase',
    p_amount: credits,
    p_expires_at: null,
    p_reference_kind: event.type === AUTOMATIC ? 'stripe_auto_refill' : 'stripe_checkout',
    p_reference_id: typeof session.id === 'string' ? session.id : null,
    p_actor_user_id: null,
    /*
     * Auto-refills grant under the tick's own key. The tick's one-per-day
     * pre-check and the monthly spending cap both look for auto-refill:… rows
     * in the ledger; keyed on the Stripe event id, no such row ever existed,
     * so the daily check was dead code and the cap summed zero — a capped
     * workspace could be charged its pack price every single day. The key
     * still deduplicates event retries: every redelivery of this payment
     * carries the same metadata.
     */
    p_idempotency_key: event.type === AUTOMATIC && typeof metadata.refill_key === 'string' && metadata.refill_key.startsWith('auto-refill:')
      ? metadata.refill_key
      : `stripe:${event.id}`,
  })
  if (error) {
    console.error('[Stripe Credit Webhook] Credit grant failed')
    // Non-200 makes Stripe retry — the idempotency key makes retries safe.
    return json(500, { error: 'GRANT_FAILED' })
  }

  // Which payment bought this lot, so a refund or dispute can find it. A
  // payment intent is its own reference; a checkout session points at one
  // (and a free checkout has none, because nothing was paid to take back).
  const paymentRef = event.type === AUTOMATIC
    ? (typeof session.id === 'string' ? session.id : null)
    : (typeof session.payment_intent === 'string' ? session.payment_intent : null)
  const lotId = typeof (grant as { lot_id?: unknown } | null)?.lot_id === 'string'
    ? (grant as { lot_id: string }).lot_id
    : null
  if (paymentRef && lotId) {
    // A replayed grant returns the original lot, so a retry after this write
    // failed fills it in rather than skipping it.
    const { error: refError } = await admin
      .from('workspace_credit_lots')
      .update({ stripe_payment_ref: paymentRef })
      .eq('id', lotId)
      .eq('workspace_id', workspaceId)
      .is('stripe_payment_ref', null)
    if (refError) {
      console.error('[Stripe Credit Webhook] Payment reference could not be recorded on the lot')
      // Retried: the grant is idempotent, and a lot nobody can find is a
      // refund that can never take its credits back.
      return json(500, { error: 'PAYMENT_REF_FAILED' })
    }
  }

  return json(200, { received: true, granted: credits, workspace_id: workspaceId })
})

/**
 * charge.refunded and charge.dispute.created: remove the unspent part of the
 * lot the payment bought.
 *
 * A refund's charge carries amount_refunded as a running total, so the RPC
 * works from the cumulative figure and subtracts what earlier refunds on the
 * same lot already removed — two partial refunds land as two adjustments that
 * add up to the right share, and a replay of either is a no-op on its event id.
 * A dispute withdraws the payment, so it takes back the whole lot.
 *
 * Credits already spent are not clawed from other purchases, and the balance
 * never goes below zero; the shortfall is logged so someone can follow up.
 */
async function reverseCredits(event: {
  id: string
  type: string
  data?: { object?: Record<string, unknown> }
}): Promise<Response> {
  const object = event.data?.object ?? {}
  const dispute = event.type === 'charge.dispute.created'
  const paymentRef = typeof object.payment_intent === 'string' ? object.payment_intent : null
  if (!paymentRef) {
    return json(200, { received: true, ignored: 'no payment intent' })
  }
  const refunded = !dispute && typeof object.amount_refunded === 'number' ? object.amount_refunded : null
  const charged = !dispute && typeof object.amount === 'number' ? object.amount : null
  if (!dispute && (refunded === null || refunded <= 0)) {
    return json(200, { received: true, ignored: 'nothing refunded' })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('reverse_workspace_credit_lot_v1', {
    p_payment_ref: paymentRef,
    p_refunded_cents: refunded,
    p_charged_cents: charged,
    p_reference_kind: dispute ? 'stripe_dispute' : 'stripe_refund',
    p_reference_id: typeof object.id === 'string' ? object.id : null,
    p_idempotency_key: `stripe:${event.id}`,
  })
  if (error) {
    console.error('[Stripe Credit Webhook] Credit reversal failed')
    return json(500, { error: 'REVERSAL_FAILED' })
  }
  const result = (data ?? {}) as {
    found?: boolean
    workspace_id?: string
    removed?: number
    already_spent?: number
  }
  if (result.found !== true) {
    // Most charges are not credit purchases — subscription invoices refund
    // through here too — so an unmatched payment is expected, not an error.
    return json(200, { received: true, ignored: 'no credit lot for this payment' })
  }
  if ((result.already_spent ?? 0) > 0) {
    console.warn(
      `[Stripe Credit Webhook] ${dispute ? 'Dispute' : 'Refund'} for workspace ${result.workspace_id}: ${result.already_spent} credits were already spent and could not be taken back`,
    )
  }
  return json(200, {
    received: true,
    removed: result.removed ?? 0,
    already_spent: result.already_spent ?? 0,
    workspace_id: result.workspace_id ?? null,
  })
}
