import { ensureWorkspaceBillingCustomer, getOrCreateWorkspaceCheckout, type CheckoutDatabase, type CheckoutInput, type StripeBillingRequest } from './subscriptionCheckout.ts'

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message) }
function equal(actual: unknown, expected: unknown) { assert(JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`) }
async function rejects(action: () => Promise<unknown>, code = 'CHECKOUT_CONFIRMATION_PENDING') {
  try { await action() } catch (error) { equal((error as { code?: string }).code, code); return }
  throw new Error(`expected ${code}`)
}
function fixture() {
  let time = 1_800_000_000_000
  let counter = 0
  let active: Record<string, unknown> | null = null
  const attempts: Record<string, unknown>[] = []
  const sessions = new Map<string, Record<string, unknown>>()
  const subscriptions = new Map<string, Record<string, unknown>>()
  const posted: Array<{ body: string; key: string | undefined }> = []
  const customers: Array<{ body: string; key: string | undefined }> = []
  const idempotency = new Map<string, { body: string; session: Record<string, unknown> }>()
  let customerId: string | null = null
  const fail = { claim: false, recordBefore: false, recordAfter: false, post: '' as '' | 'before' | 'after', list: false, truncated: false }
  const input: CheckoutInput = { workspaceId: 'workspace', customerId: 'cus_workspace', planKey: 'standard', priceId: 'price_current', billingBase: 'https://app.example/app/settings/billing' }
  const clone = (row: Record<string, unknown>) => structuredClone(row)
  const admin: CheckoutDatabase = {
    rpc: async (name, params) => {
      if (name === 'claim_workspace_checkout_attempt_v1') {
        if (fail.claim) return { data: null, error: new Error('database down') }
        if (!active || params.p_replace_attempt_id === active.id) {
          if (params.p_retired_reason === 'absent_after_expiry') assert(time > Date.parse(String(active?.expires_at)) + 60_000)
          active = {
            id: `attempt-${++counter}`, workspace_id: params.p_workspace_id, customer_id: params.p_customer_id,
            plan_key: params.p_plan_key, price_id: params.p_price_id, success_url: params.p_success_url, cancel_url: params.p_cancel_url,
            created_at: new Date(time).toISOString(), expires_at: new Date(time + 3_600_000).toISOString(), stripe_session_id: null,
          }
          attempts.push(active)
        }
        return { data: clone(active), error: null }
      }
      if (name === 'record_workspace_checkout_session_v1') {
        if (fail.recordBefore) { fail.recordBefore = false; return { data: null, error: new Error('not committed') } }
        assert(active !== null && active.id === params.p_attempt_id, 'record must match current attempt')
        assert(!active.stripe_session_id || active.stripe_session_id === params.p_session_id, 'session conflict')
        active.stripe_session_id = params.p_session_id
        if (fail.recordAfter) { fail.recordAfter = false; return { data: null, error: new Error('commit response lost') } }
        return { data: clone(active), error: null }
      }
      if (name === 'record_workspace_billing_customer_v1') {
        customerId ??= String(params.p_customer_id)
        return { data: customerId, error: null }
      }
      throw new Error(`unexpected RPC ${name}`)
    },
  }
  const stripe: StripeBillingRequest = async (method, path, params, key) => {
    if (method === 'POST' && path === 'customers') {
      customers.push({ body: params!.toString(), key })
      return { id: 'cus_workspace' }
    }
    if (method === 'POST') {
      assert(path === 'checkout/sessions')
      posted.push({ body: params!.toString(), key })
      if (fail.post === 'before') { fail.post = ''; throw new Error('network timeout before provider response') }
      const cached = idempotency.get(key!)
      if (cached) { equal(params!.toString(), cached.body); return clone(cached.session) }
      const session = {
        id: `cs_${sessions.size + 1}`, mode: 'subscription', status: 'open',
        customer: params!.get('customer'), client_reference_id: params!.get('client_reference_id'),
        metadata: { workspace_id: params!.get('metadata[workspace_id]'), plan_key: params!.get('metadata[plan_key]'), checkout_attempt_id: params!.get('metadata[checkout_attempt_id]') },
        created: Math.floor(time / 1000), expires_at: Number(params!.get('expires_at')),
        url: `https://checkout.stripe.com/c/pay/cs_${sessions.size + 1}`, subscription: null,
      }
      sessions.set(session.id, session)
      idempotency.set(key!, { body: params!.toString(), session })
      if (fail.post === 'after') { fail.post = ''; throw new Error('provider created session, response lost') }
      return clone(session)
    }
    const url = new URL(`https://api.stripe.test/v1/${path}`)
    if (url.pathname.startsWith('/v1/checkout/sessions/')) {
      const found = sessions.get(url.pathname.split('/').at(-1)!)
      if (!found) throw new Error('Stripe 404')
      return clone(found)
    }
    if (url.pathname.startsWith('/v1/subscriptions/')) {
      const found = subscriptions.get(url.pathname.split('/').at(-1)!)
      if (!found) throw new Error('Stripe 404')
      return clone(found)
    }
    if (fail.list) throw new Error('Stripe unavailable')
    let rows = [...(url.pathname === '/v1/subscriptions' ? subscriptions : sessions).values()]
    if (url.pathname !== '/v1/subscriptions') {
      rows = rows.filter((row) => row.customer === url.searchParams.get('customer'))
      if (url.searchParams.has('created[gte]')) rows = rows.filter((row) => Number(row.created) >= Number(url.searchParams.get('created[gte]')))
      if (url.searchParams.has('status')) rows = rows.filter((row) => row.status === url.searchParams.get('status'))
    }
    if (fail.truncated) return { data: [{ id: 'same_cursor' }], has_more: true }
    const cursor = url.searchParams.get('starting_after')
    const start = cursor ? rows.findIndex((row) => row.id === cursor) + 1 : 0
    // Deliberately tiny pages exercise all pagination paths.
    return { data: rows.slice(start, start + 1).map(clone), has_more: rows.length > start + 1 }
  }
  const run = (overrides: Partial<CheckoutInput> = {}) => getOrCreateWorkspaceCheckout(admin, stripe, { ...input, ...overrides }, () => time)
  const legacy = (overrides: Record<string, unknown> = {}) => {
    const session = { id: 'cs_legacy', mode: 'subscription', customer: input.customerId, status: 'open',
      metadata: { workspace_id: input.workspaceId, plan_key: input.planKey }, created: Math.floor(time / 1000) - 3600,
      expires_at: Math.floor(time / 1000) + 1800, url: 'https://checkout.stripe.com/c/pay/cs_legacy', ...overrides }
    sessions.set(String(session.id), session)
    return session
  }
  return { admin, stripe, input, run, sessions, subscriptions, posted, customers, attempts, fail, legacy, advance: (ms: number) => { time += ms } }
}

