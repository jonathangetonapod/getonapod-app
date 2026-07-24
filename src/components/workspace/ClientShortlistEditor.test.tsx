import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import { getWorkspaceCampaign, prepareWorkspaceCampaignPodcast } from '@/services/workspaceCampaigns'

vi.mock('@/services/clientShortlist', () => ({
  addClientShortlistPodcasts: vi.fn(),
  getClientShortlist: vi.fn(),
  reorderClientShortlistFeatured: vi.fn(),
  searchClientPodcastCatalog: vi.fn(),
  updateClientShortlistPodcast: vi.fn(),
}))
vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceCampaign: vi.fn(),
  prepareWorkspaceCampaignPodcast: vi.fn(),
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
    podcast_categories: [
      { category_id: 'business', category_name: 'Business' },
      { category_id: 'entrepreneurship', category_name: 'Entrepreneurship' },
    ],
    podcast_email: 'hello@founderstories.fm',
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
          clientBio="Taylor helps founders turn complicated ideas into practical growth systems."
          finderHref={`/app/podcast-finder?client=${clientId}`}
          campaignHref={`/app/client-campaigns/${clientId}`}
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
    vi.mocked(prepareWorkspaceCampaignPodcast).mockResolvedValue({
      added: true,
      campaign: { name: 'Taylor Client Podcast Outreach' } as never,
      target: {} as never,
    })
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
    expect(screen.queryByText(/^Hidden\b/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View details for Founder Stories' }))
    expect(screen.getByRole('heading', { name: 'Founder Stories' })).toBeInTheDocument()
    expect(screen.getByLabelText('Internal notes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('button', { name: 'Archived 1' }))
    expect(screen.getByText('Archived Show')).toBeInTheDocument()
    expect(screen.getAllByText('Archived', { exact: true }).length).toBeGreaterThan(0)
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

  it('opens a Write Pitch workspace for research, contact finding, and outreach preparation', async () => {
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    expect(await screen.findByRole('heading', { name: 'Write a pitch for Founder Stories' })).toBeInTheDocument()
    const podcastContext = within(screen.getByRole('region', { name: 'Podcast context' }))
    expect(podcastContext.getByRole('heading', { name: 'Founder Stories' })).toBeInTheDocument()
    expect(podcastContext.getByText('Example Media')).toBeInTheDocument()
    expect(podcastContext.queryByText('Conversations with company builders.')).not.toBeInTheDocument()
    expect(podcastContext.queryByText('24K')).not.toBeInTheDocument()
    const showStatsButton = podcastContext.getByRole('button', { name: 'Show podcast stats' })
    expect(showStatsButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(showStatsButton)
    expect(podcastContext.getByRole('button', { name: 'Hide podcast stats' })).toHaveAttribute('aria-expanded', 'true')
    expect(podcastContext.getByText('Conversations with company builders.')).toBeInTheDocument()
    expect(podcastContext.getByText('24K')).toBeInTheDocument()
    expect(podcastContext.getByText('4.8')).toBeInTheDocument()
    expect(podcastContext.getByText('120')).toBeInTheDocument()
    expect(podcastContext.getByText('Jul 20, 2026')).toBeInTheDocument()
    expect(podcastContext.getByText('Business')).toBeInTheDocument()
    expect(podcastContext.getByText(/This one looks great/)).toBeInTheDocument()
    expect(podcastContext.getByRole('link', { name: 'Open show' })).toHaveAttribute('href', 'https://example.com/founder-stories')
    expect(screen.getByRole('heading', { name: 'Find the email' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use free podcast email' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('hello@founderstories.fm')).toBeInTheDocument()
    expect(screen.getByText('0 credits · Basic')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try waterfall enrichment' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Enter email manually' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('1 credit on success')).toBeInTheDocument()
    expect(screen.getByText(/stronger route for reply potential/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try waterfall enrichment' }))
    expect(screen.getByRole('button', { name: 'Try waterfall enrichment' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Waterfall enrichment plan')).toBeInTheDocument()
    expect(screen.getByText('Identify host')).toBeInTheDocument()
    expect(screen.getByText('Match LinkedIn')).toBeInTheDocument()
    expect(screen.getByText('Verify email')).toBeInTheDocument()
    expect(screen.getByText(/No verified direct email means no credit is charged/i)).toBeInTheDocument()
    const billingLink = screen.getByRole('link', { name: 'Buy credits in Billing' })
    expect(billingLink).toHaveAttribute('href', '/app/settings/billing')
    expect(billingLink).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/Billing opens in a new tab so this pitch stays here/i)).toBeInTheDocument()
    expect(screen.queryByText('Contact record')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Host or producer')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Research the podcast' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Write the pitch' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Research notes')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Opening email')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enter email manually' }))
    expect(screen.getByRole('button', { name: 'Enter email manually' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Waterfall enrichment plan')).not.toBeInTheDocument()
    const manualEmail = screen.getByLabelText('Email address')
    const continueButton = screen.getByRole('button', { name: 'Continue to research' })
    expect(continueButton).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Step 2: Research locked until an email is ready' })).toBeDisabled()
    fireEvent.change(manualEmail, { target: { value: 'not-an-email' } })
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(continueButton).toBeDisabled()
    fireEvent.change(manualEmail, { target: { value: 'host@founderstories.fm' } })
    expect(continueButton).toBeEnabled()
    fireEvent.click(continueButton)

    expect(screen.getByRole('heading', { name: 'Research the podcast' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Podcast context' })).toBeInTheDocument()
    expect(screen.getByLabelText('Research notes')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Find the email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use free podcast email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try waterfall enrichment' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Opening email')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continue to write pitch' }))

    expect(screen.getByRole('heading', { name: 'Write the pitch' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Podcast context' })).toBeInTheDocument()
    expect(screen.getByLabelText('Opening email')).toBeInTheDocument()
    expect(screen.getByLabelText('Follow-up 1 email')).toBeInTheDocument()
    expect(screen.getByLabelText('Follow-up 2 email')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Find the email' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Research the podcast' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Research notes')).not.toBeInTheDocument()
    expect(screen.getByText(/Nothing sends from this modal/i)).toBeInTheDocument()

    const saveButton = screen.getByRole('button', { name: 'Save pitch draft' })
    await waitFor(() => expect(saveButton).toBeEnabled())
    fireEvent.click(saveButton)

    await waitFor(() => expect(prepareWorkspaceCampaignPodcast).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      clientId,
      shortlistPodcastId: '33333333-3333-4333-8333-333333333333',
      contactEmail: 'host@founderstories.fm',
      subject: 'Guest idea for Founder Stories: Taylor Client',
      pitchBody: expect.stringContaining('Founder Stories'),
      followUpOneBody: expect.stringContaining('Just following up'),
      followUpTwoBody: expect.stringContaining('One last note'),
    })))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Write a pitch for Founder Stories' })).not.toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Write Pitch for Operator Weekly' })).not.toBeInTheDocument()
  })

  it('requires a valid manually entered email when no public podcast email is available', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({ podcast_email: null })],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    expect(await screen.findByText('No public email found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use free podcast email' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Try waterfall enrichment' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Step 2: Research locked until an email is ready' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Archive podcast' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Enter email manually' }))
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'producer@example.com' } })
    expect(screen.getByRole('button', { name: 'Continue to research' })).toBeEnabled()
    expect(screen.queryByText('Contact record')).not.toBeInTheDocument()
  })

  it('offers the existing archive flow when no email can be supplied', async () => {
    vi.mocked(getClientShortlist).mockResolvedValueOnce({
      client: { id: clientId, name: 'Taylor Client' },
      podcasts: [podcast({ podcast_email: null })],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Archive podcast' }))
    expect(await screen.findByRole('heading', { name: 'Archive this podcast?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Archive podcast' }))

    await waitFor(() => expect(updateClientShortlistPodcast).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'podcast-one',
      { visibility: 'archived' },
    ))
  })

  it('keeps the pitch design visible when campaign setup is not ready', async () => {
    vi.mocked(getWorkspaceCampaign).mockResolvedValueOnce({
      integration: {} as never,
      can_manage_campaigns: true,
      campaign: null,
      targets: [],
    })
    renderEditor()
    fireEvent.click(await screen.findByRole('button', { name: 'Write Pitch for Founder Stories' }))

    expect(await screen.findByRole('heading', { name: 'Write a pitch for Founder Stories' })).toBeInTheDocument()
    const continueToResearch = screen.getByRole('button', { name: 'Continue to research' })
    await waitFor(() => expect(continueToResearch).toBeEnabled())
    fireEvent.click(continueToResearch)
    fireEvent.click(screen.getByRole('button', { name: 'Continue to write pitch' }))
    expect(screen.getByText('You can design the pitch now')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Campaign setup' })).toHaveAttribute('href', `/app/client-campaigns/${clientId}`)
    expect(screen.getByRole('button', { name: 'Save pitch draft' })).toBeDisabled()
    expect(prepareWorkspaceCampaignPodcast).not.toHaveBeenCalled()
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
