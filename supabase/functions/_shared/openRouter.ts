import { HttpError } from './httpError.ts'
import { providerFailure, providerFetch } from './providerErrors.ts'

/**
 * OpenRouter: one key, every model OpenRouter routes to.
 *
 * Callers keep writing Anthropic Messages-shaped bodies (system, content
 * blocks, cache_control, thinking, the web_search server tool). This module
 * translates that into an OpenRouter Chat Completions request and the reply
 * back into the Messages shape, so every AI step runs here unchanged — the
 * same contract the OpenAI branch of textAiFetch keeps.
 */

export const OPENROUTER_API = 'https://openrouter.ai/api/v1'
export const DEFAULT_OPENROUTER_MODEL = 'anthropic/claude-sonnet-5.5'

/**
 * A model id OpenRouter will accept for a requested id.
 *
 * OpenRouter ids are `vendor/model`, so one is passed through untouched. A
 * native Claude or OpenAI id (a shipped default, or a choice saved while the
 * workspace was on a direct key) is mapped to the same model on OpenRouter
 * rather than silently replaced by the default: `claude-sonnet-5-5` becomes
 * `anthropic/claude-sonnet-5.5`, `gpt-4.1` becomes `openai/gpt-4.1`.
 */
export function openRouterModel(requested?: string): string {
  const id = requested?.trim() ?? ''
  if (!id) return DEFAULT_OPENROUTER_MODEL
  if (id.includes('/')) return id
  const claude = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/u.exec(id)
  if (claude) return `anthropic/claude-${claude[1]}-${claude[2]}${claude[3] ? `.${claude[3]}` : ''}`
  if (/^(?:gpt-|o\d)/u.test(id)) return `openai/${id}`
  return DEFAULT_OPENROUTER_MODEL
}

/** Claude models on OpenRouter honour Anthropic prompt caching; others ignore or reject it. */
function cachesPrompts(model: string): boolean {
  return /^~?anthropic\//u.test(model)
}

// ---------------------------------------------------------------------------
// Model metadata: how each model reasons, read from the public catalog.
// ---------------------------------------------------------------------------

interface CatalogReasoning {
  mandatory?: boolean
  default_enabled?: boolean
  supported_efforts?: string[]
}

export interface OpenRouterModelInfo {
  reasoning: CatalogReasoning | null
  maxCompletionTokens: number | null
}

const CATALOG_TTL_MS = 60 * 60 * 1000
const CATALOG_RETRY_MS = 5 * 60 * 1000
let catalog: { at: number; ttl: number; models: Map<string, OpenRouterModelInfo> | null } | null = null

/** Tests only: forget the cached catalog. */
export function resetOpenRouterCatalog(): void {
  catalog = null
}

const positiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null

/**
 * The catalog entry for a model, or null when it cannot be read.
 *
 * The catalog is public (no key is sent) and cached per isolate for an hour,
 * so a run pays for it once, not per call. A failed read is remembered for
 * five minutes and never fails the request: the call then goes out without a
 * reasoning setting and with token headroom, which is safe for any model.
 */
