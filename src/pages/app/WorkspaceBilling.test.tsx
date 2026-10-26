import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/contexts/AuthContext'
import {
  createWorkspaceBillingPortal,
  createWorkspaceSubscriptionCheckout,
  getWorkspaceBillingOverview,
  setWorkspaceAutoRefill,
} from '@/services/workspaceStaff'
import WorkspaceBilling from '@/pages/app/WorkspaceBilling'

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }))
vi.mock('@/components/workspace/WorkspaceLayout', () => ({ WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  createWorkspaceCreditCheckout: vi.fn(),
  createWorkspaceBillingPortal: vi.fn(),
  createWorkspaceSubscriptionCheckout: vi.fn(),
  setWorkspaceAutoRefill: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedOverview = vi.mocked(getWorkspaceBillingOverview)
const mockedPortal = vi.mocked(createWorkspaceBillingPortal)
const mockedSubscribe = vi.mocked(createWorkspaceSubscriptionCheckout)
const mockedAutoRefill = vi.mocked(setWorkspaceAutoRefill)

const workspaceId = '11111111-1111-4111-8111-111111111111'

const overviewFixture = {
  plan_key: 'founding_member',
  billing_status: 'trialing',
  base_price_cents: 3900,
  per_client_price_cents: 3900,
  included_active_clients: 1,
  monthly_credit_allowance: 100,
  enforcement_enabled: false,
  has_subscription: false,
  current_period_end: '2026-10-01T00:00:00.000Z',
  next_allowance_at: '2026-10-01T00:00:00.000Z',
  balance: 42,
  expiring_credits: 25,
  next_expiry_at: '2026-09-01T00:00:00.000Z',
  usage_this_month: {
    dashboard_build: { total: 3, byo: 1 },
    research_run: { total: 4, byo: 0 },
  },
  credits_spent_this_month: 50,
  prices: { dashboard_build: 5, research_run: 10 },
  recent_activity: [
    { id: 'entry-1', entry_type: 'grant', amount: 25, operation_type: null, reference_kind: 'allowance_period', created_at: '2026-07-01T00:00:00.000Z' },
  ],
}

function asOwner(extra: Record<string, unknown> = {}) {
  mockedUseAuth.mockReturnValue({
    isPlatformAdmin: false,
    canManageWorkspaceStaff: true,
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    workspace: { id: workspaceId },
    ...extra,
  } as never)
}

const Location = () => {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderPage(path = '/app/settings/billing') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/app/settings/billing" element={<WorkspaceBilling />} />
          <Route path="/app/clients" element={<Location />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorkspaceBilling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('waits for the credits to actually land, and says what it means if they do not', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage('/app/settings/billing?checkout=success')

    expect(await screen.findByText(/Waiting for Stripe to confirm the payment/)).toBeInTheDocument()
    expect(screen.getByText(/contact support rather than paying again/i)).toBeInTheDocument()
    // ?checkout=success can be typed by anyone, so nothing claims the payment landed.
    expect(screen.queryByText(/payment went through|within a minute/i)).not.toBeInTheDocument()
  })

  // Selling a pack while the same page says the balance will not move is asking
  // for money for something the product has just said it is not doing.
  it('offers nothing to buy while credits are not being charged', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByText(/credits are not being charged yet/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Buy for $29' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Buy credits' })).not.toBeInTheDocument()
  })

  it('offers the packs the server will actually charge once charging is on', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({ ...overviewFixture, enforcement_enabled: true } as never)
    renderPage()

    // These mirror CREDIT_PACKS in workspace-credit-checkout.
    expect(await screen.findByRole('button', { name: 'Buy for $29' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buy for $69' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Buy for $149' })).toBeInTheDocument()
    expect(screen.queryByText(/credits are not being charged yet/i)).not.toBeInTheDocument()
  })

  // The page used to list run counts with no prices, so nobody could work out
  // where their credits had gone. The cost of each operation was being fetched
  // and thrown away.
  it('prices each operation so the usage adds up to the total', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    // The price list names the same operations, so the usage lookups are
    // scoped to the table.
    const usage = within(await screen.findByRole('table'))
    const research = usage.getByText('Research a podcast').closest('tr')!
    // An older overview with no ledger breakdown: 4 runs at 10 credits each.
    expect(within(research).getByText('4')).toBeInTheDocument()
    expect(within(research).getByText('40')).toBeInTheDocument()

    // 3 dashboard builds, 1 on their own key and therefore free, at 5 each.
    const dashboards = usage.getByText('Build a prospect page').closest('tr')!
    expect(within(dashboards).getByText(/1 on your own key, free/i)).toBeInTheDocument()
    expect(within(dashboards).getByText('10')).toBeInTheDocument()

    expect(screen.getByText('Total').closest('tr')).toHaveTextContent('50')
    expect(screen.getByRole('progressbar', { name: 'Monthly allowance used' })).toHaveAttribute('aria-valuenow', '50')
  })

  // "Used this month" read the ledger (net of refunds) while the table priced
  // run counts, so failed-and-refunded runs made the table out-total the meter.
  it('takes usage credits from the ledger so the table total matches Used this month', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({
      ...overviewFixture,
      monthly_credit_allowance: 150,
      usage_this_month: { podscan_lookup: { total: 5, byo: 0 } },
      ledger_usage_this_month: { podscan_lookup: { credits: 3, refunds: 2 } },
      credits_spent_this_month: 3,
      prices: { podscan_lookup: 1 },
    } as never)
    renderPage()

    const usage = within(await screen.findByRole('table'))
    const lookups = usage.getByText('Look up podcast data').closest('tr')!
    expect(within(lookups).getByText('5')).toBeInTheDocument()
    expect(within(lookups).getByText('2 failed, refunded')).toBeInTheDocument()
    expect(within(lookups).getByText('3')).toBeInTheDocument()
    expect(usage.getByText('Total').closest('tr')).toHaveTextContent('3')
    expect(screen.getByText('Used this month').parentElement).toHaveTextContent('3 / 150')
  })

  it('shows the balance and what is expiring', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(mockedOverview).toHaveBeenCalledWith(workspaceId)
    // Split into the part that lapses and the part that does not.
    expect(screen.getByText(/25 monthly · expire Sep 1, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/17 purchased · never expire/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Monthly allowance used' })).toHaveAttribute('aria-valuenow', '50')
  })

  // billing_status was fetched and never rendered, so a workspace whose payment
  // had failed was told nothing until something stopped working.
  it('says when a payment has failed', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({ ...overviewFixture, billing_status: 'past_due' } as never)
    renderPage()

    expect(await screen.findByText('Payment overdue')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('A payment did not go through.')
  })

  it('sends a subscribed workspace to the Stripe portal', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({ ...overviewFixture, has_subscription: true } as never)
    mockedPortal.mockResolvedValue('https://billing.stripe.com/session/test')
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Manage plan' }))
    expect(mockedPortal).toHaveBeenCalledWith(workspaceId)
    expect(mockedSubscribe).not.toHaveBeenCalled()
  })

  it('sends a workspace with no subscription to checkout instead', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    mockedSubscribe.mockResolvedValue('https://checkout.stripe.com/session/test')
    renderPage()

    // The button names the plan and the price it will start, not "a plan".
    fireEvent.click(await screen.findByRole('button', { name: 'Start plan · $39/mo' }))
    expect(mockedSubscribe).toHaveBeenCalledWith(workspaceId, 'founding_member')
    expect(mockedPortal).not.toHaveBeenCalled()
  })

  it('quotes the plan’s real price and when the trial ends', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({
      ...overviewFixture,
      base_price_cents: 2900,
      plan_base_price_cents: 4900,
      trial_ends_at: '2099-11-09T00:00:00.000Z',
    } as never)
    renderPage()

    expect(await screen.findByText('Trial ends Nov 9, 2099. Then $49/month.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start plan · $49/mo' })).toBeInTheDocument()
  })

  // The page can be behind the webhook: it offers checkout, the server finds
  // a live subscription and refuses with 409. The portal opens instead of a
  // second, separately billed subscription.
  it('opens the portal when checkout reports the workspace already subscribes', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    mockedSubscribe.mockRejectedValue(Object.assign(new Error('This workspace already has a plan.'), {
      code: 'SUBSCRIPTION_EXISTS',
      status: 409,
    }))
    mockedPortal.mockResolvedValue('https://billing.stripe.com/session/test')
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Start plan · $39/mo' }))
    await waitFor(() => expect(mockedPortal).toHaveBeenCalledWith(workspaceId))
  })

  // Nobody could find out what a credit was for, or what anything cost,
  // without spending one first.
  it('explains how credits work, with the plan figures filled in', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByText(/Your plan includes 100 credits every month/)).toBeInTheDocument()
    expect(screen.getByText(/prospect page builds pause until Oct 1, 2026 or until you buy more/)).toBeInTheDocument()
    expect(screen.getByText('Next monthly credits: 100 on Oct 1, 2026')).toBeInTheDocument()
  })

  it('drops the refill date when it is not known', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({ ...overviewFixture, next_allowance_at: null } as never)
    renderPage()

    expect(await screen.findByText(/prospect page builds pause until you buy more\./)).toBeInTheDocument()
    expect(screen.getByText('Next monthly credits: 100')).toBeInTheDocument()
  })

  it('warns in plain sight when monthly credits expire within a week', async () => {
    asOwner()
    const inSixDays = new Date(Date.now() + 6 * 86_400_000 - 60_000).toISOString()
    mockedOverview.mockResolvedValue({
      ...overviewFixture,
      balance: 797,
      expiring_credits: 297,
      expiring_next_credits: 297,
      purchased_credits: 500,
      next_expiry_at: inSixDays,
    } as never)
    renderPage()

    expect(await screen.findByText(/297 credits expire in 6 days/)).toBeInTheDocument()
  })

  it('stays quiet about expiry that is weeks away', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({
      ...overviewFixture,
      next_expiry_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    } as never)
    renderPage()

    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(screen.queryByText(/credits expire in/)).not.toBeInTheDocument()
  })

  it('lists the price of every operation, preferring the live price', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    const card = (await screen.findByRole('heading', { name: 'What credits pay for' })).closest('details')!
    // The fixture prices research at 10; the seeded table says 2. Live wins.
    expect(within(card).getByText('Research a podcast').nextElementSibling).toHaveTextContent('10 credits')
    // No live price for scoring, so the seeded one shows.
    expect(within(card).getByText('Score podcasts for fit (per 20)').nextElementSibling).toHaveTextContent('1 credit')
    // A free step says so rather than showing a zero.
    expect(within(card).getByText("Find a host's email").nextElementSibling).toHaveTextContent('Free')
    expect(within(card).getByRole('heading', { name: 'Mailboxes' })).toBeInTheDocument()
    expect(within(card).getByText('Buy a sending domain').nextElementSibling).toHaveTextContent('20 credits')
    expect(within(card).getByText('Run a mailbox for a month').nextElementSibling).toHaveTextContent('5 credits')
  })

  it('says what has paused and until when once the balance is empty', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({ ...overviewFixture, enforcement_enabled: true, balance: 0 } as never)
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have no credits left. Research, contact finding and prospect page builds are paused until Oct 1, 2026, or until you buy a pack.',
    )
  })

  // The top bar already links platform admins to billing administration, and
  // platform administration is not hosted on this page either.
  it('leaves billing administration to the top bar', async () => {
    asOwner({ isPlatformAdmin: true, user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } })
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Billing administration/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Back to settings/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Top up a workspace' })).not.toBeInTheDocument()
  })

  it('shows a workspace owner no route into platform administration', async () => {
    asOwner()
    mockedOverview.mockResolvedValue(overviewFixture as never)
    renderPage()

    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Billing administration/ })).not.toBeInTheDocument()
  })

  it('tells an agency owner the billing failed to load rather than rendering nothing', async () => {
    asOwner()
    mockedOverview.mockRejectedValue(new Error('Billing data could not be loaded.'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Your billing could not be loaded.')
    expect(screen.getByText(/Nothing has been charged/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('shows each pack’s saving and the balance after buying it', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({ ...overviewFixture, enforcement_enabled: true } as never)
    renderPage()

    await screen.findByRole('button', { name: 'Buy for $29' })
    // $0.23 and $0.18625 a credit against $0.29, rounded down.
    expect(screen.getByText('Save 20%')).toBeInTheDocument()
    expect(screen.getByText('Save 35%')).toBeInTheDocument()
    expect(screen.getByText('You’ll have 142 credits')).toBeInTheDocument()
    expect(screen.getByText('You’ll have 842 credits')).toBeInTheDocument()
  })

  it('offers auto-refill on the packs until a card is saved, then the full settings', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({ ...overviewFixture, enforcement_enabled: true, has_saved_card: false } as never)
    renderPage()

    expect(await screen.findByRole('checkbox', { name: 'Auto-refill this pack when I run low' })).toBeInTheDocument()
    expect(screen.queryByText(/Buy a credit pack once to save a card/)).not.toBeInTheDocument()
  })

  it('switches auto-refill on for the pack bought once the credits arrive on a saved card', async () => {
    asOwner()
    window.sessionStorage.setItem('billing-checkout-marker-v1', JSON.stringify({
      startedAt: Date.now() - 10_000,
      balanceBefore: 42,
      autoRefillPack: 300,
    }))
    mockedOverview.mockResolvedValue({
      ...overviewFixture,
      enforcement_enabled: true,
      has_saved_card: true,
      balance: 342,
      refill_threshold_credits: null,
    } as never)
    mockedAutoRefill.mockResolvedValue({ threshold: 50, pack: 300, monthlyCapCents: null })
    renderPage('/app/settings/billing?checkout=success')

    await waitFor(() => expect(mockedAutoRefill).toHaveBeenCalledWith(workspaceId, {
      thresholdCredits: 50,
      packCredits: 300,
      monthlyCapCents: null,
    }))
  })

  it('folds a failed run and its refund into one row, with the time', async () => {
    asOwner()
    mockedOverview.mockResolvedValue({
      ...overviewFixture,
      recent_activity: [
        { id: 'r2', entry_type: 'refund', amount: 1, operation_type: 'podscan_lookup', reference_kind: 'refund_of', reference_id: 'd2', created_at: '2026-10-20T15:01:00.000Z' },
        { id: 'd2', entry_type: 'debit', amount: -1, operation_type: 'podscan_lookup', reference_kind: null, created_at: '2026-10-20T15:00:00.000Z' },
        { id: 'r1', entry_type: 'refund', amount: 1, operation_type: 'podscan_lookup', reference_kind: 'refund_of', reference_id: 'd1', created_at: '2026-10-20T14:01:00.000Z' },
        { id: 'd1', entry_type: 'debit', amount: -1, operation_type: 'podscan_lookup', reference_kind: null, created_at: '2026-10-20T14:00:00.000Z' },
      ],
    } as never)
    renderPage()

    const activity = (await screen.findByRole('heading', { name: 'Activity' })).parentElement!
    expect(within(activity).getAllByRole('listitem')).toHaveLength(1)
    expect(within(activity).getByText('× 2')).toBeInTheDocument()
    expect(within(activity).getByText(/Refunded: 2 runs failed/)).toBeInTheDocument()
    expect(within(activity).getByText(/Oct 20, \d{1,2}:\d{2}/)).toBeInTheDocument()
  })

  it('returns members without Settings access to clients', () => {
    mockedUseAuth.mockReturnValue({ isPlatformAdmin: false, canManageWorkspaceStaff: false } as never)
    renderPage()
    expect(screen.getByTestId('location')).toHaveTextContent('/app/clients')
  })
})
