/**
 * What makes a podcast search strategy worth a credit.
 *
 * The strategy used to fall back to a template that paired the most frequent
 * words in the bio, which on ordinary prose are "and", "the", "for" and "his",
 * and shipped results like `"his leaders" OR "that growth"` as if the model had
 * written them. Two checks replace that: a profile too thin to draft from is
 * refused before anything is charged, and every query the model returns has to
 * name something from the profile and contain no phrase made of function words.
 */

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'been', 'before', 'being', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'even', 'every', 'few', 'for', 'from', 'further', 'get', 'gets', 'had', 'has',
  'have', 'having', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'just', 'more', 'most', 'my', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'our', 'ours', 'out', 'over', 'own', 'same', 'she', 'should', 'so', 'some', 'such', 'than',
  'that', 'the', 'their', 'theirs', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'you', 'your', 'yours',
])

// "The" and "a" can open a real show title ("the startup podcast"); every
// other function word at the edge of a phrase is a fragment, not a search.
const LEADING_OK = new Set(['a', 'an', 'the'])

// Words that say what a podcast is, not what it is about. They never count as
// the topic of a query.
const FORMAT_WORDS = new Set([
  'podcast', 'podcasts', 'show', 'shows', 'interview', 'interviews', 'story', 'stories', 'conversation',
  'conversations', 'episode', 'episodes', 'talk', 'talks', 'radio', 'weekly', 'daily', 'live',
])

const OPERATORS = new Set(['and', 'or', 'not'])

/** A profile with fewer distinct descriptive words than this is too thin to draft from. */
export const MIN_PROFILE_WORDS = 12

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9][a-z0-9'+-]*/gu) || []
}

function stem(word: string): string {
  return word.length >= 4 ? word.slice(0, 5) : word
}

/** Distinct descriptive words in the profile, leaving out the client's own name. */
export function profileWords(profile: string, name?: string | null): Set<string> {
  const nameWords = new Set(words(name || ''))
  return new Set(
    words(profile).filter((word) => word.length >= 3 && !STOPWORDS.has(word) && !nameWords.has(word)),
  )
}

export type ProfileAssessment =
  | { status: 'ok'; words: Set<string> }
  | { status: 'profile_too_thin'; reason: string }

export function assessProfile(profile: string, name?: string | null): ProfileAssessment {
  const descriptive = profileWords(profile, name)
  if (descriptive.size < MIN_PROFILE_WORDS) {
    return {
      status: 'profile_too_thin',
      reason: descriptive.size === 0
        ? 'The profile has no bio, topics or talking points.'
        : `The profile has only ${descriptive.size} descriptive words. It needs a bio, topics or talking points.`,
    }
  }
  return { status: 'ok', words: descriptive }
}

/** Why a query was rejected, or null when it is usable. */
export function queryProblem(query: string, profile: Set<string>): string | null {
  const phrases = [...query.matchAll(/"([^"]*)"/gu)].map((match) => match[1])
  const bare = words(query.replace(/"[^"]*"/gu, ' ')).filter((word) => !OPERATORS.has(word))

  for (const phrase of phrases) {
    const phraseWords = words(phrase)
    if (phraseWords.length === 0) return `empty phrase in ${query}`
    if (phraseWords.every((word) => STOPWORDS.has(word) || FORMAT_WORDS.has(word))) {
      return `"${phrase}" is only function words`
    }
    const first = phraseWords[0]
    const last = phraseWords[phraseWords.length - 1]
    if ((STOPWORDS.has(first) && !LEADING_OK.has(first)) || STOPWORDS.has(last)) {
      return `"${phrase}" starts or ends on a function word`
    }
  }

  // `"perk" OR "companies"`: every term a single word, which the prompt already
  // forbids, and which matches every show that says "companies" once.
  const terms = [...phrases, ...bare]
  if (terms.length > 0 && terms.every((term) => words(term).length <= 1)) {
    return `only one-word terms in ${query}`
  }

  const profileStems = new Set([...profile].map(stem))
  const topical = [...phrases.flatMap(words), ...bare].some((word) => (
    word.length >= 3
    && !STOPWORDS.has(word)
    && !FORMAT_WORDS.has(word)
    && (profile.has(word) || profileStems.has(stem(word)))
  ))
  if (!topical) return `no topic from the profile in ${query}`
  return null
}

export interface StrategyResult {
  queries: string[]
  rejected: Array<{ query: string; problem: string }>
}

/**
 * Keeps the model's usable queries, in order and without duplicates or
 * anything the caller asked to avoid. Never invents a query to make up a count.
 */
export function filterQueries(
  candidates: string[],
  profile: Set<string>,
  options: { avoid?: string[]; limit?: number } = {},
): StrategyResult {
  const avoid = new Set((options.avoid || []).map((entry) => entry.trim().toLowerCase()))
  const seen = new Set<string>()
  const queries: string[] = []
  const rejected: StrategyResult['rejected'] = []
  for (const raw of candidates) {
    const query = raw.trim()
    const key = query.toLowerCase()
    if (!query || seen.has(key) || avoid.has(key)) continue
    seen.add(key)
    const problem = queryProblem(query, profile)
    if (problem) rejected.push({ query, problem })
    else queries.push(query)
  }
  return { queries: queries.slice(0, options.limit ?? queries.length), rejected }
}
