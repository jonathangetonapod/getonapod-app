import type { TextAiProvider } from './textAi.ts'
import { providerFetch } from './providerErrors.ts'
import { OPENROUTER_API } from './openRouter.ts'

/**
 * A model list body, or a fixed error. A non-JSON reply (a CDN challenge page,
 * say) must not put a fragment of the upstream page into the message callers
 * return to the browser.
 */
async function listBody<T>(response: Response): Promise<T> {
  try {
    const decoded: unknown = await response.json()
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('not an object')
    return decoded as T
  } catch {
    throw new Error('the model list could not be read (invalid response)')
  }
}
/**
 * The Claude models a stage may run on, read from Anthropic rather than listed
 * here.
 *
 * A hardcoded list goes stale the moment a model ships or retires, and it also
 * lies in the other direction: model access varies by key, so a workspace on
 * its own Anthropic key may reach models the platform key does not, or fewer.
 * Asking the Models API answers both — the list is what THIS key can actually
 * use, today.
 *
 * What the API cannot tell us is kept below as BEHAVIOUR, deliberately small.
 */

/** The subset of a model the picker and the run actually need. */
export interface PromptModel {
  id: string
  label: string
  /** Context window. Null when the API did not report one. */
  contextTokens: number | null
  /** Output cap, which bounds what a stage can be asked to write. */
  maxOutputTokens: number | null
  /** True when omitting `thinking` makes this model think. See BEHAVIOUR. */
  thinksByDefault: boolean
  /** Who makes the model, for grouping a long list (OpenRouter). Absent for a single-vendor key. */
  group?: string
}

/**
 * Defaults differ from supported capabilities. Sonnet 5.5 uses between_tools
 * for text-only stages; Opus 5.5 and Fable 5.1 cannot disable thinking.
 * Keep legacy behavior for explicitly saved older model selections.
 */
const THINKS_BY_DEFAULT = new Set<string>([
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
])

/** Lowest compatible thinking setting for short text-only prompt stages. */
export function thinkingForModel(id: string): { type: 'disabled' | 'between_tools' } | null {
  // Sonnet 5.5 rejects disabled. between_tools preserves the text-only
  // behavior of our short extraction/writing requests when no tools are used.
  if (id === 'claude-sonnet-5-5') return { type: 'between_tools' }
  // Opus 5.5 and Fable 5.1 always think; never send disabled to them.
  if (id === 'claude-opus-5' || id === 'claude-sonnet-5') return { type: 'disabled' }
  // Haiku 5.5 thinks by default and accepts disabled at its default effort.
  // Without this it spends a short step's whole output cap thinking —
  // contact name extraction (50 tokens) came back empty on it.
  if (id === 'claude-haiku-5-5') return { type: 'disabled' }
  return null
}

interface ModelsApiEntry {
  id?: unknown
  display_name?: unknown
  max_input_tokens?: unknown
  max_tokens?: unknown
}

const positiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null

/** One API entry, kept only when it carries an id we could actually send. */
function toPromptModel(entry: unknown): PromptModel[] {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
  const record = entry as ModelsApiEntry
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) return []
  return [{
    id,
    label: typeof record.display_name === 'string' && record.display_name.trim()
      ? record.display_name.trim()
      : id,
    contextTokens: positiveInt(record.max_input_tokens),
    maxOutputTokens: positiveInt(record.max_tokens),
    thinksByDefault: THINKS_BY_DEFAULT.has(id),
  }]
}

/**
 * Every model this key may use, newest first as the API returns them.
 *
 * Paginates, because the endpoint does and a truncated first page would present
 * a partial list as the whole one. Bounded so an unexpected cursor loop cannot
 * spin an invocation against its two-minute ceiling.
 */
