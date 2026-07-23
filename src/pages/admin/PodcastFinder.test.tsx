import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PodcastFinder from '@/pages/admin/PodcastFinder'
import { listPodcastResearchWorkspaces } from '@/services/adminWorkspaces'
import { getClients } from '@/services/clients'

vi.mock('@/components/admin/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-user' } }),
}))
vi.mock('@/services/adminWorkspaces', () => ({
  listPodcastResearchWorkspaces: vi.fn(),
}))
vi.mock('@/services/clients', () => ({
  getClients: vi.fn(),
}))
vi.mock('@/services/queryGeneration', () => ({ generatePodcastQueries: vi.fn() }))
vi.mock('@/services/compatibilityScoring', () => ({ scoreCompatibilityBatch: vi.fn() }))
vi.mock('@/services/googleSheets', () => ({ exportPodcastsToGoogleSheets: vi.fn() }))
vi.mock('@/services/podscan', () => ({
  getChartCategories: vi.fn(),
  getChartCountries: vi.fn(),
  getPodcastById: vi.fn(),
  getTopChartPodcasts: vi.fn(),
  searchPodcastsWithMeta: vi.fn(),
}))

const mockedWorkspaces = vi.mocked(listPodcastResearchWorkspaces)
const mockedClients = vi.mocked(getClients)

const myWorkspace = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Get On A Pod',
  slug: 'get-on-a-pod',
  status: 'active' as const,
  is_default: true,
}
const agencyWorkspace = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Agency Partner',
  slug: 'agency-partner',
  status: 'active' as const,
  is_default: false,
}

function client(id: string, workspaceId: string, name: string) {
  return {
    id,
    workspace_id: workspaceId,
    name,
    email: `${name.toLowerCase().split(' ').join('.')}@example.com`,
    linkedin_url: null,
    website: null,
    calendar_link: null,
    contact_person: null,
    first_invoice_paid_date: null,
    status: 'active' as const,
    notes: null,
    bio: `${name} helps founders grow durable companies.`,
    photo_url: null,
    google_sheet_url: null,
    media_kit_url: null,
    prospect_dashboard_slug: null,
    outreach_webhook_url: null,
    bison_campaign_id: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PodcastFinder />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PodcastFinder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
    mockedWorkspaces.mockResolvedValue([myWorkspace, agencyWorkspace])
    mockedClients.mockImplementation(async ({ workspaceId } = {}) => ({
      clients: workspaceId === agencyWorkspace.id
        ? [client('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', agencyWorkspace.id, 'Agency Client')]
        : [client('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', myWorkspace.id, 'Own Client')],
      total: 1,
    }))
  })

  it('defaults to the platform owner workspace and keeps the surface client-only', async () => {
    renderPage()

    expect(await screen.findByText('Get On A Pod — My workspace')).toBeInTheDocument()
    await waitFor(() => expect(mockedClients).toHaveBeenCalledWith({
      workspaceId: myWorkspace.id,
      status: 'active',
    }))
    expect(screen.getByText(/prospects stay in prospect dashboards/i)).toBeInTheDocument()
    expect(screen.queryByText(/new prospect/i)).not.toBeInTheDocument()
  })

  it('restores a workspace-scoped client query without loading clients from another workspace', async () => {
    window.sessionStorage.setItem('podcast-finder-client-scope-v3', JSON.stringify({
      workspaceId: agencyWorkspace.id,
      strategy: 'volume',
    }))
    renderPage()

    expect(await screen.findByText('Agency Partner')).toBeInTheDocument()
    await waitFor(() => expect(mockedClients).toHaveBeenCalledWith({
      workspaceId: agencyWorkspace.id,
      status: 'active',
    }))
    expect(mockedClients).not.toHaveBeenCalledWith(expect.objectContaining({ workspaceId: myWorkspace.id }))
  })
})
