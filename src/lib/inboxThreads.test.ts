import { describe, expect, it } from 'vitest'
import {
  inboxScopeOf,
  isPositiveInterest,
  recoverAgedOutThread,
  replySubject,
  threadStatus,
} from '@/lib/inboxThreads'
import type { WorkspaceInboxMessage, WorkspaceInboxThread } from '@/services/workspaceCampaigns'

const thread = (overrides: Partial<WorkspaceInboxThread> = {}): WorkspaceInboxThread => ({
  id: 'email-1',
  thread_id: 'thread-1',
  message_id: null,
  eaccount: 'sender@agency.com',
  subject: 'Guest idea',
  from_email: 'host@show.fm',
  to_email: 'sender@agency.com',
  body_text: 'Sounds good.',
  received_at: '2026-10-20T10:00:00.000Z',
  is_unread: false,
  interested: false,
  lead_email: 'host@show.fm',
  campaign: { campaign_id: 'campaign-1', campaign_name: 'Fall', client: { id: 'client-1', name: 'Ada' } },
  thread_key: 'thread-1',
  ...overrides,
})

const message = (overrides: Partial<WorkspaceInboxMessage>): WorkspaceInboxMessage => ({
  id: 'm',
  direction: 'inbound',
  eaccount: 'sender@agency.com',
  subject: 'Re: Guest idea',
  from_email: 'host@show.fm',
  to_email: 'sender@agency.com',
  body_text: '',
  sent_at: null,
  ...overrides,
})

describe('inbox scope', () => {
  it('keeps every positive outcome under Interested', () => {
    for (const value of [1, 2, 3, 4]) {
      expect(isPositiveInterest(value)).toBe(true)
      expect(inboxScopeOf(thread({ interest_status: value }))).toBe('interested')
    }
  })

  it('puts out of office, negative and reset statuses under Other replies', () => {
    for (const value of [0, -1, -2, -3, -4]) {
      expect(inboxScopeOf(thread({ interest_status: value, interested: true }))).toBe('other')
    }
    expect(isPositiveInterest(null)).toBe(false)
  })

  it('falls back to the interested flag when no status is recorded', () => {
    expect(inboxScopeOf(thread({ interest_status: null, interested: true }))).toBe('interested')
    expect(inboxScopeOf(thread({ interest_status: undefined, interested: false }))).toBe('other')
  })
})

describe('thread helpers', () => {
  it('treats a reply sent this session as replied', () => {
    expect(threadStatus(thread(), new Set(['email-1']))).toBe('replied')
    expect(threadStatus(thread({ state: null }), new Set())).toBe('needs_reply')
  })

  it('keeps the subject the host is reading', () => {
    expect(replySubject('Guest idea')).toBe('Re: Guest idea')
    expect(replySubject('RE: Guest idea')).toBe('RE: Guest idea')
    expect(replySubject('')).toBe('Re:')
  })
})

describe('recoverAgedOutThread', () => {
  const agedOut = thread({
    id: 'email-answered',
    eaccount: null,
    body_text: '',
    window_aged_out: true,
  })

  it('leaves a thread inside the window untouched', () => {
    const live = thread()
    expect(recoverAgedOutThread(live, [message({ id: 'x', eaccount: 'other@agency.com' })]).thread).toBe(live)
  })

  it('recovers the mailbox and the text of the reply the draft answers', () => {
    const result = recoverAgedOutThread(agedOut, [
      message({ id: 'pitch', direction: 'outbound', body_text: 'Our pitch' }),
      message({ id: 'email-answered', body_text: 'Yes, Tuesday works.' }),
    ])
    expect(result.thread.eaccount).toBe('sender@agency.com')
    expect(result.thread.body_text).toBe('Yes, Tuesday works.')
    expect(result.newerInboundArrived).toBe(false)
  })

  it('flags a newer host message than the one the draft answers', () => {
    const result = recoverAgedOutThread(agedOut, [
      message({ id: 'email-answered', body_text: 'Yes.' }),
      message({ id: 'email-newer', body_text: 'Actually, next week.' }),
    ])
    expect(result.newerInboundArrived).toBe(true)
    expect(result.thread.body_text).toBe('Yes.')
  })

  it('stays unsendable when the history has no mailbox', () => {
    const result = recoverAgedOutThread(agedOut, [message({ id: 'email-answered', eaccount: null })])
    expect(result.thread.eaccount).toBeNull()
  })
})
