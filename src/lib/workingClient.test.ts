import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clientScopedHref,
  readWorkingClient,
  workingClientStorageKey,
  writeWorkingClient,
} from '@/lib/workingClient'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('working client', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  // Across tabs and visits, so the next morning still opens on the same client.
  it('remembers a client per person and per workspace across visits', () => {
    writeWorkingClient(workspaceId, userId, clientId)

    expect(readWorkingClient(workspaceId, userId)).toBe(clientId)
    expect(window.localStorage.getItem(workingClientStorageKey(workspaceId, userId))).toBe(clientId)
    expect(readWorkingClient('33333333-3333-4333-8333-333333333333', userId)).toBeNull()
    // Another person signing in on the same browser does not inherit it.
    expect(readWorkingClient(workspaceId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toBeNull()
    expect(readWorkingClient(workspaceId, null)).toBeNull()
  })

  it('clears the client with null and ignores anything that is not an id', () => {
    writeWorkingClient(workspaceId, userId, clientId)
    writeWorkingClient(workspaceId, userId, null)
    expect(readWorkingClient(workspaceId, userId)).toBeNull()

    writeWorkingClient(workspaceId, userId, 'not-a-client')
    expect(readWorkingClient(workspaceId, userId)).toBeNull()

    window.localStorage.setItem(workingClientStorageKey(workspaceId, userId), '<script>')
    expect(readWorkingClient(workspaceId, userId)).toBeNull()
  })

  it('keeps working when storage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })

    expect(() => writeWorkingClient(workspaceId, userId, clientId)).not.toThrow()
    expect(readWorkingClient(workspaceId, userId)).toBeNull()

    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('scopes only the modules that read a client from their address', () => {
    expect(clientScopedHref('/app', 'podcast-finder', clientId)).toBe(`/app/podcast-finder?client=${clientId}`)
    expect(clientScopedHref('/app', 'podcast-database', clientId)).toBe(`/app/podcast-database?client=${clientId}`)
    expect(clientScopedHref('/app', 'client-podcast-system', clientId)).toBe(`/app/client-podcast-system?client=${clientId}`)
    // The campaign list filtered to the client, so one with no campaign yet
    // still lands somewhere to assign one.
    expect(clientScopedHref('/app', 'client-campaigns', clientId)).toBe(`/app/client-campaigns?client=${clientId}`)
    expect(clientScopedHref('/app', 'relationships', clientId)).toBe('/app/relationships')
    expect(clientScopedHref('/app', 'settings', clientId)).toBe('/app/settings')
    expect(clientScopedHref(`/app/workspaces/${workspaceId}`, 'podcast-finder', null))
      .toBe(`/app/workspaces/${workspaceId}/podcast-finder`)
  })
})
