import { textAiFetch, textModel, textTokenUsage, type TextAiKey } from './textAi.ts'
import { openRouterModel, openRouterReasoning, openRouterMaxTokens, resetOpenRouterCatalog, DEFAULT_OPENROUTER_MODEL } from './openRouter.ts'
import { fetchPromptModels, openRouterPriceLabel } from './promptModels.ts'
import { probeAiKeyResult } from './workspaceAiKeys.ts'
import { discoverHostLinkedin } from './hostContactDiscovery.ts'
import { HttpError } from './httpError.ts'

function assert(value: unknown, message = 'assertion failed'): asserts value { if (!value) throw new Error(message) }

const openrouter: TextAiKey = { provider: 'openrouter', apiKey: 'sk-or-v1-customer-secret', source: 'workspace' }
const CATALOG_URL = 'https://openrouter.ai/api/v1/models'
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

const catalog = {
  data: [
    { id: 'anthropic/claude-sonnet-5.5', reasoning: { mandatory: true, supported_efforts: ['max', 'high', 'medium', 'low'] }, top_provider: { max_completion_tokens: 128_000 } },
    { id: 'anthropic/claude-opus-5', reasoning: { mandatory: false, supported_efforts: ['high', 'low', 'none'] }, top_provider: { max_completion_tokens: 128_000 } },
    { id: 'openai/gpt-4.1', reasoning: null, top_provider: { max_completion_tokens: 32_768 } },
    { id: 'tiny/thinker', reasoning: { mandatory: true, supported_efforts: ['low'] }, top_provider: { max_completion_tokens: 1_000 } },
  ],
}

const chatReply = (text: string, extra: Record<string, unknown> = {}) => ({
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: text } }],
  usage: { prompt_tokens: 120, completion_tokens: 30, cost: 0.0012 },
  ...extra,
})

/** Serves the public catalog and hands chat requests to `chat`. */
function router(chat: (init: RequestInit | undefined) => Response | Promise<Response>, seen: { catalogAuth?: string | null; chat?: number } = {}) {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === CATALOG_URL) {
      seen.catalogAuth = new Headers(init?.headers).get('Authorization')
      return Promise.resolve(Response.json(catalog))
    }
    if (url === CHAT_URL) {
      seen.chat = (seen.chat ?? 0) + 1
      return Promise.resolve(chat(init))
    }
    throw new Error(`unexpected request to ${url}`)
  }
}

const anthropicBody = (model: string, extra: Record<string, unknown> = {}) => ({
  body: JSON.stringify({
    model,
    max_tokens: 500,
    thinking: { type: 'between_tools' },
    system: 'Instructions',
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Research context', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'Write a pitch' },
    ] }],
    ...extra,
  }),
})

async function errorCode(run: () => Promise<unknown>): Promise<string> {
  try { await run() } catch (error) { return error instanceof HttpError ? error.code : `not-http:${error}` }
  return 'no-error'
}

Deno.test('native Claude and OpenAI ids map onto their OpenRouter models instead of a silent default', () => {
  assert(openRouterModel('claude-sonnet-5-5') === 'anthropic/claude-sonnet-5.5')
  assert(openRouterModel('claude-opus-5') === 'anthropic/claude-opus-5')
  assert(openRouterModel('claude-haiku-4-5-20251001') === 'anthropic/claude-haiku-4.5')
  assert(openRouterModel('gpt-4.1') === 'openai/gpt-4.1')
  assert(openRouterModel('meta-llama/llama-3.3-70b-instruct:free') === 'meta-llama/llama-3.3-70b-instruct:free')
  assert(openRouterModel('~anthropic/claude-sonnet-latest') === '~anthropic/claude-sonnet-latest')
  assert(openRouterModel(undefined) === DEFAULT_OPENROUTER_MODEL && openRouterModel('mystery') === DEFAULT_OPENROUTER_MODEL)
  assert(textModel('openrouter', 'claude-sonnet-5-5') === 'anthropic/claude-sonnet-5.5')
  // A saved OpenRouter id never reaches a direct provider as-is.
  assert(textModel('openai', 'anthropic/claude-sonnet-5.5') === 'gpt-4.1')
  assert(textModel('anthropic', 'anthropic/claude-sonnet-5.5') === 'claude-sonnet-5-5')
})

