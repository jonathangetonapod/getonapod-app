import { linkedinProfileUrl } from './hostContactDiscovery.ts'

export interface CatalogDirectContact {
  email: string
  last_verified_at: string
  provider_reference: unknown
  podcast: { podscan_id: string }
}

/** Replace the entire cached contact together, including removing invalidated contacts. */
export function withCurrentCatalogContacts(
  items: Array<Record<string, unknown>>,
  contacts: CatalogDirectContact[],
): Array<Record<string, unknown>> {
  const current = new Map(contacts.map(contact => [contact.podcast.podscan_id, contact]))
  return items.map(item => {
    const contact = current.get(String(item.podcast_id))
    return {
      ...item,
      direct_email: contact?.email ?? null,
      direct_verified_at: contact?.last_verified_at ?? null,
      direct_linkedin_url: linkedinProfileUrl(contact?.provider_reference),
    }
  })
}
