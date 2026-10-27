import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import { mailboxCacheKey, readMailboxCache, writeMailboxCache } from '@/lib/mailboxCache'
import WorkspaceOutreachSuite, { type OutreachWorkspaceModule } from '@/pages/app/WorkspaceOutreachSuite'
import { getAdminWorkspaceView } from '@/services/adminWorkspaces'
import { getWorkspaceClients, getWorkspaceClientSdrContext } from '@/services/clients'
import {
  getWorkspaceCampaignOverview,
  getWorkspaceInboxThreads,
  setWorkspaceInboxThreadStatus,
  getWorkspaceMailboxes,
  getWorkspaceInboxThreadMessages,
  setWorkspaceMailboxClient,
  setWorkspaceInboxLeadInterest,
  type WorkspaceMailboxesResponse,
} from '@/services/workspaceCampaigns'
import { addOutreachSuppression } from '@/services/hostRelationships'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/services/adminWorkspaces', () => ({ getAdminWorkspaceView: vi.fn(), listPodcastResearchWorkspaces: vi.fn(async () => []) }))
vi.mock('@/services/clients', () => ({
  getWorkspaceClients: vi.fn(),
  getWorkspaceClientDetail: vi.fn(),
  getWorkspaceClientSdrContext: vi.fn(),
}))
vi.mock('@/services/clientShortlist', () => ({ getClientShortlist: vi.fn() }))
vi.mock('@/services/hostRelationships', () => ({
  addOutreachSuppression: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/workspaceCampaigns', () => ({
  connectWorkspaceInstantly: vi.fn(),
  disconnectWorkspaceInstantly: vi.fn(),
  getWorkspaceCampaignOverview: vi.fn(),
  getWorkspaceMailboxes: vi.fn(),
  getWorkspaceInboxThreads: vi.fn().mockResolvedValue({ connected: true, threads: [] }),
  getWorkspaceInboxLeadDetail: vi.fn().mockResolvedValue({ lead: null }),
  getWorkspaceInboxThreadMessages: vi.fn().mockResolvedValue([]),
  setWorkspaceInboxLeadInterest: vi.fn().mockResolvedValue({ success: true, interest_value: 1 }),
  setWorkspaceInboxThreadStatus: vi.fn().mockResolvedValue({ success: true }),
  refreshWorkspaceInstantly: vi.fn(),
  saveWorkspaceCampaign: vi.fn(),
  setWorkspaceMailboxClient: vi.fn().mockResolvedValue({ sender_accounts: [] }),
}))
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
const mockedClients = vi.mocked(getWorkspaceClients)
const mockedSdrContext = vi.mocked(getWorkspaceClientSdrContext)
const mockedCampaignOverview = vi.mocked(getWorkspaceCampaignOverview)
const mockedMailboxes = vi.mocked(getWorkspaceMailboxes)
const defaultWorkspaceId = '00000000-0000-4000-8000-000000000000'
const selectedWorkspaceId = '11111111-1111-4111-8111-111111111111'

