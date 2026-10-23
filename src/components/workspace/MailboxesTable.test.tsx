import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MailboxesTable } from '@/components/workspace/MailboxesTable'
import {
  setWorkspaceMailboxClient,
  setWorkspaceMailboxesPaused,
  type WorkspaceMailboxAccount,
  type WorkspaceMailboxesResponse,
} from '@/services/workspaceCampaigns'

vi.mock('@/services/workspaceCampaigns', () => ({
  setWorkspaceMailboxClient: vi.fn().mockResolvedValue({ sender_accounts: [] }),
  setWorkspaceMailboxesPaused: vi.fn(),
}))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const GMAIL_LIMIT = '550-5.4.5 Daily user sending limit exceeded. For more information on Gmail\n550-5.4.5 sending limits go to\n550 5.4.5  https://support.google.com/a/answer/166852 abc'
const TOKEN = "Can't create new access token"

function mailbox(email: string, overrides: Partial<WorkspaceMailboxAccount> = {}): WorkspaceMailboxAccount {
  return {
    email,
    first_name: null,
    last_name: null,
    status: 1,
    status_message: null,
    warmup_status: 1,
    daily_limit: 10,
    sent_today: 2,
    send_history: [{ date: '2026-10-22', sent: 3 }, { date: '2026-10-23', sent: 2 }],
    warmup_emails: 70,
    warmup_limit: 10,
    health_score: 100,
    tags: [{ id: 'tag', label: 'Power Payback batch 1', description: null }],
    campaigns: [],
    ...overrides,
  }
}

/** 120 mailboxes: 4 at the Gmail limit, 3 needing a reconnect, the rest healthy. */
function payload(): WorkspaceMailboxesResponse {
  const accounts = Array.from({ length: 120 }, (_, index) => {
    const email = `sender${String(index).padStart(3, '0')}@example.com`
    if (index < 4) return mailbox(email, { status: -3, status_message: GMAIL_LIMIT, health_score: 100 })
    if (index < 7) return mailbox(email, { status: -1, status_message: TOKEN, health_score: 100 })
    return mailbox(email, index === 10
      ? { campaigns: [{ campaign_id: 'c1', campaign_name: 'C', campaign_status: 'active', client_id: 'client-1', client_name: 'Dallas Fontaine' }] }
      : {})
  })
  return {
    connected: true,
    provider_workspace_name: 'Power Payback 1',
    send_day_timezone: 'America/Detroit',
    accounts,
    last_synced_at: new Date(Date.now() - 12 * 60_000).toISOString(),
    analytics_errors: [],
  }
}

function renderTable(data: WorkspaceMailboxesResponse = payload()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MailboxesTable
        workspaceId={workspaceId}
        data={data}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        canManage
        clients={[{ id: 'client-1', name: 'Dallas Fontaine' }, { id: 'client-2', name: 'Rae Whitfield' }] as never}
        clientsError={null}
        onRetryClients={vi.fn()}
      />
    </QueryClientProvider>,
  )
  return screen.getByRole('table', { name: 'Mailbox accounts' })
}

const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1)

