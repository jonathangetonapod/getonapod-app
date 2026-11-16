import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PitchStagedConfirmation, type PitchStagedResult } from '@/components/workspace/PitchStagedConfirmation'

const result = (overrides: Partial<PitchStagedResult> = {}): PitchStagedResult => ({
  added: true, leadStaged: true, willSend: true, hostName: 'Jonathan Goldhill', contactEmail: 'jonathan@example.com',
  campaignName: 'Jim Podcast Outreach', ...overrides,
})

function mount(props: Partial<Parameters<typeof PitchStagedConfirmation>[0]> = {}) {
  const handlers = { onAddEmail: vi.fn(), onRemove: vi.fn(), onDismiss: vi.fn() }
  render(
    <MemoryRouter>
      <PitchStagedConfirmation
        result={result()} podcastName="Disruptive Successor Podcast" page campaignHref="/app/client-campaigns/c"
        shortlistHref="/app/clients/c?tab=shortlist" removing={false} {...handlers} {...props}
      />
    </MemoryRouter>,
  )
  return handlers
}

describe('PitchStagedConfirmation', () => {
  it('reports a live send as done, says what happens next, and leads with the next pitch', () => {
    const handlers = mount({ nextPitch: { name: 'Succession Stories', href: '/app/clients/c/podcasts/next/pitch' } })
    const card = screen.getByRole('status', { name: 'Pitch added to client campaign' })
    expect(within(card).getByRole('heading', { name: 'Pitch sent: Disruptive Successor Podcast is in the live sequence' })).toBeInTheDocument()
    expect(within(card).getByText('Jonathan Goldhill was added to Jim Podcast Outreach with all three emails. No further approval is needed.')).toBeInTheDocument()
    expect(within(card).getByText('Live — sends automatically')).toBeInTheDocument()
    expect(within(within(card).getByRole('list', { name: 'What happens next' })).getAllByRole('listitem')).toHaveLength(3)
    expect(within(card).getByRole('link', { name: 'Next pitch: Succession Stories' })).toHaveAttribute('href', '/app/clients/c/podcasts/next/pitch')
    expect(within(card).getByRole('link', { name: 'Back to shortlist' })).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Remove from campaign' }))
    expect(handlers.onRemove).toHaveBeenCalled()
  })

  it('says a paused campaign sends nothing until outreach starts', () => {
    mount({ result: result({ willSend: false }) })
    expect(screen.getByRole('heading', { name: 'Disruptive Successor Podcast was added to Jim Podcast Outreach' })).toBeInTheDocument()
    expect(screen.getByText('Paused — nothing sends yet')).toBeInTheDocument()
    expect(screen.getByText('When you start outreach')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Next pitch/ })).not.toBeInTheDocument()
  })

  it('keeps the warning for a send with no lead, and offers the fix rather than the next pitch', () => {
    const handlers = mount({ result: result({ leadStaged: false, willSend: false, contactEmail: '' }), nextPitch: { name: 'Succession Stories', href: '/next' } })
    expect(screen.getByRole('heading', { name: /has no lead/ })).toBeInTheDocument()
    expect(screen.getByText('Nothing to send — no lead yet')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'What happens next' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Next pitch/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add a contact email' }))
    expect(handlers.onAddEmail).toHaveBeenCalled()
  })

  it('offers Done in a dialog, where there is no queue to move through', () => {
    const handlers = mount({ page: false, nextPitch: { name: 'Succession Stories', href: '/next' } })
    expect(screen.queryByRole('link', { name: /Next pitch/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(handlers.onDismiss).toHaveBeenCalled()
  })
})