export async function fetchPromptModels(apiKey: string, provider: TextAiProvider = 'anthropic'): Promise<PromptModel[]> {
  if (provider === 'openrouter') return await fetchOpenRouterModels(apiKey)
  if (provider === 'openai') {
    const response = await providerFetch('openai', 'https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000),
    })
    const payload = await listBody<{ data?: unknown }>(response)
    return (Array.isArray(payload.data) ? payload.data : [])
      .flatMap(toPromptModel)
      .filter((model) => /^gpt-(?:4\.1|4o|5|6)(?:[.-]|$)/u.test(model.id)
        && !/(?:audio|realtime|transcrib|image|search|codex|chat|pro|deep-research)/u.test(model.id))
      .map((model) => ({ ...model, label: `OpenAI · ${model.id}` }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
  const models: PromptModel[] = []
  let afterId: string | null = null

  for (let page = 0; page < 10; page += 1) {
    const url = new URL('https://api.anthropic.com/v1/models')
    url.searchParams.set('limit', '100')
    if (afterId) url.searchParams.set('after_id', afterId)

    const response = await fetch(url, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`the model list could not be read (${response.status})`)
    }
    const body = await listBody<{ data?: unknown; has_more?: unknown; last_id?: unknown }>(response)
    const entries = Array.isArray(body.data) ? body.data : []
    models.push(...entries.flatMap(toPromptModel))

    if (body.has_more !== true || typeof body.last_id !== 'string' || !body.last_id) break
    afterId = body.last_id
  }

  return models
}

interface OpenRouterModelEntry {
  id?: unknown
  name?: unknown
  context_length?: unknown
  endpoints?: unknown
  architecture?: { output_modalities?: unknown }
  top_provider?: { max_completion_tokens?: unknown }
  pricing?: { prompt?: unknown; completion?: unknown }
  reasoning?: { mandatory?: unknown; default_enabled?: unknown } | null
}

/** USD per million tokens, short: 0.000003 per token reads "$3". */
function perMillion(value: unknown): number | null {
  const perToken = Number(value)
  return Number.isFinite(perToken) ? perToken * 1_000_000 : null
}

function dollars(amount: number): string {
  if (amount >= 10) return `$${Math.round(amount)}`
  if (amount >= 0.1) return `$${Number(amount.toFixed(2))}`
  return `$${Number(amount.toPrecision(2))}`
}

/** "$3 in / $15 out per 1M tokens", "free", or "price varies" for a router. */
export function openRouterPriceLabel(pricing: OpenRouterModelEntry['pricing']): string | null {
  const input = perMillion(pricing?.prompt)
  const output = perMillion(pricing?.completion)
  if (input === null || output === null) return null
  if (input < 0 || output < 0) return 'price varies'
  if (input === 0 && output === 0) return 'free'
  return `${dollars(input)} in / ${dollars(output)} out per 1M tokens`
}

const titleCase = (value: string) => value.replace(/^~/u, '').split(/[-_]/u)
  .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(' ')

/** OpenRouter's own routers lead the list; vendors follow alphabetically. */
const ROUTER_GROUP = 'OpenRouter'

/**
 * Every OpenRouter model this key can call in real time.
 *
 * Reads /models/user, which applies the key's guardrails, provider
 * preferences and privacy settings, so the picker never offers a model the
 * account has ruled out. Dropped: `:batch` variants and anything without a
 * Chat Completions endpoint (those answer hours later, not within a run) and
 * models that cannot write text. Everything else is kept, routers and
 * rolling `~…-latest` aliases included, grouped by vendor with its price.
 */
async function fetchOpenRouterModels(apiKey: string): Promise<PromptModel[]> {
  const response = await providerFetch('openrouter', `${OPENROUTER_API}/models/user`, {
    headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000),
  })
  const payload = await listBody<{ data?: unknown }>(response)
  const models: PromptModel[] = []
  for (const raw of Array.isArray(payload.data) ? payload.data : []) {
    if (!raw || typeof raw !== 'object') continue
    const entry = raw as OpenRouterModelEntry
    const id = typeof entry.id === 'string' ? entry.id.trim() : ''
    if (!id || id.endsWith(':batch') || id.length > 128) continue
    if (Array.isArray(entry.endpoints) && !entry.endpoints.includes('/api/v1/chat/completions')) continue
    const outputs = entry.architecture?.output_modalities
    if (Array.isArray(outputs) && !outputs.includes('text')) continue

    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : id
    const vendor = id.replace(/^~/u, '').split('/')[0]
    const [prefix, ...rest] = name.split(': ')
    const group = vendor === 'openrouter' ? ROUTER_GROUP : rest.length ? prefix : titleCase(vendor)
    const shortName = rest.length ? rest.join(': ') : name
    const price = openRouterPriceLabel(entry.pricing)
    models.push({
      id,
      label: price ? `${shortName} · ${price}` : shortName,
      contextTokens: positiveInt(entry.context_length),
      maxOutputTokens: positiveInt(entry.top_provider?.max_completion_tokens),
      thinksByDefault: entry.reasoning?.mandatory === true || entry.reasoning?.default_enabled === true,
      group,
    })
  }
  // Stable: within a vendor the API's order (newest first) is kept.
  return models
    .map((model, index) => ({ model, index }))
    .sort((a, b) => {
      if ((a.model.group === ROUTER_GROUP) !== (b.model.group === ROUTER_GROUP)) return a.model.group === ROUTER_GROUP ? -1 : 1
      return (a.model.group ?? '').localeCompare(b.model.group ?? '') || a.index - b.index
    })
    .map(({ model }) => model)
}
