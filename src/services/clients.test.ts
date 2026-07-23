import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getClients } from '@/services/clients'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from,
    functions: { invoke: vi.fn() },
  },
}))

describe('getClients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies the selected workspace before returning active research clients', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const terminalQuery = Promise.resolve({ data: [], error: null, count: 0 })
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.order.mockReturnValue(terminalQuery)
    from.mockReturnValue(builder)

    await expect(getClients({ workspaceId, status: 'active' })).resolves.toEqual({
      clients: [],
      total: 0,
    })
    expect(from).toHaveBeenCalledWith('clients')
    expect(builder.eq).toHaveBeenNthCalledWith(1, 'status', 'active')
    expect(builder.eq).toHaveBeenNthCalledWith(2, 'workspace_id', workspaceId)
  })

  it('fails closed if a workspace-scoped response contains another workspace', async () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const terminalQuery = Promise.resolve({
      data: [{ id: 'client-1', workspace_id: '22222222-2222-4222-8222-222222222222' }],
      error: null,
      count: 1,
    })
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    }
    builder.select.mockReturnValue(builder)
    builder.eq.mockReturnValue(builder)
    builder.order.mockReturnValue(terminalQuery)
    from.mockReturnValue(builder)

    await expect(getClients({ workspaceId, status: 'active' })).rejects.toThrow(
      'The selected workspace response did not match the client scope.',
    )
  })
})
