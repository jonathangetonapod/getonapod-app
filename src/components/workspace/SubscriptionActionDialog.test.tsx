import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SubscriptionActionDialog } from '@/components/workspace/SubscriptionActionDialog'
import { runSubscriptionAction, type BillingPlan, type SubscriptionOperation, type WorkspaceBillingOverview } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({ runSubscriptionAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const mockedRun = vi.mocked(runSubscriptionAction)

const plans: BillingPlan[] = [
  { plan_key: 'comped', display_name: 'Complimentary', base_price_cents: 0, monthly_credit_allowance: 100, stripe_price_id: null, is_purchasable: false },
  { plan_key: 'founding_member', display_name: 'Founding member', base_price_cents: 4900, monthly_credit_allowance: 100, stripe_price_id: 'price_a', is_purchasable: true },
  { plan_key: 'standard', display_name: 'Standard', base_price_cents: 9900, monthly_credit_allowance: 300, stripe_price_id: 'price_b', is_purchasable: true },
]

const trialing = {
  plan_key: 'founding_member',
  billing_status: 'trialing',
  has_subscription: false,
  trial_ends_at: '2026-08-23T17:47:06.077Z',
  current_period_end: null,
} as unknown as WorkspaceBillingOverview

function renderDialog(operation: SubscriptionOperation, billing = trialing, ownerEmail: string | null = 'sam@quantisedmedia.com', availablePlans = plans) {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <SubscriptionActionDialog
        operation={operation}
        workspaceId={workspaceId}
        workspaceName="Sam Bylett"
        billing={billing}
        plans={availablePlans}
        ownerEmail={ownerEmail}
        onClose={onClose}
      />
    </QueryClientProvider>,
  )
  return { onClose, dialog: screen.getByRole('dialog') }
}

async function chooseReason(dialog: HTMLElement, label = 'Customer support') {
  fireEvent.click(within(dialog).getByRole('combobox', { name: 'Reason' }))
  fireEvent.click(await screen.findByRole('option', { name: label }))
}

describe('SubscriptionActionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRun.mockResolvedValue({ operation: 'extend_trial', idempotent: false, result: {} })
  })

  it('requires a reason before anything is changed', async () => {
    const { dialog } = renderDialog('make_comped')
    expect(within(dialog).getByRole('button', { name: 'Make complimentary' })).toBeDisabled()
    await chooseReason(dialog)
    expect(within(dialog).getByRole('button', { name: 'Make complimentary' })).toBeEnabled()
  })

  it('extends an ended trial from today by the chosen days', async () => {
    const { dialog, onClose } = renderDialog('extend_trial')
    fireEvent.click(within(dialog).getByRole('button', { name: '+30 days' }))
    expect(within(dialog).getByRole('button', { name: '+30 days' })).toHaveAttribute('aria-pressed', 'true')
    await chooseReason(dialog, 'Trial or launch bonus')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Extend trial' }))

    await waitFor(() => expect(mockedRun).toHaveBeenCalledTimes(1))
    const input = mockedRun.mock.calls[0][1]
    expect(input).toMatchObject({ operation: 'extend_trial', reason: 'trial_bonus', note: '' })
    // The trial ended in August, so 30 days count from now.
    const days = (Date.parse(String(input.trialEndsAt)) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('offers only other plans that are on sale when changing plan', async () => {
    const { dialog } = renderDialog('change_plan')
    fireEvent.click(within(dialog).getByRole('combobox', { name: 'Plan' }))
    const options = (await screen.findAllByRole('option')).map((option) => option.textContent)
    expect(options).toEqual(['Standard · $99/mo'])
  })

  it('says a subscriber is switched now and prorated', () => {
    renderDialog('change_plan', { ...trialing, has_subscription: true, billing_status: 'active' } as WorkspaceBillingOverview)
    expect(screen.getByText(/Switches to Workspace now\. Stripe prorates the rest of this period\./u)).toBeInTheDocument()
  })

  it('does not name a retired plan or allow confirmation when no alternative is available', async () => {
    const singlePlan = plans.map((plan) => ({ ...plan, is_purchasable: plan.plan_key === 'standard' }))
    const { dialog } = renderDialog('change_plan', { ...trialing, plan_key: 'standard', has_subscription: true, billing_status: 'active' }, null, singlePlan)

    expect(within(dialog).getByText('No alternative plan is available for this workspace.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Switches to Founding member/)).not.toBeInTheDocument()
    await chooseReason(dialog)
    expect(within(dialog).getByRole('button', { name: 'Change plan' })).toBeDisabled()
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('creates a checkout link, emails the owner, and shows the link to copy', async () => {
    mockedRun.mockResolvedValue({
      operation: 'checkout_link',
      idempotent: false,
      result: { url: 'https://checkout.stripe.com/c/pay/cs_test_1', emailed: 'sent', owner_email: 'sam@quantisedmedia.com' },
    })
    const { dialog, onClose } = renderDialog('checkout_link')
    expect(within(dialog).getByLabelText('Email it to the owner (sam@quantisedmedia.com)')).toBeChecked()
    await chooseReason(dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create checkout link' }))

    expect(await within(dialog).findByDisplayValue('https://checkout.stripe.com/c/pay/cs_test_1')).toBeInTheDocument()
    expect(within(dialog).getByText('Emailed to sam@quantisedmedia.com.')).toBeInTheDocument()
    expect(mockedRun.mock.calls[0][1]).toMatchObject({ operation: 'checkout_link', planKey: 'founding_member', emailOwner: true })
    // Left open: the link is what the admin came for.
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cannot email a workspace with no owner', () => {
    const { dialog } = renderDialog('checkout_link', trialing, null)
    expect(within(dialog).getByLabelText('No owner email to send it to')).toBeDisabled()
  })

  it('sends the same action key when retried within one opening', async () => {
    mockedRun.mockRejectedValueOnce(new Error('Stripe did not answer. Try again'))
    const { dialog } = renderDialog('cancel', { ...trialing, has_subscription: true, billing_status: 'active', current_period_end: '2026-11-26T00:00:00Z' } as WorkspaceBillingOverview)
    expect(within(dialog).getByText(/The subscription ends .*\. The workspace keeps access until then\./u)).toBeInTheDocument()
    await chooseReason(dialog)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel subscription' }))
    await waitFor(() => expect(mockedRun).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel subscription' })).toBeEnabled())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel subscription' }))
    await waitFor(() => expect(mockedRun).toHaveBeenCalledTimes(2))

    const [first, second] = mockedRun.mock.calls.map(([, input]) => input.actionKey)
    expect(first).toMatch(/^[0-9a-f-]{36}$/u)
    expect(first).toBe(second)
  })

  it('closes on Escape', () => {
    const { onClose } = renderDialog('make_comped')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
