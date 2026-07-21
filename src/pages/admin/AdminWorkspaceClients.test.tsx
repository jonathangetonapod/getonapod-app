import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminWorkspaceClients from '@/pages/admin/AdminWorkspaceClients'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'

vi.mock('@/components/admin/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)
const mockedView = vi.mocked(getAdminWorkspaceView)
const workspaceId = '11111111-1111-4111-8111-111111111111'

function renderPage(path: string, switchTo?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {switchTo && <Link to={switchTo}>Switch workspace</Link>}
        <Routes>
          <Route path="/admin/workspaces/:workspaceId/clients" element={<AdminWorkspaceClients />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminWorkspaceClients', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ user: { email: 'admin@example.com' } } as never)
    mockedView.mockResolvedValue({
      workspace: { id: workspaceId, name: 'Acme Workspace', slug: 'acme', status: 'active', is_default: false },
      clients: [{
        id: '33333333-3333-4333-8333-333333333333',
        workspace_id: workspaceId,
        name: 'Acme Client',
        email: 'client@example.com',
        contact_person: 'Casey',
        website: null,
        status: 'active',
      }],
    })
  })

  it('shows a narrow read-only view for the exact workspace ID', async () => {
    renderPage(`/admin/workspaces/${workspaceId}/clients`)
    expect(await screen.findByText('Acme Workspace')).toBeInTheDocument()
    expect(screen.getByText('Acme Client')).toBeInTheDocument()
    expect(screen.getByText('Platform administrator view · Read only')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add client/i })).not.toBeInTheDocument()
    expect(mockedView).toHaveBeenCalledWith(workspaceId)
  })

  it('fails closed on a malformed workspace ID without querying clients', async () => {
    renderPage('/admin/workspaces/not-a-uuid/clients')
    await waitFor(() => expect(screen.getByText('The workspace address is invalid.')).toBeInTheDocument())
    expect(mockedView).not.toHaveBeenCalled()
  })

  it('uses an isolated query when the selected workspace changes', async () => {
    const secondWorkspaceId = '44444444-4444-4444-8444-444444444444'
    mockedView.mockImplementation(async (selectedWorkspaceId) => ({
      workspace: {
        id: selectedWorkspaceId,
        name: selectedWorkspaceId === workspaceId ? 'Acme Workspace' : 'Bravo Workspace',
        slug: selectedWorkspaceId === workspaceId ? 'acme' : 'bravo',
        status: 'active',
        is_default: false,
      },
      clients: [{
        id: selectedWorkspaceId === workspaceId
          ? '33333333-3333-4333-8333-333333333333'
          : '55555555-5555-4555-8555-555555555555',
        workspace_id: selectedWorkspaceId,
        name: selectedWorkspaceId === workspaceId ? 'Acme Client' : 'Bravo Client',
        email: null,
        contact_person: null,
        website: null,
        status: 'active',
      }],
    }))
    renderPage(
      `/admin/workspaces/${workspaceId}/clients`,
      `/admin/workspaces/${secondWorkspaceId}/clients`,
    )

    expect(await screen.findByText('Acme Client')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Switch workspace' }))
    expect(await screen.findByText('Bravo Client')).toBeInTheDocument()
    expect(screen.queryByText('Acme Client')).not.toBeInTheDocument()
    expect(mockedView).toHaveBeenCalledWith(workspaceId)
    expect(mockedView).toHaveBeenCalledWith(secondWorkspaceId)
  })
})
