import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceCampaigns from '@/pages/app/WorkspaceCampaigns'
import { getClientShortlist, type ClientShortlistPodcast } from '@/services/clientShortlist'
import { getWorkspaceClientDetail, type WorkspaceClient, type WorkspaceClientDetail } from '@/services/clients'
import {
  connectWorkspaceInstantly,
  getWorkspaceCampaignOverview,
  refreshWorkspaceCampaignAnalytics,
  refreshWorkspaceInstantly,
  saveWorkspaceCampaign,
  type WorkspaceCampaignOverview,
} from '@/services/workspaceCampaigns'

vi.mock('@/services/clientShortlist', () => ({ getClientShortlist: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClientDetail: vi.fn() }))
vi.mock('@/services/workspaceCampaigns', () => ({
  connectWorkspaceInstantly: vi.fn(),
  disconnectWorkspaceInstantly: vi.fn(),
  getWorkspaceCampaignOverview: vi.fn(),
  refreshWorkspaceCampaignAnalytics: vi.fn(),
  refreshWorkspaceInstantly: vi.fn(),
  saveWorkspaceCampaign: vi.fn(),
}))

const mockedShortlist = vi.mocked(getClientShortlist)
const mockedDetail = vi.mocked(getWorkspaceClientDetail)
const mockedOverview = vi.mocked(getWorkspaceCampaignOverview)
const mockedSaveCampaign = vi.mocked(saveWorkspaceCampaign)
const mockedConnectInstantly = vi.mocked(connectWorkspaceInstantly)
const mockedRefreshInstantly = vi.mocked(refreshWorkspaceInstantly)
const mockedRefreshAnalytics = vi.mocked(refreshWorkspaceCampaignAnalytics)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

const client: WorkspaceClient = {
  id: clientId,
  workspace_id: workspaceId,
  name: 'Dallas Fontaine',
  email: 'dallas@example.com',
  contact_person: 'Dallas Fontaine',
  linkedin_url: null,
  website: 'https://dallas.example.com',
  status: 'active',
  notes: null,
  created_at: '2026-07-01T12:00:00Z',
  updated_at: '2026-07-20T12:00:00Z',
}

const detail = {
  workspace: { id: workspaceId, name: 'Acme', slug: 'acme', status: 'active', is_default: false, logo_path: null, logo_updated_at: null },
  viewer_role: 'owner',
  can_manage: true,
  client: { ...client, bio: 'Founder and speaker', photo_url: null, calendar_link: null, media_kit_url: null, prospect_dashboard_slug: null, dashboard_slug: null, dashboard_enabled: false, portal_access_enabled: false, portal_last_login_at: null, password_set_at: null },
  dashboard: { configured: false, enabled: false, tagline: null, view_count: 0, last_viewed_at: null, podcast_count: 2, reviewed_count: 1, approved_count: 1, rejected_count: 0, to_review_count: 1, analyzed_count: 2, last_synced_at: null, last_feedback_at: null },
  outreach: { initial_emails_sent: 12, podcasts_contacted: 9, pending_review_count: 2, approved_count: 1, failed_count: 0, last_sent_at: '2026-07-22T12:00:00Z' },
  bookings: [{ id: 'booking-1', client_id: clientId, podcast_id: 'podcast-one', podcast_name: 'Founder Show', podcast_url: null, host_name: 'Jamie', scheduled_date: null, recording_date: null, publish_date: null, status: 'booked', episode_url: null, prep_sent: false, notes: null, created_at: '2026-07-20T12:00:00Z', updated_at: '2026-07-20T12:00:00Z' }],
  onboarding: null,
} as WorkspaceClientDetail

