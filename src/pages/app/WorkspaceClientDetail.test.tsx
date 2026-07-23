import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceClientDetail from '@/pages/app/WorkspaceClientDetail'
import { useAuth } from '@/contexts/AuthContext'
import { getWorkspaceClientDetail, type WorkspaceClientDetail as WorkspaceClientDetailData } from '@/services/clients'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClientDetail: vi.fn() }))
vi.mock('@/components/admin/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => <div>Workspace switcher</div> }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedDetail = vi.mocked(getWorkspaceClientDetail)
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
    photo_url: null,
    google_sheet_url: 'https://docs.google.com/spreadsheets/d/example',
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
      publish_date: null,
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

function renderPage(path = `/app/clients/${clientId}`) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/app/clients/:clientId" element={<WorkspaceClientDetail />} /></Routes>
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
  })

  it('rebuilds the legacy client command center inside the workspace shell', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Taylor Client' })).toBeInTheDocument()
    expect(screen.getByText('Client command center · Acme Workspace')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Podcast Finder' }).find((link) => (
      link.getAttribute('href')?.includes(`client=${clientId}`)
    ))).toHaveAttribute('href', `/app/podcast-finder?client=${clientId}`)
    expect(screen.getAllByRole('link', { name: 'Onboarding' }).find((link) => (
      link.getAttribute('href')?.includes(`client=${clientId}`)
    ))).toHaveAttribute('href', `/app/onboarding?client=${clientId}&instance=${onboardingId}`)
    expect(screen.getByRole('link', { name: 'Review onboarding' })).toHaveAttribute('href', `/app/onboarding?client=${clientId}&instance=${onboardingId}`)
    expect(screen.getByRole('link', { name: /open google sheet/i })).toHaveAttribute('href', 'https://docs.google.com/spreadsheets/d/example')
    expect(screen.getByRole('link', { name: /open client dashboard/i })).toHaveAttribute('href', '/client/taylor-client-123')
    expect(screen.getByRole('link', { name: /open portal login/i })).toHaveAttribute('href', '/portal/login')

    const progress = screen.getByRole('heading', { name: 'Podcast progress' }).closest('section')
    expect(progress).not.toBeNull()
    expect(within(progress as HTMLElement).getByText('Booked').nextElementSibling).toHaveTextContent('1')
    expect(within(progress as HTMLElement).getByText('Recorded').nextElementSibling).toHaveTextContent('1')
    expect(screen.getAllByText('Founder Stories').length).toBeGreaterThan(0)
    expect(screen.getByText('Operator Weekly')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Organize' })).toBeInTheDocument()
    expect(mockedDetail).toHaveBeenCalledWith(workspaceId, clientId)
  })

  it('fails closed before requesting a malformed client address', async () => {
    renderPage('/app/clients/not-a-client')
    expect(await screen.findByRole('heading', { name: 'Client unavailable' })).toBeInTheDocument()
    expect(screen.getByText('The client address is invalid.')).toBeInTheDocument()
    expect(mockedDetail).not.toHaveBeenCalled()
  })
})
