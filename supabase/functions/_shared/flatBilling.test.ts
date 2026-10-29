import { chargeCredits, enforcementEnabled } from './billing.ts'
import { resolveAiKey, requireProvider, workspaceAiKeyStatus } from './workspaceAiKeys.ts'
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

Deno.test('Claude and OpenAI can be supplied through workspace key management', () => {
  assert(requireProvider('anthropic') === 'anthropic', 'Claude must remain supported')
  assert(requireProvider('openai') === 'openai', 'OpenAI must be supported')
  for (const provider of ['podscan', 'blitz', 'winnr', 'instantly', null]) {
    let code = ''
    try { requireProvider(provider) } catch (error) { code = (error as { code: string }).code }
    assert(code === 'INVALID_PROVIDER', `must reject workspace management of ${provider}`)
  }
})

Deno.test('platform providers ignore workspace credentials and retain subscription enforcement', async () => {
  for (const [provider, env] of [['podscan', 'PODSCAN_API_KEY'], ['openai', 'OPENAI_API_KEY'], ['blitz', 'BLITZ_API_KEY'], ['winnr', 'WINNR_API_TOKEN']] as const) {
    const previous = Deno.env.get(env)
    const client = {
      rpc: () => Promise.resolve({ data: true, error: null }),
      from: () => { throw new Error('must not read obsolete workspace provider keys') },
    } as unknown as Parameters<typeof resolveAiKey>[0]
    try {
      Deno.env.set(env, '  platform-test-key  ')
      const resolved = await resolveAiKey(client, 'workspace', provider)
      assert(resolved?.source === 'platform' && resolved.apiKey === 'platform-test-key', 'must use trimmed platform secret')
      let code = ''
      try { await resolveAiKey(admin(false), 'workspace', provider) } catch (error) { code = (error as { code: string }).code }
      assert(code === 'SUBSCRIPTION_REQUIRED', 'shared keys must not bypass subscriptions')
      Deno.env.delete(env)
      try { await resolveAiKey(client, 'workspace', provider) } catch (error) { code = (error as { code: string }).code }
      assert(code === 'PLATFORM_PROVIDER_NOT_CONFIGURED', 'missing platform keys must route to support')
    } finally {
      if (previous === undefined) Deno.env.delete(env)
      else Deno.env.set(env, previous)
    }
  }
})

Deno.test('workspace key status hides obsolete non-AI credential metadata', async () => {
  const rows = ['anthropic', 'openai', 'podscan', 'blitz', 'winnr'].map((provider) => ({ provider, api_key_last_four: '1234', updated_at: '2026-10-29' }))
  const query = { select: () => query, eq: () => Promise.resolve({ data: rows, error: null }) }
  const status = await workspaceAiKeyStatus({ from: () => query } as unknown as Parameters<typeof workspaceAiKeyStatus>[0], 'workspace')
  assert(JSON.stringify(Object.keys(status)) === '["anthropic","openai"]', 'only AI providers may be shown')
  assert(status.anthropic.configured && status.anthropic.last_four === '1234', 'keep saved Claude status')
})
