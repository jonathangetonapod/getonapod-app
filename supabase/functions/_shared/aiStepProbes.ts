import { HttpError } from './httpError.ts'
import { textAiFetch, textModel, credentialProvider, type TextAiCredential } from './textAi.ts'
import { RESEARCH_PROMPT_DEFAULTS } from './researchPromptDefaults.ts'
import { parsePitchSequence, runResearchPrompt } from './researchPromptCall.ts'
import { groupScoringPrompt, parseGroupScores, type ScoringPodcast } from './compatibilityPrompt.ts'
import { discoverHostLinkedin } from './hostContactDiscovery.ts'
import { thinkingFields, type AiModelStepId } from './workspaceAiModels.ts'

/**
 * "Does this step work on the model chosen for it?" — the Integrations Test
 * button.
 *
 * Each probe sends one small request shaped like the step's production
 * request — same transport (textAiFetch, so the same provider translation for
 * Claude, OpenAI and OpenRouter), same output cap, same thinking setting, same
 * system prompt, same tools — and reads the answer with the format check the
 * step relies on. What fails here fails in production: a model that rejects a
 * parameter, spends its whole output cap thinking, cannot run web search, or
 * does not return the JSON the step parses.
 *
 * The inputs are a short fixed fixture, not a real client, so a probe proves
 * the model can do the step's job in the step's format — not how well it writes.
 */

export const AI_PROBE_STAGE_IDS = [
  'podcast_research', 'host_info', 'guest_info', 'host_name_extractor', 'find_topics', 'write_email', 'clean_email',
] as const
export type AiProbeStageId = typeof AI_PROBE_STAGE_IDS[number]
export type AiProbeId = AiProbeStageId | AiModelStepId

export function isAiProbeStageId(value: unknown): value is AiProbeStageId {
  return typeof value === 'string' && (AI_PROBE_STAGE_IDS as readonly string[]).includes(value)
}

export interface AiProbeResult {
  ok: boolean
  /** The model id actually sent to the provider. */
  model: string
  ms: number
  /** A short, user-facing reason when ok is false; a one-line sample when it passes. */
  detail: string
  code?: string
}

const FIXTURE_CONTEXT = `<context>
<podcast>
Name: The Operator's Table
Host: Dana Whitfield (founder of Whitfield Logistics)
Description: A weekly interview show for founders of bootstrapped B2B companies. Episodes cover hiring, pricing and running lean operations.
Recent episodes: "Pricing your first enterprise deal" (guest: Marco Reyes); "Hiring before you can afford it" (solo episode)
</podcast>
<client>
Name: Priya Natarajan
Bio: Founder of Ledgerline, a bookkeeping platform for agencies. Grew it to $4M ARR without outside funding. Writes about cash-flow discipline for service businesses.
</client>
</context>`

const FIXTURE_PITCH = {
  subject: 'Cash-flow lessons for bootstrapped founders',
  email_1: 'Hi Dana, your episode with Marco Reyes on enterprise pricing stuck with me. Priya Natarajan grew Ledgerline to $4M ARR without funding and won the Nobel Prize for it. She could walk your listeners through the cash-flow habits that made that possible. Open to a short call?',
  follow_up_1: 'Hi Dana, following up on Priya. Happy to send topic ideas.',
  follow_up_2: 'Last note from me, Dana. Thanks for considering Priya.',
}

const FIXTURE_SHOWS: ScoringPodcast[] = [
  { podcast_id: 'probe-show-1', podcast_name: "The Operator's Table", podcast_description: 'Interviews with founders of bootstrapped B2B companies about pricing, hiring and lean operations.' },
  { podcast_id: 'probe-show-2', podcast_name: 'Garden Hour', podcast_description: 'Weekly tips on growing vegetables and caring for houseplants.' },
]

/** The text of a Messages-shaped reply, failing the probe the way the step would fail. */
async function replyText(response: Response): Promise<string> {
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }>; stop_reason?: string }
  const text = (payload.content ?? []).filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n').trim()
  if (payload.stop_reason === 'max_tokens' && !text) {
    throw new ProbeFailure('Used its whole output limit before answering (often thinking). Choose a model that answers within the limit.')
  }
  if (!text) throw new ProbeFailure('Returned no text.')
  return text
}

class ProbeFailure extends Error {}

