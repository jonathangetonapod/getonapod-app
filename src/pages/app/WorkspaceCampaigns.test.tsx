import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceCampaigns from '@/pages/app/WorkspaceCampaigns'
import { getClientShortlist, type ClientShortlistPodcast } from '@/services/clientShortlist'
import { getWorkspaceClientDetail, type WorkspaceClient, type WorkspaceClientDetail } from '@/services/clients'

vi.mock('@/services/clientShortlist', () => ({ getClientShortlist: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClientDetail: vi.fn() }))

const mockedShortlist = vi.mocked(getClientShortlist)
const mockedDetail = vi.mocked(getWorkspaceClientDetail)
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

const Location = () => {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

function renderCampaigns() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/app/client-campaigns']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceCampaigns
          workspaceId={workspaceId}
          clients={[client]}
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
  })

  it('organizes real client outreach into an operational campaign table', async () => {
    renderCampaigns()

    expect(await screen.findByRole('link', { name: client.name })).toHaveAttribute('href', `/app/client-campaigns/${clientId}`)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect((await screen.findAllByText('Review 2 pitches')).length).toBeGreaterThan(0)
    const table = screen.getByRole('table')
    expect(within(table).getByText('9')).toBeInTheDocument()
    expect(within(table).getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Available after Instantly sync')).toBeInTheDocument()
  })

  it('creates the campaign layout from a client and a selected first wave', async () => {
    renderCampaigns()

    await screen.findByRole('link', { name: client.name })
    fireEvent.click(screen.getByRole('button', { name: 'New campaign' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Client' }))
    fireEvent.click(await screen.findByRole('option', { name: client.name }))
    expect(screen.getByDisplayValue(`${client.name} Podcast Outreach`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByRole('checkbox', { name: 'Select Founder Show' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Select Operator Stories' })).not.toBeChecked()
    expect(screen.getByText('Client positive')).toBeInTheDocument()
    expect(screen.getByText('Owner override')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /open draft workspace/i }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(
      `/app/client-campaigns/${clientId}?podcasts=shortlist-one`,
    ))
  })
})
