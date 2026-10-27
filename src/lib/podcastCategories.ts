/*
 * How catalogue categories read on screen.
 *
 * The catalogue stores Podscan's category codes, which are Apple Podcasts'
 * categories split into lower-case words: "Society & Culture" arrives as
 * "society" and "culture", "Mental Health" as "mental" alongside "health".
 * Shown raw they read as "society", "mental", "self-improvement". Here each
 * code gets its proper name, and the halves of a split category become one
 * choice, so picking "Health & Fitness" finds a show tagged with either half
 * (on the catalogue they appear together 97-100% of the time).
 *
 * A filter value is the codes it covers joined with "|" ("health|fitness");
 * the catalogue function matches any of them.
 */

import { decodeFeedText } from '@/lib/feedText'

export interface CategoryChoice {
  /** What the filter sends: one code, or several joined with "|". */
  value: string
  label: string
  /** The catalogue codes this choice covers. */
  keys: string[]
}

interface CategoryDefinition {
  keys: string[]
  label: string
}

const DEFINITIONS: CategoryDefinition[] = [
  // Apple's "A & B" categories, split in two by the catalogue.
  { keys: ['society', 'culture'], label: 'Society & Culture' },
  { keys: ['health', 'fitness'], label: 'Health & Fitness' },
  { keys: ['religion', 'spirituality'], label: 'Religion & Spirituality' },
  { keys: ['kids', 'family'], label: 'Kids & Family' },
  { keys: ['tv', 'film'], label: 'TV & Film' },
  { keys: ['places', 'travel'], label: 'Places & Travel' },
  { keys: ['home', 'garden'], label: 'Home & Garden' },
  { keys: ['language', 'learning'], label: 'Language Learning' },
  { keys: ['personal', 'journals'], label: 'Personal Journals' },
  // Sub-categories whose code is only the first word.
  { keys: ['mental'], label: 'Mental Health' },
  { keys: ['alternative'], label: 'Alternative Health' },
  { keys: ['natural'], label: 'Natural Sciences' },
  { keys: ['earth'], label: 'Earth Sciences' },
  { keys: ['life'], label: 'Life Sciences' },
  { keys: ['social'], label: 'Social Sciences' },
  { keys: ['visual'], label: 'Visual Arts' },
  { keys: ['performing'], label: 'Performing Arts' },
  { keys: ['daily'], label: 'Daily News' },
  { keys: ['fantasy'], label: 'Fantasy Sports' },
  // Codes whose spelling only needs fixing.
  { keys: ['artificial-intelligence'], label: 'AI' },
  { keys: ['how-to'], label: 'How To' },
  { keys: ['non-profit'], label: 'Non-Profit' },
  { keys: ['self-improvement'], label: 'Self-Improvement' },
  { keys: ['personal-development'], label: 'Personal Development' },
  { keys: ['stand-up'], label: 'Stand-Up' },
  { keys: ['after-shows'], label: 'After Shows' },
  { keys: ['true crime'], label: 'True Crime' },
  { keys: ['esports'], label: 'Esports' },
]

/*
 * The categories a B2B client is pitched on, first in the filter and first on
 * a show's tags, in this order. Everything else follows alphabetically.
 */
const PROFESSIONAL_KEYS = [
  'business',
  'entrepreneurship',
  'marketing',
  'management',
  'leadership',
  'careers',
  'investing',
  'technology',
  'artificial-intelligence',
  'machine-learning',
  'programming',
  'non-profit',
  'self-improvement',
  'personal-development',
  'education',
  'courses',
  'how-to',
  'government',
]

const byKey = new Map<string, CategoryDefinition>()
for (const definition of DEFINITIONS) {
  for (const key of definition.keys) byKey.set(key, definition)
}

function normalizeKey(value: string): string {
  return decodeFeedText(value).replace(/\s+/gu, ' ').trim().toLowerCase()
}

/** "machine-learning" reads "Machine Learning" when nothing names it better. */
function titleCase(key: string): string {
  return key
    .split(/[-\s]+/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** The one choice a catalogue code belongs to. */
export function categoryChoice(key: string): CategoryChoice {
  const normalized = normalizeKey(key)
  const definition = byKey.get(normalized)
  if (definition) {
    return { value: definition.keys.join('|'), label: definition.label, keys: definition.keys }
  }
  return { value: normalized, label: titleCase(normalized), keys: [normalized] }
}

function professionalRank(choice: CategoryChoice): number {
  const ranks = choice.keys.map((key) => PROFESSIONAL_KEYS.indexOf(key)).filter((rank) => rank >= 0)
  return ranks.length > 0 ? Math.min(...ranks) : -1
}

/** Professional categories first, in their set order; the rest alphabetically. */
function compareChoices(left: CategoryChoice, right: CategoryChoice): number {
  const leftRank = professionalRank(left)
  const rightRank = professionalRank(right)
  if (leftRank >= 0 && rightRank >= 0) return leftRank - rightRank
  if (leftRank >= 0) return -1
  if (rightRank >= 0) return 1
  return left.label.localeCompare(right.label)
}

function uniqueChoices(keys: string[]): CategoryChoice[] {
  const seen = new Map<string, CategoryChoice>()
  for (const key of keys) {
    if (!key.trim()) continue
    const choice = categoryChoice(key)
    if (!seen.has(choice.value)) seen.set(choice.value, choice)
  }
  return Array.from(seen.values())
}

/** The Category filter's choices from the codes the catalogue holds, in two groups. */
export function categoryFilterGroups(keys: string[]): { professional: CategoryChoice[]; other: CategoryChoice[] } {
  const choices = uniqueChoices(keys).sort(compareChoices)
  return {
    professional: choices.filter((choice) => professionalRank(choice) >= 0),
    other: choices.filter((choice) => professionalRank(choice) < 0),
  }
}

/** A show's category tags, named, with split categories shown once, professional ones first. */
export function categoryDisplayNames(keys: string[]): string[] {
  return uniqueChoices(keys).sort(compareChoices).map((choice) => choice.label)
}

/**
 * The name for a filter value: a choice ("health|fitness"), a single code, or
 * an older address that carried a category as the catalogue spelled it.
 */
export function categoryFilterLabel(value: string): string {
  if (value === 'all') return 'Any category'
  const first = value.split('|')[0] ?? value
  return categoryChoice(first).label
}
