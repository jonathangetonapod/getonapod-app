import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SetupChecklist } from '@/components/workspace/SetupChecklist'
import { getWorkspaceClients } from '@/services/clients'
import { getWorkspaceCampaignOverview, getWorkspaceMailboxes } from '@/services/workspaceCampaigns'
import { listWorkspaceOnboarding } from '@/services/workspaceOnboarding'
import { getWorkspaceBillingOverview, listWorkspaceStaff } from '@/services/workspaceStaff'

vi.mock('@/services/clients', () => ({ getWorkspaceClients: vi.fn() }))
vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceCampaignOverview: vi.fn(),
  getWorkspaceMailboxes: vi.fn(),
}))
vi.mock('@/services/workspaceOnboarding', () => ({ listWorkspaceOnboarding: vi.fn() }))
vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  listWorkspaceStaff: vi.fn(),
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const baseHref = '/app'

const connectedIntegration = {
  connected: true,
  status: 'connected' as const,
  provider_workspace_id: 'ws',
  provider_workspace_name: 'Acme Sending',
  api_key_last_four: '1234',
  accounts: [],
  active_account_count: 1,
  connected_at: '2026-07-22T00:00:00.000Z',
  last_verified_at: null,
  last_error: null,
  can_manage: true,
  required_scopes: [],
}

const linkedMailbox = {
  email: 'send@example.com',
  first_name: null,
  last_name: null,
  status: 1,
  status_message: null,
  warmup_status: null,
  daily_limit: null,
  sent_today: null,
  warmup_emails: null,
  warmup_limit: null,
  health_score: null,
  tags: [],
  campaigns: [{ campaign_id: 'c1', campaign_name: 'Acme outreach', campaign_status: 'active', client_id: 'cl1', client_name: 'Acme' }],
}

function primeAllDone() {
  vi.mocked(getWorkspaceClients).mockResolvedValue([{ id: 'cl1', name: 'Acme' } as never])
  vi.mocked(getWorkspaceCampaignOverview).mockResolvedValue({
    integration: connectedIntegration,
    can_manage_campaigns: true,
    campaigns: [],
    provider_campaigns: [],
    provider_campaigns_error: null,
  })
  vi.mocked(getWorkspaceMailboxes).mockResolvedValue({
    connected: true,
    provider_workspace_name: 'Acme Sending',
    accounts: [linkedMailbox],
    last_synced_at: null,
    analytics_errors: [],
  })
  vi.mocked(listWorkspaceOnboarding).mockResolvedValue({ templates: [{ status: 'draft' }] } as never)
  vi.mocked(listWorkspaceStaff).mockResolvedValue({
    workspace: { client_brand_name: '' },
    members: [{ status: 'active' }],
  } as never)
  vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({ has_subscription: true, balance: 0 } as never)
}

function renderChecklist(canManage = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SetupChecklist workspaceId={workspaceId} baseHref={baseHref} canManage={canManage} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SetupChecklist', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    primeAllDone()
  })

  it('reports setup complete once every required step is done, and offers to dismiss', async () => {
    renderChecklist()

    expect(await screen.findByText('Setup complete')).toBeInTheDocument()
    expect(screen.getByText('4 of 4 required steps done')).toBeInTheDocument()
    // Optional steps still list, with their tag, whether or not they are done.
    expect(screen.getByText('Invite your team').closest('li')).toHaveAttribute('data-done', 'false')
    expect(screen.getByRole('link', { name: 'Open Invite your team' })).toHaveAttribute('href', '/app/settings#workspace-access')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByTestId('setup-checklist')).not.toBeInTheDocument())
    expect(window.localStorage.getItem(`setup-checklist-dismissed:${workspaceId}`)).toBe('1')
  })

  it('shows a missing required step as not done, with a link to where it is finished', async () => {
    vi.mocked(getWorkspaceMailboxes).mockResolvedValue({
      connected: true,
      provider_workspace_name: 'Acme Sending',
      accounts: [{ ...linkedMailbox, campaigns: [] }],
      last_synced_at: null,
      analytics_errors: [],
    })
    renderChecklist()

    expect(await screen.findByText('Set up your workspace')).toBeInTheDocument()
    expect(screen.getByText('Required steps are marked. Optional ones can wait.')).toBeInTheDocument()
    expect(screen.getByText('3 of 4 required steps done')).toBeInTheDocument()
    const step = screen.getByText('Connect a sending mailbox to a client').closest('li')
    expect(step).toHaveAttribute('data-done', 'false')
    expect(step).toHaveTextContent('Required')
    expect(screen.getByRole('link', { name: 'Open Connect a sending mailbox to a client' })).toHaveAttribute('href', '/app/mailboxes')
    expect(screen.getByText('Connect Instantly').closest('li')).toHaveAttribute('data-done', 'true')
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })

  it('treats a read that fails as not done, without an error', async () => {
    vi.mocked(getWorkspaceClients).mockRejectedValue(new Error('Clients could not be loaded.'))
    renderChecklist()

    expect(await screen.findByText('Set up your workspace')).toBeInTheDocument()
    expect(screen.getByText('Add your first client').closest('li')).toHaveAttribute('data-done', 'false')
    expect(screen.queryByText('Clients could not be loaded.')).not.toBeInTheDocument()
  })

  it('renders nothing once dismissed for this workspace', () => {
    window.localStorage.setItem(`setup-checklist-dismissed:${workspaceId}`, '1')
    renderChecklist()

    expect(screen.queryByTestId('setup-checklist')).not.toBeInTheDocument()
    expect(getWorkspaceClients).not.toHaveBeenCalled()
  })

  it('renders nothing for someone who cannot manage the workspace', () => {
    renderChecklist(false)

    expect(screen.queryByTestId('setup-checklist')).not.toBeInTheDocument()
    expect(getWorkspaceClients).not.toHaveBeenCalled()
  })
})
