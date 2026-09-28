import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewTutorial } from '@/components/review/ReviewTutorial'

describe('ReviewTutorial', () => {
  it('renders nothing until opened', () => {
    render(<ReviewTutorial open={false} onOpenChange={vi.fn()} brandName="Northstar Advisory" />)
    expect(screen.queryByRole('dialog', { name: 'How this works' })).not.toBeInTheDocument()
  })

  it('walks three steps, names the agency, and can be skipped', () => {
    const onOpenChange = vi.fn()
    render(<ReviewTutorial open onOpenChange={onOpenChange} brandName="Northstar Advisory" />)

    const tour = screen.getByRole('dialog', { name: 'How this works' })
    expect(within(tour).getAllByRole('button', { name: /Go to step/ })).toHaveLength(3)
    expect(within(tour).getByRole('heading', { name: 'Open a show to see why it fits' })).toBeInTheDocument()
    expect(within(tour).getByRole('button', { name: 'Back' })).toBeDisabled()

    fireEvent.click(within(tour).getByRole('button', { name: 'Next' }))
    expect(within(tour).getByRole('heading', { name: 'Mark it Interested or Not a fit' })).toBeInTheDocument()

    fireEvent.click(within(tour).getByRole('button', { name: 'Next' }))
    expect(within(tour).getByRole('heading', { name: 'Northstar Advisory pitches the shows you picked' })).toBeInTheDocument()
    expect(within(tour).queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument()
    expect(tour.textContent).not.toMatch(/!/u)

    fireEvent.click(within(tour).getByRole('button', { name: 'Start reviewing' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('closes on Skip before the last step', () => {
    const onOpenChange = vi.fn()
    render(<ReviewTutorial open onOpenChange={onOpenChange} brandName="Northstar Advisory" />)

    fireEvent.click(within(screen.getByRole('dialog', { name: 'How this works' })).getByRole('button', { name: 'Skip' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
