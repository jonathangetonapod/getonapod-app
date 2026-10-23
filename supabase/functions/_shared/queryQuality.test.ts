import { assert, assertEquals } from 'jsr:@std/assert@1'
import { assessProfile, filterQueries, queryProblem } from './queryQuality.ts'

const RICH_PROFILE = [
  'Dallas Fontaine is the founder of Perk, a B2B sales platform that helps SaaS companies build outbound pipeline.',
  'He has coached more than 200 revenue leaders on cold outreach, sales hiring and customer retention.',
  'Topics: founder-led sales, building an SDR team, pricing for early-stage startups, sales compensation.',
].join('\n')

// What the audit got back for this client, verbatim.
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

Deno.test('a profile with only a name and a one-line note is too thin to draft from', () => {
  const result = assessProfile('Dallas Fontaine. Founder.', 'Dallas Fontaine')
  assertEquals(result.status, 'profile_too_thin')
  if (result.status === 'profile_too_thin') assert(result.reason.length > 0 && !result.reason.includes('\n'))
})

Deno.test('an empty profile says there is nothing to draft from', () => {
  const result = assessProfile('', 'Dallas Fontaine')
  assertEquals(result.status, 'profile_too_thin')
})

Deno.test('a rich profile yields 3 to 6 usable queries, and none of the audit junk', () => {
  const profile = assessProfile(RICH_PROFILE, 'Dallas Fontaine')
  assertEquals(profile.status, 'ok')
  if (profile.status !== 'ok') return

  const modelOutput = [
    '"b2b sales" OR "revenue leadership"',
    '"saas * podcast" OR "founder * stories"',
    '"startup founders" OR "bootstrapped companies"',
    '"outbound * pipeline" OR "cold outreach"',
    '"sales hiring" OR "sdr team"',
    ...AUDIT_JUNK,
  ]
  const { queries, rejected } = filterQueries(modelOutput, profile.words, { limit: 6 })

  assert(queries.length >= 3 && queries.length <= 6, `expected 3 to 6 queries, got ${queries.length}`)
  for (const query of queries) assertEquals(queryProblem(query, profile.words), null)
  assertEquals(rejected.map((entry) => entry.query), AUDIT_JUNK)
})

Deno.test('a query that names nothing from the profile is rejected', () => {
  const profile = assessProfile(RICH_PROFILE, 'Dallas Fontaine')
  if (profile.status !== 'ok') throw new Error('rich profile should pass')
  assert(queryProblem('"gardening tips" OR "home cooking"', profile.words))
  assertEquals(queryProblem('"the startup podcast"', profile.words), null)
})

Deno.test('duplicates and avoided queries are dropped, and no query is invented', () => {
  const profile = assessProfile(RICH_PROFILE, 'Dallas Fontaine')
  if (profile.status !== 'ok') throw new Error('rich profile should pass')
  const { queries } = filterQueries(
    ['"b2b sales"', '"B2B Sales"', '"cold outreach"'],
    profile.words,
    { avoid: ['"cold outreach"'] },
  )
  assertEquals(queries, ['"b2b sales"'])
})
