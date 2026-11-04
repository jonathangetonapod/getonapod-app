import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ClientShortlistPodcast } from '@/services/clientShortlist'
import { buildPitchQueue } from '@/lib/pitchQueue'
import { PitchQueueNav } from './PitchQueueNav'

const row = (id: string, display_order: number) => (
  { id, display_order, podcast_name: `Show ${id}`, visibility: 'visible', feedback_status: null } as ClientShortlistPodcast
)
const queue = buildPitchQueue([row('a', 1), row('b', 2), row('c', 3)], 'b')

describe('PitchQueueNav', () => {
  it('moves with the buttons and J/K', () => {
    const onNavigate = vi.fn()
    render(<PitchQueueNav queue={queue} onNavigate={onNavigate} />)
    expect(screen.getByText('Pitch 2 of 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next pitch/i }))
    fireEvent.click(screen.getByRole('button', { name: /previous/i }))
    fireEvent.keyDown(window, { key: 'j' })
    fireEvent.keyDown(window, { key: 'k' })
    expect(onNavigate.mock.calls.map(([id]) => id)).toEqual(['c', 'a', 'c', 'a'])
  })

  it('ignores J/K while typing, held, shifted or under an open dialog', () => {
    const onNavigate = vi.fn()
    render(<><textarea aria-label="body" /><PitchQueueNav queue={queue} onNavigate={onNavigate} /></>)
    fireEvent.keyDown(screen.getByLabelText('body'), { key: 'j' })
    fireEvent.keyDown(window, { key: 'j', repeat: true })
    fireEvent.keyDown(window, { key: 'J', shiftKey: true })
    fireEvent.keyDown(screen.getByRole('combobox', { name: /jump to podcast/i }), { key: 'j' })
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'alertdialog')
    document.body.appendChild(dialog)
    fireEvent.keyDown(window, { key: 'j' })
    dialog.remove()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('hides with a single podcast', () => {
    const { container } = render(<PitchQueueNav queue={buildPitchQueue([row('a', 1)], 'a')} onNavigate={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
