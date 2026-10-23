import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JoinRequestsCard } from './JoinRequestsCard'
import { listJoinRequests, setJoinRequestStatus, type JoinRequest } from '@/services/accessRequests'
import { inviteWorkspaceUser } from '@/services/workspaceUsers'
import { toast } from 'sonner'

vi.mock('@/services/accessRequests', () => ({
  listJoinRequests: vi.fn(),
  setJoinRequestStatus: vi.fn(),
}))
vi.mock('@/services/workspaceUsers', () => ({ inviteWorkspaceUser: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))

const list = vi.mocked(listJoinRequests)
const move = vi.mocked(setJoinRequestStatus)
const sendInvite = vi.mocked(inviteWorkspaceUser)

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

const request = (over: Partial<JoinRequest>): JoinRequest => ({
  id: 'r1',
  email: 'dana@example.com',
  full_name: 'Dana Reyes',
  company: 'Northwind Media',
  website: null,
  audience: 'agency',
  clients_now: '4–10',
  notes: null,
  status: 'new',
  handled_at: null,
  handled_note: null,
  created_at: daysAgo(1),
  ...over,
})

function renderCard(props: Parameters<typeof JoinRequestsCard>[0] = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <JoinRequestsCard {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openMenu(name: string) {
  const trigger = await screen.findByRole('button', { name: `More actions for ${name}` })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' })
}

describe('JoinRequestsCard', () => {
  beforeEach(() => {
    list.mockReset().mockResolvedValue([])
    move.mockReset().mockResolvedValue(undefined)
    sendInvite.mockReset().mockResolvedValue(undefined as never)
  })

  it('says the queue is empty rather than showing a fault', async () => {
    renderCard()
    expect(await screen.findByText(/no one has asked to join yet/iu)).toBeInTheDocument()
  })

  /*
   * Whoever has waited longest is the one at risk of being forgotten, so the
   * waiting ones lead and the oldest of those is first. Ordering by created_at
   * alone would bury a two-week-old request under yesterday's declines.
   */
  it('leads with whoever has waited longest, and colours how long', async () => {
    list.mockResolvedValue([
      request({ id: 'fresh', full_name: 'Fresh Waiter', created_at: daysAgo(1) }),
      request({ id: 'done', full_name: 'Already Invited', status: 'invited', created_at: daysAgo(30) }),
      request({ id: 'called', full_name: 'Called Back', status: 'contacted', created_at: daysAgo(40) }),
      request({ id: 'stale', full_name: 'Stale Waiter', created_at: daysAgo(12) }),
    ])
    renderCard()

    await screen.findByText('Stale Waiter')
    // The Who cell is the second; the first holds the row's checkbox.
    const rows = screen.getAllByRole('row').slice(1)
    const names = rows
      .map((row) => within(row).queryAllByRole('cell')[1]?.textContent ?? '')
      .filter(Boolean)
      .map((text) => text.split('dana@')[0])
    expect(names).toEqual(['Stale Waiter', 'Fresh Waiter', 'Called Back', 'Already Invited'])
    expect(screen.getByText('12 days')).toHaveClass('text-amber-700')
    expect(screen.getByText('1 day')).not.toHaveClass('text-amber-700')
    expect(screen.getByText('40 days')).toHaveClass('text-destructive')
  })

  it('keeps one filled button per row and the rest in the menu', async () => {
    list.mockResolvedValue([request({})])
    renderCard()

    const row = (await screen.findByText('Dana Reyes')).closest('tr') as HTMLElement
    expect(within(row).getAllByRole('button').filter((button) => button.textContent === 'Send invitation')).toHaveLength(1)
    expect(within(row).queryByRole('button', { name: 'Decline' })).toBeNull()
    await openMenu('Dana Reyes')
    expect(await screen.findByRole('menuitem', { name: 'Mark contacted' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Decline' })).toBeInTheDocument()
  })

  it('keeps declined requests folded away until asked for', async () => {
    list.mockResolvedValue([
      request({ id: 'open', full_name: 'Open Request' }),
      request({ id: 'no1', full_name: 'Turned Down', status: 'declined' }),
    ])
    renderCard()

    const toggle = await screen.findByRole('button', { name: 'Declined (1)' })
    expect(screen.queryByText('Turned Down')).toBeNull()
    fireEvent.click(toggle)
    expect(await screen.findByText('Turned Down')).toBeInTheDocument()
    const row = screen.getByText('Turned Down').closest('tr') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Move back to waiting' })).toBeInTheDocument()
  })

  it('hides the deploy smoke check rows behind a toggle', async () => {
    list.mockResolvedValue([
      request({ id: 'real', full_name: 'Real Person' }),
      request({ id: 't1', full_name: 'Rate limit check 4', email: 'burst-4@getonapod.com' }),
    ])
    renderCard()

    await screen.findByText('Real Person')
    expect(screen.queryByText('Rate limit check 4')).toBeNull()
    fireEvent.click(screen.getByLabelText('Show test entries (1)'))
    expect(await screen.findByText('Rate limit check 4')).toBeInTheDocument()
  })

  it('declines a selection in one go after naming everyone in it', async () => {
    list.mockResolvedValue([
      request({ id: 'a', full_name: 'Alex Ames' }),
      request({ id: 'b', full_name: 'Bea Brown' }),
      request({ id: 'c', full_name: 'Cy Cole' }),
    ])
    renderCard()

    fireEvent.click(await screen.findByLabelText('Select Alex Ames'))
    fireEvent.click(screen.getByLabelText('Select Cy Cole'))
    fireEvent.click(screen.getByRole('button', { name: 'Decline selected' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByText('Decline 2 requests?')).toBeInTheDocument()
    expect(dialog.getByText('Alex Ames')).toBeInTheDocument()
    expect(dialog.getByText('Cy Cole')).toBeInTheDocument()
    expect(dialog.queryByText('Bea Brown')).toBeNull()
    fireEvent.click(dialog.getByRole('button', { name: 'Decline selected' }))
    await waitFor(() => expect(move).toHaveBeenCalledTimes(2))
    expect(move).toHaveBeenCalledWith('a', 'declined')
    expect(move).toHaveBeenCalledWith('c', 'declined')
  })

  it('links an invited request to the workspace it became', async () => {
    list.mockResolvedValue([request({ status: 'invited' })])
    renderCard({ workspaceIdForEmail: (email) => (email === 'dana@example.com' ? 'ws-1' : null) })

    expect(await screen.findByRole('link', { name: 'Dana Reyes' })).toHaveAttribute('href', '/?tab=workspaces&highlight=ws-1')
  })

  it('moves a request and offers the way back from a misclick', async () => {
    // The refetch after the mutation returns the moved row, so the undo has to
    // be queued before the click rather than after it.
    list.mockResolvedValueOnce([request({})])
    list.mockResolvedValue([request({ status: 'declined', handled_at: daysAgo(0) })])
    renderCard()

    await openMenu('Dana Reyes')
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Decline' }))
    await waitFor(() => expect(move).toHaveBeenCalledWith('r1', 'declined'))
    fireEvent.click(await screen.findByRole('button', { name: 'Declined (1)' }))
    expect(await screen.findByRole('button', { name: /move back to waiting/iu })).toBeInTheDocument()
  })

  /*
   * Sending mails a stranger and creates a workspace in their name, so it asks
   * first and says who and what. A table row should not be able to do that on
   * one stray click.
   */
  it('asks before sending, naming the person and the workspace', async () => {
    list.mockResolvedValue([request({ company: 'Northwind Media' })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /send invitation/iu }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('dana@example.com')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/Northwind Media/u).length).toBeGreaterThan(0)
    expect(sendInvite).not.toHaveBeenCalled()
  })

  it('sends the invitation, then records it — in that order', async () => {
    list.mockResolvedValue([request({ company: 'Northwind Media' })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /send invitation/iu }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /send invitation/iu }))

    await waitFor(() => expect(sendInvite).toHaveBeenCalledWith({
      email: 'dana@example.com',
      full_name: 'Dana Reyes',
      workspace_name: 'Northwind Media',
    }))
    expect(move).toHaveBeenCalledWith('r1', 'invited')
  })

  // The form takes a 160-character company; a workspace name stops at 120.
  // Sending the long one unchanged had the invitation refused outright.
  it('cuts a long company name down to what a workspace name may be', async () => {
    const company = `${'Northwind '.repeat(15)}Media Group`
    expect(company.length).toBeGreaterThan(120)
    list.mockResolvedValue([request({ company })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /send invitation/iu }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /send invitation/iu }))

    await waitFor(() => expect(sendInvite).toHaveBeenCalled())
    const sent = sendInvite.mock.calls[0][0].workspace_name
    expect(sent.length).toBeLessThanOrEqual(120)
    expect(sent).toBe(company.slice(0, 120).trim())
  })

  // Marking it invited when no email left the building is the lie the old
  // "Mark invited" button could tell.
  it('does not record an invitation that failed to send', async () => {
    sendInvite.mockRejectedValue(new Error('invite email delivery is not configured'))
    list.mockResolvedValue([request({})])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /send invitation/iu }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /send invitation/iu }))

    await waitFor(() => expect(sendInvite).toHaveBeenCalled())
    expect(move).not.toHaveBeenCalled()
  })

  // The email has already gone by the time the status write runs. Reporting
  // that write's failure as "the invitation could not be sent" is how an admin
  // ends up mailing a stranger twice.
  it('reports a sent invitation as sent even when recording it fails', async () => {
    list.mockResolvedValue([request({})])
    move.mockRejectedValue(new Error('could not update the request'))
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /send invitation/iu }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /send invitation/iu }))

    await waitFor(() => expect(toast.warning).toHaveBeenCalled())
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/sent to dana@example.com/iu)
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/do not send again/iu)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('falls back to their own name when they gave no company', async () => {
    list.mockResolvedValue([request({ company: null })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /send invitation/iu }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /send invitation/iu }))

    await waitFor(() => expect(sendInvite).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_name: 'Dana Reyes' }),
    ))
  })

  // The queue is for deciding, so what they wrote has to be reachable.
  it('opens what they said, and a way to reply to them', async () => {
    list.mockResolvedValue([request({ notes: 'Using a spreadsheet and Instantly.', website: 'https://northwind.example' })])
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: 'Dana Reyes' }))
    expect(screen.getByText(/using a spreadsheet and instantly/iu)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /reply/iu })).toHaveAttribute('href', expect.stringContaining('dana@example.com'))
    // safeExternalUrl normalises through URL.toString(), which adds the slash.
    expect(screen.getByRole('link', { name: /their site/iu })).toHaveAttribute('href', 'https://northwind.example/')
  })

  it('shows why the queue could not be loaded instead of an empty one', async () => {
    list.mockRejectedValue(new Error('permission denied for table workspace_access_requests'))
    renderCard()

    expect(await screen.findByRole('alert')).toHaveTextContent(/permission denied/iu)
    expect(screen.queryByText(/no one has asked to join yet/iu)).toBeNull()
  })
})
