import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientShortlistEditor } from '@/components/workspace/ClientShortlistEditor'
import {
  addClientShortlistPodcasts,
  getClientShortlist,
  reorderClientShortlistFeatured,
  searchClientPodcastCatalog,
  updateClientShortlistPodcast,
  type ClientShortlistPodcast,
} from '@/services/clientShortlist'

vi.mock('@/services/clientShortlist', () => ({
  addClientShortlistPodcasts: vi.fn(),
  getClientShortlist: vi.fn(),
  reorderClientShortlistFeatured: vi.fn(),
  searchClientPodcastCatalog: vi.fn(),
  updateClientShortlistPodcast: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

function podcast(overrides: Partial<ClientShortlistPodcast> = {}): ClientShortlistPodcast {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    client_id: clientId,
    podcast_id: 'podcast-one',
    podcast_name: 'Founder Stories',
    podcast_description: 'Conversations with company builders.',
    podcast_image_url: null,
    podcast_url: 'https://example.com/founder-stories',
    publisher_name: 'Example Media',
    itunes_rating: 4.8,
    episode_count: 120,
    audience_size: 24_000,
    last_posted_at: '2026-07-20T00:00:00.000Z',
    podcast_categories: null,
    ai_clean_description: null,
    ai_fit_reasons: null,
    ai_pitch_angles: null,
    ai_analyzed_at: null,
    visibility: 'visible',
    display_order: 0,
    is_featured: true,
    featured_order: 0,
    operator_notes: null,
    archived_at: null,
    feedback_status: 'approved',
    feedback_notes: 'This one looks great.',
    feedback_updated_at: '2026-07-22T00:00:00.000Z',
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-22T00:00:00.000Z',
    ...overrides,
  }
}

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ClientShortlistEditor
          workspaceId={workspaceId}
          clientId={clientId}
          clientName="Taylor Client"
          finderHref={`/app/podcast-finder?client=${clientId}`}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ClientShortlistEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getClientShortlist).mockResolvedValue({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [
        podcast(),
        podcast({
          id: '44444444-4444-4444-8444-444444444444',
          podcast_id: 'podcast-two',
          podcast_name: 'Operator Weekly',
          feedback_status: null,
          feedback_notes: null,
          is_featured: false,
          featured_order: null,
          display_order: 1,
        }),
        podcast({
          id: '55555555-5555-4555-8555-555555555555',
          podcast_id: 'podcast-archived',
          podcast_name: 'Archived Show',
          visibility: 'archived',
          feedback_status: 'rejected',
          feedback_notes: null,
          is_featured: false,
          featured_order: null,
          display_order: 2,
          archived_at: '2026-07-23T00:00:00.000Z',
        }),
      ],
    })
    vi.mocked(searchClientPodcastCatalog).mockResolvedValue([])
    vi.mocked(addClientShortlistPodcasts).mockResolvedValue({ added: 1, skipped: 0, podcast_ids: ['podcast-new'] })
    vi.mocked(updateClientShortlistPodcast).mockResolvedValue(podcast())
    vi.mocked(reorderClientShortlistFeatured).mockResolvedValue()
  })

  it('shows the client-visible list, feedback, featured order, and archived dedupe history', async () => {
    renderEditor()

    expect(await screen.findByRole('heading', { name: 'Client podcast list' })).toBeInTheDocument()
    expect(screen.getAllByText('Founder Stories').length).toBeGreaterThan(0)
    expect(screen.getByText('Operator Weekly')).toBeInTheDocument()
    expect(screen.getByText('This one looks great.', { exact: false })).toBeInTheDocument()
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
    expect(screen.getByText('/ 6', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('Archived Show')).not.toBeInTheDocument()
    expect(screen.queryByText(/google sheet/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View details for Founder Stories' }))
    expect(screen.getByRole('heading', { name: 'Founder Stories' })).toBeInTheDocument()
    expect(screen.getByLabelText('Internal notes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('button', { name: 'Archived 1' }))
    expect(screen.getByText('Archived Show')).toBeInTheDocument()
    expect(screen.getByText('Archived', { exact: true })).toBeInTheDocument()
  })

  it('shows no more than ten podcasts on each list page', async () => {
    vi.mocked(getClientShortlist).mockResolvedValue({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: Array.from({ length: 12 }, (_, index) => podcast({
        id: `shortlist-row-${index + 1}`,
        podcast_id: `podcast-${index + 1}`,
        podcast_name: `Podcast ${index + 1}`,
        display_order: index,
        is_featured: false,
        featured_order: null,
      })),
    })
    renderEditor()

    expect(await screen.findByRole('button', { name: 'View details for Podcast 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View details for Podcast 10' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View details for Podcast 11' })).not.toBeInTheDocument()
    expect(screen.getByText('Showing 10 of 12 podcasts')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('button', { name: 'View details for Podcast 11' })).toBeInTheDocument()
    expect(screen.getByText('Showing 2 of 12 podcasts')).toBeInTheDocument()
  })

  it('sorts all podcasts by audience or rating', async () => {
    vi.mocked(getClientShortlist).mockResolvedValue({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [
        podcast({ id: 'row-small', podcast_id: 'small-show', podcast_name: 'Small Show', audience_size: 1_000, itunes_rating: 4.9, is_featured: false, featured_order: null }),
        podcast({ id: 'row-large', podcast_id: 'large-show', podcast_name: 'Large Show', audience_size: 100_000, itunes_rating: 4.1, is_featured: false, featured_order: null }),
        podcast({ id: 'row-medium', podcast_id: 'medium-show', podcast_name: 'Medium Show', audience_size: 25_000, itunes_rating: 4.6, is_featured: false, featured_order: null }),
      ],
    })
    renderEditor()
    await screen.findByRole('button', { name: 'View details for Small Show' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort podcasts' }), { target: { value: 'audience_desc' } })
    expect(screen.getAllByRole('button', { name: /View details for/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'View details for Large Show',
      'View details for Medium Show',
      'View details for Small Show',
    ])

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort podcasts' }), { target: { value: 'rating_desc' } })
    expect(screen.getAllByRole('button', { name: /View details for/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'View details for Small Show',
      'View details for Medium Show',
      'View details for Large Show',
    ])
  })

  it('searches the shared catalog and adds a selected podcast directly to the database list', async () => {
    vi.mocked(searchClientPodcastCatalog).mockResolvedValue([
      {
        podcast_id: 'podcast-new',
        podcast_name: 'The New Show',
        podcast_description: null,
        podcast_image_url: null,
        podcast_url: 'https://example.com/new-show',
        publisher_name: 'New Media',
        itunes_rating: 4.6,
        episode_count: 42,
        audience_size: 8_000,
        last_posted_at: '2026-07-21T00:00:00.000Z',
        podcast_categories: null,
        language: 'en',
        region: 'US',
        podcast_email: null,
        rss_feed: null,
        already_added: false,
        existing_visibility: null,
      },
    ])
    renderEditor()
    await screen.findByRole('heading', { name: 'Client podcast list' })

    fireEvent.click(screen.getByRole('button', { name: 'Add podcasts' }))
    fireEvent.change(screen.getByPlaceholderText('Search by podcast or publisher…'), { target: { value: 'new show' } })
    expect(await screen.findByText('The New Show')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select The New Show' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 selected' }))

    await waitFor(() => expect(addClientShortlistPodcasts).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      [expect.objectContaining({ podcast_id: 'podcast-new', podcast_name: 'The New Show' })],
    ))
  })

  it('saves workspace-only notes from the podcast detail view', async () => {
    vi.mocked(updateClientShortlistPodcast).mockResolvedValue(podcast({ operator_notes: 'Strong fit for the launch.' }))
    renderEditor()
    await screen.findByRole('heading', { name: 'Client podcast list' })

    fireEvent.click(screen.getByRole('button', { name: 'View details for Founder Stories' }))
    fireEvent.change(screen.getByLabelText('Internal notes'), { target: { value: 'Strong fit for the launch.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save internal notes' }))

    await waitFor(() => expect(updateClientShortlistPodcast).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'podcast-one',
      { operator_notes: 'Strong fit for the launch.' },
    ))
  })
})
