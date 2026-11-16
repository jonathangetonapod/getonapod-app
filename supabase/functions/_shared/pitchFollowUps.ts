/**
 * Layout rules for the two follow-up emails, checked in code.
 *
 * The prompt asks for them, but a workspace can rewrite the prompt and a model
 * can ignore it: follow-ups used to arrive as one block with the greeting run
 * into the first sentence, every one opening "one more thought". A flag here
 * sends the sequence through the revision pass, and anything still wrong is
 * shown to the operator.
 */

const STOCK_OPENERS =
  /\b(one more (thought|idea|thing)|just following up|following up on|circling back|checking in|bumping this|wanted to follow up|quick follow[- ]up)\b/iu

export function followUpFormatFlags(key: 'follow_up_1' | 'follow_up_2', text: string): string[] {
  const body = text.replace(/\r\n/gu, '\n').trim()
  if (!body) return []
  const flags: string[] = []
  const blocks = body.split(/\n\s*\n/u).map((block) => block.trim()).filter(Boolean)
  // The greeting is a short first block of its own: "Hey Dana," and nothing else.
  const greetingAlone = blocks.length > 1 && !blocks[0].includes('\n') && blocks[0].length <= 60 && /,$/u.test(blocks[0])
  if (!greetingAlone) flags.push(`${key} must start with the greeting on its own line, then a blank line`)
  if (blocks.length < (greetingAlone ? 3 : 2)) flags.push(`${key} is one block of text; use 2 short paragraphs separated by a blank line`)
  if (STOCK_OPENERS.test(body)) flags.push(`${key} uses a stock follow-up opener`)
  return flags
}
