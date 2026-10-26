// Prompts and parsing for score-podcast-compatibility.
//
// Two things changed what a score is worth. The model used to see the bio and
// nothing else about the client, and the podcast description and nothing else
// about the show: a description says what a show hopes to be, while its recent
// episode titles say who it actually books. And every podcast was its own
// call, with the whole profile repeated twenty times and each show judged in
// isolation, so a 7 in one call and a 7 in the next were not comparable.
// Scoring a group in one call shares the profile and lets the model rank the
// shows against each other.

export interface ScoringPodcast {
  podcast_id: string
  podcast_name: string
  podcast_description?: string | null
  publisher_name?: string | null
  podcast_categories?: Array<{ category_name: string }> | null
  audience_size?: number | null
  episode_count?: number | null
}

export interface ScoringEpisode {
  title: string
  posted_at?: string | null
}

export interface ParsedScore {
  score: number
  reasoning: string | null
}

/** Podcasts per model call. Twenty fit, but ten keeps each answer short and reliable. */
export const SCORING_GROUP_SIZE = 10
const MAX_EPISODES_PER_SHOW = 5
const MAX_SECTION_CHARS = 2_000

/**
 * The bio plus whatever else the workspace wrote about the target: notes and
 * the structured pitch profile, where positioning and topics live. The same
 * sections the search strategy is drafted from, bounded the same way.
 */
export function targetProfile(bio: string, sections: Array<[string, unknown]> = []): string {
  const extra = sections
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '')
    .map(([label, value]) => `- ${label}: ${value.replace(/\s+/gu, ' ').trim().slice(0, MAX_SECTION_CHARS)}`)
    .join('\n')
  return [bio.trim(), extra ? `Also on file:\n${extra}` : ''].filter(Boolean).join('\n\n')
}

function showBlock(podcast: ScoringPodcast, episodes: ScoringEpisode[]): string {
  const recent = episodes.slice(0, MAX_EPISODES_PER_SHOW)
    .map((episode) => `  - ${episode.title.replace(/\s+/gu, ' ').trim().slice(0, 200)}${episode.posted_at ? ` (${episode.posted_at.slice(0, 10)})` : ''}`)
    .join('\n')
  return [
    `Podcast Name: ${podcast.podcast_name}`,
    `Host/Publisher: ${podcast.publisher_name || 'Unknown'}`,
    `Description: ${(podcast.podcast_description || 'No description available').slice(0, 1_500)}`,
    `Categories: ${podcast.podcast_categories?.map((category) => category.category_name).join(', ') || 'None'}`,
    `Audience Size: ${podcast.audience_size ? podcast.audience_size.toLocaleString() : 'Unknown'}`,
    `Episodes: ${podcast.episode_count || 'Unknown'}`,
    `Recent episodes: ${recent ? `\n${recent}` : 'Not available'}`,
  ].join('\n')
}

const GUIDELINES = (target: string) => `Scoring Guidelines:
- 9-10: Perfect match - ${target}'s expertise directly aligns with the podcast's focus and audience, and recent episodes book guests like them
- 7-8: Strong match - related topics, good audience overlap
- 5-6: Moderate match - some relevance but not ideal
- 3-4: Weak match - tangentially related
- 1-2: Poor match - not relevant

Recent episode titles are the best evidence of who a show actually books. Where they are listed, weigh them above the description. Where they are not available, say so only if it limits the judgement.`

/** One call for a group of shows, answered as a JSON array keyed by the given ids. */
export function groupScoringPrompt(input: {
  targetLabel: 'client' | 'prospect'
  profile: string
  podcasts: Array<{ podcast: ScoringPodcast; episodes: ScoringEpisode[] }>
}): string {
  const shows = input.podcasts
    .map(({ podcast, episodes }, index) => `### Show ${index + 1} (id: ${podcast.podcast_id})\n${showBlock(podcast, episodes)}`)
    .join('\n\n')
  return `You are a podcast booking expert. Rate the compatibility (1-10) between this ${input.targetLabel} and each podcast below.

${input.targetLabel === 'prospect' ? 'Prospect' : 'Client'} profile:
${input.profile}

${shows}

${GUIDELINES(input.targetLabel)}

Judge every show on its own merits, but use the same scale across all of them: two shows with the same score should be equally good fits.

Return ONLY a JSON array with one object per show, in any order, using the exact ids above:
[{"id": "<id>", "score": <number 1-10>, "reasoning": "<2-3 sentences explaining why this score>"}]
No markdown, no code blocks, just the raw JSON array.`
}

/** The single-show prompt, kept for shows a group answer left out. */
export function singleScoringPrompt(input: {
  targetLabel: 'client' | 'prospect'
  profile: string
  podcast: ScoringPodcast
  episodes: ScoringEpisode[]
}): string {
  return `You are a podcast booking expert. Rate the compatibility (1-10) between this ${input.targetLabel} and podcast.

${input.targetLabel === 'prospect' ? 'Prospect' : 'Client'} profile:
${input.profile}

Podcast Information:
${showBlock(input.podcast, input.episodes)}

${GUIDELINES(input.targetLabel)}

Return your answer as JSON in this exact format:
{
  "score": <number 1-10>,
  "reasoning": "<2-3 sentences explaining why this score>"
}

CRITICAL: Your response must be ONLY valid JSON. No markdown, no code blocks, just the raw JSON object.`
}

function stripFences(text: string): string {
  const trimmed = text.trim()
  return trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\n?/u, '').replace(/\n?```$/u, '').trim()
    : trimmed
}

function validScore(value: unknown): number | null {
  const score = typeof value === 'string' ? Number.parseFloat(value) : value
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  return score >= 1 && score <= 10 ? Math.round(score * 10) / 10 : null
}

function validReasoning(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1_000) : null
}

/**
 * Scores from a group answer, keyed by id. Ids the answer does not mention,
 * names it invented, and scores off the 1-10 scale are all simply absent, so
 * the caller falls back for exactly those shows.
 */
export function parseGroupScores(text: string, expectedIds: string[]): Map<string, ParsedScore> {
  const scores = new Map<string, ParsedScore>()
  const body = stripFences(text)
  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start === -1 || end <= start) return scores
  let parsed: unknown
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    return scores
  }
  if (!Array.isArray(parsed)) return scores
  const expected = new Set(expectedIds)
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : String(record.id ?? '')
    const score = validScore(record.score)
    if (!expected.has(id) || score === null || scores.has(id)) continue
    scores.set(id, { score, reasoning: validReasoning(record.reasoning) })
  }
  return scores
}

/** A single-show answer: the JSON object, or a bare score with no reasoning. */
export function parseSingleScore(text: string): ParsedScore | null {
  const body = stripFences(text)
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const score = validScore(parsed?.score)
    if (score !== null) return { score, reasoning: validReasoning(parsed.reasoning) }
  } catch {
    // Fall through to the bare-number reading below.
  }
  const match = body.match(/\b(10|[1-9])\b/u)
  return match ? { score: Number.parseInt(match[1], 10), reasoning: null } : null
}

/** Stored recent_episodes rows, reduced to what the prompt shows. */
export function storedEpisodeTitles(value: unknown): ScoringEpisode[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((episode) => {
    if (!episode || typeof episode !== 'object') return []
    const record = episode as Record<string, unknown>
    if (typeof record.title !== 'string' || !record.title.trim()) return []
    return [{ title: record.title, posted_at: typeof record.posted_at === 'string' ? record.posted_at : null }]
  })
}
