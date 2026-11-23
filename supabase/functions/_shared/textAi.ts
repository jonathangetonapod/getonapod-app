import { thinkingForModel } from './promptModels.ts'
import { HttpError } from './httpError.ts'
import { providerFetch } from './providerErrors.ts'
import { DEFAULT_OPENROUTER_MODEL, openRouterFetch, openRouterModel } from './openRouter.ts'

export type TextAiProvider = 'anthropic' | 'openai' | 'openrouter'
export interface TextAiKey { provider: TextAiProvider; apiKey: string; source: 'workspace' | 'platform' }
// String credentials are accepted for existing explicitly Anthropic-only internal callers.
export type TextAiCredential = TextAiKey | string
export const DEFAULT_OPENAI_MODEL = 'gpt-4.1'
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5'
export { DEFAULT_OPENROUTER_MODEL }
export const TEXT_AI_PROVIDERS: readonly TextAiProvider[] = ['anthropic', 'openai', 'openrouter']

export function credentialProvider(key: TextAiCredential): TextAiProvider {
  return typeof key === 'string' ? 'anthropic' : key.provider
}

const PLATFORM_TEXT_ENV: Record<TextAiProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', openrouter: 'OPENROUTER_API_KEY',
}

export function isTextAiProvider(value: unknown): value is TextAiProvider {
  return typeof value === 'string' && (TEXT_AI_PROVIDERS as readonly string[]).includes(value)
}

/**
 * The platform's own text key, for admin and public-page features.
 * TEXT_AI_PROVIDER picks one explicitly; otherwise the first configured key
 * wins, Anthropic first, as it always has.
 */
export function platformTextAiKey(): TextAiKey | null {
  const preferred = Deno.env.get('TEXT_AI_PROVIDER')?.trim()
  const provider = isTextAiProvider(preferred)
    ? preferred
    : TEXT_AI_PROVIDERS.find((candidate) => Deno.env.get(PLATFORM_TEXT_ENV[candidate])?.trim()) ?? 'openai'
  const apiKey = Deno.env.get(PLATFORM_TEXT_ENV[provider])?.trim()
  return apiKey ? { apiKey, provider, source: 'platform' } : null
}

/**
 * The model id to send to a provider. A requested id the provider cannot take
 * falls back to that provider's default; OpenRouter maps native Claude and
 * OpenAI ids to their OpenRouter equivalents instead.
 */
export function textModel(provider: TextAiProvider, requested?: string): string {
  if (provider === 'anthropic') return requested?.startsWith('claude-') ? requested : DEFAULT_CLAUDE_MODEL
  if (provider === 'openrouter') return openRouterModel(requested)
  return requested && !requested.startsWith('claude-') && !requested.includes('/') ? requested : DEFAULT_OPENAI_MODEL
}

type Block = { type?: string; status?: string; text?: string; url?: string; content?: unknown; action?: { sources?: Array<{ url?: string }> } }
export interface TextAiMessage {
  content: Array<{ type: 'text'; text: string }>
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}

function plainText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.filter((block) => block?.type === 'text').map((block) => String(block.text ?? '')).join('\n\n')
}

/** One transport for all text tasks. Callers retain their parsers and deadlines.
 * OpenAI uses Responses with storage disabled; OpenRouter uses Chat Completions
 * (see openRouter.ts). Anthropic-only options and keys
 * never cross provider boundaries. Web-search evidence is normalized, not invented.
 */
export async function textAiFetch(key: TextAiCredential, init: RequestInit, fetcher: typeof fetch = fetch): Promise<Response> {
  const provider = credentialProvider(key)
  const apiKey = typeof key === 'string' ? key : key.apiKey
  if (!apiKey.trim()) throw new HttpError(503, 'AI_NOT_CONFIGURED', 'The AI provider is not configured.')
  const body = JSON.parse(String(init.body)) as Record<string, unknown>
  const model = textModel(provider, typeof body.model === 'string' ? body.model : undefined)
  const signal = init.signal ?? AbortSignal.timeout(90_000)
  if (provider === 'anthropic') {
    return await providerFetch(provider, 'https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, model, ...(model !== body.model ? { thinking: thinkingForModel(model) ?? undefined } : {}) }),
    }, fetcher)
  }
  if (provider === 'openrouter') return await openRouterFetch(apiKey, body, model, signal, fetcher)
  const webSearch = Array.isArray(body.tools) && body.tools.some((tool) => tool?.name === 'web_search')
  const messages = Array.isArray(body.messages) ? body.messages : []
  const response = await providerFetch(provider, 'https://api.openai.com/v1/responses', {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, store: false,
      instructions: plainText(body.system) || undefined,
      input: messages.map((message) => ({ role: message.role, content: plainText(message.content) })),
      max_output_tokens: Math.max(16, Number(body.max_tokens) || 2_000),
      ...(webSearch ? { tools: [{ type: 'web_search' }], tool_choice: 'required', max_tool_calls: 5, include: ['web_search_call.action.sources'] } : {}),
    }),
  }, fetcher)
  let payload: { status?: string; output?: Block[]; usage?: { input_tokens?: number; output_tokens?: number } }
  try {
    const decoded: unknown = await response.json()
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('Invalid response')
    payload = decoded as typeof payload
  } catch {
    throw new HttpError(503, 'AI_RESPONSE_INVALID', 'The AI provider returned an invalid response. Try again.')
  }
  if (payload.status !== 'completed' || !Array.isArray(payload.output)) {
    throw new HttpError(503, 'AI_OUTPUT_INCOMPLETE', 'The AI response did not finish. Try again or choose a different model.')
  }
  const content: Block[] = []
  let searches = 0
  for (const item of payload.output) {
    if (item.type === 'web_search_call') {
      if (item.status && item.status !== 'completed') throw new HttpError(503, 'HOST_SEARCH_UNAVAILABLE', 'The AI provider could not complete web search. Try again.')
      searches += 1
      content.push({ type: 'web_search_tool_result', content: (item.action?.sources ?? []).map((source) => ({ type: 'web_search_result', url: source.url })) })
    }
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const block of item.content as Block[]) {
        if (block.type === 'refusal') throw new HttpError(422, 'AI_REQUEST_REFUSED', 'The AI provider could not complete this request.')
        if (block.type === 'output_text' && typeof block.text === 'string') content.push({ type: 'text', text: block.text })
      }
    }
  }
  if (!content.some((block) => block.type === 'text' && block.text?.trim())) {
    throw new HttpError(503, 'AI_OUTPUT_EMPTY', 'The AI provider returned no text. Try again.')
  }
  return Response.json({ content, stop_reason: 'end_turn', usage: {
    input_tokens: payload.usage?.input_tokens ?? 0, output_tokens: payload.usage?.output_tokens ?? 0,
    server_tool_use: { web_search_requests: searches },
  } })
}

/** SDK-shaped convenience for the older content generators. */
export function textAiClient(key: TextAiCredential) {
  return { messages: { create: async (body: Record<string, unknown>): Promise<TextAiMessage> =>
    await (await textAiFetch(key, { body: JSON.stringify(body) })).json() } }
}

export function textTokenUsage(key: TextAiCredential, input: number, output: number) {
  const provider = credentialProvider(key)
  if (provider === 'openai') return { openaiInputTokens: input, openaiOutputTokens: output }
  if (provider === 'openrouter') return { openrouterInputTokens: input, openrouterOutputTokens: output }
  return { anthropicInputTokens: input, anthropicOutputTokens: output }
}
