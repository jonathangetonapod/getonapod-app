import { assertEquals } from 'jsr:@std/assert@1'
import { withCurrentCatalogContacts } from './catalogContacts.ts'

const contact = {
  email: 'new@example.com', last_verified_at: '2026-10-28',
  provider_reference: 'https://www.linkedin.com/in/new-host', podcast: { podscan_id: 'show' },
}
Deno.test('replaces cached host email, timestamp and profile together, preserving the public inbox', () => {
  const [row] = withCurrentCatalogContacts([{ podcast_id: 'show', free_podscan_email: 'public@example.com', direct_email: 'old@example.com', direct_verified_at: '2026-01-01' }], [contact])
  assertEquals(row.direct_email, contact.email)
  assertEquals(row.direct_verified_at, contact.last_verified_at)
  assertEquals(row.direct_linkedin_url, contact.provider_reference)
  assertEquals(row.free_podscan_email, 'public@example.com')
})
Deno.test('new discoveries replace empty cached contacts', () => {
  const [row] = withCurrentCatalogContacts([{ podcast_id: 'show', direct_email: null }], [contact])
  assertEquals(row.direct_email, contact.email)
  assertEquals(row.direct_linkedin_url, contact.provider_reference)
})
Deno.test('invalidated contacts clear all cached direct fields', () => {
  const [row] = withCurrentCatalogContacts([{ podcast_id: 'show', direct_email: 'old@example.com', direct_linkedin_url: contact.provider_reference, direct_verified_at: '2026-01-01' }], [])
  assertEquals(row.direct_email, null)
  assertEquals(row.direct_linkedin_url, null)
  assertEquals(row.direct_verified_at, null)
})
