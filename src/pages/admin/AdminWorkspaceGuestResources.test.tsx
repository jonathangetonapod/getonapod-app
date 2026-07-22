import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminWorkspaceGuestResources from '@/pages/admin/AdminWorkspaceGuestResources'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView, type AdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients, type WorkspaceClient } from '@/services/clients'
import {
  createWorkspaceGuestResource,
  deleteWorkspaceGuestResource,
  listWorkspaceGuestResources,
  updateWorkspaceGuestResource,
  type WorkspaceGuestResource,
} from '@/services/workspaceGuestResources'

vi.mock('@/components/admin/WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => <div>Workspace switcher</div> }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/GuestResourceEditor', () => ({
  GuestResourceEditor: ({ content }: { content: string }) => <div>{content}</div>,
}))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/clients', () => ({ getWorkspaceClients: vi.fn() }))
vi.mock('@/services/workspaceGuestResources', () => ({
  createWorkspaceGuestResource: vi.fn(),
  deleteWorkspaceGuestResource: vi.fn(),
  listWorkspaceGuestResources: vi.fn(),
  updateWorkspaceGuestResource: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedView = vi.mocked(getAdminWorkspaceView)
const mockedGetClients = vi.mocked(getWorkspaceClients)
const mockedList = vi.mocked(listWorkspaceGuestResources)
const mockedCreate = vi.mocked(createWorkspaceGuestResource)
const mockedUpdate = vi.mocked(updateWorkspaceGuestResource)
const mockedDelete = vi.mocked(deleteWorkspaceGuestResource)

const adminId = '99999999-9999-4999-8999-999999999999'
const workspaceId = '11111111-1111-4111-8111-111111111111'
const client: WorkspaceClient = {
  id: '22222222-2222-4222-8222-222222222222',
  workspace_id: workspaceId,
  name: 'Preview Client',
  email: 'preview@example.com',
  contact_person: null,
  linkedin_url: null,
  website: null,
  status: 'active',
  notes: null,
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
}
const view: AdminWorkspaceView = {
  workspace: { id: workspaceId, name: 'Acme Workspace', slug: 'acme', status: 'active', is_default: false },
  viewer: { workspace_id: workspaceId, email: 'owner@acme.example', full_name: 'Acme Owner', role: 'owner' },
  clients: [client],
}
const resource: WorkspaceGuestResource = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspaceId,
  title: 'Preview guide',
  description: 'Visible in preview.',
  content: '<p>Client-facing preview body.</p>',
  category: 'preparation',
  type: 'article',
  url: null,
  file_url: null,
  featured: false,
  display_order: 0,
  status: 'published',
  visibility: 'selected_clients',
  client_ids: [client.id],
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
}

function renderPage(id = workspaceId) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/admin/workspaces/${id}/guest-resources`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/admin/workspaces/:workspaceId/guest-resources" element={<AdminWorkspaceGuestResources />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AdminWorkspaceGuestResources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: adminId, email: 'admin@example.com' },
      workspace: { id: 'default-workspace', name: 'Default Workspace' },
      canWriteClients: true,
      isPlatformAdmin: true,
    } as never)
    mockedView.mockResolvedValue(view)
    mockedList.mockResolvedValue([resource])
    mockedCreate.mockResolvedValue(resource)
  })

  it('shows native platform-owner resource controls and module-aware navigation', async () => {
    renderPage()

    expect(await screen.findByText('Preview guide')).toBeInTheDocument()
    expect(screen.getByText('Resources for clients in Acme Workspace')).toBeInTheDocument()
    expect(screen.queryByText(/admin preview/i)).not.toBeInTheDocument()
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('platform owner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add resource/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'View Preview guide' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit Preview guide' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete Preview guide' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Clients' })).toHaveAttribute('href', `/admin/workspaces/${workspaceId}/clients`)
    expect(screen.getByRole('link', { name: 'Guest Resources' })).toHaveAttribute('href', `/admin/workspaces/${workspaceId}/guest-resources`)

    fireEvent.click(screen.getByRole('button', { name: 'View Preview guide' }))
    const detailDialog = screen.getByRole('dialog')
    expect(detailDialog).toHaveTextContent('Client-facing preview body.')
    expect(detailDialog).toHaveTextContent('Preview Client')
    expect(detailDialog).toHaveTextContent('preview@example.com')
    fireEvent.click(within(detailDialog).getAllByRole('button', { name: 'Close' })[0])

    fireEvent.click(screen.getByRole('button', { name: /add resource/i }))
    const createDialog = screen.getByRole('dialog')
    fireEvent.change(within(createDialog).getByLabelText('Title'), { target: { value: 'Platform resource' } })
    fireEvent.change(within(createDialog).getByLabelText('Description'), { target: { value: 'Managed from the selected workspace.' } })
    fireEvent.click(within(createDialog).getByRole('button', { name: 'Add resource' }))
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ title: 'Platform resource' }),
    ))
    expect(mockedUpdate).not.toHaveBeenCalled()
    expect(mockedDelete).not.toHaveBeenCalled()
    expect(mockedGetClients).not.toHaveBeenCalled()
    expect(mockedView).toHaveBeenCalledWith(workspaceId, expect.any(AbortSignal))
    expect(mockedList).toHaveBeenCalledWith(workspaceId)
  })

  it('fails closed on an invalid workspace address', async () => {
    renderPage('not-a-uuid')
    await waitFor(() => expect(screen.getByText('The workspace address is invalid.')).toBeInTheDocument())
    expect(mockedView).not.toHaveBeenCalled()
    expect(mockedList).not.toHaveBeenCalled()
  })

  it('rejects assignments that are not present in the selected workspace client set', async () => {
    mockedList.mockResolvedValue([{ ...resource, visibility: 'selected_clients', client_ids: ['44444444-4444-4444-8444-444444444444'] }])
    renderPage()
    expect(await screen.findByText('The guest resources response included an invalid client assignment.')).toBeInTheDocument()
    expect(screen.queryByText('Preview guide')).not.toBeInTheDocument()
  })
})
