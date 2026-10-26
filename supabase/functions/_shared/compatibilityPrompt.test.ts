import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'

import {
  groupScoringPrompt,
  parseGroupScores,
  parseSingleScore,
  storedEpisodeTitles,
  targetProfile,
} from './compatibilityPrompt.ts'

Deno.test('the profile carries the pitch sections, not only the bio', () => {
  const profile = targetProfile('Taylor scales B2B SaaS teams.', [
    ['Notes', '  Prefers founder audiences.  '],
    ['Topics and angles', 'Founder-led sales\nPricing'],
    ['Proof points', ''],
    ['Positioning', null],
  ])
  assertStringIncludes(profile, 'Taylor scales B2B SaaS teams.')
  assertStringIncludes(profile, '- Notes: Prefers founder audiences.')
  assertStringIncludes(profile, '- Topics and angles: Founder-led sales Pricing')
  assert(!profile.includes('Proof points'))
  assert(!profile.includes('Positioning'))
})

Deno.test('the group prompt names every show by id and lists recent episodes', () => {
  const prompt = groupScoringPrompt({
    targetLabel: 'client',
    profile: 'Bio',
    podcasts: [
      { podcast: { podcast_id: 'pd-1', podcast_name: 'Founder Hour' }, episodes: [{ title: 'Selling without a sales team', posted_at: '2026-10-01T00:00:00Z' }] },
      { podcast: { podcast_id: 'pd-2', podcast_name: 'Quiet Craft' }, episodes: [] },
    ],
  })
  assertStringIncludes(prompt, '(id: pd-1)')
  assertStringIncludes(prompt, '(id: pd-2)')
  assertStringIncludes(prompt, '- Selling without a sales team (2026-10-01)')
  assertStringIncludes(prompt, 'Recent episodes: Not available')
})

Deno.test('parses a group answer, keeping only known ids and on-scale scores', () => {
  const scores = parseGroupScores(
    '```json\n[{"id":"pd-1","score":8.5,"reasoning":"Strong."},{"id":"pd-9","score":7},{"id":"pd-2","score":14},{"id":"pd-3","score":"6"}]\n```',
    ['pd-1', 'pd-2', 'pd-3'],
  )
  assertEquals([...scores.keys()], ['pd-1', 'pd-3'])
  assertEquals(scores.get('pd-1'), { score: 8.5, reasoning: 'Strong.' })
  assertEquals(scores.get('pd-3'), { score: 6, reasoning: null })
})

Deno.test('a group answer that is not JSON scores nothing, so every show falls back', () => {
  assertEquals(parseGroupScores('I would rate these highly.', ['pd-1']).size, 0)
  assertEquals(parseGroupScores('{"id":"pd-1","score":8}', ['pd-1']).size, 0)
})

Deno.test('parses a single answer, or a bare score without reasoning', () => {
  assertEquals(parseSingleScore('{"score": 7, "reasoning": "Good overlap."}'), { score: 7, reasoning: 'Good overlap.' })
  assertEquals(parseSingleScore('Score: 9 out of ten'), { score: 9, reasoning: null })
  assertEquals(parseSingleScore('No idea.'), null)
})

Deno.test('reads stored episodes defensively', () => {
  assertEquals(storedEpisodeTitles(null), [])
  assertEquals(storedEpisodeTitles([{ title: 'One', posted_at: '2026-01-01' }, { title: '' }, 'junk', { posted_at: 'x' }]), [
    { title: 'One', posted_at: '2026-01-01' },
  ])
})
