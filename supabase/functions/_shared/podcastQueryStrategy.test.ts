import { assert, assertEquals } from 'jsr:@std/assert@1'
import {
  assessProfile,
  filterQueries,
  MIN_USABLE_QUERIES,
  rejectQuery,
  vocabularyOf,
} from './podcastQueryStrategy.ts'

// The shape of the audited client: name, contact details, nothing to search on.
const THIN_PROFILE = 'Dana Example. dana@example.com. https://example.com'

const RICH_PROFILE = `Dana Example founded a B2B SaaS sales consultancy and sold her first company,
a workplace perks platform, after scaling it past $15M in revenue. She now advises founders on
outbound sales, revenue operations and AI implementation for small sales teams. Her talking points:
building a sales playbook before hiring reps, pricing for early-stage SaaS, using AI agents to
qualify leads, and what acquirers look for in a bootstrapped startup. Audience: founders, sales
leaders and operators at seed to Series B companies.`

/*
 * What the deterministic fallback shipped for the audited client: a template
 * whose slot words were function words.
 */
const AUDIT_JUNK = [
  '"and the"',
  '"the" OR "for"',
  '"for * podcast" OR "his * stories"',
  '"his leaders" OR "that growth"',
  '"that * business" OR "sales innovation"',
  '"how perk"',
  '"perk" OR "companies"',
  '"you leaders" OR "b2b growth"',
]

// A realistic model answer for the rich profile, with two bad entries mixed in.
const MODEL_ANSWER = [
  '"B2B sales" OR "SaaS sales" OR "revenue operations"',
  '"startup * podcast" OR "founder * stories"',
  '"sales leaders" OR "sales playbook"',
  '"AI agents" OR "AI implementation" OR "sales automation"',
  '"bootstrapped startup" OR "startup acquisition"',
  '"the" OR "for"',
  '"gardening tips" OR "home cooking"',
]

Deno.test('a profile with no bio, topics or talking points is too thin', () => {
  const assessment = assessProfile(THIN_PROFILE, 'Dana Example')
  assertEquals(assessment.thin, true)
  assert(assessment.reason.length > 0)
  assertEquals(assessProfile('', 'Dana Example').reason, 'The profile has no bio, topics or talking points.')
  assertEquals(assessProfile(null).thin, true)
})

Deno.test('a profile with real positioning is not thin', () => {
  const assessment = assessProfile(RICH_PROFILE, 'Dana Example')
  assertEquals(assessment.thin, false)
  assertEquals(assessment.reason, '')
})

Deno.test('every query the fallback produced in the audit is rejected', () => {
  const vocabulary = vocabularyOf(RICH_PROFILE, 'Dana Example')
  for (const query of AUDIT_JUNK.filter((entry) => !/perk/u.test(entry))) {
    assertEquals(rejectQuery(query, vocabulary), 'stopword_phrase', query)
  }
})

Deno.test('a phrase of stopwords sinks the query even beside a good one', () => {
  const vocabulary = vocabularyOf(RICH_PROFILE)
  assertEquals(rejectQuery('"B2B sales" OR "the"', vocabulary), 'stopword_phrase')
  assertEquals(rejectQuery('"for * podcast"', vocabulary), 'stopword_phrase')
  assertEquals(rejectQuery('"his leaders" OR "B2B sales"', vocabulary), 'stopword_phrase')
  assertEquals(rejectQuery('"sales for"', vocabulary), 'stopword_phrase')
  // A leading article is how plenty of real titles start.
  assertEquals(rejectQuery('"the sales podcast"', vocabulary), null)
})

Deno.test('a query with nothing from the profile is rejected', () => {
  const vocabulary = vocabularyOf(RICH_PROFILE)
  assertEquals(rejectQuery('"gardening tips" OR "home cooking"', vocabulary), 'off_profile')
  // Stemmed: "founders" in a query matches "founder" in the bio.
  assertEquals(rejectQuery('"founders journey"', vocabulary), null)
})

Deno.test('a rich profile keeps 3 to 6 queries, none of them stopword-only', () => {
  const vocabulary = vocabularyOf(RICH_PROFILE, 'Dana Example')
  const { kept, rejected } = filterQueries(MODEL_ANSWER, vocabulary, 6)
  assert(kept.length >= MIN_USABLE_QUERIES && kept.length <= 6, `kept ${kept.length}`)
  for (const query of kept) assertEquals(rejectQuery(query, vocabulary), null, query)
  assertEquals(rejected.map((entry) => entry.reason).sort(), ['off_profile', 'stopword_phrase'])
})

Deno.test('filtering drops duplicates, already-searched queries and non-strings, and honours the limit', () => {
  const vocabulary = vocabularyOf(RICH_PROFILE)
  const { kept } = filterQueries(
    ['"B2B sales"', '"b2b SALES"', 42, null, '"sales playbook"', '"revenue operations"', '"SaaS pricing"'],
    vocabulary,
    2,
    ['"sales playbook"'],
  )
  assertEquals(kept, ['"B2B sales"', '"revenue operations"'])
})
