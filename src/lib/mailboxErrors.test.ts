import { describe, expect, it } from 'vitest'
import { humanizeMailboxError, linkifyText, truncateHint } from './mailboxErrors'

const GMAIL_LIMIT = '550-5.4.5 Daily user sending limit exceeded. For more information on Gmail\n550-5.4.5 sending limits go to\n550 5.4.5  https://support.google.com/a/answer/166852 d75a77b69052e-4b0'

describe('humanizeMailboxError', () => {
  it('names the Gmail daily limit', () => {
    expect(humanizeMailboxError(-3, GMAIL_LIMIT)).toMatchObject({
      id: 'gmail-daily-limit',
      label: 'Gmail daily limit',
      hint: 'Google paused sending for this account until the limit resets.',
      kind: 'error',
      raw: GMAIL_LIMIT,
    })
  })

  it('treats an expired OAuth token as a reconnect, with either apostrophe', () => {
    for (const message of ["Can't create new access token", 'can’t create new access token: invalid_grant']) {
      expect(humanizeMailboxError(-1, message)).toMatchObject({
        label: 'Reconnect needed',
        hint: 'The OAuth token expired. Reconnect this mailbox in Instantly.',
        kind: 'disconnected',
      })
    }
  })

  it('falls back to a generic label and the first 80 characters', () => {
    const raw = `421 4.7.0 Try again later, closing connection. ${'x'.repeat(100)}`
    const result = humanizeMailboxError(-3, raw)
    expect(result?.label).toBe('Sending error')
    expect(result?.hint).toBe(`${raw.slice(0, 80)}…`)
    expect(result?.kind).toBe('error')
  })

  it('labels by status when Instantly gave no message', () => {
    expect(humanizeMailboxError(-1, null)).toMatchObject({ label: 'Connection error', kind: 'disconnected' })
    expect(humanizeMailboxError(-2, '')).toMatchObject({ label: 'Soft bounce error', kind: 'error' })
  })

  it('ignores a leftover message on a mailbox that is not in error', () => {
    expect(humanizeMailboxError(1, GMAIL_LIMIT)).toBeNull()
    expect(humanizeMailboxError(2, 'anything')).toBeNull()
  })
})

describe('truncateHint', () => {
  it('collapses whitespace and leaves short text alone', () => {
    expect(truncateHint('  a\n\n b  ')).toBe('a b')
  })
})

describe('linkifyText', () => {
  it('turns URLs into links and keeps trailing punctuation as text', () => {
    expect(linkifyText('see https://support.google.com/a/answer/166852. Then retry')).toEqual([
      { text: 'see ' },
      { text: 'https://support.google.com/a/answer/166852', href: 'https://support.google.com/a/answer/166852' },
      { text: '. Then retry' },
    ])
  })

  it('does not link non-http schemes', () => {
    expect(linkifyText('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }])
  })
})
