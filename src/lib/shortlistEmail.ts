import type { ClientShortlistPodcast } from '@/services/clientShortlist'

export type EmailFilter = 'any' | 'has' | 'none'

type EmailSources = Pick<ClientShortlistPodcast, 'podcast_email' | 'email_unlock' | 'pitch_recipients' | 'agency_relationship' | 'bounced_emails'>

/**
 * The best contact address stored for a show, from any source the shortlist
 * carries: the pitch's chosen To, a verified direct contact, the Podscan feed
 * address, then the workspace's host relationship. An address a send has
 * proved dead does not count — it is not a way to reach the host.
 */
export function shortlistContactEmail(podcast: EmailSources): string | null {
  const bounced = new Set((podcast.bounced_emails ?? []).map((email) => email.trim().toLowerCase()))
  const candidates = [
    ...(podcast.pitch_recipients ?? []).map((recipient) => recipient?.status === 'bounced' ? null : recipient?.email),
    podcast.email_unlock?.status === 'unlocked' ? podcast.email_unlock.email : null,
    podcast.podcast_email,
    podcast.agency_relationship?.contact_email,
  ]
  for (const candidate of candidates) {
    const email = typeof candidate === 'string' ? candidate.trim() : ''
    if (email && !bounced.has(email.toLowerCase())) return email
  }
  return null
}

export function matchesEmailFilter(podcast: EmailSources, filter: EmailFilter): boolean {
  if (filter === 'any') return true
  return (shortlistContactEmail(podcast) !== null) === (filter === 'has')
}
