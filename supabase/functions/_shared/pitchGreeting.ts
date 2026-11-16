/**
 * Who the emails greet is the pitch writer's decision. This file gives it the
 * evidence to decide with, and protects the decision once made.
 *
 * It was left implicit before: the writer saw one "Host:" line, the claim
 * audit saw a research report saying "the host's name is not confirmed",
 * flagged "Hey Jonathan," as unsupported, and the revision pass replaced it
 * with "Hi there,". So the evidence is now laid out in one block (the host
 * record and where it came from, the publisher, recent guests, the address),
 * the audit leaves the greeting to the writer, and a revision that blanks a
 * name the writer chose has that name put back.
 *
 * Code decides nothing here. resolveGreetingName is offered to the writer as
 * one reading of a messy record, not applied.
 */

/** Words that mark a publisher, brand or placeholder rather than a person. */
const NOT_A_PERSON =
  /\b(podcasts?|show|studios?|networks?|media|radio|team|group|inc|llc|ltd|company|productions?|partners|franchises|institute|university|magazine|the|unknown|unavailable|various|n\/a|none|host|hosts|admin|staff|editors?|official|tv|fm|co)\b/iu

/** Titles and ranks nobody is greeted by. */
const TITLE = /^(dr|mr|mrs|ms|mx|prof|professor|sir|dame|rev|reverend|pastor|rabbi|coach|colonel|col|captain|capt|major|maj|general|gen|lt|sgt|judge|hon|senator|sen)\.?$/iu

/** "Hosted by Jane Doe", "Host: Jane Doe". */
const LEADING_LABEL = /^\s*(hosted by|host(s)?\s*[:\-]|with)\s+/iu

function normalise(value: string): string {
  return value.normalize('NFKC').replace(/[‘’]/gu, "'").trim()
}

