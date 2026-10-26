import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingPortfolio } from '@/components/workspace/BillingPortfolio'
import { getBillingPortfolio, type BillingPortfolioRow } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({ getBillingPortfolio: vi.fn() }))

const DAY = 86_400_000
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString()

const row = (overrides: Partial<BillingPortfolioRow>): BillingPortfolioRow => ({
  workspace_id: crypto.randomUUID(),
  name: 'Workspace',
  billing_status: 'trialing',
  plan_key: 'founding_member',
  plan_name: 'Founding member',
  plan_base_price_cents: 4900,
  monthly_credit_allowance: 100,
  plan_monthly_credit_allowance: 100,
  balance: 200,
  credits_spent_this_month: 0,
  has_subscription: false,
  cancel_at_period_end: false,
  current_period_end: null,
  trial_ends_at: inDays(30),
  owner_email: 'owner@example.com',
  has_saved_card: false,
  last_active_at: null,
  ...overrides,
})

const LocationProbe = () => <output data-testid="location">{useLocation().search}</output>

const renderPortfolio = (initialEntry = '/app/platform/billing', onSelect = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <BillingPortfolio workspaceId="11111111-1111-4111-8111-111111111111" selectedWorkspaceId="" onSelect={onSelect} />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return onSelect
}

const rowNames = () => screen.getAllByRole('row').slice(1).map((tableRow) => tableRow.querySelector('td')?.textContent)
const card = (label: string) => within(screen.getByText(label, { selector: 'dt' }).parentElement as HTMLElement)

const platform = [
  row({ name: 'Fine', balance: 50, owner_email: 'fine@example.com' }),
  row({ name: 'Sam Bylett', trial_ends_at: inDays(-60), owner_email: 'sam@quantisedmedia.com' }),
  row({ name: 'Lindsey Huettner', trial_ends_at: inDays(-70), balance: 100 }),
  row({ name: 'Ending soon', trial_ends_at: inDays(3), balance: 900 }),
  row({ name: 'Low', balance: 10 }),
  row({
    name: 'Payer', billing_status: 'active', has_subscription: true, subscription_price_cents: 2900,
    has_saved_card: true, credits_spent_this_month: 40,
  }),
]

describe('BillingPortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBillingPortfolio).mockResolvedValue({ enforcementEnabled: true, workspaces: platform })
  })

  it('sorts most urgent first and counts what needs attention', async () => {
    renderPortfolio()

    await screen.findByText('Sam Bylett')
    expect(rowNames()).toEqual(['Lindsey Huettner', 'Sam Bylett', 'Ending soon', 'Low', 'Fine', 'Payer'])
    expect(card('Needs attention').getByText('4')).toBeInTheDocument()
    expect(screen.getAllByText('Trial ended')).toHaveLength(2)
  })

  it('summarises the platform: MRR from Stripe, paying and trialing, credits', async () => {
    renderPortfolio()

    await screen.findByText('Sam Bylett')
    expect(card('MRR').getByText('$29')).toBeInTheDocument()
    expect(card('Paying / Trialing').getByText('1 / 5')).toBeInTheDocument()
    expect(card('Trials ending in 7 days').getByText('1')).toBeInTheDocument()
    expect(card('Credits outstanding').getByText('1,460')).toBeInTheDocument()
    expect(card('Credits used this month').getByText('40')).toBeInTheDocument()
  })

  it('shows the new columns with right-aligned numbers', async () => {
    renderPortfolio()

    const payer = (await screen.findByText('Payer')).closest('tr') as HTMLElement
    expect(within(payer).getByText('Subscribed')).toBeInTheDocument()
    expect(within(payer).getByText('Yes')).toBeInTheDocument()
    expect(within(payer).getByText('Never')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Credits used (month)' })).toHaveClass('text-right')
    expect(screen.queryByText('Spent this month')).not.toBeInTheDocument()

    const ending = screen.getByText('Ending soon').closest('tr') as HTMLElement
    expect(within(ending).getByText('3 days left')).toBeInTheDocument()
  })

  it('searches by owner email and keeps the search in the address', async () => {
    renderPortfolio()

    fireEvent.change(await screen.findByLabelText('Search workspaces'), { target: { value: 'QUANTISED' } })
    expect(rowNames()).toEqual(['Sam Bylett'])
    expect(screen.getByTestId('location')).toHaveTextContent('q=QUANTISED')
  })

  it('filters with chips that show their counts', async () => {
    renderPortfolio()

    fireEvent.click(await screen.findByRole('button', { name: /Ending in 7 days/ }))
    expect(rowNames()).toEqual(['Ending soon'])
    expect(screen.getByRole('button', { name: /Ending in 7 days/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location')).toHaveTextContent('filter=ending')

    fireEvent.click(screen.getByRole('button', { name: /Low balance/ }))
    expect(rowNames()).toEqual(['Low'])
    fireEvent.click(screen.getByRole('button', { name: /Paying/ }))
    expect(rowNames()).toEqual(['Payer'])
    expect(within(screen.getByRole('button', { name: /^All/ })).getByText('6')).toBeInTheDocument()
  })

  // Each change used to be written straight to the address, and a search
  // made right after a filter click wrote the old filter back.
  it('keeps the filter when searching straight after choosing it', async () => {
    renderPortfolio()

    fireEvent.click(await screen.findByRole('button', { name: /Needs attention/ }))
    fireEvent.change(screen.getByLabelText('Search workspaces'), { target: { value: 'sam' } })
    expect(rowNames()).toEqual(['Sam Bylett'])
    expect(screen.getByRole('button', { name: /Needs attention/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location')).toHaveTextContent('filter=attention&q=sam')
  })

  it('restores the search and filter from the address', async () => {
    renderPortfolio('/app/platform/billing?filter=attention&q=lindsey')

    await screen.findByText('Lindsey Huettner')
    expect(rowNames()).toEqual(['Lindsey Huettner'])
    expect(screen.getByRole('button', { name: /Needs attention/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('selects a workspace from anywhere on its row', async () => {
    const onSelect = renderPortfolio()

    fireEvent.click(await screen.findByText('sam@quantisedmedia.com'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Manage Payer' }))
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('tags an allowance that differs from the plan default', async () => {
    vi.mocked(getBillingPortfolio).mockResolvedValue({
      enforcementEnabled: true,
      workspaces: [
        row({ name: 'Get On A Pod', monthly_credit_allowance: 150, plan_monthly_credit_allowance: 100 }),
        row({ name: 'On default' }),
      ],
    })
    renderPortfolio()

    const tagged = await screen.findByText('Override')
    expect(tagged.closest('tr')?.querySelector('td')?.textContent).toBe('Get On A Pod')
    expect(screen.getAllByText('Override')).toHaveLength(1)
  })
})
