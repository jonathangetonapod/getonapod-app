import { HttpError } from './httpError.ts'

export interface CheckoutDatabase {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}
export type StripeBillingRequest = (
  method: 'GET' | 'POST', path: string, params?: URLSearchParams, idempotencyKey?: string,
) => Promise<Record<string, unknown>>

export interface CheckoutInput {
  workspaceId: string
  customerId: string
  planKey: string
  priceId: string
  billingBase: string
}
interface Attempt {
  id: string
  workspace_id: string
  customer_id: string
  plan_key: string
  price_id: string
  success_url: string
  cancel_url: string
  created_at: string
  expires_at: string
  stripe_session_id: string | null
}
type RetiredReason = 'expired' | 'subscription_ended' | 'absent_after_expiry'
const ENDED = new Set(['canceled', 'incomplete_expired'])
const MINUTE = 60_000

function pending(): HttpError {
  return new HttpError(503, 'CHECKOUT_CONFIRMATION_PENDING', 'We could not confirm the existing checkout. Wait a minute and try again. Do not start another payment; contact support if this continues.')
}
function subscribed(): HttpError {
  return new HttpError(409, 'SUBSCRIPTION_EXISTS', 'This workspace already has a subscription. Manage it from billing settings.')
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function id(value: unknown): string {
  return typeof value === 'string' ? value : typeof object(value).id === 'string' ? String(object(value).id) : ''
}
function attemptFrom(value: unknown, input: CheckoutInput): Attempt {
  const row = object(value)
  const strings = ['id', 'workspace_id', 'customer_id', 'plan_key', 'price_id', 'success_url', 'cancel_url', 'created_at', 'expires_at']
  if (strings.some((key) => typeof row[key] !== 'string' || !row[key])
    || row.workspace_id !== input.workspaceId || row.customer_id !== input.customerId
    || !Number.isFinite(Date.parse(String(row.created_at))) || !Number.isFinite(Date.parse(String(row.expires_at)))
    || !(row.stripe_session_id === null || typeof row.stripe_session_id === 'string')) throw pending()
  return row as unknown as Attempt
}

/** Same deterministic customer identity for tenant checkout, admin links and the portal. */
export async function ensureWorkspaceBillingCustomer(
  admin: CheckoutDatabase, stripe: StripeBillingRequest, workspaceId: string, knownCustomerId?: string | null,
): Promise<string> {
  if (knownCustomerId) return knownCustomerId
  try {
    const customer = await stripe('POST', 'customers', new URLSearchParams({
      'metadata[workspace_id]': workspaceId,
    }), `workspace-customer:${workspaceId}`)
    if (!id(customer)) throw pending()
    const { data, error } = await admin.rpc('record_workspace_billing_customer_v1', {
      p_workspace_id: workspaceId, p_customer_id: id(customer),
    })
    if (error || typeof data !== 'string' || !data) throw pending()
    return data
  } catch {
    throw pending()
  }
}

async function listAll(stripe: StripeBillingRequest, path: string, params: URLSearchParams): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  const seen = new Set<string>()
  // Bounded work fails closed rather than treating a truncated listing as proof
  // of absence. Normal workspace histories need only one page.
  for (let page = 0; page < 20; page++) {
    const result = await stripe('GET', `${path}?${params.toString()}`)
    if (!Array.isArray(result.data) || typeof result.has_more !== 'boolean') throw pending()
    const batch = result.data.map(object)
    if (batch.some((row) => !id(row))) throw pending()
    rows.push(...batch)
    if (!result.has_more) return rows
    const cursor = id(batch.at(-1))
    if (!cursor || seen.has(cursor)) throw pending()
    seen.add(cursor)
    params.set('starting_after', cursor)
  }
  throw pending()
}
async function assertNoSubscription(stripe: StripeBillingRequest, customerId: string) {
  const subscriptions = await listAll(stripe, 'subscriptions', new URLSearchParams({ customer: customerId, status: 'all', limit: '100' }))
  for (const subscription of subscriptions) {
    if (typeof subscription.status !== 'string' || !subscription.status) throw pending()
    if (!ENDED.has(subscription.status)) throw subscribed()
  }
}
function belongsToWorkspace(session: Record<string, unknown>, attempt: Attempt): boolean {
  return session.mode === 'subscription' && id(session.customer) === attempt.customer_id
    && (object(session.metadata).workspace_id === attempt.workspace_id || session.client_reference_id === attempt.workspace_id)
}
async function claim(admin: CheckoutDatabase, input: CheckoutInput, old?: Attempt, reason?: RetiredReason): Promise<Attempt> {
  const { data, error } = await admin.rpc('claim_workspace_checkout_attempt_v1', {
    p_workspace_id: input.workspaceId, p_customer_id: input.customerId,
    p_plan_key: input.planKey, p_price_id: input.priceId,
    p_success_url: `${input.billingBase}?plan=updated`, p_cancel_url: `${input.billingBase}?plan=cancelled`,
    p_replace_attempt_id: old?.id ?? null, p_retired_reason: reason ?? null,
  })
  if (error) throw pending()
  return attemptFrom(data, input)
}
async function recordSession(admin: CheckoutDatabase, input: CheckoutInput, attempt: Attempt, session: Record<string, unknown>) {
  const { data, error } = await admin.rpc('record_workspace_checkout_session_v1', {
    p_workspace_id: input.workspaceId, p_attempt_id: attempt.id, p_session_id: id(session),
  })
  if (error || attemptFrom(data, input).stripe_session_id !== id(session)) throw pending()
}
function checkoutResult(session: Record<string, unknown>, attempt: Attempt) {
  if (!belongsToWorkspace(session, attempt) || session.status !== 'open' || typeof session.url !== 'string'
    || !session.url.startsWith('https://') || typeof session.expires_at !== 'number') throw pending()
  return { url: session.url, expires_at: new Date(session.expires_at * 1000).toISOString(), plan_key: attempt.plan_key }
}

