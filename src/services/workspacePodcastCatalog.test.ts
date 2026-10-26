import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { getWorkspacePodcastCatalog } from '@/services/workspacePodcastCatalog'

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

const invoke = vi.mocked(supabase.functions.invoke)
const workspaceId = '11111111-1111-4111-8111-111111111111'

const response = {
  workspace: { id: workspaceId, name: 'Acme Workspace' },
  items: [],
  categories: ['Business'],
  pagination: { page: 2, page_size: 24, total: 30, total_pages: 2 },
  summary: {
    total_podcasts: 11807,
    active_podcasts: 9566,
    podcasts_with_free_email: 6610,
    podcasts_with_direct_email: 0,
    podcasts_used_in_shortlists: 100,
    shortlist_uses: 200,
    contributing_workspaces: 3,
  },
}

describe('workspacePodcastCatalog service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads the global catalog through the workspace-scoped function', async () => {
    invoke.mockResolvedValueOnce({ data: response, error: null } as never)

    await expect(getWorkspacePodcastCatalog(workspaceId.toUpperCase(), {
      search: ' founder ',
      category: 'Business',
      contact: 'free',
      activity: 'last_90_days',
      audience: '10k_50k',
      sort: 'community',
      page: 2,
    })).resolves.toEqual(response)

    expect(invoke).toHaveBeenCalledWith('workspace-podcast-catalog', {
      body: {
        action: 'list',
        workspace_id: workspaceId,
        search: 'founder',
        category: 'Business',
        contact: 'free',
        activity: 'last_90_days',
        audience: '10k_50k',
        sort: 'community',
        page: 2,
        page_size: 24,
      },
      signal: undefined,
    })
  })

  // A search typed past is cancelled, not left to finish.
  it('passes the abort signal through to the function call', async () => {
    invoke.mockResolvedValueOnce({ data: response, error: null } as never)
    const controller = new AbortController()

    await getWorkspacePodcastCatalog(workspaceId, { search: 'founders', sort: 'relevance' }, controller.signal)

    expect(invoke).toHaveBeenCalledWith('workspace-podcast-catalog', expect.objectContaining({
      body: expect.objectContaining({ search: 'founders', sort: 'relevance' }),
      signal: controller.signal,
    }))
  })

  // You're Wrong About and Armchair Expert arrive wrapped in <p>; SmartLess and
  // the MrBallen title carry &amp;. Cleaned once here, never per component.
  it('strips feed markup and entities from names and descriptions', async () => {
    invoke.mockResolvedValueOnce({
      data: {
        ...response,
        items: [{
          podcast_id: 'p1',
          podcast_name: 'MrBallen Podcast: Strange, Dark &amp; Mysterious Stories',
          podcast_description: '<p>Smart &amp;  less.</p>\n<p>Two&#39;s   company.</p>',
          host_name: 'Jason  Bateman &amp; Co',
          publisher_name: null,
          podcast_categories: [{ category_id: 'sc', category_name: 'Society &amp; Culture' }, 'Kids &amp; Family'],
        }],
      },
      error: null,
    } as never)

    const page = await getWorkspacePodcastCatalog(workspaceId)
    expect(page.items[0]).toMatchObject({
      podcast_name: 'MrBallen Podcast: Strange, Dark & Mysterious Stories',
      podcast_description: "Smart & less. Two's company.",
      host_name: 'Jason Bateman & Co',
      publisher_name: null,
      podcast_categories: [{ category_id: 'sc', category_name: 'Society & Culture' }, 'Kids & Family'],
    })
  })

  it('rejects a response for a different workspace', async () => {
    invoke.mockResolvedValueOnce({
      data: { ...response, workspace: { ...response.workspace, id: '22222222-2222-4222-8222-222222222222' } },
      error: null,
    } as never)

    await expect(getWorkspacePodcastCatalog(workspaceId)).rejects.toThrow(
      'did not match the workspace address',
    )
  })
})
