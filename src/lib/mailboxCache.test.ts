import { beforeEach, describe, expect, it } from 'vitest'
import { clearMailboxCaches, mailboxCacheKey, readMailboxCache, writeMailboxCache } from '@/lib/mailboxCache'
import type { WorkspaceMailboxesResponse } from '@/services/workspaceCampaigns'

const key = mailboxCacheKey('user-1', 'workspace-1')
const now = Date.parse('2026-10-27T12:00:00Z')

function response(connected = true): WorkspaceMailboxesResponse {
  return {
    connected,
    provider_workspace_name: 'The it Crowd',
    send_day_timezone: 'America/Chicago',
    accounts: connected ? [{ email: 'a@crowd.com' } as never] : [],
    last_synced_at: '2026-10-27T11:58:00Z',
    analytics_errors: [],
  }
}

describe('mailboxCache', () => {
  beforeEach(() => window.localStorage.clear())

  it('returns the last connected list with when it was saved', () => {
    writeMailboxCache(key, response(), now)
    expect(readMailboxCache(key, now + 60_000)).toEqual({ savedAt: now, data: response() })
  })

  it('keeps users and workspaces apart', () => {
    writeMailboxCache(key, response(), now)
    expect(readMailboxCache(mailboxCacheKey('user-2', 'workspace-1'), now)).toBeNull()
    expect(readMailboxCache(mailboxCacheKey('user-1', 'workspace-2'), now)).toBeNull()
  })

  it('drops a list older than a day, and never keeps a disconnected one', () => {
    writeMailboxCache(key, response(), now)
    expect(readMailboxCache(key, now + 25 * 60 * 60 * 1000)).toBeNull()
    expect(window.localStorage.getItem(key)).toBeNull()

    writeMailboxCache(key, response(), now)
    writeMailboxCache(key, response(false), now)
    expect(readMailboxCache(key, now)).toBeNull()
  })

  it('treats unreadable storage as a cold load', () => {
    window.localStorage.setItem(key, '{not json')
    expect(readMailboxCache(key, now)).toBeNull()
  })

  it('clears every stored list, whoever it belonged to, and nothing else', () => {
    writeMailboxCache(key, response(), now)
    writeMailboxCache(mailboxCacheKey('user-2', 'workspace-9'), response(), now)
    window.localStorage.setItem('unrelated', 'kept')
    clearMailboxCaches()
    expect(readMailboxCache(key, now)).toBeNull()
    expect(readMailboxCache(mailboxCacheKey('user-2', 'workspace-9'), now)).toBeNull()
    expect(window.localStorage.getItem('unrelated')).toBe('kept')
  })
})
