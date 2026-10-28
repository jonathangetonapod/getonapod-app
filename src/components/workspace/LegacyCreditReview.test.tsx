import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { LegacyCreditReview, LegacyCreditReviewQueue } from './LegacyCreditReview'
import {
  getLegacyCreditOverview, listLegacyCreditReviews, requestLegacyCreditReview, updateLegacyCreditReview,
  type LegacyCreditOverview, type LegacyCreditReview as Review,
} from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({
  getLegacyCreditOverview: vi.fn(), listLegacyCreditReviews: vi.fn(), requestLegacyCreditReview: vi.fn(), updateLegacyCreditReview: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222'
const review: Review = { status: 'requested', requested_at: '2026-10-28T12:00:00Z', purchased_remaining_at_request: 125, resolution_note: null, updated_at: '2026-10-28T12:00:00Z' }
const requested: LegacyCreditOverview = { purchased_remaining: 125, review }
const inProgress: LegacyCreditOverview = { purchased_remaining: 125, review: { ...review, status: 'reviewing' } }
const outcome = 'Customer confirmed the separately verified outcome. Reference CASE-12.'
const completed: LegacyCreditOverview = { purchased_remaining: 125, review: { ...review, status: 'resolved', resolution_note: outcome } }

function renderReview(admin = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const viewFor = (id: string, isAdmin: boolean) => <QueryClientProvider client={client}><MemoryRouter><LegacyCreditReview workspaceId={id} admin={isAdmin} /></MemoryRouter></QueryClientProvider>
  const view = render(viewFor(workspaceId, admin))
  return { ...view, client, update: (id: string, isAdmin = admin) => view.rerender(viewFor(id, isAdmin)) }
}
function renderQueue() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><LegacyCreditReviewQueue workspaceId={workspaceId} /></MemoryRouter></QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getLegacyCreditOverview).mockResolvedValue({ purchased_remaining: 125, review: null })
  vi.mocked(requestLegacyCreditReview).mockResolvedValue(requested)
  vi.mocked(updateLegacyCreditReview).mockResolvedValue(completed)
  vi.mocked(listLegacyCreditReviews).mockResolvedValue([])
})

