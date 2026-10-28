import { chargeCredits, enforcementEnabled } from './billing.ts'
import { resolveAiKey } from './workspaceAiKeys.ts'
import { requireWorkspaceSubscription } from './workspaceAuth.ts'

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
function admin(allowed: boolean | null = true, error: object | null = null) {
  const query = { select: () => query, eq: () => query, maybeSingle: () => Promise.resolve({ data: null, error: null }) }
  return { rpc: () => Promise.resolve({ data: allowed, error }), from: () => query } as unknown as Parameters<typeof resolveAiKey>[0]
}
Deno.test('flat billing cannot be reenabled by the old environment flag', async () => {
  const previous = Deno.env.get('CREDIT_ENFORCEMENT_ENABLED')
  Deno.env.set('CREDIT_ENFORCEMENT_ENABLED', 'true')
  try {
    assert(!enforcementEnabled(), 'legacy flag must not enable debits')
    const result = await chargeCredits({ rpc: () => { throw new Error('must not touch ledger') } } as never, { workspaceId: 'workspace', operationType: 'research_run' })
    assert(result.charged === 0 && result.entryId === null, 'no new debit')
  } finally { if (previous === undefined) Deno.env.delete('CREDIT_ENFORCEMENT_ENABLED')
    else Deno.env.set('CREDIT_ENFORCEMENT_ENABLED', previous) }
})
Deno.test('tenant key absence never falls back to the platform account', async () => {
  const previous = Deno.env.get('ANTHROPIC_API_KEY')
  Deno.env.set('ANTHROPIC_API_KEY', 'platform-key-must-not-be-used')
  try {
    let code = ''
    try { await resolveAiKey(admin(), 'workspace', 'anthropic') } catch (e) { code = (e as { code: string }).code }
    assert(code === 'PROVIDER_KEY_REQUIRED', 'missing tenant key must stop provider work')
    assert((await resolveAiKey(admin(), null, 'anthropic'))?.source === 'platform', 'platform maintenance remains supported')
  } finally { if (previous === undefined) Deno.env.delete('ANTHROPIC_API_KEY')
    else Deno.env.set('ANTHROPIC_API_KEY', previous) }
})
Deno.test('subscription access fails closed and distinguishes a lapse from an outage', async () => {
  await requireWorkspaceSubscription(admin(true), 'workspace')
  for (const [client, expected] of [[admin(false), 'SUBSCRIPTION_REQUIRED'], [admin(null, { message: 'offline' }), 'BILLING_UNAVAILABLE']] as const) {
    let code = ''
    try { await requireWorkspaceSubscription(client, 'workspace') } catch (e) { code = (e as { code: string }).code }
    assert(code === expected, `expected ${expected}, got ${code}`)
  }
})
