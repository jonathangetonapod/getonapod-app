import { checkoutEmailOutcome, sendCheckoutEmail, type CheckoutEmailInput } from './checkoutEmail.ts'
import type { AppEmailResult, sendAppEmail } from './appEmail.ts'
import type { CheckoutDatabase } from './subscriptionCheckout.ts'

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message) }
function equal(actual: unknown, expected: unknown) { assert(JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`) }
const input: CheckoutEmailInput = { workspaceId: 'workspace', actionKey: 'action-one', to: 'Owner@Example.com',
  workspaceName: 'Example', planName: 'Standard', priceLabel: '$99', url: 'https://checkout.stripe.com/private-link' }
const sent: AppEmailResult = { status: 'sent', providerMessageId: 'gmail-123', error: null, retryable: false }
function fixture() {
  const rows = new Map<string, Record<string, unknown>>()
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> }> = []
  const sends: Array<Parameters<typeof sendAppEmail>[0]> = []
  let sendImpl: (payload: Parameters<typeof sendAppEmail>[0]) => Promise<AppEmailResult> = () => Promise.resolve(sent)
  const faults = { claim: false, complete: false, read: false }
  const admin: CheckoutDatabase = { rpc: async (name, params) => {
    rpcCalls.push({ name, params })
    const key = `${params.p_workspace_id}:${params.p_action_key}`
    const row = rows.get(key)
    if (name === 'workspace_checkout_email_outcome_v1') return { data: row ? { status: row.status } : null, error: faults.read ? 'db down' : null }
    if (name === 'claim_workspace_checkout_email_v1') {
      if (faults.claim) return { data: null, error: 'db down' }
      if (row) return { data: row.scope !== params.p_scope_hash || row.fingerprint !== params.p_payload_hash
        ? { outcome: 'conflict' } : { outcome: 'existing', status: row.status }, error: null }
      if ([...rows.values()].some((r) => r.scope === params.p_scope_hash && ['sending', 'unknown'].includes(String(r.status)))) {
        return { data: { outcome: 'blocked', status: 'unknown' }, error: null }
      }
      rows.set(key, { scope: params.p_scope_hash, fingerprint: params.p_payload_hash, status: 'sending', owner: 'owner-token' })
      return { data: { outcome: 'claimed', owner_token: 'owner-token' }, error: null }
    }
    if (name === 'complete_workspace_checkout_email_v1') {
      if (faults.complete) return { data: null, error: 'commit unavailable' }
      assert(row && row.owner === params.p_owner_token)
      row.status = params.p_status
      return { data: { status: row.status }, error: null }
    }
    throw new Error('unexpected RPC')
  } }
  const send: typeof sendAppEmail = async (payload) => { sends.push(payload); return await sendImpl(payload) }
  return { admin, send, sends, rows, rpcCalls, faults, setSend: (next: typeof sendImpl) => { sendImpl = next } }
}

Deno.test('checkout email retries retain one operation and a deliberate new action may resend a confirmed delivery', async () => {
  const f = fixture()
  equal(await sendCheckoutEmail(f.admin, input, f.send), 'sent')
  equal(await sendCheckoutEmail(f.admin, input, f.send), 'sent')
  equal(f.sends.length, 1)
  equal(await sendCheckoutEmail(f.admin, { ...input, actionKey: 'action-two' }, f.send), 'sent')
  equal(f.sends.length, 2)
  equal(f.sends.map((p) => p.idempotencyKey), ['checkout-email:workspace:action-one', 'checkout-email:workspace:action-two'])
})

Deno.test('checkout claim stores hashes, never the bearer URL, recipient, or email content', async () => {
  const f = fixture()
  await sendCheckoutEmail(f.admin, input, f.send)
  const serialized = JSON.stringify(f.rpcCalls)
  for (const secret of [input.url, input.to, input.to.toLowerCase(), input.planName, input.workspaceName]) assert(!serialized.includes(secret))
  const claim = f.rpcCalls[0].params
  assert(/^[a-f0-9]{64}$/.test(String(claim.p_scope_hash)))
  assert(/^[a-f0-9]{64}$/.test(String(claim.p_payload_hash)))
  equal(f.sends[0].to, ['owner@example.com'])
})

Deno.test('changed content cannot reuse an action or silently mint a new operation', async () => {
  const f = fixture()
  await sendCheckoutEmail(f.admin, input, f.send)
  equal(await sendCheckoutEmail(f.admin, { ...input, workspaceName: 'Renamed' }, f.send), 'unknown')
  equal(f.sends.length, 1)
})

Deno.test('an in-flight operation blocks a different action for the same checkout recipient', async () => {
  const f = fixture()
  let release: (value: AppEmailResult) => void = () => undefined
  let started: () => void = () => undefined
  const inFlight = new Promise<void>((resolve) => { started = resolve })
  f.setSend(() => { started(); return new Promise((resolve) => { release = resolve }) })
  const first = sendCheckoutEmail(f.admin, input, f.send)
  await inFlight
  equal(await sendCheckoutEmail(f.admin, { ...input, actionKey: 'action-two', to: 'owner@example.com' }, f.send), 'unknown')
  equal(await sendCheckoutEmail(f.admin, input, f.send), 'unknown')
  equal(f.sends.length, 1)
  release(sent)
  equal(await first, 'sent')
})

Deno.test('unknown transport outcome holds the checkout scope permanently across fresh actions', async () => {
  const f = fixture()
  f.setSend(() => Promise.reject(new Error('transport timeout')))
  equal(await sendCheckoutEmail(f.admin, input, f.send), 'unknown')
  equal(await sendCheckoutEmail(f.admin, { ...input, actionKey: 'action-two' }, f.send), 'unknown')
  equal(f.sends.length, 1)
  equal([...f.rows.values()][0].status, 'unknown')
})

Deno.test('an unconfirmed receipt write never reports sent or releases the in-flight scope', async () => {
  const f = fixture()
  f.faults.complete = true
  equal(await sendCheckoutEmail(f.admin, input, f.send), 'unknown')
  equal([...f.rows.values()][0].status, 'sending')
  equal(await sendCheckoutEmail(f.admin, { ...input, actionKey: 'action-two' }, f.send), 'unknown')
  equal(f.sends.length, 1)
})

Deno.test('a failed claim cannot reach the email workflow', async () => {
  const f = fixture()
  f.faults.claim = true
  equal(await sendCheckoutEmail(f.admin, input, f.send), 'unknown')
  equal(f.sends.length, 0)
})

Deno.test('workflow content conflict stays held rather than allowing a fresh-key bypass', async () => {
  const f = fixture()
  f.setSend(() => Promise.resolve({ status: 'failed', code: 'IDEMPOTENCY_CONFLICT', providerMessageId: null, error: 'conflict', retryable: false }))
  equal(await sendCheckoutEmail(f.admin, input, f.send), 'unknown')
  equal(await sendCheckoutEmail(f.admin, { ...input, actionKey: 'action-two' }, f.send), 'unknown')
  equal(f.sends.length, 1)
})

Deno.test('a known pre-send rejection or skipped send permits a new deliberate action', async () => {
  for (const result of ['failed', 'skipped'] as const) {
    const f = fixture()
    f.setSend(() => Promise.resolve({ status: result, providerMessageId: null, error: null, retryable: false }))
    equal(await sendCheckoutEmail(f.admin, input, f.send), result)
    f.setSend(() => Promise.resolve(sent))
    equal(await sendCheckoutEmail(f.admin, input, f.send), result)
    equal(await sendCheckoutEmail(f.admin, { ...input, actionKey: 'action-two' }, f.send), 'sent')
    equal(f.sends.length, 2)
  }
})

Deno.test('a genuinely different checkout URL is a different delivery scope', async () => {
  const f = fixture()
  f.setSend(() => Promise.reject(new Error('unknown')))
  await sendCheckoutEmail(f.admin, input, f.send)
  f.setSend(() => Promise.resolve(sent))
  equal(await sendCheckoutEmail(f.admin, { ...input, actionKey: 'action-two', url: 'https://checkout.stripe.com/new-session' }, f.send), 'sent')
  equal(f.sends.length, 2)
})

Deno.test('admin replay reads receipts without sending and database read failures remain unknown', async () => {
  const f = fixture()
  equal(await checkoutEmailOutcome(f.admin, input.workspaceId, input.actionKey), null)
  await sendCheckoutEmail(f.admin, input, f.send)
  equal(await checkoutEmailOutcome(f.admin, input.workspaceId, input.actionKey), 'sent')
  f.faults.read = true
  equal(await checkoutEmailOutcome(f.admin, input.workspaceId, input.actionKey), 'unknown')
  equal(f.sends.length, 1)
})