export async function openRouterModelInfo(model: string, fetcher: typeof fetch = fetch): Promise<OpenRouterModelInfo | null> {
  if (!catalog || Date.now() - catalog.at > catalog.ttl) {
    try {
      const response = await fetcher(`${OPENROUTER_API}/models`, { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error('catalog unavailable')
      const payload = await response.json() as { data?: unknown }
      const models = new Map<string, OpenRouterModelInfo>()
      for (const entry of Array.isArray(payload.data) ? payload.data : []) {
        if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') continue
        const reasoning = entry.reasoning && typeof entry.reasoning === 'object' ? entry.reasoning as CatalogReasoning : null
        models.set(entry.id, {
          reasoning,
          maxCompletionTokens: positiveInt(entry.top_provider?.max_completion_tokens),
        })
      }
      catalog = { at: Date.now(), ttl: CATALOG_TTL_MS, models }
    } catch {
      catalog = { at: Date.now(), ttl: CATALOG_RETRY_MS, models: null }
    }
  }
  return catalog.models?.get(model) ?? null
}

/** Efforts from least to most thinking; the first one a model supports is used. */
const LOW_EFFORTS = ['none', 'minimal', 'low'] as const

/**
 * The reasoning setting for a short text task, and whether the model will
 * still spend tokens thinking.
 *
 * Mirrors the direct Claude path, where Sonnet 5.5 runs text-only prompts
 * without extended thinking: ask for the least reasoning the model allows.
 * Reasoning text is excluded either way, since no step reads it.
 */
export function openRouterReasoning(info: OpenRouterModelInfo | null): {
  reasoning?: { effort?: string; exclude?: true; enabled?: false }
  thinks: boolean
} {
  // Unknown model (catalog unreadable): send nothing, assume it may think.
  if (!info) return { thinks: true }
  if (!info.reasoning) return { thinks: false }
  const efforts = Array.isArray(info.reasoning.supported_efforts) ? info.reasoning.supported_efforts : []
  const effort = LOW_EFFORTS.find((candidate) => efforts.includes(candidate)
    && !(candidate === 'none' && info.reasoning?.mandatory === true))
  if (effort) return { reasoning: { effort, exclude: true }, thinks: effort !== 'none' }
  // No low effort to ask for. `exclude` only hides reasoning, it does not stop
  // it (verified live: qwen3.8-flash with exclude spent 44 of 50 tokens
  // thinking and returned a cut-off name), so switch reasoning off whenever
  // the model allows it.
  if (info.reasoning.mandatory !== true) return { reasoning: { enabled: false }, thinks: false }
  return { reasoning: { exclude: true }, thinks: true }
}

/** Extra output budget for a model that reasons, so thinking cannot crowd out the answer. */
const REASONING_HEADROOM = 4_096

/**
 * The output cap to send. A reasoning model spends max_tokens on thinking
 * first, so a 50-token extraction would come back empty without headroom.
 * Only generated tokens are billed, so unused headroom costs nothing.
 */
export function openRouterMaxTokens(requested: unknown, info: OpenRouterModelInfo | null, thinks: boolean): number {
  const base = Math.max(16, Math.floor(Number(requested)) || 2_000)
  if (!thinks) return base
  const cap = info?.maxCompletionTokens ?? null
  return cap ? Math.min(base + REASONING_HEADROOM, Math.max(base, cap)) : base + REASONING_HEADROOM
}

// ---------------------------------------------------------------------------
// Request and response translation
// ---------------------------------------------------------------------------

type Block = { type?: string; text?: unknown; cache_control?: unknown }

function textBlocks(value: unknown): Block[] {
  if (typeof value === 'string') return [{ type: 'text', text: value }]
  if (!Array.isArray(value)) return []
  return value.filter((block): block is Block => block?.type === 'text' && typeof block.text === 'string')
}

/** Content for one message: plain text, or text parts carrying cache_control for Claude. */
function chatContent(value: unknown, caching: boolean): string | Array<Record<string, unknown>> {
  const blocks = textBlocks(value)
  if (caching && blocks.some((block) => block.cache_control)) {
    return blocks.map((block) => ({
      type: 'text', text: String(block.text),
      ...(block.cache_control ? { cache_control: block.cache_control } : {}),
    }))
  }
  return blocks.map((block) => String(block.text)).join('\n\n')
}

const hasText = (content: string | Array<Record<string, unknown>>): boolean =>
  typeof content === 'string' ? content.trim().length > 0 : content.length > 0

/** Translates an Anthropic Messages body into an OpenRouter Chat Completions body. */
export function openRouterRequestBody(
  body: Record<string, unknown>,
  model: string,
  info: OpenRouterModelInfo | null,
): Record<string, unknown> {
  const caching = cachesPrompts(model)
  const messages: Array<Record<string, unknown>> = []
  const system = chatContent(body.system, caching)
  if (hasText(system)) messages.push({ role: 'system', content: system })
  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    if (message?.role !== 'user' && message?.role !== 'assistant') continue
    const content = chatContent(message.content, caching)
    if (hasText(content)) messages.push({ role: message.role, content })
  }
  const webSearch = Array.isArray(body.tools) && body.tools.some((tool) => tool?.name === 'web_search')
  const { reasoning, thinks } = openRouterReasoning(info)
  return {
    model,
    messages,
    max_tokens: openRouterMaxTokens(body.max_tokens, info, thinks),
    ...(reasoning ? { reasoning } : {}),
    // Web search runs as OpenRouter's web search server tool, pinned to Exa.
    // Host discovery only accepts a profile that appears in the search
    // results, so the results must come back to us. Exa returns them as
    // url_citation annotations for every model. A provider's native search
    // often returns none (verified live 2026-11-23: GPT, Claude and Gemini
    // answered correctly with no sources), and the older `web` plugin is
    // deprecated.
    ...(webSearch ? { tools: [{ type: 'openrouter:web_search', parameters: { engine: 'exa', max_results: 5 } }] } : {}),
  }
}

interface ChatChoice {
  finish_reason?: string | null
  error?: { code?: unknown; message?: unknown } | null
  message?: {
    content?: unknown
    annotations?: Array<{ type?: string; url_citation?: { url?: unknown } }>
  }
}

interface ChatPayload {
  error?: { code?: unknown; message?: unknown } | null
  choices?: ChatChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    cost?: number
    server_tool_use_details?: { web_search_requests?: number }
  }
}

