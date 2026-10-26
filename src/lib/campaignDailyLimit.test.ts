import { describe, expect, it } from 'vitest'
import { mailboxCapacity, newHostsPerDayNote, suggestedNewHostsPerDay } from '@/lib/campaignDailyLimit'
import type { InstantlySendingAccount } from '@/services/workspaceCampaigns'

const account = (email: string, dailyLimit: number | null, status = 1): InstantlySendingAccount => ({
  email,
  first_name: null,
  last_name: null,
  status,
  warmup_status: null,
  daily_limit: dailyLimit,
})

describe('campaignDailyLimit', () => {
  it('counts only selected, connected mailboxes', () => {
    const accounts = [account('a@x.com', 30), account('b@x.com', 30), account('c@x.com', 50, 2), account('d@x.com', 40)]
    expect(mailboxCapacity(accounts, new Set(['a@x.com', 'b@x.com', 'c@x.com']))).toEqual({ mailboxes: 2, emailsPerDay: 60 })
  })

  it('suggests what the mailboxes can carry with follow-ups, capped at 30', () => {
    expect(suggestedNewHostsPerDay({ mailboxes: 2, emailsPerDay: 60 })).toBe(20)
    expect(suggestedNewHostsPerDay({ mailboxes: 10, emailsPerDay: 300 })).toBe(30)
    expect(suggestedNewHostsPerDay({ mailboxes: 1, emailsPerDay: 2 })).toBe(1)
    expect(suggestedNewHostsPerDay({ mailboxes: 0, emailsPerDay: 0 })).toBe(30)
  })

  it('says how many emails a day the number means', () => {
    expect(newHostsPerDayNote(20, { mailboxes: 2, emailsPerDay: 60 })).toEqual({
      text: 'Up to 20 new hosts a day, about 60 emails with follow-ups. The 2 selected mailboxes can send 60 a day.',
      overCapacity: false,
    })
  })

  // 500 a day from two mailboxes was accepted without a word, and Instantly
  // quietly sent a fraction of it.
  it('warns when the mailboxes cannot send that many', () => {
    const note = newHostsPerDayNote(500, { mailboxes: 2, emailsPerDay: 60 })
    expect(note?.overCapacity).toBe(true)
    expect(note?.text).toContain('Lower it to 20 or add mailboxes.')
  })

  it('does not guess at capacity it was not given', () => {
    expect(newHostsPerDayNote(30, { mailboxes: 0, emailsPerDay: 0 })?.overCapacity).toBe(false)
    expect(newHostsPerDayNote(null, { mailboxes: 0, emailsPerDay: 0 })).toBeNull()
  })
})
