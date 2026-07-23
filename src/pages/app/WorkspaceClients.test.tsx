import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceClients from '@/pages/app/WorkspaceClients'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import {
  createWorkspaceClient,
  deleteWorkspaceClient,
  getWorkspaceClients,
  updateWorkspaceClient,
  type WorkspaceClient,
} from '@/services/clients'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/clients', () => ({
  createWorkspaceClient: vi.fn(),
  deleteWorkspaceClient: vi.fn(),
  getWorkspaceClients: vi.fn(),
  updateWorkspaceClient: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedAdminView = vi.mocked(getAdminWorkspaceView)
const mockedCreate = vi.mocked(createWorkspaceClient)
const mockedDelete = vi.mocked(deleteWorkspaceClient)
const mockedList = vi.mocked(getWorkspaceClients)
const mockedUpdate = vi.mocked(updateWorkspaceClient)

const workspaceId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const client: WorkspaceClient = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspaceId,
  name: 'Tenant Client',
  email: 'client@example.com',
  contact_person: 'Casey Client',
  linkedin_url: 'https://www.linkedin.com/in/casey-client',
  website: 'https://client.example.com',
  status: 'active',
  notes: 'Original notes',
  created_at: '2026-07-21T00:00:00.000Z',
  updated_at: '2026-07-21T00:00:00.000Z',
}

function renderPage(mode: 'manage' | 'research' = 'manage') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceClients mode={mode} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceClients tenant mode', () => {
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
      signOut: vi.fn(),
    } as never)
    mockedList.mockResolvedValue([client])
    mockedCreate.mockResolvedValue({ ...client, id: '44444444-4444-4444-8444-444444444444' })
    mockedUpdate.mockResolvedValue(client)
    mockedDelete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    expect(mockedAdminView).not.toHaveBeenCalled()
  })

  it('renders the authenticated tenant workspace and keeps management controls enabled', async () => {
    renderPage()

    expect(await screen.findByText('Tenant Client')).toBeInTheDocument()
    expect(screen.getByText('Clients in Tenant Workspace')).toBeInTheDocument()
    expect(screen.getByText('Casey Client')).toBeInTheDocument()
    expect(screen.getByText('client@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add client/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit Tenant Client' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Remove Tenant Client' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Open Tenant Client' })).toHaveAttribute(
      'href',
      `/app/clients/${client.id}`,
    )
    expect(screen.queryByText('Research')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeEnabled()
    expect(screen.queryByText('Admin preview · Read only')).not.toBeInTheDocument()
    expect(mockedList).toHaveBeenCalledWith(workspaceId)
  })

  it('lets a workspace member open the client hub without management controls', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: userId, email: 'member@example.com' },
      workspace: {
        id: workspaceId,
        name: 'Tenant Workspace',
        slug: 'tenant-workspace',
        status: 'active',
        is_default: false,
      },
      membership: { role: 'member' },
      canWriteClients: false,
      signOut: vi.fn(),
    } as never)

    renderPage()

    expect(await screen.findByRole('link', { name: 'Open Tenant Client' })).toHaveAttribute(
      'href',
      `/app/clients/${client.id}`,
    )
    expect(screen.queryByRole('button', { name: /add client/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Tenant Client' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Tenant Client' })).not.toBeInTheDocument()
  })

  it('uses the same workspace client list as the Podcast Finder entry point', async () => {
    mockedList.mockResolvedValue([
      client,
      { ...client, id: '55555555-5555-4555-8555-555555555555', name: 'Paused Client', status: 'paused' },
    ])

    renderPage('research')

    expect(await screen.findByRole('heading', { name: 'Podcast Finder' })).toBeInTheDocument()
    expect(screen.getByText('Choose a client')).toBeInTheDocument()
    expect(screen.getByText('Tenant Client')).toBeInTheDocument()
    expect(screen.queryByText('Paused Client')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Tenant Client' })).toHaveAttribute(
      'href',
      `/app/clients/${client.id}`,
    )
    expect(screen.queryByRole('button', { name: /add client/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Tenant Client' })).not.toBeInTheDocument()
  })

  it('creates a client through the tenant service with the authenticated workspace ID', async () => {
    renderPage()
    await screen.findByText('Tenant Client')

    fireEvent.click(screen.getByRole('button', { name: /add client/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Client name'), { target: { value: 'New Client' } })
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'new@example.com' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add client' }))

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(workspaceId, {
        name: 'New Client',
        email: 'new@example.com',
        contact_person: '',
        linkedin_url: '',
        website: '',
        status: 'active',
        notes: '',
      })
    })
  })

  it('edits a client through the tenant service with the authenticated workspace ID', async () => {
    renderPage()
    await screen.findByText('Tenant Client')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Tenant Client' }))
    const dialog = screen.getByRole('dialog')
    const nameInput = within(dialog).getByLabelText('Client name')
    expect(nameInput).toHaveValue('Tenant Client')
    fireEvent.change(nameInput, { target: { value: 'Updated Tenant Client' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(
        workspaceId,
        client.id,
        expect.objectContaining({
          name: 'Updated Tenant Client',
          email: client.email,
          contact_person: client.contact_person,
          status: client.status,
        }),
      )
    })
  })

  it('deletes a client through the tenant service with the authenticated workspace ID', async () => {
    renderPage()
    await screen.findByText('Tenant Client')

    fireEvent.click(screen.getByRole('button', { name: 'Remove Tenant Client' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/permanently removes Tenant Client/i)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove client' }))

    await waitFor(() => {
      expect(mockedDelete).toHaveBeenCalledWith(workspaceId, client.id)
    })
  })
})
