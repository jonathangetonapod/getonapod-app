import { HttpError } from './httpError.ts'
import { discoverHostLinkedin } from './hostContactDiscovery.ts'
import { platformTextAiKey, textAiFetch, type TextAiKey } from './textAi.ts'

function assert(value: unknown, message = 'assertion failed'): asserts value {
  if (!value) throw new Error(message)
}
const openai: TextAiKey = { provider: 'openai', source: 'workspace', apiKey: 'test-openai-credential' }
const anthropic: TextAiKey = { provider: 'anthropic', source: 'workspace', apiKey: 'test-claude-credential' }
const request = { body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 300, messages: [{ role: 'user', content: 'Write a pitch' }] }) }

async function failure(work: () => Promise<unknown>): Promise<HttpError> {
  try { await work() } catch (error) {
    assert(error instanceof HttpError, 'provider failures must be sanitized HttpErrors')
    return error
  }
  throw new Error('Expected a failure')
}

Deno.test('review: a malformed successful provider response never leaks upstream fragments', async () => {
  const error = await failure(() => textAiFetch(openai, request,
    () => Promise.resolve(new Response('sensitive-provider-payload', { status: 200 }))))
  assert(error.status === 503)
  assert(!error.message.includes('sensitive') && !error.message.includes('SyntaxError'))
})

Deno.test('review: absent credentials fail locally without trying a provider', async () => {
  let requests = 0
  for (const key of ['', { ...openai, apiKey: '   ' }, { ...anthropic, apiKey: '' }]) {
    const error = await failure(() => textAiFetch(key, request, () => {
      requests++
      return Promise.resolve(Response.json({}))
    }))
    assert(error.code === 'AI_NOT_CONFIGURED')
  }
  assert(requests === 0, 'a missing credential must not initiate an external request')
})

Deno.test('review: switching from a saved OpenAI model to Claude sends compatible default thinking', async () => {
  let requested = false
  await textAiFetch(anthropic, { body: JSON.stringify({ model: 'gpt-4.1-mini', max_tokens: 300, messages: [{ role: 'user', content: 'Write a pitch' }] }) }, (_url, init) => {
    requested = true
    const body = JSON.parse(String(init?.body))
    assert(body.model === 'claude-sonnet-5-5')
    assert(body.thinking?.type === 'between_tools', 'Claude default behavior must be recomputed for the mapped model')
    return Promise.resolve(Response.json({ content: [{ type: 'text', text: 'Pitch' }] }))
  })
  assert(requested)
})

Deno.test('review: a failed OpenAI web tool cannot become a negative contact result', async () => {
  const error = await failure(() => discoverHostLinkedin(openai, {}, { input: 0, output: 0, searches: 0 }, () =>
    Promise.resolve(Response.json({ status: 'completed', output: [
      { type: 'web_search_call', status: 'failed', action: { sources: [] } },
      { type: 'message', content: [{ type: 'output_text', text: 'null' }] },
    ] }))))
  assert(error.code === 'HOST_SEARCH_UNAVAILABLE')
})

Deno.test('review: platform provider selection never falls back after an explicit choice', () => {
  const originalGet = Deno.env.get
  let environment: Record<string, string> = {
    TEXT_AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'test-only-platform-claude', OPENAI_API_KEY: 'test-only-platform-openai',
  }
  Deno.env.get = (name: string) => environment[name]
  try {
    assert(platformTextAiKey()?.provider === 'openai')
    environment = { TEXT_AI_PROVIDER: 'openai', ANTHROPIC_API_KEY: 'test-only-platform-claude' }
    assert(platformTextAiKey() === null, 'an explicit OpenAI choice must not spend from Claude')
    environment = { OPENAI_API_KEY: 'test-only-platform-openai' }
    assert(platformTextAiKey()?.provider === 'openai', 'OpenAI-only maintenance must work')
  } finally { Deno.env.get = originalGet }
})