Deno.test('the least reasoning a model allows is requested, with headroom only when it still thinks', () => {
  assert(JSON.stringify(openRouterReasoning({ reasoning: null, maxCompletionTokens: null })) === JSON.stringify({ thinks: false }))
  const optional = openRouterReasoning({ reasoning: { mandatory: false, supported_efforts: ['high', 'none'] }, maxCompletionTokens: null })
  assert(optional.reasoning?.effort === 'none' && optional.thinks === false)
  const mandatory = openRouterReasoning({ reasoning: { mandatory: true, supported_efforts: ['none', 'low'] }, maxCompletionTokens: null })
  assert(mandatory.reasoning?.effort === 'low' && mandatory.thinks === true, 'a model that must reason is never sent none')
  assert(openRouterReasoning(null).thinks === true && openRouterReasoning(null).reasoning === undefined)
  assert(openRouterMaxTokens(50, null, false) === 50)
  assert(openRouterMaxTokens(50, null, true) === 50 + 4_096)
  assert(openRouterMaxTokens(500, { reasoning: null, maxCompletionTokens: 1_000 }, true) === 1_000, 'headroom stays within the model cap')
  assert(openRouterMaxTokens(2_000, { reasoning: null, maxCompletionTokens: 1_000 }, true) === 2_000, 'never below what the step asked for')
})

Deno.test('OpenRouter receives only its key, a Chat Completions body and Claude prompt caching', async () => {
  resetOpenRouterCatalog()
  const seen: { catalogAuth?: string | null; chat?: number } = {}
  const response = await textAiFetch(openrouter, anthropicBody('claude-sonnet-5-5'), router((init) => {
    const headers = new Headers(init?.headers)
    assert(headers.get('Authorization') === `Bearer ${openrouter.apiKey}`)
    assert(!headers.has('x-api-key') && !headers.has('anthropic-version'))
    const body = JSON.parse(String(init?.body))
    assert(body.model === 'anthropic/claude-sonnet-5.5')
    assert(!('thinking' in body) && !('system' in body), 'Anthropic-only fields are translated, not forwarded')
    assert(body.messages[0].role === 'system' && body.messages[0].content === 'Instructions')
    assert(body.messages[1].content[0].cache_control.type === 'ephemeral', 'Claude on OpenRouter keeps prompt caching')
    assert(body.reasoning.effort === 'low' && body.reasoning.exclude === true)
    assert(body.max_tokens === 500 + 4_096)
    assert(!('plugins' in body))
    return Response.json(chatReply('An OpenRouter pitch'))
  }, seen))
  const payload = await response.json()
  assert(payload.content.at(-1).text === 'An OpenRouter pitch' && payload.stop_reason === 'end_turn')
  assert(payload.usage.input_tokens === 120 && payload.usage.output_tokens === 30 && payload.usage.cost_usd === 0.0012)
  assert(seen.catalogAuth === null, 'the public catalog is read without the agency key')
})

Deno.test('other models get plain text and no reasoning field when they have none', async () => {
  resetOpenRouterCatalog()
  await textAiFetch(openrouter, anthropicBody('openai/gpt-4.1'), router((init) => {
    const body = JSON.parse(String(init?.body))
    assert(body.messages[1].content === 'Research context\n\nWrite a pitch')
    assert(!JSON.stringify(body).includes('cache_control'))
    assert(!('reasoning' in body) && body.max_tokens === 500)
    return Response.json(chatReply('GPT pitch'))
  }))
})

Deno.test('an unreadable catalog never blocks the request; it goes out with headroom', async () => {
  resetOpenRouterCatalog()
  let chatCalls = 0
  await textAiFetch(openrouter, anthropicBody('anthropic/claude-opus-5'), (input, init) => {
    if (String(input) === CATALOG_URL) return Promise.resolve(new Response('down', { status: 503 }))
    chatCalls += 1
    const body = JSON.parse(String(init?.body))
    assert(!('reasoning' in body) && body.max_tokens === 500 + 4_096)
    return Promise.resolve(Response.json(chatReply('Still works')))
  })
  assert(chatCalls === 1)
})

