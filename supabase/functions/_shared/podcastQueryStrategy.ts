/*
 * Guards around the AI search strategy. The old deterministic fallback ranked
 * bio words by frequency with a stoplist that missed "and", "the", "for" and
 * "his", so on a long bio it shipped "and the" and "the" OR "for" as searches
 * and charged for them. Nothing here generates queries any more: it decides
 * whether a profile is worth asking about, and which model output to keep.
 */

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'been', 'before', 'being', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'even', 'every', 'few', 'for', 'from', 'further', 'get', 'got', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'just', 'like', 'make', 'many', 'may', 'me', 'more', 'most', 'much', 'must', 'my', 'new', 'no',
  'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'one', 'only', 'or', 'other', 'our', 'ours', 'out',
  'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until',
  'up', 'us', 'very', 'was', 'way', 'we', 'well', 'were', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'will', 'with', 'would', 'yet', 'you', 'your', 'yours',
  // Boolean operators read as words once lowercased.
  'and', 'not',
])

/** Words every podcast title could carry; they say nothing about the topic. */
const GENERIC_SHOW_WORDS = new Set([
  'podcast', 'podcasts', 'show', 'shows', 'episode', 'episodes', 'interview', 'interviews', 'conversation',
  'conversations', 'talk', 'talks', 'stories', 'story', 'radio', 'hour', 'weekly', 'daily',
])

/*
 * Words a real title phrase does not open with. "the" is left out on purpose:
 * plenty of shows are "The Something Podcast". The fallback's template slots
 * produced "his leaders", "that growth" and "you leaders".
 */
const DANGLING_PHRASE_START = new Set([
  'and', 'or', 'but', 'for', 'of', 'with', 'that', 'this', 'these', 'those', 'his', 'her', 'hers', 'their',
  'its', 'our', 'my', 'your', 'you', 'he', 'she', 'they', 'we', 'it', 'him', 'them',
])

/** Fewer distinct topic words than this and the model has nothing to work from. */
export const MIN_PROFILE_TOPIC_WORDS = 15
export const MIN_USABLE_QUERIES = 3

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9][a-z0-9+&'-]*/gu)?.map((token) => token.replace(/['-]+$/u, '')) ?? []
}

function isTopicWord(token: string): boolean {
  return token.length >= 2 && !STOPWORDS.has(token) && !GENERIC_SHOW_WORDS.has(token) && !/^\d+$/u.test(token)
}

/** Distinct topic words in a profile, ignoring the person's own name. */
export function profileTopicWords(profile: string, name?: string | null): Set<string> {
  const nameTokens = new Set(tokens(name ?? ''))
  return new Set(tokens(profile).filter((token) => isTopicWord(token) && !nameTokens.has(token)))
}

export interface ProfileAssessment {
  thin: boolean
  topicWordCount: number
  /** One line, for logs and the API response. Empty when the profile is fine. */
  reason: string
}

export function assessProfile(profile: string | null | undefined, name?: string | null): ProfileAssessment {
  const topicWordCount = profileTopicWords(profile ?? '', name).size
  if (topicWordCount >= MIN_PROFILE_TOPIC_WORDS) return { thin: false, topicWordCount, reason: '' }
  return {
    thin: true,
    topicWordCount,
    reason: topicWordCount === 0
      ? 'The profile has no bio, topics or talking points.'
      : `The profile has ${topicWordCount} topic word${topicWordCount === 1 ? '' : 's'}; a strategy needs at least ${MIN_PROFILE_TOPIC_WORDS}.`,
  }
}

/*
 * Light stemming so "founders" in a query matches "founder" in a bio, and
 * "entrepreneurship" matches "entrepreneur": drop a plural s, then compare on
 * the first five letters of longer words, the whole word otherwise.
 */
function stem(token: string): string {
  const singular = token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token
  return singular.length > 5 ? singular.slice(0, 5) : singular
}

export function vocabularyOf(profile: string | null | undefined, name?: string | null): Set<string> {
  return new Set([...profileTopicWords(profile ?? '', name)].map(stem))
}

export type QueryRejection = 'empty' | 'stopword_phrase' | 'off_profile'

/**
 * Why a query should not run, or null when it can. A query is rejected when
 * any quoted phrase carries no topic word ("the" OR "for", "for * podcast"),
 * reads as a template fragment ("his leaders", "growth for"), or when nothing
 * in it ties back to the profile.
 */
export function rejectQuery(query: string, vocabulary: Set<string>): QueryRejection | null {
  const trimmed = query.trim()
  if (!trimmed) return 'empty'
  const phrases = [...trimmed.matchAll(/"([^"]*)"/gu)].map((match) => match[1])
  for (const phrase of phrases) {
    const words = tokens(phrase)
    if (!words.some(isTopicWord)) return 'stopword_phrase'
    if (DANGLING_PHRASE_START.has(words[0]) || STOPWORDS.has(words[words.length - 1])) return 'stopword_phrase'
  }
  const topicTokens = tokens(trimmed).filter(isTopicWord)
  if (topicTokens.length === 0) return 'stopword_phrase'
  if (!topicTokens.some((token) => vocabulary.has(stem(token)))) return 'off_profile'
  return null
}

export interface FilteredQueries {
  kept: string[]
  rejected: Array<{ query: string; reason: QueryRejection }>
}

/** Keeps usable, distinct queries in order, up to `limit`. */
export function filterQueries(
  candidates: unknown[],
  vocabulary: Set<string>,
  limit: number,
  avoid: string[] = [],
): FilteredQueries {
  const seen = new Set(avoid.map((entry) => entry.trim().toLowerCase()))
  const kept: string[] = []
  const rejected: FilteredQueries['rejected'] = []
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const query = candidate.trim()
    const key = query.toLowerCase()
    if (!query || seen.has(key)) continue
    seen.add(key)
    const reason = rejectQuery(query, vocabulary)
    if (reason) rejected.push({ query, reason })
    else if (kept.length < limit) kept.push(query)
  }
  return { kept, rejected }
}
