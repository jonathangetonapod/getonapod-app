import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceCreditLedger } from '@/components/workspace/WorkspaceCreditLedger'
import { getWorkspaceCreditLedger, type CreditLedgerEntry } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({ getWorkspaceCreditLedger: vi.fn() }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const mockedLedger = vi.mocked(getWorkspaceCreditLedger)

const entry = (overrides: Partial<CreditLedgerEntry>): CreditLedgerEntry => ({
  id: crypto.randomUUID(),
  created_at: '2026-10-20T15:04:00Z',
  type: 'grant',
  entry_type: 'grant',
  amount: 250,
  reason: 'customer_support',
  note: null,
  actor_email: null,
  balance_after: 450,
  ...overrides,
})

const renderLedger = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <WorkspaceCreditLedger workspaceId={workspaceId} />
  </QueryClientProvider>,
)

describe('WorkspaceCreditLedger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedLedger.mockResolvedValue({
      entries: [
        entry({ amount: 250, note: 'Onboarding call', actor_email: 'jonathan@getonapod.com', balance_after: 450 }),
        entry({ type: 'removal', entry_type: 'adjustment', amount: -50, reason: 'Duplicate onboarding grant', balance_after: 200 }),
        entry({ type: 'spend', entry_type: 'debit', amount: -1, reason: 'research_run', actor_email: 'member@acme.com', balance_after: 250 }),
      ],
      total: 60,
      page: 0,
      pageSize: 25,
    })
  })

  it('shows every column: date, type, amount, reason, note, admin, balance after', async () => {
    renderLedger()

    const grant = (await screen.findByText('Onboarding call')).closest('tr') as HTMLElement
    expect(within(grant).getByText('Grant')).toBeInTheDocument()
    expect(within(grant).getByText('+250')).toBeInTheDocument()
    expect(within(grant).getByText('Customer support')).toBeInTheDocument()
    expect(within(grant).getByText('jonathan@getonapod.com')).toBeInTheDocument()
    expect(within(grant).getByText('450')).toBeInTheDocument()

    // Older removals carry their reason as free text.
    expect(screen.getByText('Duplicate onboarding grant')).toBeInTheDocument()
    expect(screen.getByText('Research a podcast')).toBeInTheDocument()
    expect(screen.getByText('-50')).toHaveClass('text-destructive')
    // The person who ran an operation is not an admin.
    const spend = screen.getByText('Research a podcast').closest('tr') as HTMLElement
    expect(within(spend).queryByText(/@/u)).not.toBeInTheDocument()
  })

  it('pages through the ledger', async () => {
    renderLedger()

    expect(await screen.findByText(/page 1 of 3/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Newer/u })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Older/u }))
    await waitFor(() => expect(mockedLedger).toHaveBeenLastCalledWith(workspaceId, { type: 'all', page: 1 }))
  })

  it('filters by type, starting again from the first page', async () => {
    renderLedger()
    await screen.findByText('Onboarding call')
    fireEvent.click(screen.getByRole('button', { name: /Older/u }))
    await waitFor(() => expect(mockedLedger).toHaveBeenLastCalledWith(workspaceId, { type: 'all', page: 1 }))

    fireEvent.click(screen.getByRole('combobox', { name: 'Type' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Removal' }))
    await waitFor(() => expect(mockedLedger).toHaveBeenLastCalledWith(workspaceId, { type: 'removal', page: 0 }))
  })

  // Rows of the old type under the new filter would read as wrong answers.
  it('does not show the previous type while a new one loads', async () => {
    renderLedger()
    await screen.findByText('Onboarding call')
    mockedLedger.mockImplementation(() => new Promise(() => {}))

    fireEvent.click(screen.getByRole('combobox', { name: 'Type' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Purchase' }))
    expect(await screen.findByText('Reading the ledger…')).toBeInTheDocument()
    expect(screen.queryByText('Onboarding call')).not.toBeInTheDocument()
  })

  it('says so when a filter has nothing in it', async () => {
    mockedLedger.mockResolvedValue({ entries: [], total: 0, page: 0, pageSize: 25 })
    renderLedger()

    expect(await screen.findByText('No credit movements yet.')).toBeInTheDocument()
  })
})
