import { textAiFetch, textAiClient, textModel, textTokenUsage, type TextAiKey } from './textAi.ts'
import { discoverHostLinkedin } from './hostContactDiscovery.ts'
import { HttpError } from './httpError.ts'

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message) }
const openai: TextAiKey = { provider: 'openai', apiKey: 'customer-openai-secret', source: 'workspace' }
const anthropic: TextAiKey = { provider: 'anthropic', apiKey: 'customer-claude-secret', source: 'workspace' }
const request = { body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 500, thinking: { type: 'between_tools' }, system: 'Instructions', messages: [{ role: 'user', content: [{ type: 'text', text: 'Research context', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'Write a pitch' }] }] }) }
const completed = (text = 'A pitch', extra: unknown[] = []) => ({ status: 'completed', output: [...extra, { type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 21, output_tokens: 8 } })

Deno.test('OpenAI receives only its credential, translated prompt, timeout and storage-disabled Responses request', async () => {
  const controller = new AbortController()
  const response = await textAiFetch(openai, { ...request, signal: controller.signal }, async (url, init) => {
    assert(url === 'https://api.openai.com/v1/responses')
    const headers = new Headers(init?.headers)
    assert(headers.get('Authorization') === 'Bearer customer-openai-secret')
    assert(!headers.has('x-api-key') && !headers.has('anthropic-version'))
    assert(init?.signal === controller.signal)
    const body = JSON.parse(String(init?.body))
    assert(body.model === 'gpt-4.1' && body.store === false && body.max_output_tokens === 500)
    assert(body.instructions === 'Instructions')
    assert(body.input[0].content === 'Research context\n\nWrite a pitch')
    assert(!('thinking' in body) && !JSON.stringify(body).includes('cache_control'))
    return Response.json(completed())
  })
  const payload = await response.json()
  assert(payload.content[0].text === 'A pitch' && payload.stop_reason === 'end_turn')
  assert(payload.usage.input_tokens === 21 && payload.usage.output_tokens === 8)
})

Deno.test('Claude retains caching and thinking options without receiving an OpenAI key', async () => {
  await textAiFetch(anthropic, request, async (url, init) => {
    assert(url === 'https://api.anthropic.com/v1/messages')
    const headers = new Headers(init?.headers)
    assert(headers.get('x-api-key') === anthropic.apiKey && !headers.has('Authorization'))
    const body = JSON.parse(String(init?.body))
    assert(body.thinking.type === 'between_tools' && body.messages[0].content[0].cache_control.type === 'ephemeral')
    return Response.json({ content: [{ type: 'text', text: 'Claude pitch' }] })
  })
})

Deno.test('models from the other provider use the selected provider default, while matching selections are preserved', () => {
  assert(textModel('openai', 'gpt-4.1-mini') === 'gpt-4.1-mini')
  assert(textModel('openai', 'claude-sonnet-5-5') === 'gpt-4.1')
  assert(textModel('anthropic', 'gpt-4.1') === 'claude-sonnet-5-5')
  assert(textModel('anthropic', 'claude-haiku-4-5-20251001') === 'claude-haiku-4-5-20251001')
  assert(JSON.stringify(textTokenUsage(openai, 21, 8)) === '{"openaiInputTokens":21,"openaiOutputTokens":8}')
  assert(JSON.stringify(textTokenUsage(anthropic, 21, 8)) === '{"anthropicInputTokens":21,"anthropicOutputTokens":8}')
  assert(typeof textAiClient(openai).messages.create === 'function')
})

Deno.test('incomplete, refused and empty OpenAI outputs never become usable drafts', async () => {
  for (const [payload, expected] of [
    [{ ...completed('partial pitch'), status: 'incomplete' }, 'AI_OUTPUT_INCOMPLETE'],
    [{ status: 'failed', output: [] }, 'AI_OUTPUT_INCOMPLETE'],
    [{ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }, 'AI_REQUEST_REFUSED'],
    [completed(''), 'AI_OUTPUT_EMPTY'],
  ] as const) {
    let code = ''
    try { await textAiFetch(openai, request, () => Promise.resolve(Response.json(payload))) } catch (error) { code = (error as HttpError).code }
    assert(code === expected, `expected ${expected}, got ${code}`)
  }
})

Deno.test('OpenAI auth and billing failures stay on that account without retrying another provider', async () => {
  for (const [status, expected] of [[401, 'PROVIDER_KEY_REJECTED'], [402, 'PROVIDER_BILLING_REQUIRED']] as const) {
    let count = 0
    let code = ''
    try {
      await textAiFetch(openai, request, () => { count++; return Promise.resolve(Response.json({ error: { message: openai.apiKey } }, { status })) })
    } catch (error) { code = (error as HttpError).code; assert(!(error as Error).message.includes(openai.apiKey)) }
    assert(code === expected && count === 1)
  }
})

const profile = 'https://www.linkedin.com/in/verified-host'
Deno.test('OpenAI host discovery requires a profile in actual web-search sources', async () => {
  const usage = { input: 0, output: 0, searches: 0 }
  const result = await discoverHostLinkedin(openai, { show: 'Podcast' }, usage, async (url, init) => {
    assert(url === 'https://api.openai.com/v1/responses')
    const body = JSON.parse(String(init?.body))
    assert(body.tools[0].type === 'web_search' && body.tool_choice === 'required')
    assert(body.include.includes('web_search_call.action.sources'))
    return Response.json(completed(profile, [{ type: 'web_search_call', action: { sources: [{ url: profile }] } }]))
  })
  assert(result === profile && usage.searches === 1 && usage.input === 21)
})

Deno.test('OpenAI host discovery rejects a plausible profile mentioned only in generated text', async () => {
  let calls = 0
  let code = ''
  try {
    await discoverHostLinkedin(openai, {}, { input: 0, output: 0, searches: 0 }, () => {
      calls++
      return Promise.resolve(Response.json(completed(profile, [{ type: 'web_search_call', action: { sources: [{ url: 'https://example.com/host' }] } }])))
    })
  } catch (error) { code = (error as HttpError).code }
  assert(code === 'HOST_SEARCH_UNGROUNDED' && calls === 2)
})
