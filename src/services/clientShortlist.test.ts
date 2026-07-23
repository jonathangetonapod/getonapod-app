import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  addClientShortlistPodcasts,
  getClientShortlist,
  reorderClientShortlistFeatured,
  searchClientPodcastCatalog,
  updateClientShortlistPodcast,
} from '@/services/clientShortlist'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

describe('clientShortlist service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scopes every list and catalog request to the workspace client', async () => {
    invoke
      .mockResolvedValueOnce({ data: { client: { id: clientId, name: 'Client' }, podcasts: [] }, error: null } as never)
      .mockResolvedValueOnce({ data: { podcasts: [] }, error: null } as never)

    await getClientShortlist(workspaceId, clientId)
    await searchClientPodcastCatalog(workspaceId, clientId, 'founder')

    expect(invoke).toHaveBeenNthCalledWith(1, 'workspace-client-shortlist', {
      body: { action: 'list', workspace_id: workspaceId, client_id: clientId },
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'workspace-client-shortlist', {
      body: { action: 'catalog-search', workspace_id: workspaceId, client_id: clientId, query: 'founder' },
    })
  })

  it('uses narrow add, update, and reorder actions', async () => {
    invoke
      .mockResolvedValueOnce({ data: { added: 1, skipped: 0, podcast_ids: ['podcast-one'] }, error: null } as never)
      .mockResolvedValueOnce({ data: { podcast: { podcast_id: 'podcast-one' } }, error: null } as never)
      .mockResolvedValueOnce({ data: { reordered: 1 }, error: null } as never)

    await addClientShortlistPodcasts(workspaceId, clientId, [{ podcast_id: 'podcast-one', podcast_name: 'Podcast One' }])
    await updateClientShortlistPodcast(workspaceId, clientId, 'podcast-one', { is_featured: true })
    await reorderClientShortlistFeatured(workspaceId, clientId, ['podcast-one'])

    expect(invoke.mock.calls.map((call) => (call[1] as { body: { action: string } }).body.action)).toEqual([
      'add',
      'update',
      'reorder-featured',
    ])
  })

  it('chunks large weekly additions and combines dedupe totals', async () => {
    invoke
      .mockResolvedValueOnce({ data: { added: 50, skipped: 0, podcast_ids: Array.from({ length: 50 }, (_, index) => `podcast-${index}`) }, error: null } as never)
      .mockResolvedValueOnce({ data: { added: 0, skipped: 1, podcast_ids: [] }, error: null } as never)
    const podcasts = Array.from({ length: 51 }, (_, index) => ({
      podcast_id: `podcast-${index}`,
      podcast_name: `Podcast ${index}`,
    }))

    const result = await addClientShortlistPodcasts(workspaceId, clientId, podcasts)

    expect(invoke).toHaveBeenCalledTimes(2)
    expect((invoke.mock.calls[0][1] as { body: { podcasts: unknown[] } }).body.podcasts).toHaveLength(50)
    expect((invoke.mock.calls[1][1] as { body: { podcasts: unknown[] } }).body.podcasts).toHaveLength(1)
    expect(result).toMatchObject({ added: 50, skipped: 1 })
  })
})
