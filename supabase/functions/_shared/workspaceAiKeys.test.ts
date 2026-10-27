import { probeAiKeyResult } from './workspaceAiKeys.ts'

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
