import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSubscriptionStatus } from '@/components/workspace/WorkspaceSubscriptionStatus'
import { getWorkspaceBillingOverview, listBillingPlans } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  listBillingPlans: vi.fn(),
  runSubscriptionAction: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'

const renderCard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <WorkspaceSubscriptionStatus workspaceId={workspaceId} workspaceName="Juliana Munoz" ownerEmail="juliana@leadgenjay.com" />
  </QueryClientProvider>,
)

describe('WorkspaceSubscriptionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listBillingPlans).mockResolvedValue([
      { plan_key: 'founding_member', display_name: 'Founding member', base_price_cents: 4900, monthly_credit_allowance: 100, stripe_price_id: 'price_a', is_purchasable: true },
      { plan_key: 'standard', display_name: 'Standard', base_price_cents: 9900, monthly_credit_allowance: 300, stripe_price_id: 'price_b', is_purchasable: true },
    ])
  })

  it('names the status and says what happens next', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'active',
      plan_key: 'founding_member',
      base_price_cents: 3900,
      subscription_price_cents: 3900,
      plan_base_price_cents: 3900,
      current_period_end: '2026-09-01T00:00:00Z',
      has_subscription: true,
      stripe_customer_id: 'cus_123',
    } as never)
    renderCard()

    expect(await screen.findByText('Active')).toBeInTheDocument()
    // A status word alone tells an operator nothing about what happens next.
    expect(screen.getByText(/renewing on schedule/i)).toBeInTheDocument()
    expect(screen.getByText('$39/mo')).toBeInTheDocument()
  })

  // Sam Bylett: no subscription, and the profile column still at the $29
  // default it was created with. The plan costs $49, which is what checkout
  // would charge, so that is the price.
  it('shows the plan price, not the profile default, before there is a subscription', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'trialing',
      plan_key: 'founding_member',
      base_price_cents: 2900,
      subscription_price_cents: null,
      plan_base_price_cents: 4900,
      has_subscription: false,
    } as never)
    renderCard()

    expect(await screen.findByText('$49/mo')).toBeInTheDocument()
    expect(screen.queryByText(/\$29/u)).not.toBeInTheDocument()
  })

  it('labels a grandfathered Stripe price against the current plan price', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'active',
      plan_key: 'founding_member',
      base_price_cents: 4900,
      subscription_price_cents: 2900,
      plan_base_price_cents: 4900,
      has_subscription: true,
    } as never)
    renderCard()

    expect(await screen.findByText('$29/mo · Legacy price (current $49)')).toBeInTheDocument()
  })

  it('distinguishes a paused subscription from a cancelled one', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'paused', plan_key: 'standard', base_price_cents: 3900, has_subscription: true,
    } as never)
    renderCard()

    expect(await screen.findByText('Paused')).toBeInTheDocument()
    expect(screen.getByText(/No allowance is granted while paused/i)).toBeInTheDocument()
  })

  it('says a cancellation is coming while the status still reads active', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'active',
      plan_key: 'standard',
      base_price_cents: 3900,
      cancel_at_period_end: true,
      current_period_end: '2026-09-01T00:00:00Z',
      has_subscription: true,
    } as never)
    renderCard()

    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Ending')).toBeInTheDocument()
    expect(screen.getByText('Access until')).toBeInTheDocument()
  })

  it('links to the customer in Stripe when there is one', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'active', plan_key: 'standard', base_price_cents: 3900, stripe_customer_id: 'cus_abc',
    } as never)
    renderCard()

    expect(await screen.findByRole('link', { name: /Open in Stripe/i }))
      .toHaveAttribute('href', 'https://dashboard.stripe.com/customers/cus_abc')
  })

  it('says so when no Stripe customer exists yet', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'trialing', plan_key: 'founding_member', base_price_cents: 3900, has_subscription: false,
    } as never)
    renderCard()

    expect(await screen.findByText(/None yet\. One is created at the first checkout\./u)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open in Stripe/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open in Stripe/i })).toBeDisabled()
  })

  // "Renews: —" alone said nothing to a workspace with no subscription.
  it('shows the trial end where a subscription would show its renewal', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'trialing', plan_key: 'founding_member', has_subscription: false,
      trial_ends_at: '2026-08-23T17:47:06.077Z', has_saved_card: false,
    } as never)
    renderCard()

    expect(await screen.findByText('Trial ended')).toBeInTheDocument()
    expect(screen.getByText('Aug 23, 2026')).toBeInTheDocument()
    expect(screen.queryByText('Renews')).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('shows the card on file and the Stripe customer ID with a copy button', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'active', plan_key: 'standard', has_subscription: true, has_saved_card: true,
      stripe_customer_id: 'cus_abc', current_period_end: '2026-11-26T00:00:00Z',
    } as never)
    renderCard()

    const card = (await screen.findByText('Card on file')).parentElement as HTMLElement
    expect(within(card).getByText('Yes')).toBeInTheDocument()
    expect(screen.getByText('cus_abc')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy Stripe customer ID' })).toBeInTheDocument()
    expect(screen.getByText('Next renewal')).toBeInTheDocument()
  })

  it('offers only the actions that make sense for the subscription', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'trialing', plan_key: 'founding_member', has_subscription: false,
    } as never)
    renderCard()

    await screen.findByText('Trialing')
    expect(await screen.findByRole('button', { name: 'Extend trial' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Send checkout link' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeDisabled()
  })

  // The dialog unmounts on close; focus used to fall to the page body.
  it('returns focus to the action button when the dialog closes', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'trialing', plan_key: 'founding_member', has_subscription: false,
    } as never)
    renderCard()

    const opener = await screen.findByRole('button', { name: 'Extend trial' })
    await waitFor(() => expect(opener).toBeEnabled())
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('opens a confirm dialog for an action', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({
      billing_status: 'trialing', plan_key: 'founding_member', has_subscription: false,
    } as never)
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Make complimentary' }))
    expect(await screen.findByRole('dialog', { name: 'Make complimentary: Juliana Munoz' })).toBeInTheDocument()
  })
})
