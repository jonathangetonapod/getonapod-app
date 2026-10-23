import { assertEquals } from 'jsr:@std/assert@1'

import {
  explanationsNeedingRewrite,
  fitExplanationProblems,
  repeatedPhraseIndexes,
  sentenceCount,
} from './fitExplanations.ts'

Deno.test('counts sentences without splitting decimals', () => {
  assertEquals(sentenceCount('Rated 4.8 by founders. Bring the pricing story.'), 2)
  assertEquals(sentenceCount('One. Two. Three.'), 3)
})

Deno.test('flags long, wordy and category-labelled explanations', () => {
  assertEquals(fitExplanationProblems('Short and specific. One angle.'), [])
  assertEquals(fitExplanationProblems('x'.repeat(221)), ['too_long'])
  assertEquals(fitExplanationProblems('One. Two. Three.'), ['too_many_sentences'])
  assertEquals(fitExplanationProblems('This show covers Clients for agencies.', ['Clients']), ['category_label'])
  assertEquals(fitExplanationProblems('Hosts interview agency owners about clients.', ['Clients']), [])
  assertEquals(fitExplanationProblems('  '), ['empty'])
})

const template = (show: string, topic: string) =>
  `${show} covers ${topic}, which overlaps with Tyler Brennan's experience in peak performance and productivity.`

Deno.test('finds an eight-word run shared by more than two explanations', () => {
  const texts = [
    template('A', 'mindset'),
    template('B', 'habits'),
    template('C', 'leadership'),
    'A founder-led show about bootstrapped SaaS. Bring the pricing teardown.',
  ]
  const result = repeatedPhraseIndexes(texts)
  assertEquals(result.indexes, [0, 1, 2])
  assertEquals(result.phrases.includes("overlaps with tyler brennans experience in peak performance"), true)
})

Deno.test('two explanations may share a run', () => {
  assertEquals(repeatedPhraseIndexes([template('A', 'x'), template('B', 'y')]).indexes, [])
})

Deno.test('combines per-item and set-wide problems', () => {
  const result = explanationsNeedingRewrite([
    { reason: 'Interviews operators scaling past ten million. Bring the hiring playbook.' },
    { reason: 'This one covers Executive topics.', categoryNames: ['Executive'] },
  ])
  assertEquals(result.indexes, [1])
})
