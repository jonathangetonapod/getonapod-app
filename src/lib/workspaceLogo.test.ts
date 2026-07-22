import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workspaceLogoUrl } from '@/lib/workspaceLogo'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const objectId = '22222222-2222-4222-8222-222222222222'

describe('workspaceLogoUrl', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.example')
  })

  it('builds a cache-busted URL only for the exact workspace object path', () => {
    const url = workspaceLogoUrl(
      workspaceId.toUpperCase(),
      `${workspaceId}/${objectId}.png`,
      '2026-07-22T01:00:00.000Z',
    )

    expect(url).toBe(
      `https://project.example/storage/v1/object/public/workspace-logos/${workspaceId}/${objectId}.png?v=1784682000000`,
    )
  })

  it('rejects a different workspace, unsupported extension, or incomplete state', () => {
    expect(workspaceLogoUrl(
      workspaceId,
      `33333333-3333-4333-8333-333333333333/${objectId}.png`,
      '2026-07-22T01:00:00.000Z',
    )).toBeNull()
    expect(workspaceLogoUrl(
      workspaceId,
      `${workspaceId}/${objectId}.svg`,
      '2026-07-22T01:00:00.000Z',
    )).toBeNull()
    expect(workspaceLogoUrl(workspaceId, `${workspaceId}/${objectId}.png`, null)).toBeNull()
  })
})
