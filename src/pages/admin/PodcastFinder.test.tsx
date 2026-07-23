import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PodcastFinder from '@/pages/admin/PodcastFinder'
import { listPodcastResearchWorkspaces } from '@/services/adminWorkspaces'
import { getClients, getWorkspaceResearchContext } from '@/services/clients'

vi.mock('@/components/admin/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="workspace-layout">{children}</div>,
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-user' },
    workspace: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Get On A Pod',
      slug: 'get-on-a-pod',
      status: 'active',
      is_default: true,
      logo_path: null,
      logo_updated_at: null,
    },
  }),
}))
vi.mock('@/services/adminWorkspaces', () => ({
  listPodcastResearchWorkspaces: vi.fn(),
}))
vi.mock('@/services/clients', () => ({
  getClients: vi.fn(),
  getWorkspaceResearchContext: vi.fn(),
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
const mockedResearchContext = vi.mocked(getWorkspaceResearchContext)

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

function renderPage(props?: React.ComponentProps<typeof PodcastFinder>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PodcastFinder {...props} />
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
    mockedResearchContext.mockResolvedValue({
      workspace: {
        id: myWorkspace.id,
        name: myWorkspace.name,
        slug: myWorkspace.slug,
        status: myWorkspace.status,
        is_default: myWorkspace.is_default,
        logo_path: null,
        logo_updated_at: null,
      },
      client: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        workspace_id: myWorkspace.id,
        name: 'Own Client',
        email: 'own.client@example.com',
        website: null,
        status: 'active',
        bio: 'Own Client helps founders grow durable companies.',
        photo_url: null,
        google_sheet_configured: true,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
    })
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

  it('binds a workspace user to the client route without workspace or client selectors', async () => {
    const clientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    renderPage({ fixedClientId: clientId })

    expect(await screen.findByRole('heading', { name: 'Own Client Podcast Research' })).toBeInTheDocument()
    expect(screen.getByText('Get On A Pod · Own Client')).toBeInTheDocument()
    expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Client')).not.toBeInTheDocument()
    expect(screen.getByText(/permanently bound to the workspace and client/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to clients' })).toHaveAttribute('href', '/app/clients')
    expect(mockedResearchContext).toHaveBeenCalledWith(myWorkspace.id, clientId)
    expect(mockedWorkspaces).not.toHaveBeenCalled()
    expect(mockedClients).not.toHaveBeenCalled()
  })

  it('gives the platform owner the identical fixed-client surface inside another workspace', async () => {
    const clientId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    mockedResearchContext.mockResolvedValueOnce({
      workspace: {
        id: agencyWorkspace.id,
        name: agencyWorkspace.name,
        slug: agencyWorkspace.slug,
        status: agencyWorkspace.status,
        is_default: agencyWorkspace.is_default,
        logo_path: null,
        logo_updated_at: null,
      },
      client: {
        id: clientId,
        workspace_id: agencyWorkspace.id,
        name: 'Agency Client',
        email: 'agency.client@example.com',
        website: null,
        status: 'active',
        bio: 'Agency Client helps founders grow durable companies.',
        photo_url: null,
        google_sheet_configured: true,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
    })

    renderPage({ fixedClientId: clientId, platformWorkspaceId: agencyWorkspace.id })

    expect(await screen.findByRole('heading', { name: 'Agency Client Podcast Research' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Client')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to clients' })).toHaveAttribute(
      'href',
      `/app/workspaces/${agencyWorkspace.id}/clients`,
    )
    expect(mockedResearchContext).toHaveBeenCalledWith(agencyWorkspace.id, clientId)
  })
})