const podcasts = [
  {
    id: 'shortlist-one',
    client_id: clientId,
    podcast_id: 'podcast-one',
    podcast_name: 'Founder Show',
    podcast_email: 'host@founder.example',
    visibility: 'visible',
    feedback_status: 'approved',
    display_order: 0,
    created_at: '2026-07-21T12:00:00Z',
    updated_at: '2026-07-21T12:00:00Z',
  },
  {
    id: 'shortlist-two',
    client_id: clientId,
    podcast_id: 'podcast-two',
    podcast_name: 'Operator Stories',
    podcast_email: null,
    visibility: 'visible',
    feedback_status: null,
    display_order: 1,
    created_at: '2026-07-21T12:00:00Z',
    updated_at: '2026-07-21T12:00:00Z',
  },
] as ClientShortlistPodcast[]

const campaignOverview = {
  integration: {
    connected: false,
    status: 'disconnected',
    provider_workspace_id: null,
    provider_workspace_name: null,
    api_key_last_four: null,
    accounts: [],
    active_account_count: 0,
    connected_at: null,
    last_verified_at: null,
    last_error: null,
    can_manage: true,
    required_scopes: [],
  },
  can_manage_campaigns: true,
  campaigns: [],
  provider_campaigns: [],
  provider_campaigns_error: null,
} as WorkspaceCampaignOverview

const connectedIntegration = {
  ...campaignOverview.integration,
  connected: true,
  status: 'connected' as const,
  provider_workspace_id: '44444444-4444-4444-8444-444444444444',
  provider_workspace_name: 'Power Payback 1',
  api_key_last_four: 'test',
  accounts: [
    { email: 'active@example.com', first_name: 'Active', last_name: 'Sender', status: 1, warmup_status: 1, daily_limit: 40 },
    { email: 'paused@example.com', first_name: 'Paused', last_name: 'Sender', status: 0, warmup_status: 0, daily_limit: 20 },
  ],
  active_account_count: 1,
}

const persistedCampaign = {
  id: '55555555-5555-4555-8555-555555555555',
  workspace_id: workspaceId,
  client_id: clientId,
  // Monday to Friday, in Instantly's own indexing where 0 is Sunday.
  send_days: [1, 2, 3, 4, 5],
  send_window_start: '09:00',
  send_window_end: '17:00',
  follow_up_one_delay_days: 6,
  follow_up_two_delay_days: 7,
  name: 'Dallas Fontaine Podcast Outreach',
  status: 'active' as const,
  instantly_campaign_id: '66666666-6666-4666-8666-666666666666',
  instantly_campaign_status: 1,
  sender_accounts: ['active@example.com'],
  timezone: 'America/New_York',
  daily_limit: 30,
  analytics: { emails_sent_count: 12, contacted_count: 9, open_count_unique: 4, reply_count_unique: 2, bounced_count: 0, unsubscribed_count: 0, total_interested: 1, total_meeting_booked: 0 },
  target_counts: { total: 2, needs_contact: 1, needs_pitch: 0, ready: 0, in_outreach: 1, replied: 1, failed: 0, staged: 0, staged_sending: 0 },
  provider_schedule: null,
  provider_email_gap: null,
  provider_not_sending_status: null,
  target_shortlist_podcast_ids: ['shortlist-one', 'shortlist-two'],
  last_synced_at: '2026-07-23T12:00:00Z',
  last_error: null,
  created_at: '2026-07-20T12:00:00Z',
  updated_at: '2026-07-23T12:00:00Z',
}

