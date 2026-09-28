import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clientScopedHref,
  readWorkingClient,
  workingClientStorageKey,
  writeWorkingClient,
} from '@/lib/workingClient'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

describe('working client', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('remembers a client per workspace for the length of the tab', () => {
    writeWorkingClient(workspaceId, clientId)

    expect(readWorkingClient(workspaceId)).toBe(clientId)
    expect(window.sessionStorage.getItem(workingClientStorageKey(workspaceId))).toBe(clientId)
    expect(window.localStorage.getItem(workingClientStorageKey(workspaceId))).toBeNull()
    expect(readWorkingClient('33333333-3333-4333-8333-333333333333')).toBeNull()
  })

  it('clears the client with null and ignores anything that is not an id', () => {
    writeWorkingClient(workspaceId, clientId)
    writeWorkingClient(workspaceId, null)
    expect(readWorkingClient(workspaceId)).toBeNull()

    writeWorkingClient(workspaceId, 'not-a-client')
    expect(readWorkingClient(workspaceId)).toBeNull()

    window.sessionStorage.setItem(workingClientStorageKey(workspaceId), '<script>')
    expect(readWorkingClient(workspaceId)).toBeNull()
  })

  it('keeps working when storage throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })

    expect(() => writeWorkingClient(workspaceId, clientId)).not.toThrow()
    expect(readWorkingClient(workspaceId)).toBeNull()

    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('scopes only the modules that read a client from their address', () => {
    expect(clientScopedHref('/app', 'podcast-finder', clientId)).toBe(`/app/podcast-finder?client=${clientId}`)
    expect(clientScopedHref('/app', 'podcast-database', clientId)).toBe(`/app/podcast-database?client=${clientId}`)
    expect(clientScopedHref('/app', 'client-podcast-system', clientId)).toBe(`/app/client-podcast-system?client=${clientId}`)
    expect(clientScopedHref('/app', 'master-inbox', clientId)).toBe(`/app/master-inbox?client=${clientId}`)
    // Campaigns has a detail route per client, so it goes straight there.
    expect(clientScopedHref('/app', 'client-campaigns', clientId)).toBe(`/app/client-campaigns/${clientId}`)
    expect(clientScopedHref('/app', 'relationships', clientId)).toBe('/app/relationships')
    expect(clientScopedHref('/app', 'settings', clientId)).toBe('/app/settings')
    expect(clientScopedHref(`/app/workspaces/${workspaceId}`, 'podcast-finder', null))
      .toBe(`/app/workspaces/${workspaceId}/podcast-finder`)
  })
})
