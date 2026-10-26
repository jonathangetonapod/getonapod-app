import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listBillingPlans, updateBillingPlanPrice } from '@/services/workspaceStaff'
import { PlatformPlanPricing } from '@/components/workspace/PlatformPlanPricing'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/workspaceStaff', () => ({
  listBillingPlans: vi.fn(),
  updateBillingPlanPrice: vi.fn(),
}))

const mockedList = vi.mocked(listBillingPlans)
const mockedUpdate = vi.mocked(updateBillingPlanPrice)

const plans = [
  { plan_key: 'comped', display_name: 'Complimentary', base_price_cents: 0, monthly_credit_allowance: 100, stripe_price_id: null, is_purchasable: false, workspace_count: 0, subscriber_count: 0 },
  { plan_key: 'founding_member', display_name: 'Founding member', base_price_cents: 4900, monthly_credit_allowance: 100, stripe_price_id: 'price_founding', is_purchasable: true, workspace_count: 3, subscriber_count: 0 },
  { plan_key: 'standard', display_name: 'Standard', base_price_cents: 9900, monthly_credit_allowance: 300, stripe_price_id: 'price_standard', is_purchasable: true, workspace_count: 4, subscriber_count: 2 },
  { plan_key: 'enterprise', display_name: 'Enterprise', base_price_cents: 49900, monthly_credit_allowance: 2000, stripe_price_id: null, is_purchasable: true, workspace_count: 0, subscriber_count: 0 },
]

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <PlatformPlanPricing />
    </QueryClientProvider>,
  )
}

async function chooseReason(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('combobox', { name: 'Reason' }))
  fireEvent.click(await screen.findByRole('option', { name: 'Contract adjustment' }))
}

describe('PlatformPlanPricing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedList.mockResolvedValue(plans as never)
    mockedUpdate.mockResolvedValue(plans as never)
  })

  it('shows each plan at the price it is actually sold at', async () => {
    renderPanel()
    expect(await screen.findByLabelText('Per month (USD)', { selector: '#plan-price-standard' })).toHaveValue('99.00')
    expect(screen.getByLabelText('Credits/month', { selector: '#plan-credits-standard' })).toHaveValue('300')
  })

  // Saving used to go straight to Stripe. Now it shows who is affected first.
  it('confirms a price change before saving, naming who stays on the old price', async () => {
    renderPanel()
    fireEvent.change(await screen.findByLabelText('Per month (USD)', { selector: '#plan-price-standard' }), { target: { value: '119' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[2])

    const dialog = screen.getByRole('dialog', { name: 'Save Standard?' })
    expect(within(dialog).getByText('Standard: $99 → $119. New subscribers only.')).toBeInTheDocument()
    expect(within(dialog).getByText('2 current subscribers stay on $99.')).toBeInTheDocument()
    expect(mockedUpdate).not.toHaveBeenCalled()

    // A reason is required before it can be saved.
    expect(within(dialog).getByRole('button', { name: 'Save Standard' })).toBeDisabled()
    await chooseReason(dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Standard' }))

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('standard', 11_900, 300, {
      applyToExistingSubscribers: false,
      reason: 'contract_adjustment',
      note: '',
      actionKey: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    }))
  })

  it('names the live count of workspaces the allowance would reach, and that it is credits only', async () => {
    renderPanel()
    expect(await screen.findByLabelText('Also give existing subscribers (4) the new credit allowance')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Credits/month', { selector: '#plan-credits-standard' }), { target: { value: '400' } })
    fireEvent.click(screen.getByLabelText('Also give existing subscribers (4) the new credit allowance'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[2])

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Credits each month: 300 → 400.')).toBeInTheDocument()
    expect(within(dialog).getByText(/4 workspaces on Standard get 400 credits .* Price is unchanged for them\./u)).toBeInTheDocument()
    // The price did not move, so nothing is said about subscribers' prices.
    expect(within(dialog).queryByText(/New subscribers only/u)).not.toBeInTheDocument()
  })

  it('can create the first price at the amount already shown', async () => {
    renderPanel()
    const saves = await screen.findAllByRole('button', { name: 'Save' })
    fireEvent.click(saves[3])
    expect(screen.getByText('Enterprise: creates the first Stripe price, at $499/mo.')).toBeInTheDocument()
  })

  it('leaves save disabled for a priced plan at an unchanged amount', async () => {
    renderPanel()
    const saves = await screen.findAllByRole('button', { name: 'Save' })
    expect(saves[2]).toBeDisabled()
  })

  // Complimentary is never sold: credits only, no price, no Stripe.
  it('gives complimentary a credits field and no price or Stripe prompt', async () => {
    renderPanel()
    await screen.findByText('Complimentary')
    expect(screen.queryByLabelText('Per month (USD)', { selector: '#plan-price-comped' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Credits/month', { selector: '#plan-credits-comped' })).toHaveValue('100')
    expect(screen.getByText('Never sold')).toBeInTheDocument()
    expect(screen.queryByText(/Set a price to create one in Stripe/u)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Credits/month', { selector: '#plan-credits-comped' }), { target: { value: '150' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0])
    const dialog = screen.getByRole('dialog')
    await chooseReason(dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Complimentary' }))
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('comped', 0, 150, expect.objectContaining({ reason: 'contract_adjustment' })))
  })

  it('shows Stripe price IDs with a copy button and a link to the price', async () => {
    renderPanel()
    expect(await screen.findByText('price_standard')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy Stripe price ID for Standard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the Standard price in Stripe' }))
      .toHaveAttribute('href', 'https://dashboard.stripe.com/prices/price_standard')
  })

  it('refuses an amount that is not money', async () => {
    renderPanel()
    fireEvent.change(await screen.findByLabelText('Per month (USD)', { selector: '#plan-price-standard' }), { target: { value: '12abc' } })
    expect(screen.getAllByRole('button', { name: 'Save' })[2]).toBeDisabled()
  })

  it('says so when the plans cannot be loaded, rather than showing an empty list', async () => {
    mockedList.mockRejectedValue(new Error('nope'))
    renderPanel()
    expect(await screen.findByRole('alert')).toHaveTextContent('The plans could not be loaded.')
  })
})