describe('historical purchased-credit review', () => {
  it('does not offer a review when there is no purchased balance or earlier request', async () => {
    vi.mocked(getLegacyCreditOverview).mockResolvedValue({ purchased_remaining: 0, review: null })
    const { container } = renderReview()
    await waitFor(() => expect(getLegacyCreditOverview).toHaveBeenCalledWith(workspaceId))
    await waitFor(() => expect(screen.queryByText('Checking historical purchases…')).not.toBeInTheDocument())
    expect(container).toBeEmptyDOMElement()
    expect(requestLegacyCreditReview).not.toHaveBeenCalled()
  })

  it('shows historical units and offers manual review without promising money or conversion', async () => {
    renderReview()
    expect(await screen.findByText(/125 unspent purchased credits remain/)).toBeInTheDocument()
    expect(screen.getByText(/No refund or subscription credit is applied automatically/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request a balance review' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Contact billing support' }).getAttribute('href')).toContain(encodeURIComponent(workspaceId))
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('locks a pending request and shows the recorded review without changing the historical balance', async () => {
    let finish!: (value: LegacyCreditOverview) => void
    vi.mocked(requestLegacyCreditReview).mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderReview()
    fireEvent.click(await screen.findByRole('button', { name: 'Request a balance review' }))
    const requesting = await screen.findByRole('button', { name: 'Requesting…' })
    expect(requesting).toBeDisabled()
    fireEvent.click(requesting)
    expect(requestLegacyCreditReview).toHaveBeenCalledTimes(1)
    expect(requestLegacyCreditReview).toHaveBeenCalledWith(workspaceId)
    await act(async () => { finish(requested) })
    expect(await screen.findByText('Review requested')).toBeInTheDocument()
    expect(screen.getByText(/125 unspent purchased credits remain/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request a balance review' })).not.toBeInTheDocument()
    expect(updateLegacyCreditReview).not.toHaveBeenCalled()
  })

  it.each([
    [requested, 'Review requested'], [inProgress, 'Review in progress'], [completed, 'Review completed'],
  ] as const)('shows the saved review state without admin controls: %s', async (data, label) => {
    vi.mocked(getLegacyCreditOverview).mockResolvedValue(data)
    renderReview()
    expect(await screen.findByText(label)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record completed review' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start review' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Outcome shared with the workspace')).not.toBeInTheDocument()
    if (data.review?.resolution_note) expect(screen.getByText(data.review.resolution_note)).toBeInTheDocument()
  })

  it('retains a completed review when no purchased balance remains', async () => {
    vi.mocked(getLegacyCreditOverview).mockResolvedValue({ ...completed, purchased_remaining: 0 })
    renderReview(true)
    expect(await screen.findByText('Review completed')).toBeInTheDocument()
    expect(screen.getByText(outcome)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record completed review' })).not.toBeInTheDocument()
  })

  it('lets an admin start review without representing that as a settlement', async () => {
    vi.mocked(getLegacyCreditOverview).mockResolvedValue(requested)
    vi.mocked(updateLegacyCreditReview).mockResolvedValue(inProgress)
    renderReview(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Start review' }))
    await waitFor(() => expect(updateLegacyCreditReview).toHaveBeenCalledWith(workspaceId, 'reviewing', ''))
    expect(await screen.findByText('Review in progress')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Balance review updated. No payment was moved by this action.')
  })

  it('requires an outcome and explicit confirmation, and reconfirms an edited outcome', async () => {
    vi.mocked(getLegacyCreditOverview).mockResolvedValue(inProgress)
    renderReview(true)
    const record = await screen.findByRole('button', { name: 'Record completed review' })
    const note = screen.getByLabelText('Outcome shared with the workspace')
    const confirmation = screen.getByRole('checkbox')
    expect(record).toBeDisabled()
    fireEvent.change(note, { target: { value: 'short' } })
    fireEvent.click(confirmation)
    expect(record).toBeDisabled()
    fireEvent.change(note, { target: { value: outcome } })
    expect(confirmation).not.toBeChecked()
    expect(record).toBeDisabled()
    fireEvent.click(confirmation)
    expect(record).toBeEnabled()
    fireEvent.change(note, { target: { value: ` ${outcome} ` } })
    expect(confirmation).not.toBeChecked()
    fireEvent.click(confirmation)
    fireEvent.click(record)
    await waitFor(() => expect(updateLegacyCreditReview).toHaveBeenCalledWith(workspaceId, 'resolved', outcome))
    expect(await screen.findByText('Review completed')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('preserves an admin draft after a failed save without showing a completed review', async () => {
    vi.mocked(getLegacyCreditOverview).mockResolvedValue(inProgress)
    vi.mocked(updateLegacyCreditReview).mockRejectedValue(new Error('Could not save'))
    renderReview(true)
    fireEvent.change(await screen.findByLabelText('Outcome shared with the workspace'), { target: { value: outcome } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Record completed review' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not save'))
    expect(screen.getByLabelText('Outcome shared with the workspace')).toHaveValue(outcome)
    expect(screen.getByText('Review in progress')).toBeInTheDocument()
    expect(screen.queryByText('Review completed')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record completed review' })).toBeEnabled()
  })

  it('retries failed balance history without offering actions based on missing data', async () => {
    vi.mocked(getLegacyCreditOverview).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(requested)
    renderReview()
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    expect(screen.queryByRole('button', { name: 'Request a balance review' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry balance history' }))
    expect(await screen.findByText('Review requested')).toBeInTheDocument()
  })

  it('does not carry a confirmed outcome into another workspace, including cached reviews', async () => {
    vi.mocked(getLegacyCreditOverview).mockResolvedValue(inProgress)
    const view = renderReview(true)
    fireEvent.change(await screen.findByLabelText('Outcome shared with the workspace'), { target: { value: outcome } })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Record completed review' })).toBeEnabled()
    view.client.setQueryData(['legacy-credit-review', otherWorkspaceId], inProgress)
    view.update(otherWorkspaceId)
    expect(screen.getByLabelText('Outcome shared with the workspace')).toHaveValue('')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Record completed review' })).toBeDisabled()
    expect(updateLegacyCreditReview).not.toHaveBeenCalled()
  })
})

describe('platform review queue', () => {
  it('shows request-time balances and links each request to its own workspace', async () => {
    vi.mocked(listLegacyCreditReviews).mockResolvedValue([
      { ...review, workspace_id: workspaceId, workspace_name: 'First workspace' },
      { ...review, workspace_id: otherWorkspaceId, workspace_name: 'Second workspace', status: 'reviewing' },
    ])
    renderQueue()
    expect(await screen.findByRole('link', { name: 'First workspace' })).toHaveAttribute('href', `/app/platform/billing/${workspaceId}`)
    expect(screen.getByRole('link', { name: 'Second workspace' })).toHaveAttribute('href', `/app/platform/billing/${otherWorkspaceId}`)
    expect(screen.getByText('125 purchased credits · Requested')).toBeInTheDocument()
    expect(screen.getByText('125 purchased credits · In review')).toBeInTheDocument()
    expect(screen.getByText(/Completing a review does not move money/)).toBeInTheDocument()
  })

  it('distinguishes an unavailable queue from an empty queue and supports retry', async () => {
    vi.mocked(listLegacyCreditReviews).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([])
    const { container } = renderQueue()
    expect(await screen.findByRole('alert')).toHaveTextContent('Credit review requests could not be loaded')
    fireEvent.click(screen.getByRole('button', { name: 'Retry reviews' }))
    await waitFor(() => expect(listLegacyCreditReviews).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