Deno.test('errors inside an HTTP 200, refusals and empty answers never become drafts', async () => {
  const cases: Array<[unknown, string]> = [
    [{ error: { code: 402, message: 'Insufficient credits' } }, 'PROVIDER_BILLING_REQUIRED'],
    [{ choices: [{ finish_reason: 'error', error: { code: 502, message: 'upstream died' }, message: { content: '' } }] }, 'PROVIDER_UNAVAILABLE'],
    [{ choices: [{ finish_reason: 'content_filter', message: { content: 'partial' } }] }, 'AI_REQUEST_REFUSED'],
    [{ choices: [{ finish_reason: 'length', message: { content: '' } }] }, 'AI_OUTPUT_INCOMPLETE'],
    [{ choices: [{ finish_reason: 'stop', message: { content: '   ' } }] }, 'AI_OUTPUT_EMPTY'],
    [{ choices: [] }, 'AI_RESPONSE_INVALID'],
  ]
  for (const [payload, expected] of cases) {
    resetOpenRouterCatalog()
    const code = await errorCode(() => textAiFetch(openrouter, anthropicBody('openai/gpt-4.1'), router(() => Response.json(payload))))
    assert(code === expected, `${JSON.stringify(payload)} gave ${code}, expected ${expected}`)
  }
})

Deno.test('a truncated but non-empty answer reports max_tokens, which callers already check', async () => {
  resetOpenRouterCatalog()
  const response = await textAiFetch(openrouter, anthropicBody('openai/gpt-4.1'), router(() => Response.json({
    choices: [{ finish_reason: 'length', message: { content: '[{"id": 1' } }], usage: { prompt_tokens: 1, completion_tokens: 1 },
  })))
  assert((await response.json()).stop_reason === 'max_tokens')
})

Deno.test('OpenRouter HTTP failures stay on the agency account, without leaking the key', async () => {
  const cases: Array<[number, string]> = [[401, 'PROVIDER_KEY_REJECTED'], [402, 'PROVIDER_BILLING_REQUIRED'], [403, 'PROVIDER_KEY_REJECTED'], [429, 'PROVIDER_RATE_LIMITED'], [502, 'PROVIDER_UNAVAILABLE']]
  for (const [status, expected] of cases) {
    resetOpenRouterCatalog()
    let message = ''
    const code = await errorCode(async () => {
      try {
        await textAiFetch(openrouter, anthropicBody('openai/gpt-4.1'), router(() => Response.json({ error: { code: status, message: openrouter.apiKey } }, { status })))
      } catch (error) { message = (error as Error).message; throw error }
    })
    assert(code === expected, `${status} gave ${code}`)
    assert(!message.includes(openrouter.apiKey), 'the upstream message is never echoed')
    assert(!message.includes('Contact support; you do not need'), 'an agency key problem is never routed to platform support')
  }
  let blocked = ''
  try {
    resetOpenRouterCatalog()
    await textAiFetch(openrouter, anthropicBody('openai/gpt-4.1'), router(() => Response.json({ error: { code: 403, message: 'flagged' } }, { status: 403 })))
  } catch (error) { blocked = (error as Error).message }
  assert(blocked.includes('budget, guardrails and privacy settings'), '403 explains a guardrail or budget block, not a bad key')
})

