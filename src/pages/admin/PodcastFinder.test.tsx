import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PodcastFinder from '@/pages/admin/PodcastFinder'
import { listPodcastResearchWorkspaces } from '@/services/adminWorkspaces'
import { getClients, getWorkspaceClients, getWorkspaceResearchContext } from '@/services/clients'
import { generatePodcastQueries } from '@/services/queryGeneration'
import { searchPodcastsWithMeta } from '@/services/podscan'

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
  getWorkspaceClients: vi.fn(),
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
const mockedWorkspaceClients = vi.mocked(getWorkspaceClients)
const mockedResearchContext = vi.mocked(getWorkspaceResearchContext)
const mockedGenerateQueries = vi.mocked(generatePodcastQueries)
const mockedSearchPodcasts = vi.mocked(searchPodcastsWithMeta)

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
    mockedWorkspaceClients.mockResolvedValue([
      client('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', myWorkspace.id, 'Own Client'),
    ])
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
      existing_podcast_ids: [],
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

  it('opens the workspace finder directly with a client selector in the page header', async () => {
    renderPage({ workspaceScoped: true })

    expect(await screen.findByRole('heading', { name: 'Podcast Finder' })).toBeInTheDocument()
    expect(await screen.findByRole('combobox', { name: 'Find podcasts for' })).toBeInTheDocument()
    expect(await screen.findByText('Ready for Own Client’s weekly discovery')).toBeInTheDocument()
    expect(screen.queryByText('Choose the client workspace')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument()
    expect(screen.getByTestId('workspace-layout')).toBeInTheDocument()
    expect(mockedWorkspaceClients).toHaveBeenCalledWith(myWorkspace.id)
    expect(mockedResearchContext).toHaveBeenCalledWith(
      myWorkspace.id,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    )
    expect(mockedWorkspaces).not.toHaveBeenCalled()
    expect(mockedClients).not.toHaveBeenCalled()
  })

  it('lets the user switch between every active client in the workspace', async () => {
    const secondClientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    mockedWorkspaceClients.mockResolvedValue([
      client('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', myWorkspace.id, 'Own Client'),
      client(secondClientId, myWorkspace.id, 'Second Client'),
    ])
    mockedResearchContext.mockImplementation(async (_workspaceId, selectedClientId) => ({
      workspace: {
        ...myWorkspace,
        logo_path: null,
        logo_updated_at: null,
      },
      client: {
        id: selectedClientId,
        workspace_id: myWorkspace.id,
        name: selectedClientId === secondClientId ? 'Second Client' : 'Own Client',
        email: null,
        website: null,
        status: 'active' as const,
        bio: 'An approved client bio.',
        photo_url: null,
        google_sheet_configured: true,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
      existing_podcast_ids: [],
    }))
    renderPage({ workspaceScoped: true })

    const selector = await screen.findByRole('combobox', { name: 'Find podcasts for' })
    await screen.findByText('Ready for Own Client’s weekly discovery')
    fireEvent.click(selector)
    fireEvent.click(await screen.findByRole('option', { name: 'Second Client' }))

    expect(await screen.findByText('Ready for Second Client’s weekly discovery')).toBeInTheDocument()
    expect(mockedResearchContext).toHaveBeenCalledWith(myWorkspace.id, secondClientId)
  })

  it('hides podcasts already in client history and keeps them unselectable', async () => {
    mockedResearchContext.mockResolvedValue({
      workspace: { ...myWorkspace, logo_path: null, logo_updated_at: null },
      client: {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        workspace_id: myWorkspace.id,
        name: 'Own Client',
        email: null,
        website: null,
        status: 'active',
        bio: 'An approved client bio.',
        photo_url: null,
        google_sheet_configured: true,
        updated_at: '2026-07-01T00:00:00.000Z',
      },
      existing_podcast_ids: ['pod-existing'],
    })
    mockedGenerateQueries.mockResolvedValue(['founder stories'])
    mockedSearchPodcasts.mockResolvedValue({
      data: {
        podcasts: [
          { podcast_id: 'pod-existing', podcast_name: 'Existing Podcast', podcast_url: 'https://example.com/existing' },
          { podcast_id: 'pod-new', podcast_name: 'New Podcast', podcast_url: 'https://example.com/new' },
        ],
        pagination: { last_page: '1' },
      },
    })
    renderPage({ workspaceScoped: true })

    const runButton = await screen.findByRole('button', { name: 'Run balanced discovery' })
    await waitFor(() => expect(runButton).toBeEnabled())
    fireEvent.click(runButton)
    expect(await screen.findByText('New Podcast')).toBeInTheDocument()
    expect(screen.queryByText('Existing Podcast')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New only (1)' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New only (1)' }))
    expect(await screen.findByText('Existing Podcast')).toBeInTheDocument()
    expect(screen.getAllByText('Already used')).toHaveLength(2)
    expect(screen.getByRole('checkbox', { name: 'Select Existing Podcast' })).toBeDisabled()
  })

  it('binds a workspace user to the legacy fixed-client surface without selectors', async () => {
    const clientId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    renderPage({ fixedClientId: clientId })

    expect(await screen.findByRole('heading', { name: 'Podcast Finder' })).toBeInTheDocument()
    expect(screen.getByText('Get On A Pod · Own Client')).toBeInTheDocument()
    expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Find podcasts for')).not.toBeInTheDocument()
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
      existing_podcast_ids: [],
    })

    renderPage({ fixedClientId: clientId, platformWorkspaceId: agencyWorkspace.id })

    expect(await screen.findByRole('heading', { name: 'Podcast Finder' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Find podcasts for')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to clients' })).toHaveAttribute(
      'href',
      `/app/workspaces/${agencyWorkspace.id}/clients`,
    )
    expect(mockedResearchContext).toHaveBeenCalledWith(agencyWorkspace.id, clientId)
  })
})