function replyText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string).join('')
}

/**
 * Sends one request and returns an Anthropic Messages-shaped Response.
 *
 * OpenRouter can report a failure inside an HTTP 200 (a top-level `error`, or
 * a choice that finished with `error`), so the body is checked, not just the
 * status. An empty answer never becomes a usable draft.
 */
export async function openRouterFetch(
  apiKey: string,
  body: Record<string, unknown>,
  model: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const info = await openRouterModelInfo(model, fetcher)
  const webSearch = Array.isArray(body.tools) && body.tools.some((tool) => tool?.name === 'web_search')
  const response = await providerFetch('openrouter', `${OPENROUTER_API}/chat/completions`, {
    method: 'POST', signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': 'Get On A Pod',
    },
    body: JSON.stringify(openRouterRequestBody(body, model, info)),
  }, fetcher)

  let payload: ChatPayload
  try {
    const decoded: unknown = await response.json()
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('Invalid response')
    payload = decoded as ChatPayload
  } catch {
    throw new HttpError(503, 'AI_RESPONSE_INVALID', 'The AI provider returned an invalid response. Try again.')
  }
  if (payload.error) {
    throw providerFailure('openrouter', typeof payload.error.code === 'number' ? payload.error.code : undefined, payload.error)
  }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined
  if (!choice) throw new HttpError(503, 'AI_RESPONSE_INVALID', 'The AI provider returned an invalid response. Try again.')
  if (choice.error || choice.finish_reason === 'error') {
    throw providerFailure('openrouter', typeof choice.error?.code === 'number' ? choice.error.code : undefined, choice.error ?? undefined)
  }
  if (choice.finish_reason === 'content_filter') {
    throw new HttpError(422, 'AI_REQUEST_REFUSED', 'The AI provider could not complete this request.')
  }

  const text = replyText(choice.message?.content)
  if (!text.trim()) {
    throw choice.finish_reason === 'length'
      ? new HttpError(503, 'AI_OUTPUT_INCOMPLETE', 'The AI response did not finish. Try again or choose a different model.')
      : new HttpError(503, 'AI_OUTPUT_EMPTY', 'The AI provider returned no text. Try again.')
  }

  const sources = (Array.isArray(choice.message?.annotations) ? choice.message.annotations : [])
    .flatMap((annotation) => annotation?.type === 'url_citation' && typeof annotation.url_citation?.url === 'string'
      ? [annotation.url_citation.url] : [])
  const reportedSearches = Number(payload.usage?.server_tool_use_details?.web_search_requests) || 0
  const searches = webSearch ? Math.max(reportedSearches, sources.length ? 1 : 0) : 0
  const content: Array<Record<string, unknown>> = []
  if (webSearch && searches > 0) {
    content.push({ type: 'web_search_tool_result', content: sources.map((url) => ({ type: 'web_search_result', url })) })
  }
  content.push({ type: 'text', text })

  return Response.json({
    content,
    stop_reason: choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    usage: {
      input_tokens: Number(payload.usage?.prompt_tokens) || 0,
      output_tokens: Number(payload.usage?.completion_tokens) || 0,
      server_tool_use: { web_search_requests: searches },
      // What OpenRouter charged, in USD, when it reports it.
      ...(typeof payload.usage?.cost === 'number' ? { cost_usd: payload.usage.cost } : {}),
    },
  })
}
