import { assertEquals } from 'jsr:@std/assert@1'
import { followUpFormatFlags } from './pitchFollowUps.ts'

Deno.test('a follow-up laid out as greeting, paragraph, closing line passes', () => {
  const text = 'Hey David,\n\nA different way into the exit side of your show: the records founders can start early so a sale is not a scramble.\n\nWould that be closer to what you have planned?'
  assertEquals(followUpFormatFlags('follow_up_1', text), [])
})

Deno.test('a greeting run into one block is flagged for both problems', () => {
  const text = 'Hey David, Jim could also take a different route into the exit side of your show. Would either angle suit an upcoming episode?'
  assertEquals(followUpFormatFlags('follow_up_1', text), [
    'follow_up_1 must start with the greeting on its own line, then a blank line',
    'follow_up_1 is one block of text; use 2 short paragraphs separated by a blank line',
  ])
})

Deno.test('a greeting on its own line still needs two paragraphs after it', () => {
  const text = 'Hey Greg,\n\nIf an upcoming theme on succession is on your calendar, Jim can fit it. I will leave it with you.'
  assertEquals(followUpFormatFlags('follow_up_2', text), ['follow_up_2 is one block of text; use 2 short paragraphs separated by a blank line'])
})

Deno.test('stock openers are flagged wherever they appear', () => {
  const text = 'Hey Brady,\n\nOne more thought: Jim could cover what founders do with proceeds.\n\nDoes that fit?'
  assertEquals(followUpFormatFlags('follow_up_1', text), ['follow_up_1 uses a stock follow-up opener'])
})

Deno.test('an absent follow-up raises nothing', () => {
  assertEquals(followUpFormatFlags('follow_up_2', '  '), [])
})
