import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientShortlistEditor } from '@/components/workspace/ClientShortlistEditor'
import {
  addClientShortlistPodcasts,
  getClientShortlist,
  searchClientPodcastCatalog,
  updateClientShortlistPodcast,
  type ClientShortlistPodcast,
} from '@/services/clientShortlist'
import { getWorkspaceCampaign } from '@/services/workspaceCampaigns'

vi.mock('@/services/clientShortlist', () => ({
  addClientShortlistPodcasts: vi.fn(),
  getClientShortlist: vi.fn(),
  searchClientPodcastCatalog: vi.fn(),
  updateClientShortlistPodcast: vi.fn(),
}))
vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceCampaign: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const podcastRowId = '33333333-3333-4333-8333-333333333333'

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
    podcast_categories: [
      { category_id: 'business', category_name: 'Business' },
      { category_id: 'entrepreneurship', category_name: 'Entrepreneurship' },
    ],
    podcast_email: 'hello@founderstories.fm',
    ai_clean_description: null,
    ai_fit_reasons: null,
    ai_pitch_angles: null,
    ai_analyzed_at: '2026-07-21T00:00:00.000Z',
    // Legacy ai_analyzed_at alone no longer unlocks the pitch flow — the
    // fixture must have completed the real prompt pipeline.
    research_progress: {
      status: 'completed',
      current_stage: null,
      completed_stages: ['podcast_profile', 'recent_episodes', 'host_profile', 'guest_patterns', 'guest_fit', 'pitch_angles'],
      started_at: '2026-07-21T00:00:00.000Z',
      updated_at: '2026-07-21T00:02:00.000Z',
    },
    visibility: 'visible',
    display_order: 0,
    is_featured: true,
    featured_order: 0,
    operator_notes: null,
    archived_at: null,
    feedback_status: 'approved',
    feedback_notes: 'This one looks great.',
    feedback_updated_at: '2026-07-22T00:00:00.000Z',
    prior_outreach_at: null,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-22T00:00:00.000Z',
    ...overrides,
  }
}

