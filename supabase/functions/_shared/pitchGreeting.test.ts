import { assertEquals } from 'jsr:@std/assert@1'
import { greetingEvidenceBlock, keepWriterGreeting, resolveGreetingName, samePerson } from './pitchGreeting.ts'

const name = (hostName: string | null, extra: Record<string, unknown> = {}) => resolveGreetingName({ hostName, ...extra })

Deno.test('a catalogue record is narrowed to its first-listed host', () => {
  assertEquals(name('Jonathan Goldhill'), 'Jonathan')
  assertEquals(name('Craig'), 'Craig')
  // Directories list guests beside the host, so only the first is greeted.
  assertEquals(name('Pat Ennis & Walter Deyhle'), 'Pat')
  assertEquals(name('Susan Koh and Carl Robinson'), 'Susan')
  assertEquals(name('Mark Creedon & Nick Creedon & Caroline Creedon'), 'Mark')
  assertEquals(name('Lucas & Luna'), 'Lucas')
})

Deno.test('co-hosts an operator typed are both greeted, up to two', () => {
  assertEquals(name('Pat Ennis & Walter Deyhle', { operatorEntered: true }), 'Pat and Walter')
  assertEquals(name('Kristi Daeda', { guestNames: ['Kristi Daeda'], operatorEntered: true }), 'Kristi')
  assertEquals(name('Ann Lee, Bo Chan & Cy Diaz', { operatorEntered: true }), null)
  assertEquals(name('John Smith & John Abrams', { operatorEntered: true }), null)
})

Deno.test('titles, ranks, initials, suffixes and nicknames do not end up in the greeting', () => {
  assertEquals(name('Dr. Andrea Wojnicki'), 'Andrea')
  assertEquals(name('Dr Elena Paweta'), 'Elena')
  assertEquals(name('Professor Jack Ledger'), 'Jack')
  assertEquals(name('Colonel Denny Gillum'), 'Denny')
  assertEquals(name('David W. Carr'), 'David')
  assertEquals(name('Ed Weeks Jr.'), 'Ed')
  assertEquals(name('Ed Weeks, Jr.'), 'Ed')
  assertEquals(name('JV Crum III'), 'JV')
  assertEquals(name('M.C. Laubscher'), 'M.C.')
  assertEquals(name("Colleen O'Connell-Campbell"), 'Colleen')
  assertEquals(name('Robert "Bob" Smith'), 'Robert')
  assertEquals(name('José Álvarez'), 'José')
  assertEquals(name('JONATHAN GOLDHILL'), 'Jonathan')
  assertEquals(name('Hosted by Jane Doe'), 'Jane')
  assertEquals(name('Goldhill, Jonathan'), 'Jonathan')
})

Deno.test('a company, a placeholder or an unreadable record gives no name', () => {
  for (const record of ['Three Peaks Studio', 'Shaughnessy Group', 'Joshua Wilson One Iron Network', 'Unknown', 'N/A', 'Various hosts', 'amy', '@jon', 'J. Smith', '  ']) {
    assertEquals(name(record), null, record)
  }
  assertEquals(name(null), null)
})

Deno.test('a recent guest listed as a co-host is not greeted', () => {
  assertEquals(name('Laurie Barkman & Kristi Daeda', { guestNames: ['Kristi Daeda'] }), 'Laurie')
  // Listed first, but a guest: the host is the one left.
  assertEquals(name('Kristi Daeda & Laurie Barkman', { guestNames: ['Kristi Daeda'] }), 'Laurie')
  // The directory and the transcript spell the guest differently.
  assertEquals(name('Karen Prangley & Brady Weller', { guestNames: [null, 'Karin Prangley'] }), 'Brady')
  // Nobody left: the record is not trusted.
  assertEquals(name('Kristi Daeda', { guestNames: ['Kristi Daeda'] }), null)
})

