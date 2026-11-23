import { textAiFetch, type TextAiCredential } from './textAi.ts'
import { thinkingForModel } from './promptModels.ts'

/**
 * The research/pitch model call and the pitch-sequence parser, shared by
 * workspace-client-shortlist (production) and aiStepProbes (the Integrations
 * "Test" check), so a test sends exactly the request production sends and
 * reads the answer with exactly the same parser.
 */

export interface PitchSequence {
  subject: string
  email_1: string
  follow_up_1: string
  follow_up_2: string
}

export function parsePitchSequence(raw: string): PitchSequence | null {
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')) as Record<string, unknown>
    if (parsed && typeof parsed === 'object' && typeof parsed.email_1 === 'string' && parsed.email_1.trim()) {
      return {
        subject: typeof parsed.subject === 'string' ? parsed.subject.trim() : '',
        email_1: parsed.email_1.trim(),
        follow_up_1: typeof parsed.follow_up_1 === 'string' ? parsed.follow_up_1.trim() : '',
        follow_up_2: typeof parsed.follow_up_2 === 'string' ? parsed.follow_up_2.trim() : '',
      }
    }
  } catch (_error) {
    // Malformed JSON degrades to the caller's raw-text fallback.
  }
  return null
}

// Prompt caching is a byte-exact prefix match rendered as tools -> system ->
// messages, so every stage that wants to share the cache must send the SAME
// system string; the stage's own system line moves into the instruction
// block instead. Caches are also model-scoped — only same-model stages share.
export const RESEARCH_SHARED_SYSTEM =
  'You are an expert podcast outreach specialist working for a podcast booking agency. '
  + 'A CONTEXT section opens the message; the stage instructions follow it. '
  + 'Follow the instructions precisely and ground every claim in the provided context.'

export interface ResearchPromptParts {
  /** Shared cacheable context — byte-identical across the run's stages. */
  context?: string | null
  /** Second cached block: the stage-one report reused by later stages. */
  report?: string | null
  /** Stage-specific text: the filled prompt template. */
  instruction: string
}

export async function runResearchPrompt(
  apiKey: TextAiCredential,
  prompt: { model: string; maxTokens: number; system: string },
  parts: string | ResearchPromptParts,
  usage: { input: number; output: number; deadline?: number },
): Promise<string> {
  const resolved: ResearchPromptParts = typeof parts === 'string' ? { instruction: parts } : parts
  const cached = Boolean(resolved.context)
  const blocks: Array<Record<string, unknown>> = []
  if (resolved.context) {
    blocks.push({ type: 'text', text: resolved.context, cache_control: { type: 'ephemeral' } })
  }
  if (resolved.report) {
    blocks.push({ type: 'text', text: resolved.report, cache_control: { type: 'ephemeral' } })
  }
  blocks.push({
    type: 'text',
    // In cached mode the shared system replaces the per-stage one, so the
    // stage's own system line leads the instruction block instead.
    text: cached ? `${prompt.system}\n\n${resolved.instruction}` : resolved.instruction,
  })
  const response = await textAiFetch(apiKey, {
    method: 'POST',
    body: JSON.stringify({
      model: prompt.model,
      max_tokens: prompt.maxTokens,
      system: cached ? RESEARCH_SHARED_SYSTEM : prompt.system,
      messages: [{ role: 'user', content: blocks }],
      // Preserve the output budget using the model's compatible thinking setting.
      ...(thinkingForModel(prompt.model) ? { thinking: thinkingForModel(prompt.model) } : {}),
    }),
    // Research stages legitimately generate ~3k tokens, which takes 30-60s.
    // The old 28s cap timed out every real run the moment the API key worked.
    signal: AbortSignal.timeout(Math.max(1, Math.min(90_000, (usage.deadline ?? Infinity) - Date.now()))),
  })
  const payload = await response.json() as {
    content?: Array<{ type?: string; text?: string }>
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
  // input_tokens is only the UNCACHED remainder; the ledger should record
  // total prompt volume, so cache writes and reads are counted in as well.
  usage.input += (Number(payload.usage?.input_tokens) || 0)
    + (Number(payload.usage?.cache_creation_input_tokens) || 0)
    + (Number(payload.usage?.cache_read_input_tokens) || 0)
  usage.output += Number(payload.usage?.output_tokens) || 0
  const text = payload.content?.find((block) => block.type === 'text' && typeof block.text === 'string')?.text
  if (typeof text !== 'string' || !text.trim()) throw new Error('research prompt returned no text')
  return text.trim()
}
