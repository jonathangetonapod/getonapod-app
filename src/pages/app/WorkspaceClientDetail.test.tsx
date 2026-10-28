import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceClientDetail from '@/pages/app/WorkspaceClientDetail'
import { useAuth } from '@/contexts/AuthContext'
import {
  getWorkspaceClientDetail,
  setWorkspaceClientPassword,
  updateWorkspaceClient,
  updateWorkspaceClientProfile,
  updateWorkspaceClientSdrProfile,
  draftWorkspaceClientSdrProfile,
  linkWorkspaceClientProspect,
  type WorkspaceClientDetail as WorkspaceClientDetailData,
} from '@/services/clients'
import { getWorkspaceProspects } from '@/services/prospectDashboards'
import { getWorkspaceClientPodcastSystem, type ClientPodcastSystemItem } from '@/services/clientPodcastSystem'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clients', () => ({
  saveWorkspaceClientBooking: vi.fn(),
  deleteWorkspaceClientBooking: vi.fn(),
  generatePassword: vi.fn(() => 'Generated-Portal-42!'),
  getWorkspaceClientDetail: vi.fn(),
  setWorkspaceClientPassword: vi.fn(),
  updateWorkspaceClient: vi.fn(),
  updateWorkspaceClientProfile: vi.fn(),
  updateWorkspaceClientSdrProfile: vi.fn(),
  draftWorkspaceClientSdrProfile: vi.fn(),
  linkWorkspaceClientProspect: vi.fn(),
  rotateWorkspaceClientDashboardSlug: vi.fn(),
}))
vi.mock('@/services/prospectDashboards', () => ({
  getWorkspaceProspects: vi.fn().mockResolvedValue({ dashboards: [] }),
}))
vi.mock('@/services/clientPodcastSystem', () => ({
  getWorkspaceClientPodcastSystem: vi.fn(),
}))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => <div>Workspace switcher</div> }))
vi.mock('@/components/workspace/ClientInstantlyCampaignsCard', () => ({
  ClientInstantlyCampaignsCard: () => <div>Instantly campaign links</div>,
}))
vi.mock('@/components/workspace/ClientMailboxesCard', () => ({
  ClientMailboxesCard: () => <div>Sending mailboxes</div>,
}))
vi.mock('@/components/workspace/ClientBookingDialog', () => ({
  ClientBookingDialog: () => <div>Booking dialog</div>,
}))
vi.mock('@/components/workspace/ClientSdrPromptsCard', () => ({
  ClientSdrPromptsCard: () => <div>Client reply instructions</div>,
}))
vi.mock('@/components/workspace/ClientShortlistEditor', () => ({
  // Surfaces the two hrefs the pitch-prep dialog navigates to, so the page's
  // wiring of them is assertable without driving the dialog itself.
  ClientShortlistEditor: ({ relationshipsHref, billingHref }: {
    relationshipsHref: string
    billingHref: string
  }) => (
    <section id="client-podcast-list">
      Client podcast editor
      <a href={relationshipsHref}>prep relationships</a>
      <a href={billingHref}>prep billing</a>
    </section>
  ),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedDetail = vi.mocked(getWorkspaceClientDetail)
const mockedSetPortalPassword = vi.mocked(setWorkspaceClientPassword)
const mockedUpdateClient = vi.mocked(updateWorkspaceClient)
const mockedUpdateProfile = vi.mocked(updateWorkspaceClientProfile)
const mockedUpdateSdrProfile = vi.mocked(updateWorkspaceClientSdrProfile)
const mockedDraftSdrProfile = vi.mocked(draftWorkspaceClientSdrProfile)
const mockedGetSystem = vi.mocked(getWorkspaceClientPodcastSystem)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const onboardingId = '33333333-3333-4333-8333-333333333333'

const detail: WorkspaceClientDetailData = {
  workspace: {
    id: workspaceId,
    name: 'Acme Workspace',
    slug: 'acme-workspace',
    status: 'active',
    is_default: false,
    logo_path: null,
    logo_updated_at: null,
  },
  viewer_role: 'owner',
  can_manage: true,
  client: {
    id: clientId,
    workspace_id: workspaceId,
    name: 'Taylor Client',
    email: 'taylor@example.com',
    contact_person: 'Taylor Smith',
    linkedin_url: 'https://linkedin.com/in/taylor',
    website: 'https://taylor.example.com',
    calendar_link: null,
    status: 'active',
    notes: 'High-priority launch in September.',
    bio: 'Taylor helps founders build durable operations.',
    ai_sdr_profile: {
      positioning: 'Taylor is an operations leader who helps growth-stage founders build durable companies.',
      topics_and_angles: 'Sustainable scale, founder leverage, and the operator systems behind durable growth.',
      listener_takeaways: 'A practical framework for diagnosing and fixing the bottleneck behind stalled growth.',
      proof_points: 'Approved operating case studies and media kit only.',
      ideal_opportunities: 'Founder and operations podcasts for growth-stage teams.',
      booking_details: 'Remote interviews preferred. Route sponsorships and unclear scheduling to a human.',
    },
    ai_sdr_profile_approved_fields: [
      'positioning', 'topics_and_angles', 'listener_takeaways', 'proof_points', 'ideal_opportunities', 'booking_details',
    ],
    ai_sdr_profile_updated_at: '2026-07-23T01:00:00.000Z',
    ai_sdr_readiness: {
      ready: true,
      completed_fields: 6,
      total_fields: 6,
      missing_fields: [],
      missing_core_fields: [],
    },
    photo_url: null,
    media_kit_url: 'https://docs.google.com/document/d/example',
    prospect_dashboard_slug: null,
    dashboard_slug: 'taylor-client-123',
    dashboard_enabled: true,
    portal_access_enabled: true,
    portal_last_login_at: '2026-07-22T00:00:00.000Z',
    password_set_at: '2026-07-20T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-23T00:00:00.000Z',
  },
  dashboard: {
    configured: true,
    enabled: true,
    tagline: 'Podcasts selected for Taylor’s operating expertise.',
    view_count: 14,
    last_viewed_at: '2026-07-22T12:00:00.000Z',
    podcast_count: 12,
    reviewed_count: 8,
    approved_count: 5,
    rejected_count: 3,
    to_review_count: 4,
    analyzed_count: 10,
    last_synced_at: '2026-07-23T08:00:00.000Z',
    last_feedback_at: '2026-07-22T12:00:00.000Z',
  },
  outreach: {
    initial_emails_sent: 43,
    podcasts_contacted: 31,
    pending_review_count: 7,
    approved_count: 4,
    failed_count: 1,
    last_sent_at: '2026-07-23T09:00:00.000Z',
  },
  bookings: [
    {
      id: 'booking-one',
      client_id: clientId,
      podcast_id: 'podcast-one',
      podcast_name: 'Founder Stories',
      podcast_url: 'https://podcasts.example.com/founder-stories',
      host_name: 'Morgan Host',
      scheduled_date: '2099-09-12',
      recording_date: null,
      publish_date: null,
      status: 'booked',
      episode_url: null,
      prep_sent: false,
      notes: null,
      created_at: '2026-07-22T00:00:00.000Z',
      updated_at: '2026-07-22T00:00:00.000Z',
    },
    {
      id: 'booking-two',
      client_id: clientId,
      podcast_id: 'podcast-two',
      podcast_name: 'Operator Weekly',
      podcast_url: null,
      host_name: null,
      scheduled_date: '2026-06-01',
      recording_date: '2026-06-01',
      publish_date: '2099-10-01',
      status: 'recorded',
      episode_url: null,
      prep_sent: true,
      notes: null,
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z',
    },
  ],
  onboarding: {
    id: onboardingId,
    workspace_id: workspaceId,
    client_id: clientId,
    recipient_name: 'Taylor Smith',
    recipient_email: 'taylor@example.com',
    status: 'approved',
    invited_at: '2026-07-01T00:00:00.000Z',
    started_at: '2026-07-01T00:00:00.000Z',
    submitted_at: '2026-07-02T00:00:00.000Z',
    approved_at: '2026-07-03T00:00:00.000Z',
    updated_at: '2026-07-03T00:00:00.000Z',
    archived_at: null,
  },
}

// The shortlist row behind booking-one, as the pipeline function pairs them.
const founderStoriesOpportunity: ClientPodcastSystemItem = {
  id: 'shortlist-founder-stories',
  client: { id: clientId, name: 'Taylor Client', status: 'active', photo_url: null },
  podcast: {
    id: '44444444-4444-4444-8444-444444444444',
    podscan_id: 'podcast-one',
    name: 'Founder Stories',
    description: 'Founder interviews.',
    image_url: null,
    url: 'https://podcasts.example.com/founder-stories',
    publisher_name: 'Story Media',
    host_name: 'Morgan Host',
    audience_size: 25_000,
    last_posted_at: '2026-07-20T12:00:00.000Z',
  },
  stage: 'booked',
  outcome: null,
  terminal: false,
  has_conflict: false,
  next_action: 'Send the prep pack',
  contact: { available: true, source: 'direct', email: 'morgan@founder.example', verified_at: '2026-07-01T00:00:00.000Z' },
  decision: { status: 'approved', notes: null, updated_at: '2026-07-10T00:00:00.000Z' },
  analysis: {
    source: 'normalized',
    clean_description: 'Founders on the decisions that shaped their companies.',
    fit_reasons: ['Taylor has a founder story with operating depth.'],
    pitch_angles: [],
    analyzed_at: '2026-07-10T00:00:00.000Z',
  },
  campaign: null,
  legacy_outreach_at: null,
  conversation: null,
  booking: {
    id: 'booking-one',
    match: 'podcast_id',
    status: 'booked',
    host_name: 'Morgan Host',
    scheduled_date: '2099-09-12',
    recording_date: null,
    publish_date: null,
    episode_url: null,
    prep_sent: false,
    notes: null,
    created_at: '2026-07-22T00:00:00.000Z',
    updated_at: '2026-07-22T00:00:00.000Z',
  },
  operator_notes: null,
  shortlist_created_at: '2026-07-01T00:00:00.000Z',
  shortlist_updated_at: '2026-07-22T00:00:00.000Z',
  last_activity_at: '2026-07-22T00:00:00.000Z',
}

function renderPageWithHandle(path = `/app/clients/${clientId}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/app/clients/:clientId" element={<WorkspaceClientDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function renderPage(path = `/app/clients/${clientId}`) {
  renderPageWithHandle(path)
}

function renderPlatformPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[`/app/workspaces/${workspaceId}/clients/${clientId}?tab=approval`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route
            path="/app/workspaces/:workspaceId/clients/:clientId"
            element={<WorkspaceClientDetail platformWorkspaceId={workspaceId} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceClientDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'owner@example.com' },
      workspace: { id: workspaceId, name: 'Acme Workspace', is_default: false },
      membership: { role: 'owner', full_name: 'Workspace Owner' },
      isPlatformAdmin: false,
      signOut: vi.fn(),
    } as never)
    mockedDetail.mockResolvedValue(detail)
    mockedGetSystem.mockResolvedValue({
      workspace: { id: workspaceId, name: 'Acme Workspace', logo_path: null, logo_updated_at: null },
      viewer_role: 'owner',
      can_manage: true,
      generated_at: '2026-07-25T12:00:00.000Z',
      clients: [],
      summary: {
        total: 1, active: 1, completed: 0, needs_attention: 1, upcoming_recordings: 1, awaiting_publication: 0,
        stage_counts: { awaiting_review: 0, approved: 0, contact_needed: 0, research_needed: 0, ready: 0, outreach: 0, conversation: 0, booked: 1, recorded: 0, published: 0 },
      },
      items: [founderStoriesOpportunity],
    })
    mockedSetPortalPassword.mockResolvedValue(undefined)
    mockedUpdateClient.mockResolvedValue(detail.client)
    mockedUpdateSdrProfile.mockResolvedValue({
      id: clientId,
      workspace_id: workspaceId,
      ai_sdr_profile: {
        ...detail.client.ai_sdr_profile,
        positioning: detail.client.ai_sdr_profile.positioning || '',
        topics_and_angles: detail.client.ai_sdr_profile.topics_and_angles || '',
        listener_takeaways: 'Listeners leave with a repeatable operating-system audit.',
        proof_points: detail.client.ai_sdr_profile.proof_points || '',
        ideal_opportunities: detail.client.ai_sdr_profile.ideal_opportunities || '',
        booking_details: detail.client.ai_sdr_profile.booking_details || '',
      },
      ai_sdr_profile_approved_fields: detail.client.ai_sdr_profile_approved_fields,
      ai_sdr_profile_updated_at: '2026-07-24T00:00:00.000Z',
      ai_sdr_readiness: detail.client.ai_sdr_readiness,
    })
  })

  /*
   * Both links live beside pitch prep: one explains the viewed workspace's
   * history with a host, the other buys the credit the button next to it
   * spends. Hardcoded to /app/… they pointed at the viewer's own CRM and the
   * viewer's own ledger while the work in front of them was somebody else's.
   */
  it('keeps the pitch-prep CRM link inside the workspace being viewed', async () => {
    renderPlatformPage()

    expect(await screen.findByRole('link', { name: 'prep relationships' }))
      .toHaveAttribute('href', `/app/workspaces/${workspaceId}/relationships`)
    // Billing is not workspace-scoped: a platform admin tops a tenant up from
    // the platform screen, the same split the header credit chip makes.
    expect(screen.getByRole('link', { name: 'prep billing' }))
      .toHaveAttribute('href', '/app/platform/billing')
  })

  it('sends a workspace of its own people to their own CRM and billing', async () => {
    renderPage(`/app/clients/${clientId}?tab=approval`)

    expect(await screen.findByRole('link', { name: 'prep relationships' }))
      .toHaveAttribute('href', '/app/relationships')
    expect(screen.getByRole('link', { name: 'prep billing' }))
      .toHaveAttribute('href', '/app/settings/billing')
  })

  it('is the one client record: overview, guest brief, shortlist, placements, sharing, intake', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    // The subtitle carries only the date the client was added.
    expect(screen.queryByText(/Client record/)).not.toBeInTheDocument()
    expect(screen.getByText('Added Jul 1, 2026')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview', 'Guest brief', 'Shortlist', 'Placements', 'Sharing', 'Intake & files',
    ])
    // Outreach is live, so the one primary action is the pipeline.
    expect(screen.getByRole('link', { name: 'View pipeline' })).toHaveAttribute(
      'href',
      `/app/client-podcast-system?client=${clientId}`,
    )
    // Everything else sits in the overflow menu, without repeating the pipeline.
    fireEvent.keyDown(screen.getByRole('button', { name: 'More client actions' }), { key: 'Enter', code: 'Enter' })
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Onboarding', 'Client Campaigns', 'Podcast Finder',
    ])
    expect(within(menu).getByRole('menuitem', { name: 'Podcast Finder' })).toHaveAttribute('href', `/app/podcast-finder?client=${clientId}`)
    expect(within(menu).getByRole('menuitem', { name: 'Onboarding' })).toHaveAttribute('href', `/app/onboarding?client=${clientId}&instance=${onboardingId}`)
    expect(within(menu).getByRole('menuitem', { name: 'Client Campaigns' })).toHaveAttribute('href', `/app/client-campaigns/${clientId}`)
    fireEvent.keyDown(menu, { key: 'Escape', code: 'Escape' })

    // Setup stays on top while the shortlist is still being reviewed.
    const setup = screen.getByTestId('client-setup')
    expect(within(setup).getByText('4 of 5 complete')).toBeInTheDocument()
    expect(within(setup).getByRole('link', { name: /Shortlist.*In progress.*8 of 12 reviewed.*Review shortlist/ })).toHaveAttribute('href', '/app/clients/' + clientId + '?tab=shortlist')

    // One funnel, each step counting every show that reached it.
    const funnel = screen.getByRole('heading', { name: 'Funnel' }).closest('section') as HTMLElement
    expect(within(funnel).getByRole('link', { name: /^Contacted: 31\./ })).toBeInTheDocument()
    expect(within(funnel).getByRole('link', { name: /^Booked: 2, 100% of In conversation/ })).toBeInTheDocument()
    expect(within(funnel).getByRole('link', { name: /^Recorded: 1, 50% of Booked/ })).toBeInTheDocument()
    expect(within(funnel).getByText('1 delivery issue')).toBeInTheDocument()
    expect(within(funnel).getByRole('link', { name: '7 pitches awaiting your review' })).toHaveAttribute('href', `/app/client-campaigns/${clientId}`)
    expect(screen.queryByText(/total$/)).not.toBeInTheDocument()

    // Recordings and releases share one list, each tagged.
    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Upcoming recordings' })).not.toBeInTheDocument()
    expect(screen.getByText('Recording')).toBeInTheDocument()
    expect(screen.getByText('Release')).toBeInTheDocument()
    expect(screen.getByText('Oct 1, 2099')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Shortlist' }), { button: 0 })
    expect(screen.getByRole('heading', { name: 'Podcast approval dashboard' })).toBeInTheDocument()
    expect(screen.getAllByText('Podcasts selected for Taylor’s operating expertise.')).toHaveLength(1)
    expect(screen.queryByText(/google sheet/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view & edit podcasts/i })).toHaveAttribute('href', '#client-podcast-list')
    expect(screen.getByText('Client podcast editor')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()
    expect(screen.getByText('Positive').nextElementSibling).toHaveTextContent('5')
    expect(screen.getByText('Negative').nextElementSibling).toHaveTextContent('3')
    expect(screen.getByText('To review').nextElementSibling).toHaveTextContent('4')
    expect(screen.queryByRole('heading', { name: 'Review completion' })).not.toBeInTheDocument()
    expect(screen.queryByText('AI fit insights ready')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Client engagement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Dashboard setup' })).not.toBeInTheDocument()

    // Every way this client's work is shared sits together: the approval
    // dashboard link, the portal login, and the prospect page it came from.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sharing' }), { button: 0 })
    expect(screen.queryByRole('heading', { name: 'Client portal' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /open portal login/i })).not.toBeInTheDocument()
    expect(screen.getAllByText('taylor@example.com').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /preview as client/i })).toHaveAttribute('href', '/client/taylor-client-123?preview=1')
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New link' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Link a prospect page/i })).toBeInTheDocument()
    // The upcoming milestones are on the overview, not repeated here.
    expect(screen.queryByRole('heading', { name: 'Upcoming' })).not.toBeInTheDocument()

    // Placements carry the calendar with them.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Placements' }), { button: 0 })
    expect(screen.getByRole('heading', { name: 'Placements' })).toBeInTheDocument()
    const placements = screen.getByRole('table')
    expect(within(placements).getByText('Founder Stories')).toBeInTheDocument()
    expect(within(placements).getByText('Operator Weekly')).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Client activity calendar' })).toBeInTheDocument()

    // The guest brief tab holds the source profile and the host brief drafted from it.
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Guest brief' }), { button: 0 })
    expect(screen.getByText('Source profile')).toBeInTheDocument()
    expect(screen.getByText('Taylor helps founders build durable operations.')).toBeInTheDocument()
    expect(screen.getByText('Host brief')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Intake & files' }), { button: 0 })
    expect(screen.getByRole('link', { name: 'Review onboarding' })).toHaveAttribute('href', `/app/onboarding?client=${clientId}&instance=${onboardingId}`)
    expect(screen.queryByText(/google sheet/i)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Internal account notes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View full profile' })).not.toBeInTheDocument()
    expect(mockedDetail).toHaveBeenCalledWith(workspaceId, clientId)
  })

  it('lands every previous tab id on the tab that now holds its content', async () => {
    const aliases: Array<[string, string]> = [
      ['ai-sdr', 'Guest brief'],
      ['profile', 'Guest brief'],
      ['brief', 'Guest brief'],
      ['approval', 'Shortlist'],
      ['podcasts', 'Placements'],
      ['calendar', 'Placements'],
      ['portal', 'Sharing'],
      ['files', 'Intake & files'],
    ]
    for (const [legacy, tabName] of aliases) {
      const { unmount } = renderPageWithHandle(`/app/clients/${clientId}?tab=${legacy}`)
      expect(await screen.findByRole('tab', { name: tabName })).toHaveAttribute('data-state', 'active')
      unmount()
    }
  })

  /*
   * The shortlist editor exposes no row-level hook, so the shared opportunity
   * sheet opens from the placements table instead: each placement's Details
   * shows the shortlist row the pipeline pairs it with. The workspace payload
   * is fetched only once that tab is open.
   */
  // A white-label agency's client must get the agency's own domain, the same
  // origin the onboarding and portal emails use.
  it('copies the dashboard link on the agency domain the server resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mockedDetail.mockResolvedValueOnce({ ...detail, public_base_url: 'https://pods.agency.example' })
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sharing' }), { button: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://pods.agency.example/client/taylor-client-123'))
  })

  it('shows the link in a dialog when the clipboard refuses it, so it is never lost', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mockedDetail.mockResolvedValueOnce({ ...detail, public_base_url: 'https://pods.agency.example' })
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sharing' }), { button: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Link')).toHaveValue('https://pods.agency.example/client/taylor-client-123')
  })

  it('opens the shared opportunity sheet for a placement, loading the rows only when needed', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    expect(mockedGetSystem).not.toHaveBeenCalled()

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Placements' }), { button: 0 })
    await waitFor(() => expect(mockedGetSystem).toHaveBeenCalledWith(workspaceId, { clientId }))

    fireEvent.click(await screen.findByRole('button', { name: 'Details for Founder Stories' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'Founder Stories' })).toBeInTheDocument()
    expect(within(sheet).getByText('Send the prep pack')).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: 'Client shortlist' })).toHaveAttribute('href', `/app/clients/${clientId}?tab=shortlist`)
    // A placement with no shortlist row behind it has nothing to open.
    expect(screen.queryByRole('button', { name: 'Details for Operator Weekly' })).not.toBeInTheDocument()

    // Updating the placement from the sheet edits the booking already on the page.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Update placement' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Booking dialog')).toBeInTheDocument()
  })

  it('offers exactly one primary action on an empty brief, priced unless the workspace uses its own key', async () => {
    const empty: WorkspaceClientDetailData = {
      ...detail,
      client: {
        ...detail.client,
        bio: 'Taylor helps founders build durable operations and repeatable growth systems.',
        ai_sdr_profile: {},
        ai_sdr_profile_approved_fields: [],
        ai_sdr_readiness: { ready: false, completed_fields: 0, total_fields: 6, missing_fields: [], missing_core_fields: [] },
      },
    }
    mockedDetail.mockResolvedValueOnce({ ...empty, ai_keys: { anthropic: true, openai: false } })
    const first = renderPageWithHandle(`/app/clients/${clientId}?tab=brief`)
    const brief = await screen.findByTestId('client-host-brief')
    expect(within(brief).getByRole('button', { name: /Generate from profile/ })).toBeInTheDocument()
    expect(within(brief).getByText('0 of 4 required')).toBeInTheDocument()
    // The old pair of brief buttons is gone.
    expect(screen.queryByRole('button', { name: /Draft brief/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start brief/ })).not.toBeInTheDocument()
    first.unmount()

    mockedDetail.mockResolvedValueOnce(empty)
    renderPage(`/app/clients/${clientId}?tab=brief`)
    expect(await screen.findByRole('button', { name: 'Generate from profile · Your provider account' })).toBeInTheDocument()
  })

  it('generates every empty section as a draft, then approves sections into a ready brief', async () => {
    const empty: WorkspaceClientDetailData = {
      ...detail,
      client: {
        ...detail.client,
        bio: 'Taylor helps founders build durable operations and repeatable growth systems.',
        ai_sdr_profile: {},
        ai_sdr_profile_approved_fields: [],
      },
      onboarding: { ...detail.onboarding!, status: 'approved' },
      dashboard: { ...detail.dashboard, podcast_count: 0, reviewed_count: 0, approved_count: 0, rejected_count: 0, to_review_count: 0, analyzed_count: 0 },
      outreach: { initial_emails_sent: 0, podcasts_contacted: 0, pending_review_count: 0, approved_count: 0, failed_count: 0, last_sent_at: null },
      bookings: [],
    }
    const drafted = {
      positioning: 'Taylor is an operations leader.',
      topics_and_angles: 'Sustainable scale.',
      listener_takeaways: 'A bottleneck audit.',
      proof_points: 'Case studies.',
      ideal_opportunities: 'Founder shows.',
      booking_details: 'Remote only.',
    }
    mockedDetail.mockResolvedValue(empty)
    mockedDraftSdrProfile.mockResolvedValue({ draft: drafted, evidence_shows: 0 })
    renderPage(`/app/clients/${clientId}?tab=brief`)

    // Before the brief is ready the shortlist is offered, but not as the lead action.
    const shortlistLink = await screen.findByRole('link', { name: 'Build shortlist' })
    expect(shortlistLink.className).toMatch(/border/)

    const brief = screen.getByTestId('client-host-brief')
    mockedDetail.mockResolvedValue({
      ...empty,
      client: { ...empty.client, ai_sdr_profile: drafted, ai_sdr_profile_updated_at: '2026-07-24T00:00:00.000Z' },
    })
    fireEvent.click(within(brief).getByRole('button', { name: 'Generate from profile · Your provider account' }))
    await waitFor(() => expect(mockedUpdateSdrProfile).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      expect.objectContaining(drafted),
      '2026-07-23T01:00:00.000Z',
      [],
    ))
    // Generated sections are drafts until someone approves them.
    await waitFor(() => expect(within(brief).getAllByText('Draft')).toHaveLength(6))
    expect(within(brief).getByText('0 of 4 required')).toBeInTheDocument()

    // The first required section opens for review; approving it sends the approval.
    mockedUpdateSdrProfile.mockClear()
    fireEvent.click(await within(brief).findByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(mockedUpdateSdrProfile).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      expect.objectContaining({ positioning: 'Taylor is an operations leader.' }),
      '2026-07-24T00:00:00.000Z',
      ['positioning'],
    ))
  })

  it('shows Brief ready and leads with Build shortlist once the required sections are approved', async () => {
    mockedDetail.mockResolvedValueOnce({
      ...detail,
      client: {
        ...detail.client,
        ai_sdr_profile_approved_fields: ['positioning', 'topics_and_angles', 'listener_takeaways', 'booking_details'],
      },
      onboarding: { ...detail.onboarding!, status: 'approved' },
      dashboard: { ...detail.dashboard, podcast_count: 0, reviewed_count: 0, approved_count: 0, rejected_count: 0, to_review_count: 0, analyzed_count: 0 },
      outreach: { initial_emails_sent: 0, podcasts_contacted: 0, pending_review_count: 0, approved_count: 0, failed_count: 0, last_sent_at: null },
      bookings: [],
    })
    renderPage(`/app/clients/${clientId}?tab=brief`)

    const brief = await screen.findByTestId('client-host-brief')
    // Once in the page header, once on the card.
    expect(screen.getAllByText('Brief ready')).toHaveLength(2)
    // The optional sections were left as drafts and do not hold the brief back.
    expect(within(brief).getAllByText('Approved')).toHaveLength(4)
    expect(within(brief).getAllByText('Draft')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Build shortlist' }).className).not.toMatch(/border-input/)
  })

  it('gives one client their own calendar, built from the bookings already loaded', async () => {
    renderPage(`/app/clients/${clientId}?tab=calendar`)

    expect(await screen.findByRole('tab', { name: 'Placements' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('grid', { name: 'Client activity calendar' })).toBeInTheDocument()
    // Every entry is this client, so the client filter is not offered.
    expect(screen.queryByLabelText('Filter by client')).not.toBeInTheDocument()
    // A booking with only a scheduled date still lands on the calendar: it is
    // named once in the placements table and again as a calendar entry.
    const table = screen.getByRole('table')
    expect(screen.getAllByText(/Founder Stories/).filter((node) => !table.contains(node)).length).toBeGreaterThan(0)
    // No extra request: the page's own bookings feed it.
    expect(mockedDetail).toHaveBeenCalledTimes(1)
  })

  it('edits a host brief section inline, and saving an edit makes it a draft again', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Guest brief' }), { button: 0 })

    const brief = screen.getByTestId('client-host-brief')
    expect(within(brief).getByText('Host brief')).toBeInTheDocument()
    expect(within(brief).getByText('What the AI uses to research shows and write pitches.')).toBeInTheDocument()
    expect(within(brief).getByText('Optional')).toBeInTheDocument()
    expect(screen.queryByText('Approved host context')).not.toBeInTheDocument()
    // Reply drafting is retired with the inbox; the brief stays for research and pitching.
    expect(screen.queryByText('Reply drafting')).not.toBeInTheDocument()

    fireEvent.click(within(brief).getByRole('button', { name: /Listener value & takeaways/ }))
    const takeaways = within(brief).getByLabelText('Listener value & takeaways')
    expect(takeaways).toHaveValue('A practical framework for diagnosing and fixing the bottleneck behind stalled growth.')
    fireEvent.change(takeaways, { target: { value: 'Listeners leave with a repeatable operating-system audit.' } })
    fireEvent.click(within(brief).getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(mockedUpdateSdrProfile).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      expect.objectContaining({ listener_takeaways: 'Listeners leave with a repeatable operating-system audit.' }),
      '2026-07-23T01:00:00.000Z',
      ['positioning', 'topics_and_angles', 'proof_points', 'ideal_opportunities', 'booking_details'],
    ))
  })

  it('tells a brand-new client what to do first instead of showing zeros', async () => {
    mockedDetail.mockResolvedValueOnce({
      ...detail,
      client: { ...detail.client, ai_sdr_profile: {}, ai_sdr_profile_approved_fields: [], portal_access_enabled: false },
      dashboard: { ...detail.dashboard, configured: false, podcast_count: 0, reviewed_count: 0, approved_count: 0, rejected_count: 0, to_review_count: 0 },
      outreach: { initial_emails_sent: 0, podcasts_contacted: 0, pending_review_count: 0, approved_count: 0, failed_count: 0, last_sent_at: null },
      bookings: [],
      onboarding: null,
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })

    // The header's primary action, repeated beside the outreach line.
    const startLinks = screen.getAllByRole('link', { name: 'Start onboarding' })
    expect(startLinks).toHaveLength(2)
    startLinks.forEach((link) => expect(link).toHaveAttribute('href', `/app/onboarding?client=${clientId}`))
    const setup = screen.getByTestId('client-setup')
    expect(within(setup).getByText('0 of 5 complete')).toBeInTheDocument()
    expect(within(setup).getAllByText('Not started')).toHaveLength(5)
    expect(within(setup).getByRole('link', { name: /Finish host brief \(0\/4\)/ })).toHaveAttribute('href', `/app/clients/${clientId}?tab=brief`)
    expect(within(setup).getByRole('link', { name: /Enable portal/ })).toHaveAttribute('href', `/app/clients/${clientId}?tab=sharing`)
    expect(within(setup).getByRole('link', { name: /Build shortlist/ })).toHaveAttribute('href', `/app/clients/${clientId}?tab=shortlist`)

    expect(screen.queryByRole('heading', { name: 'Funnel' })).not.toBeInTheDocument()
    expect(screen.getByTestId('client-outreach-pending')).toHaveTextContent('Outreach starts once the shortlist is approved.')
    expect(screen.queryByText('No delivery issues')).not.toBeInTheDocument()
    expect(screen.getByText('Nothing scheduled yet. Recordings appear here after a podcast is booked.')).toBeInTheDocument()
  })

  it('folds a finished setup to one line below the funnel', async () => {
    mockedDetail.mockResolvedValueOnce({
      ...detail,
      dashboard: { ...detail.dashboard, reviewed_count: 12, approved_count: 9, rejected_count: 3, to_review_count: 0 },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })

    const collapsed = screen.getByRole('button', { name: /Setup complete/ })
    expect(collapsed).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('client-setup')).not.toBeInTheDocument()
    // Below the metrics, not above them.
    expect(screen.getByRole('heading', { name: 'Funnel' }).compareDocumentPosition(collapsed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(collapsed)
    expect(within(screen.getByTestId('client-setup')).getByText('5 of 5 complete')).toBeInTheDocument()
  })

  it('opens directly to the host brief from its stable client deep link', async () => {
    renderPage(`/app/clients/${clientId}?tab=ai-sdr`)

    expect(await screen.findByTestId('client-host-brief')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Guest brief' })).toHaveAttribute('data-state', 'active')
    expect(screen.queryByRole('heading', { name: 'Funnel' })).not.toBeInTheDocument()
  })

  it('keeps host brief editing manager-only', async () => {
    mockedDetail.mockResolvedValueOnce({ ...detail, viewer_role: 'member', can_manage: false })
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Guest brief' }), { button: 0 })

    const brief = screen.getByTestId('client-host-brief')
    fireEvent.click(within(brief).getByRole('button', { name: /Topics & signature angles/ }))
    expect(within(brief).getByText('Sustainable scale, founder leverage, and the operator systems behind durable growth.')).toBeInTheDocument()
    expect(within(brief).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(brief).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('shows the source profile two lines deep until Show more', async () => {
    const longProfile = [
      'PODCAST OUTREACH STRATEGY FOR TAYLOR CLIENT',
      'Taylor helps founders build durable operations and repeatable growth systems. '.repeat(12),
      'FINAL APPROVED TOPIC: The operator playbook for sustainable scale.',
    ].join('\n\n')
    mockedDetail.mockResolvedValueOnce({
      ...detail,
      client: { ...detail.client, bio: longProfile },
    })

    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Guest brief' }), { button: 0 })

    const text = screen.getByText(/PODCAST OUTREACH STRATEGY FOR TAYLOR CLIENT/)
    expect(text).toHaveClass('line-clamp-2')
    expect(screen.queryByRole('button', { name: 'View full profile' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(text).not.toHaveClass('line-clamp-2')
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('lets a workspace manager edit the source profile where it is used', async () => {
    mockedUpdateProfile.mockResolvedValue({
      id: clientId,
      workspace_id: workspaceId,
      bio: 'Taylor helps operational leaders turn complexity into durable growth.',
      updated_at: '2026-07-24T00:00:00.000Z',
    })

    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Guest brief' }), { button: 0 })

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const editor = screen.getByRole('dialog', { name: 'Edit source profile' })
    const profile = within(editor).getByLabelText('Source profile')
    expect(profile).toHaveValue('Taylor helps founders build durable operations.')
    expect(within(editor).getByText(/6 words · 47 \/ 20,000 characters/i)).toBeInTheDocument()

    fireEvent.change(profile, {
      target: { value: 'Taylor helps operational leaders turn complexity into durable growth.' },
    })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save profile' }))

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'Taylor helps operational leaders turn complexity into durable growth.',
      '2026-07-23T00:00:00.000Z',
    ))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit source profile' })).not.toBeInTheDocument())
  })

  it('keeps source profile editing manager-only', async () => {
    mockedDetail.mockResolvedValueOnce({ ...detail, viewer_role: 'member', can_manage: false })

    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Guest brief' }), { button: 0 })

    expect(screen.getByText('Taylor helps founders build durable operations.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(mockedUpdateProfile).not.toHaveBeenCalled()
  })

  it('treats every configured approval dashboard as live even for a legacy disabled row', async () => {
    mockedDetail.mockResolvedValueOnce({
      ...detail,
      client: { ...detail.client, dashboard_enabled: false },
      dashboard: {
        ...detail.dashboard,
        enabled: false,
        podcast_count: 0,
        reviewed_count: 0,
        approved_count: 0,
        rejected_count: 0,
        to_review_count: 0,
        analyzed_count: 0,
        last_synced_at: null,
        last_feedback_at: null,
      },
    })

    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Shortlist' }), { button: 0 })

    expect(screen.getAllByText('Live').length).toBeGreaterThan(0)
    expect(screen.queryByText('Not shared')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
    expect(screen.getByText('Client podcast editor')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sharing' }), { button: 0 })
    expect(screen.getAllByText('Live').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /preview as client/i })).toHaveAttribute('href', '/client/taylor-client-123?preview=1')
    expect(screen.queryByRole('heading', { name: 'Review completion' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /run fresh discovery/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make dashboard live' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()
  })

  it('edits internal account notes without leaving the client record', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Intake & files' }), { button: 0 })

    fireEvent.click(screen.getByRole('button', { name: 'Edit notes' }))
    fireEvent.change(screen.getByLabelText('Internal account notes'), {
      target: { value: 'Prefers concise prep notes and Thursday recordings.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }))

    await waitFor(() => expect(mockedUpdateClient).toHaveBeenCalledWith(workspaceId, clientId, {
      name: 'Taylor Client',
      email: 'taylor@example.com',
      contact_person: 'Taylor Smith',
      linkedin_url: 'https://linkedin.com/in/taylor',
      website: 'https://taylor.example.com',
      status: 'active',
      notes: 'Prefers concise prep notes and Thursday recordings.',
    }))
    await waitFor(() => expect(screen.queryByLabelText('Internal account notes')).not.toBeInTheDocument())
  })

  it('lets the workspace owner set and reveal a client portal password once', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sharing' }), { button: 0 })

    fireEvent.click(screen.getByRole('button', { name: 'Change portal password' }))
    const editor = screen.getByRole('dialog', { name: 'Change portal password' })
    expect(within(editor).getByLabelText('New password')).toHaveValue('Generated-Portal-42!')
    expect(within(editor).getByLabelText('Confirm password')).toHaveValue('Generated-Portal-42!')
    fireEvent.click(within(editor).getByRole('button', { name: 'Save new password' }))

    await waitFor(() => expect(mockedSetPortalPassword).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'Generated-Portal-42!',
    ))
    const receipt = await screen.findByRole('dialog', { name: 'Save the client portal password' })
    expect(within(receipt).getByLabelText('Portal password')).toHaveValue('Generated-Portal-42!')
    expect(within(receipt).getByRole('button', { name: 'Done' })).toBeDisabled()
    fireEvent.click(within(receipt).getByLabelText('I saved this password in a secure place.'))
    fireEvent.click(within(receipt).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save the client portal password' })).not.toBeInTheDocument())
  })

  it('keeps client portal password controls owner-only', async () => {
    mockedDetail.mockResolvedValue({ ...detail, viewer_role: 'admin', can_manage: true })
    renderPage()
    await screen.findByRole('heading', { name: 'Taylor Client' })
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Sharing' }), { button: 0 })

    expect(screen.queryByRole('button', { name: 'Change portal password' })).not.toBeInTheDocument()
    expect(screen.getByText('Only the workspace owner can manage client portal passwords.')).toBeInTheDocument()
  })

  it('links a prospect page from a searchable list instead of leaving a dead end', async () => {
    vi.mocked(getWorkspaceProspects).mockResolvedValue({
      dashboards: [
        { slug: 'prospect-aaa', prospect_name: 'Andre Daughty', prospect_company: 'Daughty Media', prospect_email: 'andre@example.com' },
        { slug: 'prospect-bbb', prospect_name: 'Kari Yasi', prospect_company: null, prospect_email: 'kari@example.com' },
      ],
    } as never)
    vi.mocked(linkWorkspaceClientProspect).mockResolvedValue('prospect-bbb')
    renderPage()

    // The prospect link lives on the Sharing tab, not the default one.
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Sharing' }), { button: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /Link a prospect page/i }))
    expect(await screen.findByText('Andre Daughty')).toBeInTheDocument()
    expect(screen.getByText('Kari Yasi')).toBeInTheDocument()

    // The search narrows the list rather than making the operator scan 26 pages.
    fireEvent.change(screen.getByLabelText('Search prospect pages'), { target: { value: 'kari' } })
    expect(screen.queryByText('Andre Daughty')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Kari Yasi'))
    await waitFor(() => expect(linkWorkspaceClientProspect).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      'prospect-bbb',
    ))
  })

  it('shows every match rather than truncating the list', async () => {
    vi.mocked(getWorkspaceProspects).mockResolvedValue({
      dashboards: Array.from({ length: 40 }, (_value, index) => ({
        slug: `prospect-${index}`,
        prospect_name: `Prospect ${index}`,
        prospect_company: null,
        prospect_email: null,
      })),
    } as never)
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Sharing' }), { button: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /Link a prospect page/i }))

    // The 26th onwards used to be unreachable behind a "narrow the search" note.
    expect(await screen.findByText('Prospect 39')).toBeInTheDocument()
    expect(screen.getByText('40 pages available')).toBeInTheDocument()
  })

  it('explains an empty prospect list rather than showing a blank picker', async () => {
    vi.mocked(getWorkspaceProspects).mockResolvedValue({ dashboards: [] } as never)
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Sharing' }), { button: 0 })
    fireEvent.click(await screen.findByRole('button', { name: /Link a prospect page/i }))
    expect(await screen.findByText('No prospect pages yet')).toBeInTheDocument()
    expect(screen.getByText(/built in Prospect Studio before a client signs/i)).toBeInTheDocument()
  })

  it('fails closed before requesting a malformed client address', async () => {
    renderPage('/app/clients/not-a-client')
    expect(await screen.findByRole('heading', { name: 'Client unavailable' })).toBeInTheDocument()
    expect(screen.getByText('The client address is invalid.')).toBeInTheDocument()
    expect(mockedDetail).not.toHaveBeenCalled()
  })
})
