import type { WorkspaceMailboxesResponse } from '@/services/workspaceCampaigns'

/**
 * The last mailbox list this browser loaded, per user and workspace, so the
 * page draws at once and refreshes behind it. Loading it fresh means several
 * Instantly round trips; the header already says when the list was synced, so
 * a minutes-old list is shown for what it is rather than as a blank table.
 *
 * Storage can be missing, full or blocked; every miss just means a cold load.
 * Every stored list is removed when the browser has no signed-in user (see
 * main.tsx), so the next person at a shared computer does not inherit it.
 */
const PREFIX = 'goap:mailboxes:v1:'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

interface CachedMailboxes {
  savedAt: number
  data: WorkspaceMailboxesResponse
}

export function mailboxCacheKey(userId: string, workspaceId: string): string {
  return `${PREFIX}${userId}:${workspaceId}`
}

export function readMailboxCache(key: string, now = Date.now()): CachedMailboxes | null {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedMailboxes
    if (
      typeof cached?.savedAt !== 'number'
      || now - cached.savedAt > MAX_AGE_MS
      || !cached.data?.connected
      || !Array.isArray(cached.data.accounts)
    ) {
      window.localStorage.removeItem(key)
      return null
    }
    return cached
  } catch {
    return null
  }
}

/** Only a connected list is worth showing early; a disconnected one is cheap to load. */
export function writeMailboxCache(key: string, data: WorkspaceMailboxesResponse, now = Date.now()): void {
  try {
    if (!data.connected) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify({ savedAt: now, data } satisfies CachedMailboxes))
  } catch {
    // Quota or privacy mode: the next visit loads cold, which is today's behaviour.
  }
}

/** Remove every stored mailbox list, whoever's it was. */
export function clearMailboxCaches(): void {
  try {
    const storage = window.localStorage
    const keys: string[] = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    // Storage that cannot be read holds nothing to remove.
  }
}
