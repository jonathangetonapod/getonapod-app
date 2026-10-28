import { probeAiKeyResult, readStoredAiKey } from './workspaceAiKeys.ts'
import { HttpError } from './httpError.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const answering = (status: number) => (() => Promise.resolve(new Response('{}', { status }))) as typeof fetch

Deno.test('a key the provider accepts is valid', async () => {
  assert(await probeAiKeyResult('anthropic', 'sk-ant-test', answering(200)) === 'valid', 'a 200 should be valid')
  assert(await probeAiKeyResult('openai', 'sk-test', answering(200)) === 'valid', 'a 200 should be valid')
})

Deno.test('only an authentication refusal makes a key invalid', async () => {
  assert(await probeAiKeyResult('anthropic', 'sk-ant-test', answering(401)) === 'invalid', 'a 401 should be invalid')
  assert(await probeAiKeyResult('openai', 'sk-test', answering(403)) === 'invalid', 'a 403 should be invalid')
})

// An outage or a rate limit says nothing about the key, and calling it
// invalid invites deleting a key that works.
Deno.test('an outage, a rate limit or a network failure is unreachable, not invalid', async () => {
  assert(await probeAiKeyResult('anthropic', 'sk-ant-test', answering(529)) === 'unreachable', 'a 529 should be unreachable')
  assert(await probeAiKeyResult('openai', 'sk-test', answering(429)) === 'unreachable', 'a 429 should be unreachable')
  const failing = (() => Promise.reject(new TypeError('network down'))) as typeof fetch
  assert(await probeAiKeyResult('anthropic', 'sk-ant-test', failing) === 'unreachable', 'a network failure should be unreachable')
})

Deno.test('each provider is asked with its own header', async () => {
  const seen: Array<{ url: string; headers: Record<string, string> }> = []
  const recording = ((url: string, init?: RequestInit) => {
    seen.push({ url, headers: init?.headers as Record<string, string> })
    return Promise.resolve(new Response('{}', { status: 200 }))
  }) as unknown as typeof fetch
  await probeAiKeyResult('anthropic', 'sk-ant-key', recording)
  await probeAiKeyResult('openai', 'sk-key', recording)
  assert(seen[0].url.startsWith('https://api.anthropic.com/') && seen[0].headers['x-api-key'] === 'sk-ant-key', 'anthropic header')
  assert(seen[1].url.startsWith('https://api.openai.com/') && seen[1].headers.Authorization === 'Bearer sk-key', 'openai header')
})

function storedKeyAdmin(result: { data: unknown; error: unknown }) {
  const filters: Array<[string, unknown]> = []
  const query = {
    select: (columns: string) => {
      assert(columns === 'api_key_ciphertext, api_key_iv', 'read only the encrypted key fields')
      return query
    },
    eq: (column: string, value: unknown) => { filters.push([column, value]); return query },
    maybeSingle: () => {
      assert(JSON.stringify(filters) === JSON.stringify([['workspace_id', 'workspace-test'], ['provider', 'anthropic']]), 'key lookup must stay workspace and provider scoped')
      return Promise.resolve(result)
    },
  }
  return { from: (table: string) => {
    assert(table === 'workspace_ai_credentials', 'lookup must use credential storage')
    return query
  } } as unknown as Parameters<typeof readStoredAiKey>[0]
}

async function storedKeyFailure(result: { data: unknown; error: unknown }): Promise<HttpError> {
  try { await readStoredAiKey(storedKeyAdmin(result), 'workspace-test', 'anthropic') }
  catch (error) {
    assert(error instanceof HttpError, 'stored key failure should preserve a stable HTTP error')
    return error
  }
  throw new Error('expected a stored key failure')
}

Deno.test('a credential DB failure is unavailable, never a missing or invalid key', async () => {
  const failure = await storedKeyFailure({ data: null, error: { message: 'private database detail' } })
  assert(failure.status === 503, 'storage outage should be retryable')
  assert(failure.code === 'AI_KEY_STORAGE_UNAVAILABLE', 'storage outage should have its own recovery code')
  assert(!failure.message.includes('private database detail'), 'database detail must stay private')
  assert(failure.message.includes('saved keys have not changed'), 'recovery must not invite key replacement')
})

Deno.test('an absent credential row is honestly not configured', async () => {
  const result = await readStoredAiKey(storedKeyAdmin({ data: null, error: null }), 'workspace-test', 'anthropic')
  assert(result.configured === false && result.apiKey === null, 'absent row must not invent a connection or a platform fallback')
})

Deno.test('a stored credential that cannot decrypt has a support recovery error', async () => {
  const originalGet = Deno.env.get
  const originalError = console.error
  const logged: unknown[][] = []
  Deno.env.get = (name: string) => {
    assert(name === 'INSTANTLY_CREDENTIAL_ENCRYPTION_KEY', 'decryption must not look up platform provider credentials')
    return 'test-encryption-secret-at-least-32-characters'
  }
  console.error = (...args: unknown[]) => { logged.push(args) }
  try {
    const failure = await storedKeyFailure({ data: { api_key_ciphertext: 'private-invalid-ciphertext', api_key_iv: 'private-invalid-iv' }, error: null })
    assert(failure.status === 503 && failure.code === 'PROVIDER_CONNECTION_UNAVAILABLE', 'decrypt failure must not look like a rejected API key')
    assert(failure.message.includes('Contact support before replacing'), 'connection recovery should protect the existing key')
    assert(!JSON.stringify([failure.message, logged]).includes('private-invalid'), 'ciphertext and IV must not be exposed')
  } finally {
    Deno.env.get = originalGet
    console.error = originalError
  }
})

Deno.test('a malformed existing credential row is unavailable, not missing', async () => {
  const originalError = console.error
  console.error = () => undefined
  try {
    for (const data of [{}, { api_key_ciphertext: 'ciphertext' }, { api_key_ciphertext: '', api_key_iv: 'iv' }, { api_key_ciphertext: 'ciphertext', api_key_iv: ' ' }]) {
      const failure = await storedKeyFailure({ data, error: null })
      assert(failure.status === 503 && failure.code === 'PROVIDER_CONNECTION_UNAVAILABLE', 'existing corrupt row must never prompt reconnection as a missing key')
    }
  } finally { console.error = originalError }
})
