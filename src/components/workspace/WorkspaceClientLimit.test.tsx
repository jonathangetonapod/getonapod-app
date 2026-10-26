import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceClientLimit } from '@/components/workspace/WorkspaceClientLimit'
import { toast } from 'sonner'
import { getWorkspaceBillingOverview, setWorkspaceClientLimit } from '@/services/workspaceStaff'

vi.mock('@/services/workspaceStaff', () => ({
  getWorkspaceBillingOverview: vi.fn(),
  setWorkspaceClientLimit: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const workspaceId = '11111111-1111-4111-8111-111111111111'

const renderCard = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <WorkspaceClientLimit workspaceId={workspaceId} workspaceName="Juliana Munoz" />
  </QueryClientProvider>,
)

const limitInput = () => screen.getByLabelText('Active client limit') as HTMLInputElement

describe('WorkspaceClientLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getWorkspaceBillingOverview).mockResolvedValue({ included_active_clients: 3 } as never)
    vi.mocked(setWorkspaceClientLimit).mockResolvedValue(10)
  })

  it('shows the limit the client check actually reads', async () => {
    renderCard()
    await waitFor(() => expect(limitInput().value).toBe('3'))
  })

  it('saves a new limit for this workspace', async () => {
    renderCard()
    await waitFor(() => expect(limitInput().value).toBe('3'))

    fireEvent.change(limitInput(), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /Save limit/i }))

    await waitFor(() => expect(setWorkspaceClientLimit).toHaveBeenCalledWith(workspaceId, 10))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Juliana Munoz can now have 10 active clients.'))
  })

  it('will not save a limit that has not changed', async () => {
    renderCard()
    await waitFor(() => expect(limitInput().value).toBe('3'))

    expect(screen.getByRole('button', { name: /Save limit/i })).toBeDisabled()
  })

  it('refuses a limit that is not a whole number', async () => {
    renderCard()
    await waitFor(() => expect(limitInput().value).toBe('3'))

    fireEvent.change(limitInput(), { target: { value: '1e3' } })

    expect(await screen.findByText(/whole number of clients between 0 and 10,000/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save limit/i })).toBeDisabled()
  })

  it('says a plan change resets it', async () => {
    renderCard()
    expect(await screen.findByText(/Changing plan resets it/i)).toBeInTheDocument()
  })
})
