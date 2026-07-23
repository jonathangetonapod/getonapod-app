import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import WorkspaceOutreachSuite, { type OutreachWorkspaceModule } from '@/pages/app/WorkspaceOutreachSuite'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children, platformWorkspace }: {
    children: React.ReactNode
    platformWorkspace?: { baseHref: string; workspaceName: string }
  }) => (
    <div
      data-testid="workspace-layout"
      data-base-href={platformWorkspace?.baseHref || '/app'}
      data-workspace-name={platformWorkspace?.workspaceName || 'My Workspace'}
    >
      {children}
    </div>
  ),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedView = vi.mocked(getAdminWorkspaceView)
const defaultWorkspaceId = '00000000-0000-4000-8000-000000000000'
const selectedWorkspaceId = '11111111-1111-4111-8111-111111111111'

const Location = () => {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderPage(module: OutreachWorkspaceModule, platformWorkspaceId?: string) {
  const baseHref = platformWorkspaceId
    ? `/app/workspaces/${platformWorkspaceId.toLowerCase()}`
    : '/app'
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[`${baseHref}/${module}`]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <WorkspaceOutreachSuite module={module} platformWorkspaceId={platformWorkspaceId} />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceOutreachSuite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      workspace: {
        id: defaultWorkspaceId,
        name: 'Get On A Pod',
        slug: 'get-on-a-pod',
        status: 'active',
        is_default: true,
        logo_path: null,
        logo_updated_at: null,
      },
    } as never)
    mockedView.mockResolvedValue({
      workspace: {
        id: selectedWorkspaceId,
        name: 'Acme Workspace',
        slug: 'acme-workspace',
        status: 'active',
        is_default: false,
        logo_path: null,
        logo_updated_at: null,
      },
      viewer: {
        workspace_id: selectedWorkspaceId,
        email: 'owner@acme.example',
        full_name: 'Acme Owner',
        role: 'owner',
      },
      clients: [],
    })
  })

  it.each([
    ['client-campaigns', 'Client Campaigns', 'No Instantly campaigns synced yet'],
    ['master-inbox', 'Master Inbox', 'Your master inbox is ready'],
    ['mailboxes', 'Mailboxes', 'No mailboxes synced yet'],
  ] as const)('renders the %s workspace foundation without invented provider data', (module, title, emptyState) => {
    renderPage(module)

    expect(screen.getByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: emptyState })).toBeInTheDocument()
    expect(screen.getByTestId('instantly-connection-state')).toHaveTextContent('Not connected')
    expect(screen.getByText('My Workspace')).toBeInTheDocument()
    expect(mockedView).not.toHaveBeenCalled()
  })

  it('keeps all outreach links inside the current workspace', () => {
    renderPage('master-inbox')

    const navigation = screen.getByRole('navigation', { name: 'Outreach suite' })
    expect(navigation).toHaveTextContent('Client Campaigns')
    expect(navigation).toHaveTextContent('Master Inbox')
    expect(navigation).toHaveTextContent('Mailboxes')
    expect(screen.getByRole('link', { name: /launch and monitor outreach by client/i })).toHaveAttribute('href', '/app/client-campaigns')
    expect(screen.getByRole('link', { name: /handle every reply in one queue/i })).toHaveAttribute('href', '/app/master-inbox')
    expect(screen.getByRole('link', { name: /protect sender health and capacity/i })).toHaveAttribute('href', '/app/mailboxes')
  })

  it('loads a selected workspace and scopes every suite route to it', async () => {
    renderPage('client-campaigns', selectedWorkspaceId.toUpperCase())

    expect(await screen.findByText('Acme Workspace')).toBeInTheDocument()
    const baseHref = `/app/workspaces/${selectedWorkspaceId}`
    expect(screen.getByTestId('workspace-layout')).toHaveAttribute('data-base-href', baseHref)
    expect(screen.getByRole('link', { name: /handle every reply in one queue/i })).toHaveAttribute('href', `${baseHref}/master-inbox`)
    expect(screen.getByRole('link', { name: /review workspace clients/i })).toHaveAttribute('href', `${baseHref}/clients`)
    expect(mockedView).toHaveBeenCalledWith(selectedWorkspaceId, expect.any(AbortSignal))
  })
})
