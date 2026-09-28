import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewCard } from '@/components/review/ReviewCard'
import type { ReviewPodcast } from '@/components/review/reviewTypes'

const podcast: ReviewPodcast = {
  podcast_id: 'show-one',
  podcast_name: 'The Clear Leader',
  podcast_description: 'Conversations about practical leadership.',
  podcast_image_url: null,
  podcast_url: null,
  publisher_name: 'Morgan Host',
  itunes_rating: 4.9,
  episode_count: 146,
  audience_size: 42000,
  podcast_categories: [{ category_id: 'leadership', category_name: 'Leadership' }],
  last_posted_at: '2026-07-20T00:00:00.000Z',
  ai_fit_reasons: ['A practical framework for communicating under pressure.'],
}

describe('ReviewCard', () => {
  it('shows the show, its audience line, category and fit reason', () => {
    render(<ReviewCard podcast={podcast} decision={null} onDecide={vi.fn()} onOpen={vi.fn()} eyebrow="Top match #1" />)

    expect(screen.getByRole('heading', { name: 'The Clear Leader' })).toBeInTheDocument()
    expect(screen.getByText('with Morgan Host')).toBeInTheDocument()
    expect(screen.getByText('42K est. listeners')).toBeInTheDocument()
    expect(screen.getByText('Leadership')).toBeInTheDocument()
    expect(screen.getByText('Top match #1')).toBeInTheDocument()
    expect(screen.getByText('A practical framework for communicating under pressure.')).toBeInTheDocument()
  })

  it('emits a decision, and clears it when the same button is pressed again', () => {
    const onDecide = vi.fn()
    const { rerender } = render(<ReviewCard podcast={podcast} decision={null} onDecide={onDecide} onOpen={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Interested' }))
    expect(onDecide).toHaveBeenLastCalledWith('approved')
    fireEvent.click(screen.getByRole('button', { name: 'Not a fit' }))
    expect(onDecide).toHaveBeenLastCalledWith('rejected')

    rerender(<ReviewCard podcast={podcast} decision="approved" onDecide={onDecide} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Interested' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Interested' }))
    expect(onDecide).toHaveBeenLastCalledWith(null)
  })

  it('opens the profile from the card body and the details chevron, and honours disabled', () => {
    const onOpen = vi.fn()
    const onDecide = vi.fn()
    render(<ReviewCard podcast={podcast} decision="rejected" disabled onDecide={onDecide} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button', { name: 'View details for The Clear Leader' }))
    fireEvent.click(screen.getByRole('button', { name: 'Why The Clear Leader fits' }))
    expect(onOpen).toHaveBeenCalledTimes(2)

    expect(screen.getByRole('button', { name: 'Interested' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Not a fit' }))
    expect(onDecide).not.toHaveBeenCalled()
  })
})
