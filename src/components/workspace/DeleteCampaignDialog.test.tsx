import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { DeleteCampaignDialog } from '@/components/workspace/DeleteCampaignDialog'
import { deleteWorkspaceCampaign } from '@/services/workspaceCampaigns'

vi.mock('@/services/workspaceCampaigns', () => ({ deleteWorkspaceCampaign: vi.fn() }))

const coded = (name: string, message = name) => Object.assign(new Error(message), { name })
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedDelete = vi.mocked(deleteWorkspaceCampaign)
const target = {
  clientId: 'client-1',
  clientName: 'Margaret Page',
  campaignName: 'Margaret Page Podcast Outreach',
  onPlatform: true,
  pitchCount: 2,
}

const renderDialog = (props: Partial<Parameters<typeof DeleteCampaignDialog>[0]> = {}) => {
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <DeleteCampaignDialog workspaceId="ws-1" target={target} providerKind="instantly" providerLabel="Instantly" onClose={onClose} onDeleted={onDeleted} {...props} />
    </QueryClientProvider>,
  )
  return { onClose, onDeleted }
}

describe('DeleteCampaignDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('says what is lost on the platform and here before anything is deleted', () => {
    renderDialog()
    expect(screen.getByRole('heading', { name: 'Delete Margaret Page Podcast Outreach?' })).toBeInTheDocument()
    expect(screen.getByText(/deleted in Instantly, with its leads and sequence/)).toBeInTheDocument()
    expect(screen.getByText(/2 pitches for Margaret Page are removed/)).toBeInTheDocument()
    expect(screen.getByText(/other linked campaigns are removed from those campaigns too/)).toBeInTheDocument()
    expect(screen.getByLabelText(/to confirm/)).toHaveFocus()
  })

  it('tells a ReachInbox workspace up front that the campaign is only paused there', () => {
    renderDialog({ providerKind: 'reachinbox', providerLabel: 'ReachInbox' })
    expect(screen.getByText(/paused there/)).toBeInTheDocument()
    expect(screen.queryByText(/deleted in ReachInbox/)).not.toBeInTheDocument()
  })

  it('offers a local-only removal once the platform turns out to be unreachable', async () => {
    mockedDelete.mockRejectedValueOnce(coded('INSTANTLY_KEY_REJECTED', 'Instantly rejected this API key'))
    mockedDelete.mockResolvedValueOnce('skipped')
    const { onDeleted } = renderDialog()
    expect(screen.queryByRole('button', { name: 'Remove from this app only' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'delete' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove from this app only' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('skipped'))
    expect(mockedDelete).toHaveBeenLastCalledWith('ws-1', 'client-1', { localOnly: true })
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/untouched in Instantly/))
  })

  it('treats a campaign that is already gone as done and refreshes', async () => {
    mockedDelete.mockRejectedValue(coded('CAMPAIGN_NOT_FOUND'))
    const { onDeleted, onClose } = renderDialog()
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'delete' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(null))
    expect(onClose).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('This campaign is already gone', expect.anything())
  })

  it('stays disabled until the confirmation word is typed', async () => {
    mockedDelete.mockResolvedValue('deleted')
    const { onDeleted, onClose } = renderDialog()
    const button = screen.getByRole('button', { name: 'Delete campaign' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'Delete ' } })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('deleted'))
    expect(mockedDelete).toHaveBeenCalledWith('ws-1', 'client-1', { localOnly: false })
    expect(onClose).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('Campaign deleted here and in Instantly.')
  })

  it('says plainly when the platform could only pause it', async () => {
    mockedDelete.mockResolvedValue('paused')
    renderDialog({ providerKind: 'reachinbox', providerLabel: 'ReachInbox' })
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'delete' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/paused there; delete it in ReachInbox/)))
  })

  it('keeps the dialog open and reports a failure', async () => {
    mockedDelete.mockRejectedValue(new Error('The Instantly API key is missing a required permission'))
    const { onDeleted, onClose } = renderDialog()
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: 'delete' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete campaign' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
