import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreditBalanceWarning } from '@/components/workspace/CreditBalanceWarning'
import { getWorkspaceBillingOverview } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceBillingOverview: vi.fn() }))

const workspaceId = '11111111-1111-4111-8111-111111111111'

const renderWarning = (
  canManageBilling = true,
  autoRefill?: { thresholdCredits: number; packCredits: number },
) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CreditBalanceWarning workspaceId={workspaceId} canManageBilling={canManageBilling} autoRefill={autoRefill} />
    </MemoryRouter>
  </QueryClientProvider>,
)

const overview = (over: Record<string, unknown>) => ({
  enforcement_enabled: true,
  monthly_credit_allowance: 100,
  balance: 100,
  ...over,
})

describe('CreditBalanceWarning', () => {
  beforeEach(() => vi.clearAllMocks())

  // A banner that is always there is one nobody reads on the day it matters.
  it('says nothing while the balance is healthy', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({ balance: 90 }) as never)
    renderWarning()

    await waitFor(() => expect(getWorkspaceBillingOverview).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('warns before the balance runs out, not after', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({ balance: 15 }) as never)
    renderWarning()

    expect(await screen.findByText(/15 credits left/i)).toBeInTheDocument()
    expect(screen.getByText(/research, contact finding and prospect page builds/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Top up' })).toHaveAttribute('href', '/app/settings/billing')
  })

  // Someone who has already agreed to be topped up automatically is told when
  // that happens, not asked to do it by hand.
  it('says when the automatic top-up will run instead of asking for a manual one', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(
      overview({ balance: 15, refill_threshold_credits: 10, refill_pack_credits: 300 }) as never,
    )
    renderWarning()

    expect(await screen.findByText(
      '15 credits left. Automatic top-up will buy 300 credits when you reach 10.',
    )).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Top up' })).not.toBeInTheDocument()
  })

  it('takes the automatic top-up settings from the caller when it has them', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({ balance: 15 }) as never)
    renderWarning(true, { thresholdCredits: 25, packCredits: 100 })

    expect(await screen.findByText(
      '15 credits left. Automatic top-up will buy 100 credits when you reach 25.',
    )).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Top up' })).not.toBeInTheDocument()
  })

  it('says what has stopped once the balance is empty', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(overview({ balance: 0 }) as never)
    renderWarning()

    expect(await screen.findByText(/out of credits/i)).toBeInTheDocument()
    expect(screen.getByText(/will not run until it is topped up/i)).toBeInTheDocument()
  })

  // Nothing is being charged, so there is nothing to warn about.
  it('stays quiet while enforcement is off', async () => {
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue(
      overview({ balance: 0, enforcement_enabled: false }) as never,
    )
    renderWarning()

    await waitFor(() => expect(getWorkspaceBillingOverview).toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not nag someone who cannot act on it', async () => {
    renderWarning(false)

    await waitFor(() => expect(getWorkspaceBillingOverview).not.toHaveBeenCalled())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