const Location = () => {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

const secondClientId = '77777777-7777-4777-8777-777777777777'
const secondClient: WorkspaceClient = { ...client, id: secondClientId, name: 'Ana Boyd', email: 'ana@example.com' }

function renderCampaigns(clients: WorkspaceClient[] = [client], initialEntry = '/app/client-campaigns') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceCampaigns
          workspaceId={workspaceId}
          clients={clients}
          clientsLoading={false}
          clientsError={null}
          baseHref="/app"
          onRetryClients={vi.fn()}
        />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceCampaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedDetail.mockResolvedValue(detail)
    mockedShortlist.mockResolvedValue({ client: { id: clientId, name: client.name }, podcasts })
    mockedOverview.mockResolvedValue(campaignOverview)
    mockedSaveCampaign.mockResolvedValue({ campaign: null, targets: [] })
    mockedConnectInstantly.mockResolvedValue({
      ...campaignOverview.integration,
      connected: true,
      status: 'connected',
      provider_workspace_id: '44444444-4444-4444-8444-444444444444',
      provider_workspace_name: 'Acme Instantly',
      api_key_last_four: 'test',
    })
  })

  it('organizes real client outreach into an operational campaign table', async () => {
    mockedOverview.mockResolvedValueOnce({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [persistedCampaign],
      provider_campaigns: [{ id: persistedCampaign.instantly_campaign_id, name: persistedCampaign.name, status: 1, sender_accounts: ['active@example.com'], timezone: 'America/New_York', daily_limit: 30, timestamp_created: '2026-07-20T12:00:00Z', timestamp_updated: '2026-07-23T12:00:00Z', mapped_client_id: clientId }],
    })
    renderCampaigns()

    const table = await screen.findByRole('table')
    expect(within(table).getByRole('link', { name: `${client.name} Podcast Outreach` })).toHaveAttribute('href', `/app/client-campaigns/${clientId}`)
    expect(screen.getByRole('combobox', { name: 'Filter campaigns by client' })).toHaveTextContent('All clients')
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    expect(within(table).getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Client' })).toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: 'Sender' })).not.toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Progress' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Sent' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Replies' })).toBeInTheDocument()
    // Replies and positive replies were two columns answering one question.
    expect(within(table).queryByRole('columnheader', { name: 'Positive replies' })).not.toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Next step' })).toBeInTheDocument()
    expect(within(table).getByText('12')).toBeInTheDocument()
    expect(within(table).queryByText('active@example.com')).not.toBeInTheDocument()
    expect(screen.getByText('22% of 9 contacted replied')).toBeInTheDocument()
    expect(screen.queryByText('Ready to launch')).not.toBeInTheDocument()
    expect(screen.queryByText(/Feb 16–22|podcasts in view|Current wave/i)).not.toBeInTheDocument()
  })

  /*
   * The Dallas-class incident: a campaign whose Instantly side was deleted sat
   * on this list rendering last-seen numbers as current until a send 409'd.
   * The overview now names it from the listing already on the wire.
   */
  it('marks a campaign whose Instantly side no longer exists', async () => {
    mockedOverview.mockResolvedValueOnce({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [{ ...persistedCampaign, provider_missing: true }],
      provider_campaigns: [],
    })
    renderCampaigns()

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Not in Instantly')).toBeInTheDocument()
  })

  // A failed read is not an empty list: this used to render "No Instantly
  // campaigns assigned yet" as fact on any overview error.
  it('shows the failure and a retry when the overview cannot be read', async () => {
    mockedOverview.mockRejectedValueOnce(new Error('The campaigns response could not be read. Try again.'))
    renderCampaigns()

    expect(await screen.findByText('Campaigns could not be loaded')).toBeInTheDocument()
    // The connection card renders its own retry too; at least one must exist.
    expect(screen.getAllByRole('button', { name: 'Try again' }).length).toBeGreaterThan(0)
    expect(screen.queryByText('No campaigns yet.')).not.toBeInTheDocument()
  })

  // Rows display the campaign's real name; the search used to look only at
  // the client name and a synthetic default, so it could not find the very
  // text the Name column showed.
  it('finds a campaign by the name the row displays', async () => {
    mockedOverview.mockResolvedValueOnce({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [{ ...persistedCampaign, name: 'Q3 Solar Blitz' }],
      provider_campaigns: [],
    })
    renderCampaigns()

    await screen.findByRole('table')
    fireEvent.change(screen.getByPlaceholderText('Search campaigns…'), { target: { value: 'solar' } })
    expect(screen.getByRole('link', { name: 'Q3 Solar Blitz' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search campaigns…'), { target: { value: 'zzz-no-match' } })
    expect(screen.getByText('No campaigns match this view')).toBeInTheDocument()
  })

  // The table used to fetch each client's detail and shortlist — two requests
  // per row — and render neither. The cost was a spinner per row and, on a
  // failure, an "Unavailable" badge over a campaign that had loaded fine.
  it('renders the whole table from the overview without a request per row', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [persistedCampaign],
    })
    renderCampaigns()

    const table = await screen.findByRole('table')
    expect(within(table).getByRole('link', { name: `${client.name} Podcast Outreach` })).toBeInTheDocument()
    expect(mockedDetail).not.toHaveBeenCalled()
    expect(mockedShortlist).not.toHaveBeenCalled()
    expect(within(table).queryByText('Unavailable')).not.toBeInTheDocument()
  })

  it('sends the next step to the place that work is done', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [{
        ...persistedCampaign,
        target_counts: { ...persistedCampaign.target_counts, needs_pitch: 3, needs_contact: 0, staged: 0, staged_sending: 0, ready: 0 },
      }],
    })
    renderCampaigns()

    // Writing a pitch happens on the client's shortlist, not on the campaign page.
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('link', { name: 'Write 3 pitches' }))
      .toHaveAttribute('href', `/app/clients/${clientId}?tab=shortlist`)
  })

  it('points a launch step at the campaign options, where the launch button is', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [{
        ...persistedCampaign,
        target_counts: { ...persistedCampaign.target_counts, staged: 2, staged_sending: 0, needs_pitch: 0, needs_contact: 0 },
      }],
    })
    renderCampaigns()

    const table = await screen.findByRole('table')
    expect(within(table).getByRole('link', { name: 'Launch 2 staged pitches' }))
      .toHaveAttribute('href', `/app/client-campaigns/${clientId}?tab=options`)
  })

  // Pitches added to a live campaign send on the next window with nobody
  // pressing launch. It was a table cell; it is the one state on this page
  // where real hosts are being emailed right now.
  it('raises staged pitches that are already emailing hosts to the top of the page', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [{
        ...persistedCampaign,
        target_counts: { ...persistedCampaign.target_counts, staged: 5, staged_sending: 3 },
      }],
    })
    renderCampaigns()

    expect(await screen.findByText('3 pitches are already emailing hosts')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Review/ })).toHaveAttribute('href', `/app/client-campaigns/${clientId}?tab=leads`)
  })

  it('says nothing about sending when no staged pitch is live', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [{
        ...persistedCampaign,
        target_counts: { ...persistedCampaign.target_counts, staged: 5, staged_sending: 0 },
      }],
    })
    renderCampaigns()

    await screen.findByRole('table')
    expect(screen.queryByText(/already emailing hosts/)).not.toBeInTheDocument()
  })

  // Totals arrive only when somebody presses Refresh totals, so their age has
  // to be on screen next to them.
  it('marks totals that have not been synced in over a day', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [{ ...persistedCampaign, last_synced_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() }],
    })
    renderCampaigns()

    expect(await screen.findByText('Totals synced 3 days ago')).toBeInTheDocument()
  })

  it('sorts the table by the column the operator picks', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [
        { ...persistedCampaign, target_counts: { ...persistedCampaign.target_counts, staged: 1, staged_sending: 0 } },
        {
          ...persistedCampaign,
          id: '88888888-8888-4888-8888-888888888888',
          client_id: secondClientId,
          name: 'Ana Boyd Podcast Outreach',
          instantly_campaign_id: '99999999-9999-4999-8999-999999999999',
          target_counts: { ...persistedCampaign.target_counts, staged: 9, staged_sending: 0 },
        },
      ],
      provider_campaigns: [],
    })
    renderCampaigns([client, secondClient])

    const table = await screen.findByRole('table')
    const names = () => within(table).getAllByRole('row').slice(1)
      .map((row) => within(row).getAllByRole('cell')[1].textContent)

    // Default order is status first, then client name alphabetically.
    expect(names()).toEqual(['Ana Boyd', 'Dallas Fontaine'])

    // Staged opens on the largest, because the question is "who has the most?".
    fireEvent.click(within(table).getByRole('button', { name: 'Staged' }))
    expect(names()).toEqual(['Ana Boyd', 'Dallas Fontaine'])
    expect(within(table).getByRole('columnheader', { name: 'Staged' })).toHaveAttribute('aria-sort', 'descending')

    fireEvent.click(within(table).getByRole('button', { name: 'Staged' }))
    expect(names()).toEqual(['Dallas Fontaine', 'Ana Boyd'])
    expect(within(table).getByRole('columnheader', { name: 'Staged' })).toHaveAttribute('aria-sort', 'ascending')

    // A third click returns to the default rather than stranding the operator.
    fireEvent.click(within(table).getByRole('button', { name: 'Staged' }))
    expect(within(table).getByRole('columnheader', { name: 'Staged' })).toHaveAttribute('aria-sort', 'none')
    expect(names()).toEqual(['Ana Boyd', 'Dallas Fontaine'])
  })

  it('shows the bounce rate that says a sending domain is burning', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [{
        ...persistedCampaign,
        analytics: {
          ...persistedCampaign.analytics,
          emails_sent_count: 100,
          bounced_count: 9,
          unsubscribed_count: 2,
        },
      }],
    })
    renderCampaigns()

    // Collected on every sync and previously shown nowhere.
    expect(await screen.findByText('Bounce rate')).toBeInTheDocument()
    expect(screen.getByText('9%')).toBeInTheDocument()
    expect(screen.getByText('9 bounced · 2 unsubscribed')).toBeInTheDocument()
  })

  it('does not turn no sending into a zero percent rate', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [{
        ...persistedCampaign,
        analytics: {
          ...persistedCampaign.analytics,
          emails_sent_count: 0,
          contacted_count: 0,
          reply_count_unique: 0,
          bounced_count: 0,
        },
      }],
    })
    renderCampaigns()

    expect(await screen.findByText('Bounce rate')).toBeInTheDocument()
    // A percentage of nothing would read as a real, reassuring zero.
    expect(screen.getByText('No emails sent yet')).toBeInTheDocument()
    expect(screen.getByText('No replies yet')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('distinguishes pitches waiting in Instantly from pitches already sending', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      campaigns: [{
        ...persistedCampaign,
        target_counts: { ...persistedCampaign.target_counts, staged: 4, staged_sending: 0 },
      }],
    })
    renderCampaigns()

    // Waiting: added to the campaign, but the campaign is paused.
    expect(await screen.findByText('4 waiting')).toBeInTheDocument()
    expect(screen.getAllByText(/Launch 4 staged pitches/i).length).toBeGreaterThan(0)
  })

  it('calls out staged pitches that are already emailing hosts', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      campaigns: [{
        ...persistedCampaign,
        target_counts: { ...persistedCampaign.target_counts, staged: 4, staged_sending: 3 },
      }],
    })
    renderCampaigns()

    // Nobody pressed launch for these, so nothing else on the page would say
    // they are reaching hosts right now.
    expect((await screen.findAllByText('4 · 3 sending')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/3 pitches already sending/i).length).toBeGreaterThan(0)
  })

  it('creates an empty Instantly campaign that receives podcasts only from Write Pitch', async () => {
    mockedOverview.mockResolvedValueOnce({ ...campaignOverview, integration: connectedIntegration })
    renderCampaigns()

    fireEvent.click((await screen.findAllByRole('button', { name: 'New campaign' }))[0])
    fireEvent.click(screen.getByRole('combobox', { name: 'Client' }))
    fireEvent.click(await screen.findByRole('option', { name: client.name }))
    expect(screen.getByDisplayValue(`${client.name} Podcast Outreach`)).toBeInTheDocument()
    expect(screen.getByText('Select one or more accounts to send emails from.')).toBeInTheDocument()
    expect(screen.getByText('active@example.com')).toBeInTheDocument()
    expect(screen.getByText('paused@example.com')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Use paused@example.com' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use active@example.com' }))

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByRole('heading', { name: 'Confirm the campaign' })).toBeInTheDocument()
    expect(screen.getByText(/only after its sequence is finalized and sent from the Write Pitch modal/i)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Select Founder Show' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /save & open campaign/i }))
    await waitFor(() => expect(mockedSaveCampaign).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      clientId,
      senderAccounts: ['active@example.com'],
      shortlistPodcastIds: [],
      providerCampaignId: null,
    })))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      `/app/client-campaigns/${clientId}`,
    ))
  })

  it('assigns an existing unassigned Instantly campaign to a client', async () => {
    const providerCampaign = {
      id: '77777777-7777-4777-8777-777777777777',
      name: 'Existing Podcast Campaign',
      status: 2,
      sender_accounts: ['active@example.com'],
      timezone: 'America/Chicago',
      daily_limit: 25,
      timestamp_created: '2026-07-01T12:00:00Z',
      timestamp_updated: '2026-07-23T12:00:00Z',
      mapped_client_id: null,
    }
    mockedOverview.mockResolvedValueOnce({
      ...campaignOverview,
      integration: connectedIntegration,
      provider_campaigns: [providerCampaign],
    })
    renderCampaigns()

    fireEvent.click((await screen.findAllByRole('button', { name: 'New campaign' }))[0])
    fireEvent.click(screen.getByRole('combobox', { name: 'Client' }))
    fireEvent.click(await screen.findByRole('option', { name: client.name }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Instantly campaign' }))
    fireEvent.click(await screen.findByRole('option', { name: /Existing Podcast Campaign/ }))
    expect(screen.getByText(`This exact Instantly campaign will be assigned to ${client.name}.`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByRole('heading', { name: 'Confirm the campaign' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /save & open campaign/i }))
    await waitFor(() => expect(mockedSaveCampaign).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      clientId,
      providerCampaignId: providerCampaign.id,
      senderAccounts: ['active@example.com'],
      shortlistPodcastIds: [],
    })))
  })

  it('clears the owner API key once the connection succeeds', async () => {
    mockedConnectInstantly.mockResolvedValue(undefined as never)
    renderCampaigns()

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Instantly' }))
    const input = screen.getByLabelText('Instantly V2 API key')
    fireEvent.change(input, { target: { value: 'instantly-owner-key-longer-than-20' } })
    fireEvent.click(screen.getByRole('button', { name: /verify & save key/i }))

    await waitFor(() => expect(mockedConnectInstantly).toHaveBeenCalledWith(
      workspaceId,
      'instantly-owner-key-longer-than-20',
    ))
    await waitFor(() => expect(screen.queryByLabelText('Instantly V2 API key')).not.toBeInTheDocument())
  })

  // Clearing the field on submit meant a rejected key (a typo, the V1 key)
  // had to be found and pasted again.
  it('keeps the pasted API key when the connection is rejected', async () => {
    mockedConnectInstantly.mockRejectedValue(new Error('That key was rejected by Instantly.'))
    renderCampaigns()

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Instantly' }))
    const input = screen.getByLabelText('Instantly V2 API key')
    fireEvent.change(input, { target: { value: 'instantly-owner-key-longer-than-20' } })
    fireEvent.click(screen.getByRole('button', { name: /verify & save key/i }))

    await waitFor(() => expect(mockedConnectInstantly).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText('Instantly V2 API key')).toHaveValue('instantly-owner-key-longer-than-20'))
  })

  it('keeps campaign creation and credential controls owner-manager only', async () => {
    mockedOverview.mockResolvedValueOnce({
      ...campaignOverview,
      can_manage_campaigns: false,
      integration: { ...campaignOverview.integration, can_manage: false },
    })

    renderCampaigns()

    expect(await screen.findByRole('heading', { name: 'No campaigns yet' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New campaign' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Instantly' })).not.toBeInTheDocument()
  })

  const unassignedCampaign = {
    id: '88888888-8888-4888-8888-888888888888',
    name: 'Existing Podcast Campaign',
    status: 2,
    sender_accounts: ['active@example.com'],
    timezone: 'America/Chicago',
    daily_limit: 25,
    timestamp_created: '2026-07-01T12:00:00Z',
    timestamp_updated: '2026-07-23T12:00:00Z',
    mapped_client_id: null,
  }

  // The card counted 28 campaigns in Instantly while the table said "No
  // campaigns yet": the table lists only assigned ones, and none were.
  it('says campaigns exist in Instantly when none is assigned yet, and assigns them', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      provider_campaigns: [unassignedCampaign],
    })
    renderCampaigns([client, secondClient])

    expect(await screen.findByRole('heading', { name: '1 campaign found in Instantly, none assigned yet' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'No campaigns yet' })).not.toBeInTheDocument()
    expect(screen.getByText('1 active sending account · 1 campaign (1 unassigned)')).toBeInTheDocument()
    expect(screen.queryByText(/key ending/)).not.toBeInTheDocument()
    expect(screen.getByText('Stats appear once a campaign starts sending.')).toBeInTheDocument()
    expect(screen.queryByText('Emails sent')).not.toBeInTheDocument()
    // One New campaign at a time: the empty state's, not the header's too.
    expect(screen.getAllByRole('button', { name: 'New campaign' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Assign campaigns' }))
    expect(await screen.findByRole('heading', { name: 'Assign Instantly campaigns' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review assignments' })).toBeDisabled()
    fireEvent.click(screen.getByRole('combobox', { name: 'Client for Existing Podcast Campaign' }))
    fireEvent.click(await screen.findByRole('option', { name: secondClient.name }))
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 assignment' }))
    expect(await screen.findByRole('heading', { name: 'Confirm assignments' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Assign 1 campaign' }))

    await waitFor(() => expect(mockedSaveCampaign).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      clientId: secondClientId,
      providerCampaignId: unassignedCampaign.id,
      name: 'Existing Podcast Campaign',
      dailyLimit: 25,
      senderAccounts: ['active@example.com'],
    })))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Confirm assignments' })).not.toBeInTheDocument())
  })

  it('keeps a failed assignment in the dialog with the reason', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      provider_campaigns: [unassignedCampaign],
    })
    mockedSaveCampaign.mockRejectedValueOnce(new Error('That Instantly campaign is already assigned to another client'))
    renderCampaigns()

    fireEvent.click(await screen.findByRole('button', { name: 'Assign campaigns' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Client for Existing Podcast Campaign' }))
    fireEvent.click(await screen.findByRole('option', { name: client.name }))
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 assignment' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Assign 1 campaign' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Existing Podcast Campaign: That Instantly campaign is already assigned to another client')
    expect(screen.getByRole('heading', { name: 'Assign Instantly campaigns' })).toBeInTheDocument()
  })

  // The header's Working on writes ?client=, so the list, its stats and its
  // tab counts open on that client.
  it('scopes the table, stats and tab counts to the client in the address', async () => {
    const secondCampaign = {
      ...persistedCampaign,
      id: '99999999-9999-4999-8999-999999999999',
      client_id: secondClientId,
      name: 'Ana Boyd Podcast Outreach',
      status: 'attention' as const,
      instantly_campaign_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      analytics: { ...persistedCampaign.analytics, emails_sent_count: 500 },
    }
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [persistedCampaign, secondCampaign],
    })
    renderCampaigns([client, secondClient], `/app/client-campaigns?client=${clientId}`)

    expect(await screen.findByText('Showing campaigns for')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter campaigns by client' })).toHaveTextContent(client.name)
    expect(screen.getAllByText('Dallas Fontaine Podcast Outreach').length).toBeGreaterThan(0)
    expect(screen.queryByText('Ana Boyd Podcast Outreach')).not.toBeInTheDocument()
    expect(screen.getByText('Synced from Instantly · For Dallas Fontaine')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Needs attention (0)' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show all clients' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/app\/client-campaigns$/u))
    expect(screen.getAllByText('Ana Boyd Podcast Outreach').length).toBeGreaterThan(0)
    expect(screen.getByText('Synced from Instantly · All clients')).toBeInTheDocument()
    expect(screen.getByText('512')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Needs attention (1)' })).toBeInTheDocument()
  })

  it('offers to assign or create for a working client with no campaign yet', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: connectedIntegration,
      campaigns: [persistedCampaign],
      provider_campaigns: [unassignedCampaign],
    })
    renderCampaigns([client, secondClient], `/app/client-campaigns?client=${secondClientId}`)

    expect(await screen.findByRole('heading', { name: 'Ana Boyd has no campaign yet' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Assign campaigns' }))
    // Opened for Ana, the first campaign is already set to Ana.
    expect(await screen.findByRole('button', { name: 'Review 1 assignment' })).toBeEnabled()
  })

  it('syncs the connection and the totals from one button, and says which step failed', async () => {
    mockedOverview.mockResolvedValue({
      ...campaignOverview,
      integration: { ...connectedIntegration, last_verified_at: new Date(Date.now() - 5 * 60_000).toISOString() },
      campaigns: [persistedCampaign],
    })
    mockedRefreshInstantly.mockResolvedValue(connectedIntegration)
    mockedRefreshAnalytics.mockRejectedValueOnce(new Error('Instantly timed out.'))
    renderCampaigns()

    expect(await screen.findByText('Last synced 5 minutes ago')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh totals' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sync with Instantly' }))

    expect(await screen.findByText(/Sync failed\. Campaign totals: Instantly timed out\./)).toBeInTheDocument()
    expect(mockedRefreshInstantly).toHaveBeenCalledWith(workspaceId)
    expect(mockedRefreshAnalytics).toHaveBeenCalledWith(workspaceId)

    mockedRefreshAnalytics.mockResolvedValueOnce({ requested: 1, refreshed: 1, missing: 0 } as never)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mockedRefreshAnalytics).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/Sync failed/)).not.toBeInTheDocument())
  })

  // An account with dozens of campaigns pages them, so the dialog's title and
  // buttons never scroll off screen.
  it('pages a long list of unassigned campaigns and keeps choices across pages', async () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      ...unassignedCampaign,
      id: `88888888-8888-4888-8888-${String(index).padStart(12, '0')}`,
      name: `Campaign ${index + 1}`,
    }))
    mockedOverview.mockResolvedValue({ ...campaignOverview, integration: connectedIntegration, provider_campaigns: many })
    renderCampaigns()

    fireEvent.click(await screen.findByRole('button', { name: 'Assign campaigns' }))
    expect(await screen.findByText('1-8 of 10')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Client for Campaign 8' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Client for Campaign 9' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('9-10 of 10')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: 'Client for Campaign 10' }))
    fireEvent.click(await screen.findByRole('option', { name: client.name }))

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    // One campaign per client: picked on another row, it shows but cannot be chosen.
    fireEvent.click(screen.getByRole('combobox', { name: 'Client for Campaign 1' }))
    expect(await screen.findByRole('option', { name: `${client.name} (already picked)` })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Review 1 assignment' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 assignment' }))
    expect(await screen.findByText('Campaign 10')).toBeInTheDocument()
  })

  it('searches the unassigned campaigns without dropping choices already made', async () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      ...unassignedCampaign,
      id: `88888888-8888-4888-8888-${String(index).padStart(12, '0')}`,
      name: index === 9 ? 'TiC - CEDIA Expo Sept 2-4 Campaign' : `Campaign ${index + 1}`,
    }))
    mockedOverview.mockResolvedValue({ ...campaignOverview, integration: connectedIntegration, provider_campaigns: many })
    renderCampaigns()

    fireEvent.click(await screen.findByRole('button', { name: 'Assign campaigns' }))
    fireEvent.click(await screen.findByRole('combobox', { name: 'Client for Campaign 1' }))
    fireEvent.click(await screen.findByRole('option', { name: client.name }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Search Instantly campaigns' }), { target: { value: 'cedia' } })
    expect(screen.getByRole('combobox', { name: 'Client for TiC - CEDIA Expo Sept 2-4 Campaign' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Client for Campaign 1' })).not.toBeInTheDocument()
    expect(screen.queryByText(/of 10/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review 1 assignment' })).toBeEnabled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Search Instantly campaigns' }), { target: { value: 'nothing like this' } })
    expect(screen.getByText('No campaigns match "nothing like this".')).toBeInTheDocument()
  })
})
