import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceClients from '@/pages/app/WorkspaceClients'
import { useAuth } from '@/contexts/AuthContext'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { createWorkspaceClient, deleteWorkspaceClient, getWorkspaceClients, type WorkspaceClient } from '@/services/clients'
import { getWorkspaceCampaignOverview, getWorkspaceMailboxes } from '@/services/workspaceCampaigns'
import { listWorkspaceOnboarding } from '@/services/workspaceOnboarding'
import { getWorkspaceSubscriptionOverview, listWorkspaceStaff } from '@/services/workspaceStaff'

// Keep the real checklist mounted beside the real client form. Mocking it out
// hides stale setup data after a successful client mutation on this same page.
vi.mock('@/components/workspace/WorkspaceLayout', () => ({
  WorkspaceLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn() }))
vi.mock('@/services/clients', () => ({
  getWorkspaceClients: vi.fn(),
  createWorkspaceClient: vi.fn(),
  updateWorkspaceClient: vi.fn(),
  deleteWorkspaceClient: vi.fn(),
}))
vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceCampaignOverview: vi.fn(),
  getWorkspaceMailboxes: vi.fn(),
}))
vi.mock('@/services/workspaceOnboarding', () => ({ listWorkspaceOnboarding: vi.fn() }))
vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceSubscriptionOverview: vi.fn(),
  listWorkspaceStaff: vi.fn(),
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'
const client: WorkspaceClient = {
  id: '33333333-3333-4333-8333-333333333333',
  workspace_id: workspaceId,
  name: 'First client',
  email: 'client@example.test',
  contact_person: null,
  linkedin_url: null,
  website: null,
  status: 'active',
  notes: null,
  created_at: '2026-10-29T00:00:00Z',
  updated_at: '2026-10-29T00:00:00Z',
}
const otherChecklistKey = ['setup-checklist', otherWorkspaceId, 'clients'] as const
const otherClients = [{ ...client, workspace_id: otherWorkspaceId, name: 'Other agency client' }]

function renderPage(mode: 'tenant' | 'selected agency', initialClients: WorkspaceClient[]) {
  let savedClients = [...initialClients]
  const workspace = { id: workspaceId, name: 'Agency', slug: 'agency', status: 'active' as const, is_default: false }
  const selectedAgency = mode === 'selected agency'
  vi.mocked(useAuth).mockReturnValue({
    user: { id: '44444444-4444-4444-8444-444444444444', email: 'owner@example.test' },
    workspace: selectedAgency ? { ...workspace, id: otherWorkspaceId, is_default: true } : workspace,
    canWriteClients: true,
    isPlatformAdmin: selectedAgency,
  } as never)
  vi.mocked(getWorkspaceClients).mockImplementation(async (requestedId) => {
    expect(requestedId).toBe(workspaceId)
    return [...savedClients]
  })
  vi.mocked(getAdminWorkspaceView).mockImplementation(async (requestedId) => {
    expect(requestedId).toBe(workspaceId)
    return {
      workspace,
      viewer: { workspace_id: workspaceId, email: 'owner@example.test', full_name: 'Owner', role: 'owner' },
      clients: [...savedClients],
    }
  })
  vi.mocked(createWorkspaceClient).mockImplementation(async (requestedId, input) => {
    expect(requestedId).toBe(workspaceId)
    const created = { ...client, name: input.name }
    savedClients = [...savedClients, created]
    return created
  })
  vi.mocked(deleteWorkspaceClient).mockImplementation(async (requestedId, clientId) => {
    expect(requestedId).toBe(workspaceId)
    savedClients = savedClients.filter((row) => row.id !== clientId)
  })

  // Only the reply-to remains after a client exists, making the next action
  // deterministic without replacing the actual setup-progress hook.
  vi.mocked(listWorkspaceStaff).mockResolvedValue({
    workspace: { id: workspaceId, client_brand_name: '', client_contact_email: '' },
    members: [{ status: 'active' }],
  } as never)
  vi.mocked(getWorkspaceSubscriptionOverview).mockResolvedValue({ billing_status: 'active' } as never)
  vi.mocked(getWorkspaceCampaignOverview).mockResolvedValue({ integration: { connected: true } } as never)
  vi.mocked(getWorkspaceMailboxes).mockResolvedValue({ accounts: [{ campaigns: [{ client_id: client.id }] }] } as never)
  vi.mocked(listWorkspaceOnboarding).mockResolvedValue({ templates: [] } as never)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  queryClient.setQueryData(otherChecklistKey, otherClients)
  const baseHref = selectedAgency ? `/app/workspaces/${workspaceId}` : '/app'
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`${baseHref}/clients`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <WorkspaceClients platformWorkspaceId={selectedAgency ? workspaceId : undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return queryClient
}

describe.each(['tenant', 'selected agency'] as const)('Client onboarding in %s mode', (mode) => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.localStorage.clear()
  })

  it('advances immediately after creating the first client through the guided action', async () => {
    const queryClient = renderPage(mode, [])
    expect(await screen.findByText('Next: Add your first client')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add your first client' }))
    const dialog = screen.getByRole('dialog', { name: 'Add client' })
    fireEvent.change(within(dialog).getByLabelText('Client name'), { target: { value: client.name } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add client' }))

    expect(await screen.findByText('Next: Set the email clients reply to')).toBeInTheDocument()
    expect(screen.queryByText('Next: Add your first client')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: `Open ${client.name}` })).toBeInTheDocument()
    expect(queryClient.getQueryData(['setup-checklist', workspaceId, 'clients'])).toEqual([client])
    expect(queryClient.getQueryData(otherChecklistKey)).toEqual(otherClients)
    expect(queryClient.getQueryState(otherChecklistKey)?.isInvalidated).toBe(false)
    expect(createWorkspaceClient).toHaveBeenCalledOnce()
    if (mode === 'tenant') expect(getAdminWorkspaceView).not.toHaveBeenCalled()
  })

  it('restores the first-client action immediately after removing the last client', async () => {
    const queryClient = renderPage(mode, [client])
    expect(await screen.findByText('Next: Set the email clients reply to')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `Remove ${client.name}` }))
    const dialog = screen.getByRole('dialog', { name: 'Remove client?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove client' }))

    expect(await screen.findByText('Next: Add your first client')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add your first client' })).toBeInTheDocument()
    expect(screen.getByText('No clients yet')).toBeInTheDocument()
    expect(queryClient.getQueryData(['setup-checklist', workspaceId, 'clients'])).toEqual([])
    expect(queryClient.getQueryData(otherChecklistKey)).toEqual(otherClients)
    expect(queryClient.getQueryState(otherChecklistKey)?.isInvalidated).toBe(false)
    expect(deleteWorkspaceClient).toHaveBeenCalledWith(workspaceId, client.id)
    if (mode === 'tenant') expect(getAdminWorkspaceView).not.toHaveBeenCalled()
  })
})
