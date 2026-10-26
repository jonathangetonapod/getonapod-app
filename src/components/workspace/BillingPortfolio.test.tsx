import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
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
  monthly_credit_allowance: 100,
  plan_monthly_credit_allowance: 100,
  balance: 200,
  credits_spent_this_month: 0,
  has_subscription: false,
  cancel_at_period_end: false,
  current_period_end: null,
  trial_ends_at: inDays(30),
  ...overrides,
})

const renderPortfolio = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BillingPortfolio workspaceId="11111111-1111-4111-8111-111111111111" selectedWorkspaceId="" onSelect={vi.fn()} />
  </QueryClientProvider>,
)

describe('BillingPortfolio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts and sorts lapsed trials as needing attention', async () => {
    vi.mocked(getBillingPortfolio).mockResolvedValue({
      enforcementEnabled: true,
      workspaces: [
        row({ name: 'Fine', balance: 50 }),
        row({ name: 'Sam Bylett', trial_ends_at: inDays(-60), balance: 200 }),
        row({ name: 'Lindsey Huettner', trial_ends_at: inDays(-70), balance: 100 }),
        row({ name: 'Ending soon', trial_ends_at: inDays(3), balance: 900 }),
      ],
    })
    renderPortfolio()

    const count = await screen.findByText('Need attention')
    expect(within(count.parentElement as HTMLElement).getByText('3')).toBeInTheDocument()

    const names = screen.getAllByRole('row').slice(1).map((tableRow) => tableRow.querySelector('td')?.textContent)
    expect(names).toEqual(['Lindsey Huettner', 'Sam Bylett', 'Ending soon', 'Fine'])
    expect(screen.getAllByText('Trial ended')).toHaveLength(2)
    expect(screen.getByText('Trial ending')).toBeInTheDocument()
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
