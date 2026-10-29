import { resolveTextAiKey, setWorkspaceTextAiProvider } from './workspaceAiKeys.ts'
import { encryptInstantlyApiKey } from './instantly.ts'

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message) }
type Admin = Parameters<typeof resolveTextAiKey>[0]

async function fixture(preferred: 'openai' | 'anthropic' | null, saved: string[], allowed = true) {
  const encrypted = await encryptInstantlyApiKey('customer-key')
  const reads: string[] = []
  const updates: unknown[] = []
  const admin = {
    rpc: () => Promise.resolve({ data: allowed, error: null }),
    from: (table: string) => {
      let provider = ''
      const query = {
        select: () => query,
        update: (value: unknown) => { updates.push(value); return query },
        eq: (name: string, value: string) => {
          if (name === 'provider') provider = value
          else assert(value === 'workspace-a', 'must scope every read/write to the requested workspace')
          return query
        },
        single: () => Promise.resolve({ data: { default_ai_provider: preferred }, error: null }),
        maybeSingle: () => { reads.push(provider); return Promise.resolve({ data: saved.includes(provider) ? { api_key_ciphertext: encrypted.ciphertext, api_key_iv: encrypted.iv } : null, error: null }) },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: null })),
      }
      assert(table === 'workspaces' || table === 'workspace_ai_credentials')
      return query
    },
  } as unknown as Admin
  return { admin, reads, updates }
}

async function withSecret(run: () => Promise<void>) {
  const previous = Deno.env.get('INSTANTLY_CREDENTIAL_ENCRYPTION_KEY')
  Deno.env.set('INSTANTLY_CREDENTIAL_ENCRYPTION_KEY', 'test-only-encryption-secret-32-characters')
  try { await run() } finally { if (previous === undefined) Deno.env.delete('INSTANTLY_CREDENTIAL_ENCRYPTION_KEY'); else Deno.env.set('INSTANTLY_CREDENTIAL_ENCRYPTION_KEY', previous) }
}

Deno.test('an OpenAI-only workspace needs no Claude key', () => withSecret(async () => {
  const { admin, reads } = await fixture(null, ['openai'])
  const key = await resolveTextAiKey(admin, 'workspace-a')
  assert(key.provider === 'openai' && key.source === 'workspace' && key.apiKey === 'customer-key')
  assert(reads.join(',') === 'anthropic,openai')
}))

Deno.test('the chosen provider wins when both keys exist', () => withSecret(async () => {
  for (const provider of ['openai', 'anthropic'] as const) {
    const { admin, reads } = await fixture(provider, ['openai', 'anthropic'])
    assert((await resolveTextAiKey(admin, 'workspace-a')).provider === provider)
    assert(reads.join(',') === provider)
  }
}))

Deno.test('missing selected credentials do not fall back to another saved provider', () => withSecret(async () => {
  const { admin, reads } = await fixture('openai', ['anthropic'])
  let code = ''
  try { await resolveTextAiKey(admin, 'workspace-a') } catch (error) { code = (error as { code: string }).code }
  assert(code === 'PROVIDER_KEY_REQUIRED' && reads.join(',') === 'openai')
}))

Deno.test('subscription denial happens before any key read', () => withSecret(async () => {
  const { admin, reads } = await fixture('openai', ['openai'], false)
  let code = ''
  try { await resolveTextAiKey(admin, 'workspace-a') } catch (error) { code = (error as { code: string }).code }
  assert(code === 'SUBSCRIPTION_REQUIRED' && reads.length === 0)
}))

Deno.test('a provider selection requires a readable saved key and writes only the preference', () => withSecret(async () => {
  const { admin, updates } = await fixture(null, ['openai'])
  await setWorkspaceTextAiProvider(admin, 'workspace-a', 'openai')
  assert(JSON.stringify(updates) === '[{"default_ai_provider":"openai"}]')
  let code = ''
  try { await setWorkspaceTextAiProvider(admin, 'workspace-a', 'anthropic') } catch (error) { code = (error as { code: string }).code }
  assert(code === 'PROVIDER_KEY_REQUIRED' && updates.length === 1)
}))
