import type { TextAiProvider } from './textAi.ts'
import { providerFetch } from './providerErrors.ts'
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
])

/** Lowest compatible thinking setting for short text-only prompt stages. */
export function thinkingForModel(id: string): { type: 'disabled' | 'between_tools' } | null {
  // Sonnet 5.5 rejects disabled. between_tools preserves the text-only
  // behavior of our short extraction/writing requests when no tools are used.
  if (id === 'claude-sonnet-5-5') return { type: 'between_tools' }
  // Opus 5.5 and Fable 5.1 always think; never send disabled to them.
  if (id === 'claude-opus-5' || id === 'claude-sonnet-5') return { type: 'disabled' }
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
  if (provider === 'openai') {
    const response = await providerFetch('openai', 'https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000),
    })
    const payload = await response.json() as { data?: unknown }
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
    const body = await response.json() as { data?: unknown; has_more?: unknown; last_id?: unknown }
    const entries = Array.isArray(body.data) ? body.data : []
    models.push(...entries.flatMap(toPromptModel))

    if (body.has_more !== true || typeof body.last_id !== 'string' || !body.last_id) break
    afterId = body.last_id
  }

  return models
}
