import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientMailboxesCard } from '@/components/workspace/ClientMailboxesCard'
import {
  getWorkspaceMailboxes,
  setWorkspaceMailboxClient,
  type WorkspaceMailboxAccount,
} from '@/services/workspaceCampaigns'

vi.mock('@/services/workspaceCampaigns', () => ({
  getWorkspaceMailboxes: vi.fn(),
  setWorkspaceMailboxClient: vi.fn().mockResolvedValue({ sender_accounts: [] }),
  setWorkspaceMailboxesPaused: vi.fn(),
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

function mailbox(email: string, clientIds: string[], overrides: Partial<WorkspaceMailboxAccount> = {}): WorkspaceMailboxAccount {
  return {
    email,
    first_name: 'Lindsey',
    last_name: null,
    status: 1,
    status_message: null,
    warmup_status: 1,
    daily_limit: 20,
    sent_today: 3,
    send_history: [],
    warmup_emails: 0,
    warmup_limit: 30,
    health_score: 100,
    tags: [],
    campaigns: clientIds.map((id) => ({ campaign_id: `c-${id}`, campaign_name: 'C', campaign_status: 'draft', client_id: id, client_name: 'Qoverage' })),
    ...overrides,
  }
}

function renderCard(accounts: WorkspaceMailboxAccount[], canManage = true) {
  vi.mocked(getWorkspaceMailboxes).mockResolvedValue({
    connected: true,
    provider_workspace_name: 'The it Crowd',
    send_day_timezone: 'America/Chicago',
    accounts,
    last_synced_at: null,
    analytics_errors: [],
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClientMailboxesCard workspaceId={workspaceId} clientId={clientId} clientName="Qoverage" canManage={canManage} mailboxesHref="/app/mailboxes" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ClientMailboxesCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists only the mailboxes assigned to this client and flags ones that cannot send', async () => {
    renderCard([
      mailbox('b@qoverage.com', [clientId]),
      mailbox('a@qoverage.com', [clientId], { status: -1, status_message: "Can't create new access token" }),
      mailbox('other@crowd.com', ['someone-else']),
      mailbox('free@crowd.com', []),
    ])
    const list = await screen.findByRole('list', { name: 'Mailboxes sending for Qoverage' })
    expect(within(list).getAllByRole('listitem').map((item) => item.querySelector('p')?.textContent)).toEqual([
      'a@qoverage.com',
      'b@qoverage.com',
    ])
    expect(screen.getByText(/1 mailbox cannot send right now/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Assign mailboxes' })).toHaveAttribute('href', '/app/mailboxes')
  })

  it('removes a mailbox from the client', async () => {
    renderCard([mailbox('b@qoverage.com', [clientId])])
    fireEvent.click(await screen.findByRole('button', { name: 'Remove b@qoverage.com from Qoverage' }))
    await waitFor(() => expect(setWorkspaceMailboxClient).toHaveBeenCalledWith({
      workspaceId,
      clientId,
      email: 'b@qoverage.com',
      assigned: false,
    }))
  })

  it('says so when no mailbox is assigned, and offers no removal to viewers', async () => {
    renderCard([mailbox('free@crowd.com', [])], false)
    expect(await screen.findByText(/No mailboxes send for Qoverage yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View mailboxes' })).toBeInTheDocument()
  })
})
