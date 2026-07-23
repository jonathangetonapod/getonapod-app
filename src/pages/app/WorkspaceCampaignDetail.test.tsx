import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceCampaignDetail from '@/pages/app/WorkspaceCampaignDetail'
import { getClientShortlist, type ClientShortlistPodcast } from '@/services/clientShortlist'
import { getWorkspaceClientDetail, type WorkspaceClientDetail } from '@/services/clients'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/clientShortlist', () => ({ getClientShortlist: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClientDetail: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children, platformWorkspace }: { children: React.ReactNode; platformWorkspace?: { baseHref: string } }) => <div data-testid="workspace-layout" data-base-href={platformWorkspace?.baseHref || '/app'}>{children}</div>,
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedShortlist = vi.mocked(getClientShortlist)
const mockedDetail = vi.mocked(getWorkspaceClientDetail)
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
  })

  it('shows the weekly pitch queue and opens a custom podcast pitch drawer', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Dallas Fontaine Podcast Outreach', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Pitch Queue' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('link', { name: /add podcasts/i })).toHaveAttribute('href', `/app/podcast-finder?client=${clientId}`)
    expect(screen.getAllByText('Needs contact').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Needs pitch').length).toBeGreaterThan(0)

    const founderRow = within(screen.getByRole('table')).getByText('Founder Show').closest('tr')
    expect(founderRow).not.toBeNull()
    fireEvent.click(within(founderRow as HTMLElement).getByRole('button', { name: /review pitch/i }))
    expect(await screen.findByRole('heading', { name: 'Founder Show' })).toBeInTheDocument()
    expect(screen.getByText('Dallas has direct founder experience.')).toBeInTheDocument()
    expect(screen.getByLabelText('Subject line')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /approve & start outreach/i })).toBeDisabled()
  })

  it('uses the identical campaign workspace in a platform-selected workspace', async () => {
    renderPage(workspaceId)

    expect(await screen.findByRole('heading', { name: 'Dallas Fontaine Podcast Outreach', level: 1 })).toBeInTheDocument()
    expect(screen.getByTestId('workspace-layout')).toHaveAttribute('data-base-href', `/app/workspaces/${workspaceId}`)
    expect(mockedDetail).toHaveBeenCalledWith(workspaceId, clientId)
    expect(mockedShortlist).toHaveBeenCalledWith(workspaceId, clientId)
  })
})
