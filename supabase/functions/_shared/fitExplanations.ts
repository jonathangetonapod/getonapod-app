/**
 * The "why they fit" line a prospect reads under each show.
 *
 * Every featured show for one prospect used to get the same sentence with one
 * noun swapped, which reads as a mail merge and undoes the point of the page.
 * These are the checks a generated set has to pass before it is saved.
 */

export const MAX_FIT_EXPLANATION_CHARS = 220
export const MAX_FIT_EXPLANATION_SENTENCES = 2
/** A run of this many words shared by too many explanations is boilerplate. */
export const REPEATED_PHRASE_WORDS = 8
/** How many explanations may share one such run before it counts. */
export const REPEATED_PHRASE_MAX_SHARE = 2

export type FitExplanationProblem = 'empty' | 'too_long' | 'too_many_sentences' | 'category_label'

export function sentenceCount(text: string): number {
  return text
    .trim()
    // A decimal or an initial is not a sentence end.
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘])/u)
    .filter((sentence) => sentence.trim().length > 0)
    .length
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * Problems with one explanation on its own. Category labels are the feed's
 * taxonomy ("Clients", "Executive"); quoting them as the subject of a sentence
 * is how "covers Clients" ended up in front of prospects. Matched with the
 * label's own capitalisation, so "talks about clients" in prose still passes.
 */
export function fitExplanationProblems(
  text: string,
  categoryNames: string[] = [],
): FitExplanationProblem[] {
  const trimmed = text.trim()
  if (!trimmed) return ['empty']
  const problems: FitExplanationProblem[] = []
  if (trimmed.length > MAX_FIT_EXPLANATION_CHARS) problems.push('too_long')
  if (sentenceCount(trimmed) > MAX_FIT_EXPLANATION_SENTENCES) problems.push('too_many_sentences')
  const labelled = categoryNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .some((name) => new RegExp(`\\b(?:[Cc]overs|[Cc]overing|[Ff]ocuses on|[Aa]bout)\\s+${escapeRegExp(name)}\\b`, 'u').test(trimmed))
  if (labelled) problems.push('category_label')
  return problems
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean)
}

/**
 * Which explanations share a run of eight words with more than two others in
 * the set. Every explanation carrying an over-shared run is returned, since
 * any of them could be the one rewritten; the caller decides which.
 */
export function repeatedPhraseIndexes(
  texts: string[],
  phraseWords = REPEATED_PHRASE_WORDS,
  maxShare = REPEATED_PHRASE_MAX_SHARE,
): { indexes: number[]; phrases: string[] } {
  const owners = new Map<string, Set<number>>()
  texts.forEach((text, index) => {
    const tokens = words(text)
    for (let start = 0; start + phraseWords <= tokens.length; start += 1) {
      const phrase = tokens.slice(start, start + phraseWords).join(' ')
      const set = owners.get(phrase) || new Set<number>()
      set.add(index)
      owners.set(phrase, set)
    }
  })
  const indexes = new Set<number>()
  const phrases: string[] = []
  for (const [phrase, set] of owners) {
    if (set.size <= maxShare) continue
    phrases.push(phrase)
    set.forEach((index) => indexes.add(index))
  }
  return { indexes: [...indexes].sort((left, right) => left - right), phrases }
}

/** Every explanation that fails on its own or as part of the set. */
export function explanationsNeedingRewrite(
  items: Array<{ reason: string; categoryNames?: string[] }>,
): { indexes: number[]; phrases: string[] } {
  const repeated = repeatedPhraseIndexes(items.map((item) => item.reason))
  const indexes = new Set(repeated.indexes)
  items.forEach((item, index) => {
    if (fitExplanationProblems(item.reason, item.categoryNames).length > 0) indexes.add(index)
  })
  return { indexes: [...indexes].sort((left, right) => left - right), phrases: repeated.phrases }
}