Deno.test('concurrent tenant and admin requests share one attempt and one billable session', async () => {
  const f = fixture()
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => f.run(i % 2 ? { priceId: 'price_changed', billingBase: 'https://changed.example' } : {})))
  equal(new Set(results.map((r) => r.url)).size, 1)
  equal(f.attempts.length, 1)
  equal(f.sessions.size, 1)
  equal(new Set(f.posted.map((p) => p.key)).size, 1)
  equal(new Set(f.posted.map((p) => p.body)).size, 1)
})
Deno.test('an already-open session is reused with frozen original price and redirect parameters', async () => {
  const f = fixture()
  const first = await f.run()
  equal(await f.run({ priceId: 'price_new', billingBase: 'https://new.example' }), first)
  equal(f.posted.length, 1)
  const params = new URLSearchParams(f.posted[0].body)
  equal(params.get('line_items[0][price]'), 'price_current')
  equal(params.get('success_url'), `${f.input.billingBase}?plan=updated`)
})
Deno.test('a lost creation response is recovered from Stripe without a second POST', async () => {
  const f = fixture(); f.fail.post = 'after'
  await rejects(() => f.run())
  assert((await f.run()).url.endsWith('cs_1'))
  equal(f.posted.length, 1)
})
Deno.test('a network failure before creation retries the same frozen key and parameters', async () => {
  const f = fixture(); f.fail.post = 'before'
  await rejects(() => f.run())
  await f.run({ priceId: 'new_price', billingBase: 'https://new.example' })
  equal(f.posted.length, 2)
  equal(f.posted[0], f.posted[1])
  equal(f.sessions.size, 1)
})
for (const failure of ['recordBefore', 'recordAfter'] as const) {
  Deno.test(`checkout persists no new charge after database ${failure} failure`, async () => {
    const f = fixture(); f.fail[failure] = true
    await rejects(() => f.run())
    await f.run()
    equal(f.sessions.size, 1)
    equal(f.posted.length, 1)
  })
}
Deno.test('no Stripe session is created if the durable attempt cannot be claimed', async () => {
  const f = fixture(); f.fail.claim = true
  await rejects(() => f.run())
  equal(f.posted.length, 0)
})
Deno.test('an unknown outcome outside the creation window waits rather than reusing a stale key', async () => {
  const f = fixture(); f.fail.post = 'before'
  await rejects(() => f.run())
  f.advance(30 * 60_000)
  await rejects(() => f.run())
  equal(f.attempts.length, 1)
  equal(f.posted.length, 1)
})
Deno.test('confirmed absence after hard expiry rotates once across concurrent retries', async () => {
  const f = fixture(); f.fail.post = 'before'
  await rejects(() => f.run())
  f.advance(25 * 3_600_000)
  const results = await Promise.all([f.run(), f.run()])
  equal(results[0].url, results[1].url)
  equal(f.attempts.length, 2)
  assert(f.posted[0].key !== f.posted.at(-1)?.key)
  equal(f.sessions.size, 1)
})
Deno.test('unavailable or incomplete Stripe listings cannot authorize attempt rotation', async () => {
  for (const failure of ['list', 'truncated'] as const) {
    const f = fixture(); f.fail.post = 'before'
    await rejects(() => f.run())
    f.advance(25 * 3_600_000); f.fail[failure] = true
    await rejects(() => f.run())
    equal(f.attempts.length, 1)
    equal(f.posted.length, 1)
  }
})
Deno.test('Stripe-confirmed expiry rotates a stored session and picks up the current price', async () => {
  const f = fixture(); await f.run()
  f.sessions.get('cs_1')!.status = 'expired'
  await f.run({ priceId: 'price_new' })
  equal(f.attempts.length, 2)
  equal(new URLSearchParams(f.posted[1].body).get('line_items[0][price]'), 'price_new')
})
Deno.test('a completed checkout cannot be replaced while its subscription remains live', async () => {
  const f = fixture(); await f.run()
  Object.assign(f.sessions.get('cs_1')!, { status: 'complete', subscription: 'sub_live' })
  f.subscriptions.set('sub_live', { id: 'sub_live', status: 'active' })
  await rejects(() => f.run(), 'SUBSCRIPTION_EXISTS')
  equal(f.attempts.length, 1); equal(f.posted.length, 1)
})
Deno.test('a complete session with no confirmed subscription outcome remains blocked', async () => {
  const f = fixture(); await f.run()
  f.sessions.get('cs_1')!.status = 'complete'
  await rejects(() => f.run())
  equal(f.attempts.length, 1)
})
Deno.test('a completed session rotates only after its subscription is confirmed ended', async () => {
  const f = fixture(); await f.run()
  Object.assign(f.sessions.get('cs_1')!, { status: 'complete', subscription: 'sub_ended' })
  f.subscriptions.set('sub_ended', { id: 'sub_ended', status: 'canceled' })
  await f.run()
  equal(f.attempts.length, 2); equal(f.posted.length, 2)
})
Deno.test('all subscription pages are checked before creating checkout', async () => {
  const f = fixture()
  f.subscriptions.set('sub_old', { id: 'sub_old', status: 'canceled' })
  f.subscriptions.set('sub_active', { id: 'sub_active', status: 'active' })
  await rejects(() => f.run(), 'SUBSCRIPTION_EXISTS')
  equal(f.posted.length, 0)
})
Deno.test('a matching pre-cutover open checkout is reused instead of duplicated', async () => {
  const f = fixture(); f.legacy()
  equal((await f.run()).url, 'https://checkout.stripe.com/c/pay/cs_legacy')
  equal(f.posted.length, 0)
  equal(f.attempts[0].stripe_session_id, 'cs_legacy')
})
Deno.test('conflicting or multiple legacy checkouts fail closed', async () => {
  for (const multiple of [false, true]) {
    const f = fixture()
    f.legacy({ metadata: { workspace_id: multiple ? f.input.workspaceId : 'different_workspace', plan_key: 'standard' } })
    if (multiple) f.legacy({ id: 'cs_legacy_second' })
    await rejects(() => f.run())
    equal(f.posted.length, 0)
  }
})
Deno.test('a legacy checkout finishing between list reads blocks a second payment', async () => {
  const f = fixture()
  f.legacy({ status: 'complete', subscription: null })
  await rejects(() => f.run())
  equal(f.posted.length, 0)
})
Deno.test('tenant and admin customer creation use identical workspace metadata and key', async () => {
  const f = fixture()
  equal(await Promise.all([
    ensureWorkspaceBillingCustomer(f.admin, f.stripe, f.input.workspaceId),
    ensureWorkspaceBillingCustomer(f.admin, f.stripe, f.input.workspaceId),
  ]), ['cus_workspace', 'cus_workspace'])
  equal(f.customers[0], f.customers[1])
  equal(f.customers[0].key, 'workspace-customer:workspace')
  equal([...new URLSearchParams(f.customers[0].body).entries()], [['metadata[workspace_id]', 'workspace']])
})