function jsonValue(text: string): unknown {
  const body = text.replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '').trim()
  try { return JSON.parse(body) } catch { /* fall through to the bracketed slice */ }
  const start = body.search(/[[{]/u)
  const end = Math.max(body.lastIndexOf(']'), body.lastIndexOf('}'))
  if (start === -1 || end <= start) throw new ProbeFailure('Did not return JSON, which this step needs.')
  try { return JSON.parse(body.slice(start, end + 1)) } catch { throw new ProbeFailure('Returned malformed JSON, which this step cannot read.') }
}

async function messagesCall(key: TextAiCredential, model: string, maxTokens: number, prompt: string, system?: string): Promise<string> {
  const response = await textAiFetch(key, {
    method: 'POST',
    body: JSON.stringify({
      model,
      ...thinkingFields(model),
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  return await replyText(response)
}

const sample = (text: string) => text.replace(/\s+/gu, ' ').trim().slice(0, 140)

const STAGE_INSTRUCTIONS: Record<AiProbeStageId, string> = {
  podcast_research: 'In three sentences, describe this show\'s positioning, audience and format, and name its host.',
  host_info: 'Name every host of this show and the primary booking contact. Two sentences.',
  guest_info: 'Name the guest of each recent episode listed, or say it was a solo episode. One line per episode.',
  host_name_extractor: 'Return only the primary host\'s full name, nothing else.',
  find_topics: 'Propose two specific topics the client can credibly deliver on this show, one line each.',
  write_email: 'Write a short pitch from the agency to the host for the client. Return ONLY JSON: {"subject": string, "email_1": string, "follow_up_1": string, "follow_up_2": string}.',
  clean_email: `Shorten and polish this pitch, keeping its facts. Return ONLY JSON with the same keys.\n${JSON.stringify(FIXTURE_PITCH)}`,
}

async function probeStage(key: TextAiCredential, id: AiProbeStageId, model: string): Promise<string> {
  const shipped = RESEARCH_PROMPT_DEFAULTS[id]
  const text = await runResearchPrompt(
    key,
    { model, maxTokens: shipped.maxTokens, system: shipped.system },
    { context: FIXTURE_CONTEXT, instruction: STAGE_INSTRUCTIONS[id] },
    { input: 0, output: 0 },
  )
  if (id === 'write_email' || id === 'clean_email') {
    if (!parsePitchSequence(text)) throw new ProbeFailure('Did not return the pitch JSON (subject, email_1, follow-ups) this stage needs.')
  }
  if (id === 'host_name_extractor' && text.length > 120) throw new ProbeFailure('Returned more than a name; this stage expects only the name.')
  return text
}

async function probeStep(key: TextAiCredential, id: AiModelStepId, model: string): Promise<string> {
  switch (id) {
    case 'research_structure': {
      const text = await runResearchPrompt(
        key,
        { model, maxTokens: 1_500, system: 'You convert podcast research into strict JSON. Return ONLY a JSON object, no markdown.' },
        `From the context below, return ONLY this JSON shape: {"clean_description": string, "fit_reasons": string[] (3), "pitch_angles": [{"title": string, "description": string}] (exactly 3), "host_name": string or null, "recent_guest_name": string or null}.\n\n${FIXTURE_CONTEXT}`,
        { input: 0, output: 0 },
      )
      const parsed = jsonValue(text) as { pitch_angles?: unknown }
      if (!parsed || !Array.isArray(parsed.pitch_angles)) throw new ProbeFailure('Did not return the summary JSON with pitch angles.')
      return text
    }
    case 'pitch_fact_check': {
      const text = await runResearchPrompt(
        key,
        { model, maxTokens: 700, system: 'You audit outreach copy for factual grounding. Return ONLY JSON.' },
        `EVIDENCE (the only permitted source of claims):\n${FIXTURE_CONTEXT}\n\nOUTREACH SEQUENCE (JSON):\n${JSON.stringify(FIXTURE_PITCH)}\n\nList every specific factual claim in the sequence that is NOT supported by the evidence above. Respond ONLY with JSON: {"unsupported": [{"claim": string, "problem": string}]}. If everything is supported, return {"unsupported": []}.`,
        { input: 0, output: 0 },
      )
      const parsed = jsonValue(text) as { unsupported?: unknown }
      if (!parsed || !Array.isArray(parsed.unsupported)) throw new ProbeFailure('Did not return the {"unsupported": [...]} JSON this step reads.')
      // The fixture pitch carries one invented claim. Missing it is a quality
      // signal, not a format failure, so it is reported rather than failed.
      const caught = JSON.stringify(parsed.unsupported).toLowerCase().includes('nobel')
      return caught ? 'Caught the planted false claim.' : 'Ran, but missed the planted false claim (a Nobel Prize).'
    }
    case 'host_discovery': {
      const result = await discoverHostLinkedin(key, {
        podcast_name: 'The Tim Ferriss Show',
        description: 'Interviews with world-class performers about the tools and routines they use.',
        detected_hosts_not_confirmed: 'Tim Ferriss',
      }, { input: 0, output: 0, searches: 0 }, fetch, model)
      return result ? `Found ${result}` : 'Ran web search; found no confident profile.'
    }
    case 'fit_scoring': {
      const text = await messagesCall(key, model, 240 * FIXTURE_SHOWS.length + 200, groupScoringPrompt({
        targetLabel: 'client',
        profile: 'Priya Natarajan, founder of Ledgerline, a bookkeeping platform for agencies; bootstrapped to $4M ARR; speaks on cash-flow discipline.',
        podcasts: FIXTURE_SHOWS.map((podcast) => ({ podcast, episodes: [] })),
      }))
      const scores = parseGroupScores(text, FIXTURE_SHOWS.map((show) => show.podcast_id))
      if (scores.size < FIXTURE_SHOWS.length) throw new ProbeFailure('Did not return a readable score for every show.')
      return FIXTURE_SHOWS.map((show) => `${show.podcast_name}: ${scores.get(show.podcast_id)?.score}`).join(', ')
    }
    case 'search_queries': {
      const text = await messagesCall(key, model, Math.min(4000, 400 + 5 * 80),
        `Generate 5 podcast search queries to find shows where this guest would fit: ${FIXTURE_CONTEXT}\nReturn ONLY JSON: {"queries": ["query 1", "query 2", "query 3", "query 4", "query 5"]}`)
      const parsed = jsonValue(text) as { queries?: unknown }
      if (!parsed || !Array.isArray(parsed.queries) || !parsed.queries.some((entry) => typeof entry === 'string')) {
        throw new ProbeFailure('Did not return the {"queries": [...]} JSON this step reads.')
      }
      return text
    }
    case 'prospect_dashboard': {
      const text = await messagesCall(key, model, 8_192,
        `Rank these podcasts for the prospect below and explain each fit in one sentence.\n${FIXTURE_CONTEXT}\nPodcasts: ${JSON.stringify(FIXTURE_SHOWS.map((show, index) => ({ index, name: show.podcast_name, description: show.podcast_description })))}\nReturn ONLY a JSON array: [{"index": number, "score": number, "reason": string}]`)
      if (!Array.isArray(jsonValue(text))) throw new ProbeFailure('Did not return the JSON array of ranked shows this step reads.')
      return text
    }
    case 'autopilot': {
      const text = await messagesCall(key, model, 400,
        `Draft 3 distinct podcast-search queries (2-4 words each) to find interview podcasts where this person would be a strong guest:\n\nPriya Natarajan, founder of Ledgerline, bootstrapped bookkeeping platform for agencies.`,
        'You draft podcast search queries. Return ONLY a JSON array of strings.')
      if (!Array.isArray(jsonValue(text))) throw new ProbeFailure('Did not return the JSON array of queries autopilot reads, within its 400-token limit.')
      return text
    }
    case 'profile_drafts': {
      const text = await messagesCall(key, model, 2_500,
        `Draft the profile fields for this podcast guest. Return ONLY JSON with string fields {"positioning", "topics_and_angles", "listener_takeaways"}, 1-2 sentences each.\n\n${FIXTURE_CONTEXT}`,
        'You draft podcast-guest profiles for booking agencies. Return ONLY a JSON object, no markdown.')
      const parsed = jsonValue(text) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.values(parsed).some((value) => typeof value === 'string')) {
        throw new ProbeFailure('Did not return the profile JSON this step reads.')
      }
      return text
    }
  }
}

/** Runs one step's probe. Never throws: every outcome is a result the UI can show. */
export async function runAiStepProbe(key: TextAiCredential, id: AiProbeId, model: string): Promise<AiProbeResult> {
  const sentModel = textModel(credentialProvider(key), model)
  const started = Date.now()
  try {
    const text = isAiProbeStageId(id) ? await probeStage(key, id, model) : await probeStep(key, id, model)
    return { ok: true, model: sentModel, ms: Date.now() - started, detail: sample(text) }
  } catch (error) {
    const ms = Date.now() - started
    if (error instanceof ProbeFailure) return { ok: false, model: sentModel, ms, detail: error.message, code: 'FORMAT' }
    if (error instanceof HttpError) return { ok: false, model: sentModel, ms, detail: error.message, code: error.code }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return { ok: false, model: sentModel, ms, detail: 'Took longer than this step allows (90 seconds).', code: 'TIMEOUT' }
    }
    const message = error instanceof Error ? error.message : 'unknown error'
    return { ok: false, model: sentModel, ms, detail: `The request failed: ${message.slice(0, 200)}`, code: 'FAILED' }
  }
}