Deno.test('an address that is plainly one listed person picks that person', () => {
  assertEquals(name('Paul H. Graham & Tim Kelly', { toEmail: 'paul@taxesandexits.com' }), 'Paul')
  assertEquals(name('Paul H. Graham & Tim Kelly', { toEmail: 'tim.kelly@taxesandexits.com' }), 'Tim')
  // Even a recent guest, when the email goes to them.
  assertEquals(name('Paul H. Graham & Tim Kelly', { toEmail: 'tkelly@firm.com', guestNames: ['Tim Kelly'] }), 'Tim')
  assertEquals(name('JV Crum III & Sam Poe', { toEmail: 'jvcrum@consciousmillionaire.com' }), 'JV')
  // A show inbox says nothing, and short names are not matched: "ed" is in "editor".
  assertEquals(name('Paul H. Graham & Tim Kelly', { toEmail: 'podcast@taxesandexits.com' }), 'Paul')
  assertEquals(name('Al Diaz & Ed Weeks', { toEmail: 'editor@show.com' }), 'Al')
})

Deno.test('samePerson tolerates titles and spelling, not different people', () => {
  assertEquals(samePerson('Dr. Kristi Daeda', 'Kristi Daeda'), true)
  assertEquals(samePerson('Karen Prangley', 'Karin Prangley'), true)
  assertEquals(samePerson('Nick Creedon', 'Mark Creedon'), false)
  assertEquals(samePerson('Laurie Barkman', 'Kristi Daeda'), false)
})

Deno.test('a revision that blanks the name the writer chose has it put back', () => {
  assertEquals(keepWriterGreeting('Hey Jonathan,\n\nDraft body.', 'Hi there,\n\nRevised body.'), 'Hey Jonathan,\n\nRevised body.')
  assertEquals(keepWriterGreeting('Hey Pat and Walter,\n\nDraft', 'Hello,\n\nRevised'), 'Hey Pat and Walter,\n\nRevised')
})

Deno.test('every other greeting decision is the model\'s and stands', () => {
  // The writer chose a neutral greeting: nothing to restore.
  assertEquals(keepWriterGreeting('Hi there,\n\nDraft', 'Hi there,\n\nRevised'), 'Hi there,\n\nRevised')
  // The revision greets a different person: that is its call.
  assertEquals(keepWriterGreeting('Hey Laurie and Kristi,\n\nDraft', 'Hey Laurie,\n\nRevised'), 'Hey Laurie,\n\nRevised')
  // The writer opened with a sentence, not a greeting line.
  const warm = 'Hey Laurie, good to be back in touch.\n\nDraft'
  assertEquals(keepWriterGreeting(warm, 'Hi there,\n\nRevised'), 'Hi there,\n\nRevised')
  assertEquals(keepWriterGreeting('', 'Hi there,\n\nRevised'), 'Hi there,\n\nRevised')
  assertEquals(keepWriterGreeting('Hey Jonathan,\n\nDraft', ''), '')
})

Deno.test('the writer is given the evidence and the cautions, and a suggestion it may overrule', () => {
  const block = greetingEvidenceBlock({
    hostName: 'Laurie Barkman & Kristi Daeda', publisherName: 'Laurie Barkman', guestNames: ['Kristi Daeda', 'Kristi Daeda', null],
    toEmail: 'podcast@btsherpa.com',
  })
  assertEquals(block.includes('You decide who these emails greet.'), true)
  assertEquals(block.includes('Host record (from the podcast directory): Laurie Barkman & Kristi Daeda'), true)
  assertEquals(block.includes('Guests of recent episodes: Kristi Daeda\n'), true)
  assertEquals(block.includes('One reading of the host record: greet "Laurie". Use it unless the research shows otherwise.'), true)
  assertEquals(block.includes('Never greet anyone who appears as a guest'), true)
})

Deno.test('with no host record the writer is pointed at the publisher and the research', () => {
  const block = greetingEvidenceBlock({ hostName: null, publisherName: 'Cody Jess', toEmail: null })
  assertEquals(block.includes('Host record (none on file): none'), true)
  assertEquals(block.includes('Publisher: Cody Jess'), true)
  assertEquals(block.includes('does not give one clear person'), true)
  assertEquals(block.includes('no address chosen yet'), true)
})

Deno.test('an operator entry is marked reliable, and a producer is greeted by role', () => {
  assertEquals(greetingEvidenceBlock({ hostName: 'Pat Ennis & Walter Deyhle', operatorEntered: true }).includes('typed by the operator, so reliable'), true)
  const producer = greetingEvidenceBlock({ hostName: 'Jonathan Goldhill', recipientRole: 'producer' })
  assertEquals(producer.includes('not the host'), true)
  assertEquals(producer.includes('You decide who these emails greet'), false)
})
