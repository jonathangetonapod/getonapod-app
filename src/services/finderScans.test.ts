import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { DEFAULT_FINDER_FILTERS } from '@/lib/finderFilters'
import { getFinderScan, listFinderScans, saveFinderScan } from '@/services/finderScans'

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const scanId = '33333333-3333-4333-8333-333333333333'

describe('finder scans service', () => {
  beforeEach(() => invoke.mockReset())

  it('saves a scan against the client, lower-casing the ids', async () => {
    invoke.mockResolvedValue({ data: { scan: { id: scanId, client_id: clientId, match_count: 1 } }, error: null } as never)
    const input = {
      queries: ['founder stories'],
      filters: DEFAULT_FINDER_FILTERS,
      found_count: 40,
      credits_used: 6,
      results: [],
    }
    const saved = await saveFinderScan(workspaceId.toUpperCase(), clientId.toUpperCase(), input)

    expect(saved.id).toBe(scanId)
    expect(invoke).toHaveBeenCalledWith('workspace-clients', {
      body: { action: 'finder-scan-save', workspace_id: workspaceId, client_id: clientId, scan: input },
    })
  })

  it('lists across the workspace when no client is given', async () => {
    invoke.mockResolvedValue({ data: { scans: [] }, error: null } as never)
    await listFinderScans(workspaceId, null)
    expect(invoke).toHaveBeenCalledWith('workspace-clients', { body: { action: 'finder-scan-list', workspace_id: workspaceId } })

    await listFinderScans(workspaceId, clientId)
    expect(invoke).toHaveBeenLastCalledWith('workspace-clients', {
      body: { action: 'finder-scan-list', workspace_id: workspaceId, client_id: clientId },
    })
  })

  it('reads one scan by id inside the workspace', async () => {
    invoke.mockResolvedValue({ data: { scan: { id: scanId, results: null } }, error: null } as never)
    const scan = await getFinderScan(workspaceId, scanId)

    expect(scan.results).toEqual([])
    expect(invoke).toHaveBeenCalledWith('workspace-clients', {
      body: { action: 'finder-scan-get', workspace_id: workspaceId, scan_id: scanId },
    })
  })

  it('refuses an answer with no scan in it', async () => {
    invoke.mockResolvedValue({ data: {}, error: null } as never)
    await expect(getFinderScan(workspaceId, scanId)).rejects.toThrow('The scan could not be loaded.')
  })
})