describe('MailboxesTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('applies the Needs attention filter from the summary chip, and clears it on a second click', () => {
    const table = renderTable()
    const chip = screen.getByRole('button', { name: '7 mailboxes cannot send' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('combobox', { name: 'Filter mailboxes' })).toHaveTextContent('Needs attention')
    expect(bodyRows(table)).toHaveLength(7)

    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(bodyRows(table)).toHaveLength(50)
  })

  it('applies the No client filter from its chip', () => {
    const table = renderTable()
    fireEvent.click(screen.getByRole('button', { name: '119 not connected to any client' }))
    expect(within(table).queryByText('sender010@example.com')).not.toBeInTheDocument()
    expect(screen.getByText('1-50 of 119 mailboxes')).toBeInTheDocument()
  })

  it('never shows a green dot or a status of Healthy next to a sending or connection error', () => {
    const table = renderTable()
    for (const row of bodyRows(table).slice(0, 7)) {
      expect(row.querySelector('.bg-emerald-500')).toBeNull()
      expect(row).not.toHaveTextContent('Healthy')
    }
    // Errors first, then the reconnects, then everything that sends.
    expect(within(bodyRows(table)[0]).getByText('Gmail daily limit')).toBeInTheDocument()
    expect(within(bodyRows(table)[4]).getByText('Reconnect needed')).toBeInTheDocument()
    expect(within(bodyRows(table)[4]).getByText('Disconnected')).toBeInTheDocument()
    expect(bodyRows(table)[7].querySelector('.bg-emerald-500')).not.toBeNull()
  })

  it('keeps the raw error behind Details, with its URL as a real link', () => {
    const table = renderTable()
    const row = bodyRows(table)[0]
    expect(within(row).getByText('Google paused sending for this account until the limit resets.')).toBeInTheDocument()
    expect(screen.queryByText(/Daily user sending limit exceeded/)).not.toBeInTheDocument()

    fireEvent.click(within(row).getByRole('button', { name: 'Details' }))
    const link = screen.getByRole('link', { name: 'https://support.google.com/a/answer/166852' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('selects a page, then every matching mailbox across pages, and pauses them all', async () => {
    vi.mocked(setWorkspaceMailboxesPaused).mockResolvedValue({ paused: true, updated: [], failed: [] })
    const table = renderTable()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all shown mailboxes' }))
    const bar = screen.getByRole('region', { name: 'Bulk actions' })
    expect(bar).toHaveTextContent('50 selected')

    fireEvent.click(within(bar).getByRole('button', { name: 'Select all 120 matching' }))
    expect(bar).toHaveTextContent('120 selected')
    expect(bar).toHaveTextContent('All 120 matching mailboxes are selected.')

    // Rows on a later page arrive already selected.
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(within(bodyRows(table)[0]).getByRole('checkbox')).toHaveAttribute('data-state', 'checked')

    fireEvent.click(within(bar).getByRole('button', { name: 'Pause' }))
    await waitFor(() => expect(setWorkspaceMailboxesPaused).toHaveBeenCalledTimes(1))
    expect(vi.mocked(setWorkspaceMailboxesPaused).mock.calls[0][0].emails).toHaveLength(120)
    expect(vi.mocked(setWorkspaceMailboxesPaused).mock.calls[0][0].paused).toBe(true)
  })

  it('assigns a selection to a client one mailbox at a time, skipping ones that cannot send', async () => {
    renderTable()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select sender000@example.com' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select sender020@example.com' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select sender021@example.com' }))

    const trigger = within(screen.getByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: /Assign to client/ })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rae Whitfield' }))

    await waitFor(() => expect(setWorkspaceMailboxClient).toHaveBeenCalledTimes(2))
    expect(vi.mocked(setWorkspaceMailboxClient).mock.calls.map(([input]) => input.email)).toEqual([
      'sender020@example.com',
      'sender021@example.com',
    ])
    expect(vi.mocked(setWorkspaceMailboxClient).mock.calls[0][0]).toMatchObject({ workspaceId, clientId: 'client-2', assigned: true })
  })

  it('groups by error type with only the first group open', () => {
    const table = renderTable()
    fireEvent.click(screen.getByRole('combobox', { name: 'Group mailboxes' }))
    fireEvent.click(screen.getByRole('option', { name: 'Error type' }))

    const toggles = within(table).getAllByRole('button', { expanded: true })
      .concat(within(table).getAllByRole('button', { expanded: false }))
      .filter((button) => button.getAttribute('aria-controls') === button.closest('tbody')?.id)
    expect(toggles.map((button) => button.textContent)).toEqual(['Gmail daily limit4', 'Reconnect needed3', 'No errors113'])
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true')
    expect(toggles[1]).toHaveAttribute('aria-expanded', 'false')
    expect(within(table).getAllByText('Gmail daily limit').length).toBeGreaterThan(1)
    expect(within(table).queryByText('sender004@example.com')).not.toBeInTheDocument()

    fireEvent.click(toggles[1])
    expect(within(table).getByText('sender004@example.com')).toBeInTheDocument()
  })

  it('searches batch tags and client names, and offers Clear filters when nothing matches', () => {
    const table = renderTable()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search mailboxes' }), { target: { value: 'fontaine' } })
    expect(bodyRows(table)).toHaveLength(1)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search mailboxes' }), { target: { value: 'nothing like this' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(bodyRows(table)).toHaveLength(50)
  })

  it('says when and where it synced, in relative time', () => {
    renderTable()
    expect(screen.getByTestId('mailbox-sync-status')).toHaveTextContent('Synced 12 min ago · Instantly / Power Payback 1')
    expect(screen.getByTestId('mailbox-capacity')).toHaveTextContent('226 / 1,130 sent today, resets midnight America/Detroit')
  })
})
