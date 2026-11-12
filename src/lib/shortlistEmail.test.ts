import { describe, expect, it } from 'vitest'
import { matchesEmailFilter, shortlistContactEmail } from './shortlistEmail'

const none = { podcast_email: null, email_unlock: null, pitch_recipients: null, agency_relationship: null, bounced_emails: [] }

describe('shortlistContactEmail', () => {
  it('finds an address from any stored source, preferring the chosen pitch recipient', () => {
    expect(shortlistContactEmail(none)).toBeNull()
    expect(shortlistContactEmail({ ...none, podcast_email: ' feed@show.fm ' })).toBe('feed@show.fm')
    expect(shortlistContactEmail({ ...none, agency_relationship: { contact_email: 'host@show.fm' } as never })).toBe('host@show.fm')
    expect(shortlistContactEmail({ ...none, email_unlock: { status: 'unlocked', email: 'direct@show.fm' } as never, podcast_email: 'feed@show.fm' })).toBe('direct@show.fm')
    expect(shortlistContactEmail({ ...none, pitch_recipients: [{ email: 'to@show.fm' }] as never, podcast_email: 'feed@show.fm' })).toBe('to@show.fm')
  })

  it('ignores an unfinished direct search, blanks, and addresses that bounced', () => {
    expect(shortlistContactEmail({ ...none, email_unlock: { status: 'running', email: 'x@show.fm' } as never })).toBeNull()
    expect(shortlistContactEmail({ ...none, podcast_email: '   ' })).toBeNull()
    expect(shortlistContactEmail({ ...none, pitch_recipients: [{ email: 'old@show.fm', status: 'bounced' }] as never })).toBeNull()
    expect(shortlistContactEmail({ ...none, podcast_email: 'Dead@Show.fm', bounced_emails: ['dead@show.fm'] })).toBeNull()
    expect(shortlistContactEmail({ ...none, podcast_email: 'dead@show.fm', agency_relationship: { contact_email: 'live@show.fm' } as never, bounced_emails: ['dead@show.fm'] })).toBe('live@show.fm')
  })

  it('filters by whether an address exists', () => {
    const withEmail = { ...none, podcast_email: 'feed@show.fm' }
    expect(matchesEmailFilter(withEmail, 'any')).toBe(true)
    expect(matchesEmailFilter(withEmail, 'has')).toBe(true)
    expect(matchesEmailFilter(withEmail, 'none')).toBe(false)
    expect(matchesEmailFilter(none, 'none')).toBe(true)
    expect(matchesEmailFilter(none, 'has')).toBe(false)
  })
})
