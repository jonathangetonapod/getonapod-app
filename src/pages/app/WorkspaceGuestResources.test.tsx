import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceGuestResources from '@/pages/app/WorkspaceGuestResources'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients, type WorkspaceClient } from '@/services/clients'
import {
  createWorkspaceGuestResource,
  deleteWorkspaceGuestResource,
  listWorkspaceGuestResources,
  updateWorkspaceGuestResource,
  type WorkspaceGuestResource,
} from '@/services/workspaceGuestResources'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/GuestResourceEditor', () => ({
  GuestResourceEditor: ({ content, onChange }: { content: string; onChange: (value: string) => void }) => (
    <textarea aria-label="Resource content" value={content} onChange={(event) => onChange(event.target.value)} />
  ),
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
const mockedAdminView = vi.mocked(getAdminWorkspaceView)
const mockedClients = vi.mocked(getWorkspaceClients)
const mockedCreate = vi.mocked(createWorkspaceGuestResource)
const mockedDelete = vi.mocked(deleteWorkspaceGuestResource)
const mockedList = vi.mocked(listWorkspaceGuestResources)
const mockedUpdate = vi.mocked(updateWorkspaceGuestResource)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const client: WorkspaceClient = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspaceId,
  name: 'Tenant Client',
  email: 'client@example.com',
  contact_person: 'Casey',
  linkedin_url: null,
  website: null,
  status: 'active',
  notes: null,
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
}
const resource: WorkspaceGuestResource = {
  id: '44444444-4444-4444-8444-444444444444',
  workspace_id: workspaceId,
  title: 'Tenant preparation guide',
  description: 'A workspace-only resource.',
  content: '<p>Prepare carefully.</p>',
  category: 'preparation',
  type: 'article',
  url: null,
  file_url: null,
  featured: true,
  display_order: 1,
  status: 'published',
  visibility: 'selected_clients',
  client_ids: [client.id],
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceGuestResources />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceGuestResources tenant mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'owner@example.com' },
      workspace: {
        id: workspaceId,
        name: 'Tenant Workspace',
        slug: 'tenant-workspace',
        status: 'active',
        is_default: false,
      },
      membership: { role: 'owner' },
      canWriteClients: true,
      isPlatformAdmin: false,
      signOut: vi.fn(),
    } as never)
    mockedClients.mockResolvedValue([client])
    mockedList.mockResolvedValue([resource])
    mockedCreate.mockResolvedValue(resource)
    mockedUpdate.mockResolvedValue(resource)
    mockedDelete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    expect(mockedAdminView).not.toHaveBeenCalled()
  })

  it('renders workspace-scoped resources and enabled manager controls', async () => {
    renderPage()

    expect(await screen.findByText('Tenant preparation guide')).toBeInTheDocument()
    expect(screen.getByText('Resources for clients in Tenant Workspace')).toBeInTheDocument()
    expect(screen.getByText('1 selected client')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add resource/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit Tenant preparation guide' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete Tenant preparation guide' })).toBeEnabled()
    expect(mockedList).toHaveBeenCalledWith(workspaceId)
    expect(mockedClients).toHaveBeenCalledWith(workspaceId)
  })

  it('creates a selected-client resource with its explicit assignment', async () => {
    renderPage()
    await screen.findByText('Tenant preparation guide')
    fireEvent.click(screen.getByRole('button', { name: /add resource/i }))

    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Private checklist' } })
    fireEvent.change(within(dialog).getByLabelText('Description'), { target: { value: 'For one client' } })
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Visibility' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Selected clients' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Tenant Client/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add resource' }))

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(workspaceId, expect.objectContaining({
        title: 'Private checklist',
        description: 'For one client',
        visibility: 'selected_clients',
        client_ids: [client.id],
      }))
    })
  })

  it('updates and deletes through the tenant service with both scoped IDs', async () => {
    renderPage()
    await screen.findByText('Tenant preparation guide')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Tenant preparation guide' }))
    const editDialog = screen.getByRole('dialog')
    fireEvent.change(within(editDialog).getByLabelText('Title'), { target: { value: 'Updated guide' } })
    fireEvent.click(within(editDialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith(
      workspaceId,
      resource.id,
      expect.objectContaining({ title: 'Updated guide', client_ids: [client.id] }),
    ))

    fireEvent.click(screen.getByRole('button', { name: 'Delete Tenant preparation guide' }))
    const deleteDialog = screen.getByRole('dialog')
    fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Delete resource' }))
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith(workspaceId, resource.id))
  })
})