function renderEditor(
  viewerRole: 'owner' | 'admin' | 'member' | 'platform_admin' = 'owner',
  // Defaulted to what a tenant's own people get, so the workspace base every
  // pitch link is built on can be asserted with an address that is nobody's
  // hardcoded fallback.
  hrefs: { campaignHref?: string } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ClientShortlistEditor
          workspaceId={workspaceId}
          clientId={clientId}
          clientName="Taylor Client"
          clientBio="Taylor helps founders turn complicated ideas into practical growth systems."
          viewerRole={viewerRole}
          databaseHref={`/app/podcast-database?client=${clientId}`}
          finderHref={`/app/podcast-finder?client=${clientId}`}
          campaignHref={hrefs.campaignHref ?? `/app/client-campaigns/${clientId}`}
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
    vi.mocked(getWorkspaceCampaign).mockResolvedValue({
      integration: {} as never,
      can_manage_campaigns: true,
      campaign: {
        id: 'campaign-one',
        name: 'Taylor Client Podcast Outreach',
        instantly_campaign_id: '77777777-7777-4777-8777-777777777777',
      } as never,
      targets: [],
    })
  })

  it('shows the client-visible list, feedback, featured order, and archived dedupe history', async () => {
    renderEditor()

    expect(await screen.findByRole('heading', { name: 'Shortlist' })).toBeInTheDocument()
    expect(screen.getAllByText('Founder Stories').length).toBeGreaterThan(0)
    expect(screen.getByText('Operator Weekly')).toBeInTheDocument()
    expect(screen.getByText('This one looks great.', { exact: false })).toBeInTheDocument()
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Founder Stories is featured')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Featured recommendations' })).not.toBeInTheDocument()
    expect(screen.getByText('/ 6', { exact: false })).toBeInTheDocument()
    expect(screen.queryByText('Archived Show')).not.toBeInTheDocument()
    expect(screen.queryByText(/google sheet/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^Hidden\b/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse database' })).toHaveAttribute(
      'href',
      `/app/podcast-database?client=${clientId}`,
    )

    fireEvent.click(screen.getByRole('button', { name: 'View details for Founder Stories' }))
    expect(screen.getByRole('heading', { name: 'Founder Stories' })).toBeInTheDocument()
    expect(screen.getByLabelText('Internal notes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('button', { name: 'Archived 1' }))
    expect(screen.getByText('Archived Show')).toBeInTheDocument()
    expect(screen.getAllByText('Archived', { exact: true }).length).toBeGreaterThan(0)
  })

  it('hides the empty featured panel and keeps featuring in the actions menu', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({ is_featured: false, featured_order: null })],
    })
    renderEditor()

    expect(await screen.findByRole('heading', { name: 'All podcasts' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Featured recommendations' })).not.toBeInTheDocument()
    const actions = screen.getByRole('button', { name: 'Actions for Founder Stories' })
    actions.focus()
    fireEvent.keyDown(actions, { key: 'Enter', code: 'Enter' })
    expect(await screen.findByRole('menuitem', { name: 'Add to featured' })).toBeInTheDocument()
  })

  it('marks a previously contacted podcast and links it to a re-pitch', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({
        prior_outreach_at: '2026-07-10T00:00:00.000Z',
        agency_relationship: {
          podcast_id: 'podcast-one',
          state: 'pitched',
          touch_count: 1,
          last_contacted_at: '2026-07-10T00:00:00.000Z',
          last_client_name: 'Earlier Client',
          booked_client_name: null,
          booked_at: null,
          booked_episode_url: null,
          replied_client_name: null,
          contact_email: 'host@founderstories.fm',
          same_contact_other_show: false,
          manual_stage: null,
          summary: 'The first angle focused on founder operations.',
        },
      })],
    })
    renderEditor()

    expect((await screen.findAllByLabelText('Founder Stories was previously contacted')).length).toBeGreaterThan(0)
    const writePitch = screen.getByRole('link', { name: 'Write Re-pitch for Founder Stories' })
    expect(writePitch).toHaveTextContent('Write Re-pitch')
    // The relationship warning itself lives on the pitch page.
    expect(writePitch).toHaveAttribute('href', `/app/clients/${clientId}/podcasts/${podcastRowId}/pitch`)

    fireEvent.click(screen.getByRole('button', { name: 'View details for Founder Stories' }))
    expect(screen.getByRole('heading', { name: 'Outreach history' })).toBeInTheDocument()
    expect(screen.getByText(/prepare a re-pitch/i)).toBeInTheDocument()
  })

  /*
   * The editor is given no route context beyond the campaign address, so the
   * workspace base of every pitch link is what precedes it. Asserted at an
   * address no fallback would produce, or a hardcoded /app/… would pass.
   */
  it('links each approved podcast to its pitch page inside the workspace being viewed', async () => {
    renderEditor('platform_admin', {
      campaignHref: `/app/workspaces/${workspaceId}/client-campaigns/${clientId}`,
    })

    expect(await screen.findByRole('link', { name: 'Write Pitch for Founder Stories' })).toHaveAttribute(
      'href',
      `/app/workspaces/${workspaceId}/clients/${clientId}/podcasts/${podcastRowId}/pitch`,
    )
    // Only approved, visible podcasts get one.
    expect(screen.queryByRole('link', { name: /for Operator Weekly$/ })).not.toBeInTheDocument()
  })

  it('lets an owner mark a podcast approved or passed directly from its actions menu', async () => {
    vi.mocked(updateClientShortlistPodcast).mockResolvedValue(podcast({
      podcast_id: 'podcast-two',
      podcast_name: 'Operator Weekly',
      feedback_status: 'approved',
    }))
    renderEditor()
    await screen.findByText('Operator Weekly')

    const actions = screen.getByRole('button', { name: 'Actions for Operator Weekly' })
    actions.focus()
    fireEvent.keyDown(actions, { key: 'Enter', code: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: /Mark approved/i }))

    await waitFor(() => expect(updateClientShortlistPodcast).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'podcast-two',
      { feedback_status: 'approved' },
    ))
    expect(screen.queryByRole('menuitem', { name: /Hide from client/i })).not.toBeInTheDocument()
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
    await screen.findByRole('heading', { name: 'Shortlist' })

    fireEvent.click(screen.getByRole('button', { name: 'Quick add' }))
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

  it('keeps a podcast ticked under an earlier search in the add', async () => {
    const catalogRow = (id: string, name: string) => ({
      podcast_id: id,
      podcast_name: name,
      podcast_description: null,
      podcast_image_url: null,
      podcast_url: `https://example.com/${id}`,
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
    })
    vi.mocked(searchClientPodcastCatalog).mockImplementation(async (_workspace, _client, query) => (
      query === 'first' ? [catalogRow('podcast-first', 'The First Show')] : [catalogRow('podcast-second', 'The Second Show')]
    ))
    renderEditor()
    await screen.findByRole('heading', { name: 'Shortlist' })

    fireEvent.click(screen.getByRole('button', { name: 'Quick add' }))
    const search = screen.getByLabelText('Search the podcast catalog')
    fireEvent.change(search, { target: { value: 'first' } })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select The First Show' }))
    expect(screen.getByRole('button', { name: 'Add 1 selected' })).toBeInTheDocument()

    // The count and the add used to intersect ticks with the CURRENT results,
    // so a show ticked under the previous search silently fell out of both.
    fireEvent.change(search, { target: { value: 'second' } })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select The Second Show' }))
    expect(screen.queryByText('The First Show')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 selected' }))

    await waitFor(() => expect(addClientShortlistPodcasts).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      [
        expect.objectContaining({ podcast_id: 'podcast-first' }),
        expect.objectContaining({ podcast_id: 'podcast-second' }),
      ],
    ))
  })

  it('saves workspace-only notes from the podcast detail view', async () => {
    vi.mocked(updateClientShortlistPodcast).mockResolvedValue(podcast({ operator_notes: 'Strong fit for the launch.' }))
    renderEditor()
    await screen.findByRole('heading', { name: 'Shortlist' })

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

  // The row could not see the campaign, so a podcast already out with the host
  // still offered "Write Pitch" — a button promising work the next screen
  // opens locked and refuses.
  it('offers to view, not write, a pitch already in active outreach', async () => {
    vi.mocked(getWorkspaceCampaign).mockResolvedValue({
      integration: {} as never,
      can_manage_campaigns: true,
      campaign: {
        id: 'campaign-one',
        name: 'Taylor Client Podcast Outreach',
        instantly_campaign_id: '77777777-7777-4777-8777-777777777777',
      } as never,
      targets: [{
        shortlist_podcast_id: '33333333-3333-4333-8333-333333333333',
        status: 'in_outreach',
        instantly_lead_id: 'lead-one',
      }] as never,
    })
    renderEditor()

    expect(await screen.findByRole('link', { name: 'View Pitch for Founder Stories' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Write Pitch for Founder Stories' })).not.toBeInTheDocument()
  })

  it('still offers to write when nothing has been sent', async () => {
    renderEditor()

    expect(await screen.findByRole('link', { name: 'Write Pitch for Founder Stories' })).toHaveAttribute(
      'href',
      `/app/clients/${clientId}/podcasts/${podcastRowId}/pitch`,
    )
  })
})
