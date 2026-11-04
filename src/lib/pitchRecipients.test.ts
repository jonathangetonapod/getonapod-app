import { describe, expect, it } from 'vitest'
import {
  applyBounces,
  chooseRecipient,
  recipientTo,
  sameRecipients,
  seedRecipients,
  setContactRole,
  sourceBadgeLabel,
  type PitchRecipient,
  type RecipientContext,
} from './pitchRecipients'

const context: RecipientContext = {
  podscanEmails: ['info@show.fm', 'jane@show.fm'],
  verifiedEmail: 'jane@show.fm',
}

describe('pitch recipient', () => {
  it('is one address: choosing another replaces it', () => {
    const first = chooseRecipient(context, 'info@show.fm', 'podscan')
    expect(first).toHaveLength(1)
    const second = chooseRecipient(context, 'Me@Found.com', 'manual')
    expect(second).toEqual([expect.objectContaining({ email: 'me@found.com', role: 'to', sources: ['manual'], contact_role: 'host' })])
  })

  it('merges the badges of an address found through several sources', () => {
    const [jane] = chooseRecipient(context, 'jane@show.fm', 'podscan')
    expect(jane.sources).toEqual(['verified', 'podscan'])
    expect(sourceBadgeLabel(jane)).toBe('Podscan + Verified')
    expect(jane.status).toBe('verified')
  })

  it('never offers a bounced address as the recipient', () => {
    const list = chooseRecipient({ ...context, bounced: ['INFO@show.fm'] }, 'info@show.fm', 'podscan')
    expect(list[0].status).toBe('bounced')
    expect(recipientTo(list)).toBeNull()
    expect(recipientTo(applyBounces(chooseRecipient(context, 'info@show.fm', 'podscan'), ['info@show.fm']))).toBeNull()
  })

  it('maps an old single contact_email to the recipient on load', () => {
    const list = seedRecipients({ ...context, saved: null, legacyContactEmail: 'Info@Show.fm' })
    expect(list).toEqual([expect.objectContaining({ email: 'info@show.fm', role: 'to', sources: ['podscan'] })])
  })

  it('opens a fresh pitch on the verified email, else the first Podscan inbox, and a saved choice as saved', () => {
    expect(recipientTo(seedRecipients({ ...context, saved: null, legacyContactEmail: null }))?.email).toBe('jane@show.fm')
    expect(recipientTo(seedRecipients({ podscanEmails: ['info@show.fm'], verifiedEmail: null, saved: null, legacyContactEmail: null }))?.email).toBe('info@show.fm')
    const saved: PitchRecipient[] = [{ email: 'me@found.com', source: 'manual', sources: ['manual'], status: 'unverified', role: 'to', contact_role: 'producer' }]
    expect(seedRecipients({ ...context, saved, legacyContactEmail: 'other@x.co' })).toEqual([expect.objectContaining({ email: 'me@found.com', contact_role: 'producer' })])
  })

  it('keeps the role the operator set, and knows an unchanged choice needs no save', () => {
    const chosen = chooseRecipient(context, 'me@found.com', 'manual')
    const producer = setContactRole(chosen, 'producer')
    expect(producer[0].contact_role).toBe('producer')
    expect(sameRecipients(chosen, chooseRecipient(context, 'ME@found.com', 'manual'))).toBe(true)
    expect(sameRecipients(chosen, producer)).toBe(false)
  })
})
