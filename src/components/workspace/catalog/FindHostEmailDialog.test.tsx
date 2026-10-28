import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FindHostEmailDialog } from './FindHostEmailDialog'
import { addClientShortlistPodcasts, getClientShortlist } from '@/services/clientShortlist'
import type { WorkspacePodcastCatalogItem } from '@/services/workspacePodcastCatalog'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))
vi.mock('@/services/clientShortlist', () => ({ addClientShortlistPodcasts: vi.fn(), getClientShortlist: vi.fn() }))
const podcast = { podcast_id: 'pd_show', podcast_name: 'Example Show', free_podscan_email: 'show@example.com' } as WorkspacePodcastCatalogItem
function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  queryClient.setQueryData(['client-shortlist', 'workspace-1', 'client-1'], { podcasts: [] })
  render(<QueryClientProvider client={queryClient}>
    <FindHostEmailDialog podcast={podcast} clients={[{ id: 'client-1', name: 'Jim' }]} defaultClientId="client-1" workspaceId="workspace-1" baseHref="/app" onClose={vi.fn()} />
  </QueryClientProvider>)
  return queryClient
}
beforeEach(() => vi.clearAllMocks())
describe('Find host email entry point', () => {
  it('opens the existing shortlist row without adding it again', async () => {
    vi.mocked(getClientShortlist).mockResolvedValue({ podcasts: [{ id: 'row-1', podcast_id: 'pd_show' }] } as never)
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to pitch workspace' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/app/clients/client-1/podcasts/row-1/pitch'))
    expect(addClientShortlistPodcasts).not.toHaveBeenCalled()
  })
  it('adds a missing show then opens the server-created shortlist row', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({ podcasts: [] } as never)
      .mockResolvedValueOnce({ podcasts: [{ id: 'row-2', podcast_id: 'pd_show' }] } as never)
    vi.mocked(addClientShortlistPodcasts).mockResolvedValue({ added: 1, skipped: 0, podcast_ids: ['pd_show'] })
    const queryClient = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to pitch workspace' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/app/clients/client-1/podcasts/row-2/pitch'))
    expect(queryClient.getQueryData(['client-shortlist', 'workspace-1', 'client-1'])).toEqual({ podcasts: [{ id: 'row-2', podcast_id: 'pd_show' }] })
    expect(addClientShortlistPodcasts).toHaveBeenCalledWith('workspace-1', 'client-1', [expect.objectContaining({ podcast_id: 'pd_show' })])
  })
  it('keeps the dialog open if the shortlist cannot be read', async () => {
    vi.mocked(getClientShortlist).mockRejectedValue(new Error('Unable to load shortlist'))
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to pitch workspace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load shortlist')
    expect(navigate).not.toHaveBeenCalled()
    expect(addClientShortlistPodcasts).not.toHaveBeenCalled()
  })
})
