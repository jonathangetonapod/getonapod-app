import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientBookingDialog } from '@/components/workspace/ClientBookingDialog'
import {
  deleteWorkspaceClientBooking,
  saveWorkspaceClientBooking,
  type WorkspaceClientBooking,
} from '@/services/clients'

vi.mock('@/services/clients', () => ({
  deleteWorkspaceClientBooking: vi.fn(),
  saveWorkspaceClientBooking: vi.fn(),
}))
vi.mock('@/services/clientShortlist', () => ({
  getClientShortlist: vi.fn().mockResolvedValue({ podcasts: [] }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const mockedSave = vi.mocked(saveWorkspaceClientBooking)
const mockedDelete = vi.mocked(deleteWorkspaceClientBooking)
const workspaceId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'

const booking: WorkspaceClientBooking = {
  id: '33333333-3333-4333-8333-333333333333',
  client_id: clientId,
  podcast_id: null,
  shortlist_podcast_id: '44444444-4444-4444-8444-444444444444',
  campaign_target_id: '55555555-5555-4555-8555-555555555555',
  podcast_name: 'Founder Stories',
  podcast_url: null,
  host_name: 'Morgan Host',
  scheduled_date: null,
  recording_date: null,
  publish_date: null,
  status: 'conversation_started',
  episode_url: null,
  prep_sent: false,
  notes: null,
  created_at: '2026-07-20T12:00:00.000Z',
  updated_at: '2026-07-20T12:00:00.000Z',
}

function renderDialog(onSaved = vi.fn(), onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ClientBookingDialog
        open
        onOpenChange={onOpenChange}
        workspaceId={workspaceId}
        clientId={clientId}
        clientName="Taylor Client"
        booking={booking}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  )
  return { onSaved, onOpenChange }
}

describe('ClientBookingDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  // The edit form never shows the journey links; a save that left them out
  // used to null them on the server and orphan the placement from its outreach.
  it('round-trips the shortlist and campaign links on an edit', async () => {
    mockedSave.mockResolvedValue(booking)
    renderDialog()

    fireEvent.click(screen.getByRole('radio', { name: 'Booked' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith(
      workspaceId,
      clientId,
      expect.objectContaining({
        status: 'booked',
        shortlist_podcast_id: booking.shortlist_podcast_id,
        campaign_target_id: booking.campaign_target_id,
      }),
      booking.id,
    ))
  })

  it('treats removing a placement that is already gone as removed', async () => {
    mockedDelete.mockRejectedValue(Object.assign(new Error('That placement no longer exists for this client'), {
      code: 'BOOKING_NOT_FOUND',
    }))
    const { onSaved, onOpenChange } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