Deno.test('OpenRouter host discovery accepts only a profile present in its web citations', async () => {
  resetOpenRouterCatalog()
  const usage = { input: 0, output: 0, searches: 0 }
  const profile = await discoverHostLinkedin(openrouter, { podcast: 'Show' }, usage, router((init) => {
    const body = JSON.parse(String(init?.body))
    assert(body.plugins?.[0]?.id === 'web', 'web search runs as the web plugin')
    assert(!('tools' in body))
    return Response.json(chatReply('https://www.linkedin.com/in/real-host', {
      choices: [{ finish_reason: 'stop', message: { content: 'https://www.linkedin.com/in/real-host', annotations: [
        { type: 'url_citation', url_citation: { url: 'https://www.linkedin.com/in/real-host' } },
      ] } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, server_tool_use_details: { web_search_requests: 1 } },
    }))
  }), 'openai/gpt-4.1')
  assert(profile === 'https://www.linkedin.com/in/real-host')
  assert(usage.searches === 1)

  resetOpenRouterCatalog()
  const code = await errorCode(() => discoverHostLinkedin(openrouter, { podcast: 'Show' }, { input: 0, output: 0, searches: 0 }, router(() => Response.json({
    choices: [{ finish_reason: 'stop', message: { content: 'https://www.linkedin.com/in/invented', annotations: [
      { type: 'url_citation', url_citation: { url: 'https://example.com/about' } },
    ] } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  })), 'openai/gpt-4.1'))
  assert(code === 'HOST_SEARCH_UNGROUNDED', `an uncited profile gave ${code}`)
})

Deno.test('OpenRouter usage is recorded under its own provider', () => {
  const usage = textTokenUsage(openrouter, 10, 4)
  assert(JSON.stringify(usage) === JSON.stringify({ openrouterInputTokens: 10, openrouterOutputTokens: 4 }))
})

Deno.test('the model list offers every real-time model the key allows, grouped, with prices', async () => {
  const realFetch = globalThis.fetch
  let auth: string | null = null
  let url = ''
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    url = String(input)
    auth = new Headers(init?.headers).get('Authorization')
    return Promise.resolve(Response.json({ data: [
      { id: 'anthropic/claude-sonnet-5.5', name: 'Anthropic: Claude Sonnet 5.5', context_length: 1_000_000, endpoints: ['/api/v1/chat/completions'], pricing: { prompt: '0.000002', completion: '0.00001' }, top_provider: { max_completion_tokens: 128_000 }, reasoning: { mandatory: true } },
      { id: 'anthropic/claude-sonnet-5.5:batch', name: 'Anthropic: Claude Sonnet 5.5 (batch)', endpoints: ['/api/v1/batches'], pricing: { prompt: '0.000001', completion: '0.000005' } },
      { id: 'openrouter/auto', name: 'Auto Router', endpoints: ['/api/v1/chat/completions'], pricing: { prompt: '-1', completion: '-1' } },
      { id: 'meta-llama/llama-4:free', name: 'Meta: Llama 4 (free)', pricing: { prompt: '0', completion: '0' } },
      { id: 'image/only', name: 'Image Only', architecture: { output_modalities: ['image'] } },
      { id: '~anthropic/claude-sonnet-latest', name: 'Anthropic: Claude Sonnet Latest', pricing: { prompt: '0.000002', completion: '0.00001' } },
    ] }))
  }
  try {
    const models = await fetchPromptModels(openrouter.apiKey, 'openrouter')
    assert(url === 'https://openrouter.ai/api/v1/models/user', 'reads the key-filtered list')
    assert(auth === `Bearer ${openrouter.apiKey}`)
    const ids = models.map((model) => model.id)
    assert(!ids.includes('anthropic/claude-sonnet-5.5:batch') && !ids.includes('image/only'))
    assert(ids[0] === 'openrouter/auto', 'routers lead the list')
    assert(ids.includes('~anthropic/claude-sonnet-latest') && ids.includes('meta-llama/llama-4:free'))
    const sonnet = models.find((model) => model.id === 'anthropic/claude-sonnet-5.5')!
    assert(sonnet.group === 'Anthropic' && sonnet.label === 'Claude Sonnet 5.5 · $2 in / $10 out per 1M tokens')
    assert(sonnet.contextTokens === 1_000_000 && sonnet.maxOutputTokens === 128_000 && sonnet.thinksByDefault)
    assert(models.find((model) => model.id === 'openrouter/auto')!.label === 'Auto Router · price varies')
    assert(models.find((model) => model.id === 'meta-llama/llama-4:free')!.label.endsWith('· free'))
  } finally {
    globalThis.fetch = realFetch
  }
  assert(openRouterPriceLabel({ prompt: '0.00000015', completion: '0.0000006' }) === '$0.15 in / $0.6 out per 1M tokens')
  assert(openRouterPriceLabel(undefined) === null)
})

Deno.test('an OpenRouter key is checked against the authenticated key endpoint', async () => {
  let checked = ''
  const valid = await probeAiKeyResult('openrouter', openrouter.apiKey, (input, init) => {
    checked = String(input)
    assert(new Headers(init?.headers).get('Authorization') === `Bearer ${openrouter.apiKey}`)
    return Promise.resolve(Response.json({ data: { label: 'agency' } }))
  })
  assert(valid === 'valid' && checked === 'https://openrouter.ai/api/v1/key')
  assert(await probeAiKeyResult('openrouter', 'bad', () => Promise.resolve(new Response('', { status: 401 }))) === 'invalid')
  assert(await probeAiKeyResult('openrouter', 'x', () => Promise.resolve(new Response('', { status: 503 }))) === 'unreachable')
})