/** Lower-cased words of a name with titles, initials and suffixes removed, for comparing two spellings of a person. */
function nameKey(person: string): string[] {
  return normalise(person)
    .replace(/["“”()]/gu, ' ')
    .split(/\s+/u)
    .map((word) => word.replace(/[.,]/gu, '').toLowerCase())
    .filter((word) => word.length > 1 && !TITLE.test(word) && !/^(jr|sr|ii|iii|iv|phd|md|cpa|esq|mba)$/u.test(word))
}

/**
 * Whether two names are the same person. Feeds and transcripts spell names
 * differently ("Karen Prangley" / "Karin Prangley"), so a shared surname with
 * first names that start alike counts.
 */
export function samePerson(left: string, right: string): boolean {
  const a = nameKey(left)
  const b = nameKey(right)
  if (a.length === 0 || b.length === 0) return false
  if (a.join(' ') === b.join(' ')) return true
  if (a.length < 2 || b.length < 2) return false
  const sameSurname = a[a.length - 1] === b[b.length - 1]
  return sameSurname && a[0].slice(0, 3) === b[0].slice(0, 3)
}

function firstName(person: string): string | null {
  // A nickname in quotes or brackets is not the given name: Robert "Bob" Smith.
  const cleaned = normalise(person).replace(/["“”][^"“”]*["“”]|\([^)]*\)/gu, ' ')
  const words = cleaned.split(/\s+/u).filter(Boolean)
  if (words.length === 0 || words.length > 5) return null
  if (NOT_A_PERSON.test(cleaned)) return null
  let index = 0
  while (index < words.length && TITLE.test(words[index])) index += 1
  let given = words[index]
  if (!given) return null
  // A feed in capitals is still a person: JONATHAN GOLDHILL. Short all-caps
  // words are left as initials (JV, MC).
  if (given.length > 3 && given === given.toUpperCase() && /^\p{L}+$/u.test(given)) {
    given = given[0] + given.slice(1).toLowerCase()
  }
  if (!/^\p{Lu}[\p{L}'.-]*$/u.test(given)) return null
  // A bare initial is not a greeting: "J. Smith" gives nothing, "M.C." stays.
  if (/^\p{Lu}\.?$/u.test(given)) return null
  return given
}

export interface GreetingInput {
  /** The host as recorded: an operator's entry on the campaign, else the catalogue's. */
  hostName: string | null | undefined
  /**
   * True when a person typed the host name. Their entry is taken as written,
   * co-hosts included; a catalogue record is narrowed to one person first.
   */
  operatorEntered?: boolean
  /** Guests of recent episodes. Podcast directories often list the latest guest as a co-host. */
  guestNames?: ReadonlyArray<string | null | undefined>
  /** The address the email goes to, used to tell which listed person it reaches. */
  toEmail?: string | null
}

function splitPeople(record: string): string[] {
  let people = record.split(/\s*(?:&|\+|,|;|\/|\band\b)\s*/iu).map((part) => part.trim()).filter(Boolean)
  // "Smith, Jane" is one person written surname-first, not two hosts.
  if (people.length === 2 && !/\s/u.test(people[0]) && !/\s/u.test(people[1]) && /,/u.test(record) && !/&|\band\b/iu.test(record)) {
    people = [`${people[1]} ${people[0]}`]
  }
  // Suffixes split off by the comma: "Ed Weeks, Jr."
  return people.filter((part) => !/^(jr|sr|ii|iii|iv|phd|md|cpa|esq|mba)\.?$/iu.test(part))
}

/** Whether an address plainly belongs to this person: jonathan@, tim.kelly@, jvcrum@. */
function addressNames(person: string, toEmail: string | null | undefined): boolean {
  if (typeof toEmail !== 'string') return false
  const local = toEmail.split('@')[0]?.toLowerCase().replace(/[^a-z]/gu, '') ?? ''
  if (!local) return false
  const key = nameKey(person).map((word) => word.replace(/[^a-z]/gu, ''))
  const given = key[0] ?? ''
  const surname = key.length > 1 ? key[key.length - 1] : ''
  // Short names match too much: "ed" is in "editor", "al" in "sales".
  return (given.length >= 3 && local.startsWith(given)) || (surname.length >= 4 && local.includes(surname))
}

/**
 * One reading of the host record, offered to the writer as a suggestion.
 *
 * - An operator's entry is read as typed: "Jonathan", or "Pat and Walter".
 * - A catalogue record is narrowed to one person: whoever the address belongs
 *   to, else the first listed who is not a recent guest. Directories list
 *   guests beside the host too often to assume everyone named is a host.
 * - With no host record there is no suggestion: a publisher is as often a
 *   company as a person, and that is a judgement for the writer.
 */
export function resolveGreetingName(input: GreetingInput): string | null {
  const record = typeof input.hostName === 'string' ? normalise(input.hostName).replace(LEADING_LABEL, '') : ''

  // No host record: the publisher is as often a company as a person, and code
  // cannot tell "View Legal" from "Cody Jess". The writer decides those.
  if (!record) return null

  let people = splitPeople(record)
  if (people.length === 0) return null

  if (input.operatorEntered) {
    if (people.length > 2) return null
    const names = people.map(firstName)
    if (names.some((name) => name === null)) return null
    // Two hosts with one first name between them reads as a mistake.
    if (names.length === 2 && names[0] === names[1]) return null
    return names.join(' and ')
  }

  const addressed = people.filter((person) => addressNames(person, input.toEmail))
  if (addressed.length === 1) return firstName(addressed[0])

  const guests = (input.guestNames ?? []).filter((name): name is string => typeof name === 'string' && name.trim() !== '')
  people = people.filter((person) => !guests.some((guest) => samePerson(person, guest)))
  // Every listed name being a recent guest means the record cannot be trusted at all.
  return people.length > 0 ? firstName(people[0]) : null
}

/** A first line that is a greeting and nothing else: "Hi there,", "Hey Jon,", "Hello Laurie and Kristi,". */
const GREETING_LINE = /^(hi|hey|hello|dear|greetings|good (morning|afternoon|evening))\b[^\n.!?:]{0,50}[,!]?$/iu
const NAMELESS_GREETING = /^(hi|hey|hello|greetings|good (morning|afternoon|evening))(\s+(there|all|everyone|team|folks))?\s*[,!.]?$/iu

function firstLine(body: string): string {
  const lineEnd = body.indexOf('\n')
  return (lineEnd === -1 ? body : body.slice(0, lineEnd)).trim()
}

/**
 * Keeps the greeting the writer chose when a revision pass blanked it.
 *
 * Only that one case: the writer greeted someone by name and the revised
 * email opens with a nameless greeting. A revision that greets a different
 * person, or rewrites the opening sentence, is the model's call and stands.
 */
export function keepWriterGreeting(written: string, revised: string): string {
  if (!written || !revised) return revised
  const chosen = firstLine(written)
  if (!GREETING_LINE.test(chosen) || NAMELESS_GREETING.test(chosen)) return revised
  if (!NAMELESS_GREETING.test(firstLine(revised))) return revised
  const lineEnd = revised.indexOf('\n')
  return `${chosen}${lineEnd === -1 ? '' : revised.slice(lineEnd)}`
}

export interface GreetingEvidence extends GreetingInput {
  publisherName?: string | null
  /** 'producer' or 'booking' when the email goes to someone who is not the host. */
  recipientRole?: string | null
}

/**
 * Everything known about who hosts the show and who the email reaches, with
 * the cautions that matter, for the writer to decide the greeting from.
 */
export function greetingEvidenceBlock(evidence: GreetingEvidence): string {
  const host = typeof evidence.hostName === 'string' && evidence.hostName.trim() ? evidence.hostName.trim() : null
  const publisher = typeof evidence.publisherName === 'string' && evidence.publisherName.trim() ? evidence.publisherName.trim() : null
  const guests = [...new Set((evidence.guestNames ?? []).filter((name): name is string => typeof name === 'string' && name.trim() !== '').map((name) => name.trim()))].slice(0, 12)
  const suggestion = resolveGreetingName(evidence)
  if (evidence.recipientRole === 'producer' || evidence.recipientRole === 'booking') {
    return [
      '<greeting>',
      `This email goes to the show's ${evidence.recipientRole === 'booking' ? 'booking contact' : 'producer'}, not the host. Follow the <recipient> rules for the greeting and do not open with the host's name.`,
      `Host record, for reference in the body only: ${host ?? 'none'}`,
      '</greeting>',
    ].join('\n')
  }
  return [
    '<greeting>',
    'You decide who these emails greet. Weigh the evidence below and use the same greeting in all three emails.',
    `Host record (${host ? (evidence.operatorEntered ? 'typed by the operator, so reliable' : 'from the podcast directory') : 'none on file'}): ${host ?? 'none'}`,
    `Publisher: ${publisher ?? 'none'}`,
    `Guests of recent episodes: ${guests.length > 0 ? guests.join('; ') : 'none recorded'}`,
    `The email goes to: ${typeof evidence.toEmail === 'string' && evidence.toEmail ? evidence.toEmail : 'no address chosen yet'}`,
    suggestion
      ? `One reading of the host record: greet "${suggestion}". Use it unless the research shows otherwise.`
      : 'The host record does not give one clear person. Look to the research, the show description and the publisher.',
    'How to decide:',
    '- Greet the person who hosts the show by first name, for example "Hey Laurie,". A directory host record or an operator entry is real evidence even when the research report says the name is unconfirmed.',
    '- Podcast directories often list a recent guest beside the host. Never greet anyone who appears as a guest of a recent episode, unless the address is plainly theirs.',
    '- Two people may both be greeted only when the research shows they genuinely co-host.',
    '- If the address plainly belongs to a named person (their name is in it), greet that person.',
    '- A publisher is often a company, network or brand: never greet one. If the publisher is plainly a person\'s name and nothing contradicts that they host, greet them.',
    '- Drop titles and ranks (Dr., Professor, Colonel) and use the given name as it would be said.',
    '- Only when no person can be identified with reasonable confidence, open "Hi there,". A wrong name is worse than none.',
    '</greeting>',
  ].join('\n')
}