const Location = () => {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

function renderPage(module: OutreachWorkspaceModule, platformWorkspaceId?: string, search = '') {
  const baseHref = platformWorkspaceId
    ? `/app/workspaces/${platformWorkspaceId.toLowerCase()}`
    : '/app'
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[`${baseHref}/${module}${search}`]}
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
    // The page keeps the last mailbox list in localStorage; each test starts cold.
    window.localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(getWorkspaceInboxThreads).mockResolvedValue({ connected: true, threads: [] })
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      membership: { role: 'owner' },
      isPlatformAdmin: false,
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
    mockedClients.mockResolvedValue([])
    mockedCampaignOverview.mockResolvedValue({
      integration: {
        connected: false,
        status: 'disconnected',
        provider_workspace_id: null,
        provider_workspace_name: null,
        api_key_last_four: null,
        accounts: [],
        active_account_count: 0,
        connected_at: null,
        last_verified_at: null,
        last_error: null,
        can_manage: true,
        required_scopes: [],
      },
      can_manage_campaigns: true,
      campaigns: [],
      provider_campaigns: [],
      provider_campaigns_error: null,
    })
    const mailboxes = [
      ['admin@solaraccountreview.help', 1, 70, 100],
      ['admin@solaraccountreview.homes', 1, 70, 100],
      ['admin@solarserviceupdate.help', -3, 0, 100],
      ['admin@solarserviceupdate.homes', 1, 70, 100],
      ['admin@solarsupportcenter.help', 1, 70, 100],
      ['admin@solarsupportcenter.homes', 1, 70, 97],
      ['admin@titanbankruptcy.lat', 1, 70, 100],
      ['admin@titanbankruptcyupdate.help', -3, 0, 99],
      ['admin@titanbankruptcyupdates.help', 1, 70, 99],
      ['admin@titansolarbankrupcy.help', -3, 0, 100],
    ] as const
    mockedMailboxes.mockResolvedValue({
      connected: true,
      provider_workspace_name: 'Solar workspace',
      send_day_timezone: 'America/Chicago',
      accounts: mailboxes.map(([email, status, warmupEmails, healthScore], index) => ({
        email,
        first_name: null,
        last_name: null,
        status,
        status_message: status === -3 ? 'SMTP send failed' : null,
        warmup_status: 1,
        daily_limit: 15,
        sent_today: 0,
        send_history: [],
        warmup_emails: warmupEmails,
        warmup_limit: 70,
        health_score: healthScore,
        tags: [{ id: `tag-${index}`, label: 'Solar - CI 04/23/2026', description: null }],
        campaigns: email === 'admin@solaraccountreview.help'
          ? [{
            campaign_id: 'campaign-one',
            campaign_name: 'Dallas Fontaine podcast outreach',
            campaign_status: 'active',
            client_id: 'client-one',
            client_name: 'Dallas Fontaine',
          }]
          : [],
      })),
      last_synced_at: '2026-07-24T12:00:00.000Z',
      analytics_errors: [],
    })
  })

  it('renders the client-campaigns workspace foundation without invented provider data', async () => {
    renderPage('client-campaigns')

    expect(screen.getByRole('heading', { name: 'Client Campaigns', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'No active clients' })).toBeInTheDocument()
    expect(await screen.findByTestId('instantly-connection-card')).toHaveTextContent('Connect Instantly')
    expect(screen.queryByRole('navigation', { name: 'Outreach suite' })).not.toBeInTheDocument()
    expect(screen.getByText('My Workspace')).toBeInTheDocument()
    expect(mockedView).not.toHaveBeenCalled()
  })

  it('renders live Instantly accounts in the supplied operational table layout', async () => {
    renderPage('mailboxes')

    expect(screen.getByRole('heading', { name: 'Mailboxes', level: 1 })).toBeInTheDocument()
    expect(screen.queryByTestId('instantly-connection-state')).not.toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Mailbox accounts' })
    expect(within(table).getByRole('columnheader', { name: 'Email' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Sent today' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Client' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Warmup' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /^Status/ })).toHaveAttribute('aria-sort', 'ascending')
    await within(table).findByText('admin@solaraccountreview.help')
    expect(within(table).getAllByRole('row')).toHaveLength(11)
    expect(within(table).getAllByText('Solar - CI 04/23/2026')).toHaveLength(10)
    expect(within(table).getAllByText('Sending error')).toHaveLength(3)

    const account = within(table).getByText('admin@solaraccountreview.help').closest('tr')
    expect(account).not.toBeNull()
    expect(within(account as HTMLElement).getByText('0 of 15')).toBeInTheDocument()
    // Warmup total and per-day target are different things, so each is named.
    expect(within(account as HTMLElement).getByText('70 sent · target 70/day')).toBeInTheDocument()
    expect(account).toHaveTextContent('Healthy')
    expect(account).toHaveTextContent('Health 100%')
    expect(screen.queryByText('No mailboxes synced yet')).not.toBeInTheDocument()
    expect(screen.queryByText('Mailbox health signals')).not.toBeInTheDocument()
    expect(screen.queryByText(/layout preview/i)).not.toBeInTheDocument()
    expect(mockedMailboxes).toHaveBeenCalledWith(defaultWorkspaceId)
  })

  it('draws the last mailbox list at once while the live one loads, then stores the new one', async () => {
    // The default list from beforeEach, read back before the live call is held open.
    const base = await getWorkspaceMailboxes(defaultWorkspaceId)
    mockedMailboxes.mockClear()
    const cached = { ...base, last_synced_at: new Date(Date.now() - 5 * 60_000).toISOString() }
    const storageKey = mailboxCacheKey('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', defaultWorkspaceId)
    writeMailboxCache(storageKey, cached, Date.now() - 5 * 60_000)
    let finish: (value: WorkspaceMailboxesResponse) => void = () => undefined
    mockedMailboxes.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    renderPage('mailboxes')

    const table = screen.getByRole('table', { name: 'Mailbox accounts' })
    expect(within(table).getByText('admin@solaraccountreview.help')).toBeInTheDocument()
    // Older than staleTime, so it is refreshed straight away behind the table.
    await waitFor(() => expect(mockedMailboxes).toHaveBeenCalledWith(defaultWorkspaceId))

    const fresh = { ...base, last_synced_at: new Date().toISOString() }
    finish(fresh)
    await waitFor(() => expect(readMailboxCache(storageKey)?.data.last_synced_at).toBe(fresh.last_synced_at))
  })

  /*
   * The workspace lookup keyed on `module`, and this query ends in 'mailboxes',
   * so on the platform route the two keys were identical and React Query gave
   * them one cache entry. The lookup mounted first, so the mailboxes request was
   * never sent and the admin workspace view was read as a mailbox payload —
   * leaving "Instantly is not connected" asserted about every tenant a platform
   * admin opened, with no Refresh button because that only renders when
   * connected.
   */
  it('asks for the mailboxes of the workspace a platform admin is viewing', async () => {
    renderPage('mailboxes', selectedWorkspaceId)

    await waitFor(() => expect(mockedMailboxes).toHaveBeenCalledWith(selectedWorkspaceId))
    expect(screen.queryByTestId('instantly-connection-state')).not.toBeInTheDocument()
  })

  it('puts the mailboxes that cannot send at the top, and says why on the row', async () => {
    renderPage('mailboxes')

    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    const rows = within(table).getAllByRole('row').slice(1)
    // Three accounts are in a hard sending error. They used to sit in provider
    // order, which buried them among healthy ones.
    expect(rows.slice(0, 3).every((row) => within(row).queryByText('Sending error'))).toBe(true)
    // The SMTP failure was a title attribute — invisible without a mouse.
    expect(within(rows[0]).getByText('SMTP send failed')).toBeInTheDocument()
  })

  it('sums the sending capacity and names the day it belongs to', async () => {
    renderPage('mailboxes')

    // Seven of ten accounts are active at 15/day.
    const summary = await screen.findByTestId('mailbox-capacity')
    expect(summary).toHaveTextContent('0 / 105 sent today, resets midnight America/Chicago')
    expect(summary).toHaveTextContent('3 mailboxes cannot send')
    expect(summary).toHaveTextContent('9 not connected to any client')
  })

  it('filters down to the mailboxes that need attention', async () => {
    renderPage('mailboxes')
    await screen.findByRole('table', { name: 'Mailbox accounts' })

    fireEvent.click(screen.getByLabelText('Filter mailboxes'))
    fireEvent.click(await screen.findByRole('option', { name: /Needs attention/ }))

    const rows = within(screen.getByRole('table', { name: 'Mailbox accounts' })).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
  })

  it('shows which client a mailbox sends for, and connects it to another', async () => {
    mockedClients.mockResolvedValue([
      { id: 'client-one', name: 'Dallas Fontaine', status: 'active' },
      { id: 'client-two', name: 'Rae Whitfield', status: 'active' },
    ] as never)

    renderPage('mailboxes')

    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    const assigned = within(table).getByText('admin@solaraccountreview.help').closest('tr') as HTMLElement
    expect(assigned).toHaveTextContent('Dallas Fontaine')

    // The client cell is the menu; Dallas is already checked.
    const trigger = within(assigned).getByRole('button', { name: 'Client for admin@solaraccountreview.help: Dallas Fontaine' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' })
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Dallas Fontaine' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Rae Whitfield' }))

    const clientReads = mockedClients.mock.calls.length
    const mailboxReads = mockedMailboxes.mock.calls.length
    await waitFor(() => expect(vi.mocked(setWorkspaceMailboxClient)).toHaveBeenCalledWith({
      workspaceId: defaultWorkspaceId,
      clientId: 'client-two',
      email: 'admin@solaraccountreview.help',
      assigned: true,
    }))
    // The mailbox list re-reads; unrelated tenant data (the client list) does not.
    await waitFor(() => expect(mockedMailboxes.mock.calls.length).toBeGreaterThan(mailboxReads))
    expect(mockedClients.mock.calls.length).toBe(clientReads)
  })

  it('takes a mailbox back off a client by unchecking it in the client cell', async () => {
    mockedClients.mockResolvedValue([
      { id: 'client-one', name: 'Dallas Fontaine', status: 'active' },
    ] as never)

    renderPage('mailboxes')

    const table = await screen.findByRole('table', { name: 'Mailbox accounts' })
    const assigned = within(table).getByText('admin@solaraccountreview.help').closest('tr') as HTMLElement
    const trigger = within(assigned).getByRole('button', { name: 'Client for admin@solaraccountreview.help: Dallas Fontaine' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' })
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Dallas Fontaine' }))

    await waitFor(() => expect(vi.mocked(setWorkspaceMailboxClient)).toHaveBeenCalledWith({
      workspaceId: defaultWorkspaceId,
      clientId: 'client-one',
      email: 'admin@solaraccountreview.help',
      assigned: false,
    }))
  })

  it('offers no purchase flow to a member who could not complete one', async () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      membership: { role: 'member' },
      isPlatformAdmin: false,
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

    renderPage('mailboxes')

    // Mailboxes are provisioned outside this product entirely: no purchase
    // flow renders for anyone, whatever their role.
    await screen.findByRole('heading', { name: /Mailboxes/i })
    expect(screen.queryByText('Buy new sending domains')).not.toBeInTheDocument()
  })

  it('shows the workspace-safe disconnected mailbox state', async () => {
    mockedMailboxes.mockResolvedValueOnce({
      connected: false,
      provider_workspace_name: null,
      accounts: [],
      last_synced_at: null,
      analytics_errors: [],
    })

    renderPage('mailboxes')

    expect(await screen.findByRole('heading', { name: 'Instantly is not connected' })).toBeInTheDocument()
    expect(screen.getByText('Connect this workspace to load its sending accounts.')).toBeInTheDocument()
  })

  it('explains a rejected Instantly key instead of rendering a plain disconnect', async () => {
    mockedMailboxes.mockResolvedValueOnce({
      connected: false,
      reason: 'key_rejected',
      provider_workspace_name: 'Get On A Pod Sending',
      accounts: [],
      last_synced_at: null,
      analytics_errors: [],
    })

    renderPage('mailboxes')

    expect(await screen.findByRole('heading', { name: 'Instantly declined the connected key' })).toBeInTheDocument()
    expect(screen.getByText('Instantly rejected the saved API key. Reconnect Instantly in Client Campaigns with a current key.')).toBeInTheDocument()
  })

  it('distinguishes a mailbox request error from a disconnected workspace', async () => {
    mockedMailboxes.mockRejectedValueOnce(new Error('Mailbox request failed'))

    renderPage('mailboxes')

    expect(await screen.findByRole('heading', { name: 'Mailbox data unavailable' })).toBeInTheDocument()
    expect(screen.getByText('Mailbox request failed')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Not connected')).not.toBeInTheDocument()
  })

  it('loads a selected workspace and scopes every suite route to it', async () => {
    renderPage('client-campaigns', selectedWorkspaceId.toUpperCase())

    expect(await screen.findByText('Acme Workspace')).toBeInTheDocument()
    const baseHref = `/app/workspaces/${selectedWorkspaceId}`
    expect(screen.getByTestId('workspace-layout')).toHaveAttribute('data-base-href', baseHref)
    expect(screen.queryByRole('navigation', { name: 'Outreach suite' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open clients/i })).toHaveAttribute('href', `${baseHref}/clients`)
    expect(mockedView).toHaveBeenCalledWith(selectedWorkspaceId, expect.any(AbortSignal))
  })

})
