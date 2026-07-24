import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceCampaignDetail from '@/pages/app/WorkspaceCampaignDetail'
import { getClientShortlist, type ClientShortlistPodcast } from '@/services/clientShortlist'
import { getWorkspaceClientDetail, type WorkspaceClientDetail } from '@/services/clients'
import {
  getWorkspaceCampaign,
  updateWorkspaceCampaignContact,
  type WorkspaceCampaignDetailResponse,
} from '@/services/workspaceCampaigns'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clientShortlist', () => ({ getClientShortlist: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClientDetail: vi.fn() }))
vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceCampaign: vi.fn(),
  launchWorkspaceCampaignPitch: vi.fn(),
  saveWorkspaceCampaign: vi.fn(),
  saveWorkspaceCampaignPitch: vi.fn(),
  setWorkspaceCampaignRunning: vi.fn(),
  syncWorkspaceCampaign: vi.fn(),
  updateWorkspaceCampaignContact: vi.fn(),
  updateWorkspaceCampaignSettings: vi.fn(),
}))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children, platformWorkspace }: { children: React.ReactNode; platformWorkspace?: { baseHref: string } }) => <div data-testid="workspace-layout" data-base-href={platformWorkspace?.baseHref || '/app'}>{children}</div>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedShortlist = vi.mocked(getClientShortlist)
const mockedDetail = vi.mocked(getWorkspaceClientDetail)
const mockedCampaign = vi.mocked(getWorkspaceCampaign)
const mockedUpdateContact = vi.mocked(updateWorkspaceCampaignContact)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

