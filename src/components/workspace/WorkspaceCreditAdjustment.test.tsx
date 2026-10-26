import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceCreditAdjustment } from '@/components/workspace/WorkspaceCreditAdjustment'
import { adjustWorkspaceCredits, getWorkspaceBillingOverview } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  adjustWorkspaceCredits: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'

const renderCard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <WorkspaceCreditAdjustment workspaceId={workspaceId} workspaceName="Juliana Munoz" />
  </QueryClientProvider>,
)

async function chooseReason(label: string) {
  fireEvent.click(screen.getByRole('combobox', { name: 'Reason' }))
  fireEvent.click(await screen.findByRole('option', { name: label }))
}

async function ready() {
  await screen.findByText('850 available.')
}

describe('WorkspaceCreditAdjustment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({ balance: 850 } as never)
    vi.mocked(adjustWorkspaceCredits).mockResolvedValue({ removed: 100, balance: 750 })
  })

  it('files a removal under the same reasons as a grant, with an optional note, after a review', async () => {
    renderCard()
    await ready()

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '100' } })
    await chooseReason('Service recovery')
    fireEvent.change(screen.getByLabelText(/Internal note/), { target: { value: 'Duplicate grant.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review removal' }))

    // Nothing is removed until the review is confirmed.
    expect(adjustWorkspaceCredits).not.toHaveBeenCalled()
    const review = screen.getByRole('alertdialog', { name: 'Remove 100 credits from Juliana Munoz?' })
    expect(within(review).getByText('850')).toBeInTheDocument()
    expect(within(review).getByText('750')).toBeInTheDocument()
    expect(within(review).getByText('Service recovery')).toBeInTheDocument()
    expect(within(review).getByText('Duplicate grant.')).toBeInTheDocument()

    fireEvent.click(within(review).getByRole('button', { name: 'Remove credits' }))
    await waitFor(() => expect(adjustWorkspaceCredits).toHaveBeenCalledWith(workspaceId, {
      amount: 100,
      reason: 'service_recovery',
      note: 'Duplicate grant.',
      adjustmentKey: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    }))
  })

  it('will not review a removal without a reason', async () => {
    renderCard()
    await ready()

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '100' } })
    expect(screen.getByRole('button', { name: 'Review removal' })).toBeDisabled()
  })

  it('refuses an amount that is not plainly a whole number', async () => {
    renderCard()
    await ready()

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '1e3' } })
    await chooseReason('Other')
    expect(screen.getByText('Enter a whole number of credits.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review removal' })).toBeDisabled()
  })

  // Capped at the balance: a removal larger than the balance is a mistake
  // about the number, and the server would refuse it anyway.
  it('caps the amount at the available balance', async () => {
    renderCard()
    await ready()

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '851' } })
    await chooseReason('Other')
    expect(screen.getByText('Only 850 credits are available to remove.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review removal' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '850' } })
    expect(screen.getByRole('button', { name: 'Review removal' })).toBeEnabled()
  })

  it('returns focus to the review button when the review is dismissed', async () => {
    renderCard()
    await ready()

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '10' } })
    await chooseReason('Other')
    const review = screen.getByRole('button', { name: 'Review removal' })
    fireEvent.click(review)
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(review).toHaveFocus())
  })

  it('sends the same key for a retry within one review', async () => {
    vi.mocked(adjustWorkspaceCredits).mockRejectedValueOnce(new Error('Network timeout'))
    renderCard()
    await ready()

    fireEvent.change(screen.getByLabelText('Credits to remove'), { target: { value: '10' } })
    await chooseReason('Other')
    fireEvent.click(screen.getByRole('button', { name: 'Review removal' }))
    const review = screen.getByRole('alertdialog')
    fireEvent.click(within(review).getByRole('button', { name: 'Remove credits' }))
    await waitFor(() => expect(adjustWorkspaceCredits).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(within(review).getByRole('button', { name: 'Remove credits' })).toBeEnabled())
    fireEvent.click(within(review).getByRole('button', { name: 'Remove credits' }))
    await waitFor(() => expect(adjustWorkspaceCredits).toHaveBeenCalledTimes(2))

    const [first, second] = vi.mocked(adjustWorkspaceCredits).mock.calls.map(([, input]) => input.adjustmentKey)
    expect(first).toBe(second)
  })
})