/**
 * A UUID attempt and immutable parameters are persisted BEFORE the POST. Stripe
 * v1 retains idempotency for at least 24h, not forever. We never POST this key
 * after the attempt's first 30 minutes, and explicitly expire its session at 1h.
 * Unknown outcomes after that window must be reconciled, never blindly retried.
 * https://docs.stripe.com/api/idempotent_requests
 * https://docs.stripe.com/api/checkout/sessions/create#checkout_session_create-expires_at
 * https://docs.stripe.com/api/checkout/sessions/list
 */
export async function getOrCreateWorkspaceCheckout(
  admin: CheckoutDatabase, stripe: StripeBillingRequest, input: CheckoutInput, now: () => number = Date.now,
): Promise<{ url: string; expires_at: string; plan_key: string }> {
  try {
    let attempt = await claim(admin, input)
    for (let rotation = 0; rotation < 3; rotation++) {
      await assertNoSubscription(stripe, attempt.customer_id)
      // Open sessions are checked even for a saved attempt, protecting against
      // legacy links created before this durable protocol was deployed.
      const openSessions = (await listAll(stripe, 'checkout/sessions', new URLSearchParams({
        customer: attempt.customer_id, status: 'open', limit: '100',
      }))).filter((session) => session.mode === 'subscription')
      let session: Record<string, unknown> | undefined
      if (attempt.stripe_session_id) {
        session = await stripe('GET', `checkout/sessions/${encodeURIComponent(attempt.stripe_session_id)}`)
        if (id(session) !== attempt.stripe_session_id || !belongsToWorkspace(session, attempt)) throw pending()
      } else {
        // List, rather than Stripe Search: Search is eventually consistent and
        // cannot establish that a timed-out creation did not succeed.
        const history = await listAll(stripe, 'checkout/sessions', new URLSearchParams({
          customer: attempt.customer_id, limit: '100',
          'created[gte]': String(Math.floor(Date.parse(attempt.created_at) / 1000) - 86_460),
        }))
        const matches = history.filter((candidate) => object(candidate.metadata).checkout_attempt_id === attempt.id)
        if (matches.length > 1) throw pending()
        session = matches[0]
        // Reuse a lone, matching pre-cutover checkout rather than create a
        // second billable session. A different workspace/plan is not adopted.
        if (!session && openSessions.length === 1) {
          const existing = openSessions[0]
          if (!belongsToWorkspace(existing, attempt) || object(existing.metadata).plan_key !== attempt.plan_key) throw pending()
          session = existing
        }
        // A legacy link can finish between the subscription and open-session
        // reads. Its completed session is proof of an in-flight payment even
        // when the new subscription has not appeared in the list yet.
        if (!session) {
          for (const previous of history.filter((candidate) => belongsToWorkspace(candidate, attempt) && candidate.status === 'complete')) {
            const subscriptionId = id(previous.subscription)
            if (!subscriptionId) throw pending()
            const subscription = await stripe('GET', `subscriptions/${encodeURIComponent(subscriptionId)}`)
            if (id(subscription) !== subscriptionId || typeof subscription.status !== 'string') throw pending()
            if (!ENDED.has(subscription.status)) throw subscribed()
          }
        }
        if (session) {
          if (!belongsToWorkspace(session, attempt)) throw pending()
          await recordSession(admin, input, attempt, session)
        }
      }
      if (openSessions.some((candidate) => id(candidate) !== id(session))) throw pending()
      if (session) {
        if (session.status === 'open') return checkoutResult(session, attempt)
        let reason: RetiredReason
        if (session.status === 'expired') reason = 'expired'
        else if (session.status === 'complete') {
          const subscriptionId = id(session.subscription)
          if (!subscriptionId) throw pending()
          const subscription = await stripe('GET', `subscriptions/${encodeURIComponent(subscriptionId)}`)
          if (id(subscription) !== subscriptionId || typeof subscription.status !== 'string') throw pending()
          if (!ENDED.has(subscription.status)) throw subscribed()
          reason = 'subscription_ended'
        } else throw pending()
        attempt = await claim(admin, input, attempt, reason)
        continue
      }
      const expiresAt = Date.parse(attempt.expires_at)
      if (now() > expiresAt + MINUTE) {
        // The exhaustive session listing was empty for this attempt, all open
        // sessions were absent, and the subscription list had no live entries.
        attempt = await claim(admin, input, attempt, 'absent_after_expiry')
        continue
      }
      // expires_at must be >=30 minutes ahead for a new Stripe request. A retry
      // outside this creation window waits for confirmed reconciliation/expiry.
      if (now() >= expiresAt - 31 * MINUTE) throw pending()
      const params = new URLSearchParams({
        mode: 'subscription', customer: attempt.customer_id, allow_promotion_codes: 'true',
        success_url: attempt.success_url, cancel_url: attempt.cancel_url,
        client_reference_id: attempt.workspace_id,
        'line_items[0][price]': attempt.price_id, 'line_items[0][quantity]': '1',
        'metadata[workspace_id]': attempt.workspace_id, 'metadata[plan_key]': attempt.plan_key,
        'metadata[checkout_attempt_id]': attempt.id,
        'subscription_data[metadata][workspace_id]': attempt.workspace_id,
        'subscription_data[metadata][plan_key]': attempt.plan_key,
        expires_at: String(Math.floor(expiresAt / 1000)),
      })
      session = await stripe('POST', 'checkout/sessions', params, `workspace-checkout:${attempt.id}`)
      await recordSession(admin, input, attempt, session)
      return checkoutResult(session, attempt)
    }
    throw pending()
  } catch (error) {
    if (error instanceof HttpError && error.code === 'SUBSCRIPTION_EXISTS') throw error
    throw pending()
  }
}