const detail = {
  workspace: { id: workspaceId, name: 'Acme Workspace', slug: 'acme', status: 'active', is_default: false, logo_path: null, logo_updated_at: null },
  viewer_role: 'owner', can_manage: true,
  client: { id: clientId, workspace_id: workspaceId, name: 'Dallas Fontaine', email: 'dallas@example.com', contact_person: 'Dallas', linkedin_url: null, website: null, status: 'active', notes: null, created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-22T00:00:00Z', bio: 'Founder and speaker', photo_url: null, calendar_link: null, media_kit_url: null, prospect_dashboard_slug: null, dashboard_slug: null, dashboard_enabled: false, portal_access_enabled: false, portal_last_login_at: null, password_set_at: null },
  dashboard: { configured: false, enabled: false, tagline: null, view_count: 0, last_viewed_at: null, podcast_count: 2, reviewed_count: 1, approved_count: 1, rejected_count: 0, to_review_count: 1, analyzed_count: 2, last_synced_at: null, last_feedback_at: null },
  outreach: { initial_emails_sent: 8, podcasts_contacted: 7, pending_review_count: 0, approved_count: 0, failed_count: 0, last_sent_at: '2026-07-22T00:00:00Z' },
  bookings: [], onboarding: null,
} as WorkspaceClientDetail

const podcasts = [
  {
    id: 'shortlist-one', client_id: clientId, podcast_id: 'podcast-one', podcast_name: 'Founder Show', podcast_email: 'host@founder.example', publisher_name: 'Jamie Host', podcast_url: 'https://founder.example.com', podcast_image_url: null, visibility: 'visible', feedback_status: 'approved', display_order: 0, created_at: '2026-07-21T00:00:00Z', updated_at: '2026-07-22T00:00:00Z', feedback_updated_at: '2026-07-22T00:00:00Z', ai_fit_reasons: ['Dallas has direct founder experience.'], ai_pitch_angles: [{ title: 'Scaling with focus', description: 'A practical founder conversation.' }],
  },
  {
    id: 'shortlist-two', client_id: clientId, podcast_id: 'podcast-two', podcast_name: 'Operator Stories', podcast_email: null, publisher_name: null, podcast_url: null, podcast_image_url: null, visibility: 'visible', feedback_status: 'approved', display_order: 1, created_at: '2026-07-21T00:00:00Z', updated_at: '2026-07-22T00:00:00Z', feedback_updated_at: '2026-07-22T00:00:00Z', ai_fit_reasons: null, ai_pitch_angles: null,
  },
] as ClientShortlistPodcast[]

const campaignState = {
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
  campaign: null,
  targets: [],
} as WorkspaceCampaignDetailResponse

function renderPage(platformWorkspaceId?: string) {
  const base = platformWorkspaceId ? `/app/workspaces/${workspaceId}` : '/app'
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`${base}/client-campaigns/${clientId}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path={`${base}/client-campaigns/:clientId`} element={<WorkspaceCampaignDetail platformWorkspaceId={platformWorkspaceId} />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceCampaignDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({ user: { id: 'user-1' }, workspace: { id: workspaceId, name: 'Acme Workspace' } } as never)
    mockedDetail.mockResolvedValue(detail)
    mockedShortlist.mockResolvedValue({ client: { id: clientId, name: 'Dallas Fontaine' }, podcasts })
    mockedCampaign.mockResolvedValue(campaignState)
    mockedUpdateContact.mockResolvedValue({ id: 'target-two' } as never)
  })

  it('opens with campaign analytics and keeps the message workflow under Podcasts', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Dallas Fontaine Podcast Outreach', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Analytics' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('tab', { name: 'Podcasts' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sequences' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Schedule' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Options' })).toBeInTheDocument()
    expect(screen.queryByText('Bookings')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add podcasts/i })).toHaveAttribute('href', `/app/podcast-finder?client=${clientId}`)

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Podcasts' }), { button: 0 })
    expect(screen.getAllByText('Needs contact').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Needs pitch').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Current wave|podcasts in view/i)).not.toBeInTheDocument()

    const founderRow = within(screen.getByRole('table')).getByText('Founder Show').closest('tr')
    expect(founderRow).not.toBeNull()
    fireEvent.click(within(founderRow as HTMLElement).getByRole('button', { name: /review pitch/i }))
    expect(await screen.findByRole('heading', { name: 'Founder Show' })).toBeInTheDocument()
    expect(screen.getByText('Dallas has direct founder experience.')).toBeInTheDocument()
    expect(screen.getByLabelText('Subject line')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /approve & start outreach/i })).toBeDisabled()
  })

  it('uses the identical campaign workspace in a platform-selected workspace', async () => {
    renderPage(workspaceId)

    expect(await screen.findByRole('heading', { name: 'Dallas Fontaine Podcast Outreach', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('workspace-layout')).toHaveAttribute('data-base-href', `/app/workspaces/${workspaceId}`)
    expect(mockedDetail).toHaveBeenCalledWith(workspaceId, clientId)
    expect(mockedShortlist).toHaveBeenCalledWith(workspaceId, clientId)
    expect(mockedCampaign).toHaveBeenCalledWith(workspaceId, clientId)
  })

  it('saves a missing host contact directly from the pitch drawer', async () => {
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Podcasts' }), { button: 0 })
    const operatorRow = within(await screen.findByRole('table')).getByText('Operator Stories').closest('tr')
    expect(operatorRow).not.toBeNull()
    fireEvent.click(within(operatorRow as HTMLElement).getByRole('button', { name: /review pitch/i }))

    fireEvent.change(await screen.findByLabelText('Host name'), { target: { value: 'Taylor Host' } })
    fireEvent.change(screen.getByLabelText('Contact email'), { target: { value: 'TAYLOR@EXAMPLE.COM' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }))

    await waitFor(() => expect(mockedUpdateContact).toHaveBeenCalledWith({
      workspaceId,
      clientId,
      shortlistPodcastId: 'shortlist-two',
      contactEmail: 'taylor@example.com',
      hostName: 'Taylor Host',
    }))
  })

  it('shows every Instantly mailbox in campaign options while disabling unavailable accounts', async () => {
    mockedCampaign.mockResolvedValueOnce({
      ...campaignState,
      integration: {
        ...campaignState.integration,
        connected: true,
        status: 'connected',
        accounts: [
          { email: 'active@example.com', first_name: 'Active', last_name: 'Sender', status: 1, warmup_status: 1, daily_limit: 40 },
          { email: 'paused@example.com', first_name: 'Paused', last_name: 'Sender', status: 0, warmup_status: 0, daily_limit: 20 },
        ],
        active_account_count: 1,
      },
    })
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Options' }), { button: 0 })
    expect(screen.getByText('Select one or more accounts to send emails from.')).toBeInTheDocument()
    expect(screen.getByText('active@example.com')).toBeInTheDocument()
    expect(screen.getByText('paused@example.com')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Use active@example.com' })).toBeEnabled()
    expect(screen.getByRole('checkbox', { name: 'Use paused@example.com' })).toBeDisabled()
  })

  it('explains that podcast messages can be AI, template, or manually prepared before Instantly sends them', async () => {
    renderPage()

    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Sequences' }), { button: 0 })
    expect(screen.getByText(/written manually, generated with AI, or started from a template/i)).toBeInTheDocument()
    expect(screen.getByText(/Message creation belongs in Podcasts/i)).toBeInTheDocument()
  })
})
